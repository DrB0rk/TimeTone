#include "api.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "cJSON.h"
#include "esp_crt_bundle.h"
#include "esp_http_client.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_system.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "network.h"
#include "storage.h"
#include "display.h"

static const char *TAG = "api";
static SemaphoreHandle_t s_wake;

typedef struct { char *data; size_t length; size_t capacity; } response_buffer_t;

static esp_err_t http_event(esp_http_client_event_t *event)
{
    response_buffer_t *buffer = event->user_data;
    if (event->event_id == HTTP_EVENT_ON_DATA && buffer && event->data_len > 0) {
        if (buffer->length + event->data_len + 1 > buffer->capacity) return ESP_ERR_NO_MEM;
        memcpy(buffer->data + buffer->length, event->data, event->data_len);
        buffer->length += event->data_len;
        buffer->data[buffer->length] = 0;
    }
    return ESP_OK;
}

static int request(const char *path, esp_http_client_method_t method, const char *body, char *response, size_t response_size)
{
    const tk_config_t *config = tk_config_get();
    char url[256];
    snprintf(url, sizeof(url), "%s%s", config->server_url, path);
    response_buffer_t buffer = { .data = response, .capacity = response_size };
    response[0] = 0;
    esp_http_client_config_t client_config = {
        .url = url,
        .method = method,
        .timeout_ms = 12000,
        .event_handler = http_event,
        .user_data = &buffer,
        .crt_bundle_attach = esp_crt_bundle_attach,
    };
    esp_http_client_handle_t client = esp_http_client_init(&client_config);
    if (!client) return -1;
    char auth[150];
    snprintf(auth, sizeof(auth), "Bearer %s", config->device_token);
    esp_http_client_set_header(client, "Authorization", auth);
    esp_http_client_set_header(client, "Content-Type", "application/json");
    if (body) esp_http_client_set_post_field(client, body, strlen(body));
    esp_err_t err = esp_http_client_perform(client);
    int status = err == ESP_OK ? esp_http_client_get_status_code(client) : -1;
    if (err != ESP_OK) ESP_LOGW(TAG, "%s failed: %s", path, esp_err_to_name(err));
    esp_http_client_cleanup(client);
    return status;
}

static esp_err_t fetch_config(void)
{
    char *response = malloc(18000);
    if (!response) return ESP_ERR_NO_MEM;
    int status = request("/api/device/v1/config", HTTP_METHOD_GET, NULL, response, 18000);
    if (status != 200) { free(response); return ESP_FAIL; }
    cJSON *root = cJSON_Parse(response);
    free(response);
    if (!root) return ESP_ERR_INVALID_RESPONSE;
    cJSON *employees = cJSON_GetObjectItem(root, "employees");
    if (!cJSON_IsArray(employees)) { cJSON_Delete(root); return ESP_ERR_INVALID_RESPONSE; }
    tk_state_t *state = tk_state_lock();
    state->employee_count = 0;
    cJSON *item;
    cJSON_ArrayForEach(item, employees) {
        if (state->employee_count >= TK_MAX_EMPLOYEES) break;
        cJSON *id = cJSON_GetObjectItem(item, "id"), *name = cJSON_GetObjectItem(item, "name");
        cJSON *digest = cJSON_GetObjectItem(item, "codeDigest"), *clocked = cJSON_GetObjectItem(item, "clockedIn");
        if (!cJSON_IsString(id) || !cJSON_IsString(name) || !cJSON_IsString(digest)) continue;
        tk_employee_t *employee = &state->employees[state->employee_count++];
        memset(employee, 0, sizeof(*employee));
        strlcpy(employee->id, id->valuestring, sizeof(employee->id));
        strlcpy(employee->name, name->valuestring, sizeof(employee->name));
        strlcpy(employee->code_digest, digest->valuestring, sizeof(employee->code_digest));
        employee->clocked_in = cJSON_IsTrue(clocked);
    }
    esp_err_t err = tk_state_save();
    tk_state_unlock();
    cJSON_Delete(root);
    tk_display_refresh();
    return err;
}

static esp_err_t push_events(void)
{
    tk_event_t events[TK_MAX_EVENTS];
    int count;
    tk_state_t *state = tk_state_lock();
    count = state->event_count;
    memcpy(events, state->events, count * sizeof(tk_event_t));
    tk_state_unlock();
    if (!count) return ESP_OK;
    cJSON *root = cJSON_CreateObject(), *array = cJSON_AddArrayToObject(root, "events");
    cJSON_AddNumberToObject(root, "pendingCount", count);
    for (int i = 0; i < count; ++i) {
        cJSON *item = cJSON_CreateObject();
        cJSON_AddStringToObject(item, "id", events[i].id);
        cJSON_AddStringToObject(item, "employeeId", events[i].employee_id);
        cJSON_AddStringToObject(item, "type", events[i].clock_in ? "CLOCK_IN" : "CLOCK_OUT");
        cJSON_AddStringToObject(item, "occurredAt", events[i].occurred_at);
        cJSON_AddItemToArray(array, item);
    }
    char *body = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    char response[4096];
    int status = request("/api/device/v1/events", HTTP_METHOD_POST, body, response, sizeof(response));
    free(body);
    if (status != 200) return ESP_FAIL;
    state = tk_state_lock();
    if (state->event_count >= count) {
        memmove(state->events, state->events + count, (state->event_count - count) * sizeof(tk_event_t));
        state->event_count -= count;
        tk_state_save();
    }
    tk_state_unlock();
    return ESP_OK;
}

static void heartbeat(void)
{
    int pending;
    tk_state_t *state = tk_state_lock(); pending = state->event_count; tk_state_unlock();
    char ip[16]; tk_network_ip(ip, sizeof(ip));
    char body[220];
    snprintf(body, sizeof(body), "{\"firmwareVersion\":\"%s\",\"ipAddress\":\"%s\",\"pendingEvents\":%d}", TK_FIRMWARE_VERSION, ip, pending);
    char response[256];
    request("/api/device/v1/heartbeat", HTTP_METHOD_POST, body, response, sizeof(response));
}

static void api_task(void *argument)
{
    int cycle = 0;
    while (true) {
        if (tk_network_connected() && tk_config_get()->configured) {
            tk_display_set_online(true);
            if (cycle % 5 == 0) fetch_config();
            push_events();
            heartbeat();
            cycle++;
        } else tk_display_set_online(false);
        xSemaphoreTake(s_wake, pdMS_TO_TICKS(30000));
    }
}

esp_err_t tk_api_start(void)
{
    s_wake = xSemaphoreCreateBinary();
    if (!s_wake) return ESP_ERR_NO_MEM;
    return xTaskCreate(api_task, "timekeep_api", 8192, NULL, 4, NULL) == pdPASS ? ESP_OK : ESP_ERR_NO_MEM;
}

void tk_api_wake(void) { if (s_wake) xSemaphoreGive(s_wake); }
