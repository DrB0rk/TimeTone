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
static uint16_t s_sync_interval_seconds = 5;

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
    // A 401 response can make esp_http_client return ESP_ERR_NOT_SUPPORTED
    // before ESP_OK (it attempts an auth challenge). Preserve the HTTP status
    // so the pairing handshake can still run for a new token.
    int status = esp_http_client_get_status_code(client);
    if (status <= 0) status = err == ESP_OK ? 200 : -1;
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
        if (!cJSON_IsString(id) || !cJSON_IsString(name)) continue;
        tk_employee_t *employee = &state->employees[state->employee_count++];
        memset(employee, 0, sizeof(*employee));
        strlcpy(employee->id, id->valuestring, sizeof(employee->id));
        strlcpy(employee->name, name->valuestring, sizeof(employee->name));
        if (cJSON_IsString(digest)) strlcpy(employee->code_digest, digest->valuestring, sizeof(employee->code_digest));
        employee->clocked_in = cJSON_IsTrue(clocked);
    }
    esp_err_t err = tk_state_save();
    tk_state_unlock();
    cJSON *settings = cJSON_GetObjectItem(root, "settings");
    if (cJSON_IsObject(settings)) {
        cJSON *interval = cJSON_GetObjectItem(settings, "syncIntervalSeconds");
        cJSON *screen_off_timeout = cJSON_GetObjectItem(settings, "screenOffTimeoutSeconds");
        cJSON *low_power_timeout = cJSON_GetObjectItem(settings, "lowPowerTimeoutSeconds");
        cJSON *theme = cJSON_GetObjectItem(settings, "terminalTheme");
        cJSON *company_name = cJSON_GetObjectItem(settings, "companyName");
        tk_config_t updated = *tk_config_get();
        bool changed = false;
        if (cJSON_IsNumber(interval)) {
            uint16_t seconds = (uint16_t)(interval->valuedouble < 2 ? 2 : interval->valuedouble > 60 ? 60 : interval->valuedouble);
            s_sync_interval_seconds = seconds;
            if (updated.sync_interval_seconds != seconds) { updated.sync_interval_seconds = seconds; changed = true; }
        }
        if (cJSON_IsNumber(screen_off_timeout) && cJSON_IsNumber(low_power_timeout)) {
            uint16_t screen_seconds = (uint16_t)(screen_off_timeout->valuedouble < 0 ? 0 : screen_off_timeout->valuedouble > 3600 ? 3600 : screen_off_timeout->valuedouble);
            uint16_t low_power_seconds = (uint16_t)(low_power_timeout->valuedouble < 0 ? 0 : low_power_timeout->valuedouble > 3600 ? 3600 : low_power_timeout->valuedouble);
            if (low_power_seconds && screen_seconds && low_power_seconds < screen_seconds) low_power_seconds = screen_seconds;
            if (updated.screen_off_timeout_seconds != screen_seconds || updated.low_power_timeout_seconds != low_power_seconds || !updated.power_timeouts_configured) {
                updated.screen_off_timeout_seconds = screen_seconds;
                updated.low_power_timeout_seconds = low_power_seconds;
                updated.power_timeouts_configured = true;
                changed = true;
            }
        }
        if (!updated.terminal_theme_override && cJSON_IsString(theme) && (strcmp(theme->valuestring, "dark") == 0 || strcmp(theme->valuestring, "light") == 0) && strcmp(updated.terminal_theme, theme->valuestring) != 0) {
            strlcpy(updated.terminal_theme, theme->valuestring, sizeof(updated.terminal_theme));
            changed = true;
        }
        if (changed) { tk_config_save(&updated); tk_display_apply_settings(); }
        if (cJSON_IsString(company_name)) tk_display_set_company_name(company_name->valuestring);
    }
    cJSON_Delete(root);
    tk_display_refresh();
    return err;
}

esp_err_t tk_api_submit_code(const char *code, char employee_name[48], bool *clocked_in)
{
    char body[96];
    snprintf(body, sizeof(body), "{\"code\":\"%s\"}", code);
    char response[512];
    int status = request("/api/device/v1/clock", HTTP_METHOD_POST, body, response, sizeof(response));
    if (status == 404) return ESP_ERR_NOT_FOUND;
    if (status == 401) return ESP_ERR_INVALID_STATE;
    if (status != 200) return ESP_FAIL;
    cJSON *root = cJSON_Parse(response);
    if (!root) return ESP_ERR_INVALID_RESPONSE;
    cJSON *name = cJSON_GetObjectItem(root, "employeeName"), *clocked = cJSON_GetObjectItem(root, "clockedIn");
    if (!cJSON_IsString(name) || !cJSON_IsBool(clocked)) { cJSON_Delete(root); return ESP_ERR_INVALID_RESPONSE; }
    strlcpy(employee_name, name->valuestring, 48);
    *clocked_in = cJSON_IsTrue(clocked);
    cJSON_Delete(root);
    return ESP_OK;
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
    int status = request("/api/device/v1/heartbeat", HTTP_METHOD_POST, body, response, sizeof(response));
    if (status == 401) {
        char pair_body[320];
        snprintf(pair_body, sizeof(pair_body), "{\"deviceName\":\"%s\",\"token\":\"%s\",\"firmwareVersion\":\"%s\",\"ipAddress\":\"%s\"}", tk_network_setup_ssid(), tk_config_get()->device_token, TK_FIRMWARE_VERSION, ip);
        int pair_status = request("/api/device/v1/pair", HTTP_METHOD_POST, pair_body, response, sizeof(response));
        if (pair_status == 202) ESP_LOGW(TAG, "device pairing requested; approve it in the server dashboard");
        else if (pair_status == 200) ESP_LOGI(TAG, "device pairing already approved");
    }
}

static void api_task(void *argument)
{
    while (true) {
        if (tk_network_connected() && tk_config_get()->configured && !tk_display_is_sleeping()) {
            tk_display_set_online(true);
            // Keep the terminal's employee list fresh while the server is
            // being configured, and after an administrator approves pairing.
            // The response is small and this avoids a long stale-PIN window.
            fetch_config();
            push_events();
            heartbeat();
        }
        uint16_t seconds = tk_config_get()->sync_interval_seconds ?: s_sync_interval_seconds;
        xSemaphoreTake(s_wake, pdMS_TO_TICKS(seconds * 1000));
    }
}

esp_err_t tk_api_start(void)
{
    s_wake = xSemaphoreCreateBinary();
    if (!s_wake) return ESP_ERR_NO_MEM;
    return xTaskCreate(api_task, "timekeep_api", 8192, NULL, 4, NULL) == pdPASS ? ESP_OK : ESP_ERR_NO_MEM;
}

void tk_api_wake(void) { if (s_wake) xSemaphoreGive(s_wake); }
