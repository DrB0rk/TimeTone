#include "network.h"
#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "esp_event.h"
#include "esp_check.h"
#include "esp_http_server.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_netif.h"
#include "esp_netif_sntp.h"
#include "esp_random.h"
#include "esp_system.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "storage.h"
#include "display.h"

static const char *TAG = "network";
static EventGroupHandle_t s_events;
static const int CONNECTED_BIT = BIT0;
static char s_ap_ssid[33];
static char s_ip[16] = "0.0.0.0";
static bool s_ap_started;
static httpd_handle_t s_server;

static const char SETUP_HTML[] =
"<!doctype html><html><head><meta name=viewport content='width=device-width,initial-scale=1'>"
"<title>ESP Timekeep setup</title><style>body{margin:0;background:#17211b;color:#17211b;font:16px system-ui}"
"main{max-width:460px;margin:7vh auto;background:#f5f6f2;padding:32px;border-radius:24px}h1{margin:0 0 8px;font-size:30px}"
"p{color:#657068;line-height:1.5}label{display:block;margin:18px 0 6px;font-size:13px;font-weight:650}input{box-sizing:border-box;width:100%;padding:13px;border:1px solid #d4d8d1;border-radius:10px;font-size:16px}"
"button{width:100%;margin-top:24px;padding:14px;border:0;border-radius:11px;background:#d8ff62;color:#17211b;font-weight:750;font-size:16px}</style></head>"
"<body><main><div style='font-size:12px;letter-spacing:.15em;text-transform:uppercase;color:#657068'>Terminal setup</div><h1>ESP Timekeep</h1>"
"<p>Connect this terminal to Wi-Fi and enter the Timekeep server URL. The server will show this terminal for approval automatically.</p><form method=post action=/save>"
"<label>Wi-Fi name</label><input name=ssid maxlength=32 required><label>Wi-Fi password</label><input name=password type=password maxlength=64>"
"<label>Server URL</label><input name=server placeholder='http://192.168.1.20:3000' required>"
"<button>Save and restart</button></form></main></body></html>";

static esp_err_t root_handler(httpd_req_t *request)
{
    httpd_resp_set_type(request, "text/html");
    return httpd_resp_send(request, SETUP_HTML, HTTPD_RESP_USE_STRLEN);
}

static void url_decode(char *output, const char *input, size_t output_size)
{
    size_t j = 0;
    for (size_t i = 0; input[i] && j + 1 < output_size; ++i) {
        if (input[i] == '+' ) output[j++] = ' ';
        else if (input[i] == '%' && isxdigit((unsigned char)input[i + 1]) && isxdigit((unsigned char)input[i + 2])) {
            char hex[3] = { input[i + 1], input[i + 2], 0 };
            output[j++] = (char)strtol(hex, NULL, 16); i += 2;
        } else output[j++] = input[i];
    }
    output[j] = 0;
}

static void form_value(const char *body, const char *key, char *output, size_t output_size)
{
    output[0] = 0;
    char needle[40];
    snprintf(needle, sizeof(needle), "%s=", key);
    const char *start = strstr(body, needle);
    if (!start) return;
    start += strlen(needle);
    const char *end = strchr(start, '&');
    size_t length = end ? (size_t)(end - start) : strlen(start);
    char encoded[192];
    length = length < sizeof(encoded) - 1 ? length : sizeof(encoded) - 1;
    memcpy(encoded, start, length); encoded[length] = 0;
    url_decode(output, encoded, output_size);
}

static esp_err_t save_handler(httpd_req_t *request)
{
    if (request->content_len <= 0 || request->content_len >= 700) return httpd_resp_send_err(request, HTTPD_400_BAD_REQUEST, "Invalid form");
    char *body = calloc(1, request->content_len + 1);
    if (!body) return ESP_ERR_NO_MEM;
    int received = httpd_req_recv(request, body, request->content_len);
    if (received <= 0) { free(body); return ESP_FAIL; }
    tk_config_t config = { .configured = true };
    form_value(body, "ssid", config.ssid, sizeof(config.ssid));
    form_value(body, "password", config.wifi_password, sizeof(config.wifi_password));
    form_value(body, "server", config.server_url, sizeof(config.server_url));
    // Generate the device credential locally; it is never typed or exposed
    // during setup. The server receives it through the pairing handshake.
    if (tk_config_get()->device_token[0]) {
        strlcpy(config.device_token, tk_config_get()->device_token, sizeof(config.device_token));
    } else {
        uint8_t mac[6]; esp_read_mac(mac, ESP_MAC_WIFI_STA);
        snprintf(config.device_token, sizeof(config.device_token), "tk-%02X%02X%02X%02X-%08lX", mac[2], mac[3], mac[4], mac[5], (unsigned long)esp_random());
    }
    strlcpy(config.timezone, "Europe/Amsterdam", sizeof(config.timezone));
    free(body);
    if (!config.ssid[0] || !config.server_url[0]) return httpd_resp_send_err(request, HTTPD_400_BAD_REQUEST, "Missing required value");
    while (strlen(config.server_url) && config.server_url[strlen(config.server_url) - 1] == '/') config.server_url[strlen(config.server_url) - 1] = 0;
    ESP_ERROR_CHECK(tk_config_save(&config));
    httpd_resp_set_type(request, "text/html");
    httpd_resp_sendstr(request, "<html><body style='font:18px system-ui;padding:40px'><h1>Saved</h1><p>The terminal is restarting...</p></body></html>");
    vTaskDelay(pdMS_TO_TICKS(800));
    esp_restart();
    return ESP_OK;
}

static void start_http_server(void)
{
    if (s_server) return;
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.stack_size = 6144;
    if (httpd_start(&s_server, &config) == ESP_OK) {
        httpd_uri_t root = { .uri = "/", .method = HTTP_GET, .handler = root_handler };
        httpd_uri_t save = { .uri = "/save", .method = HTTP_POST, .handler = save_handler };
        httpd_register_uri_handler(s_server, &root);
        httpd_register_uri_handler(s_server, &save);
    }
}

static void start_sntp_once(void)
{
    static bool started;
    if (started) return;
    esp_sntp_config_t config = ESP_NETIF_SNTP_DEFAULT_CONFIG("pool.ntp.org");
    if (esp_netif_sntp_init(&config) == ESP_OK) started = true;
}

static void event_handler(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) esp_wifi_connect();
    else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        xEventGroupClearBits(s_events, CONNECTED_BIT);
        tk_display_set_online(false);
        esp_wifi_connect();
    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *event = data;
        snprintf(s_ip, sizeof(s_ip), IPSTR, IP2STR(&event->ip_info.ip));
        xEventGroupSetBits(s_events, CONNECTED_BIT);
        tk_display_set_online(true);
        start_sntp_once();
        ESP_LOGI(TAG, "connected with IP %s", s_ip);
    }
}

void tk_network_start_setup_ap(void)
{
    if (s_ap_started) return;
    wifi_mode_t mode;
    esp_wifi_get_mode(&mode);
    esp_wifi_set_mode(mode == WIFI_MODE_STA ? WIFI_MODE_APSTA : WIFI_MODE_AP);
    wifi_config_t ap = { .ap = { .channel = 1, .max_connection = 4, .authmode = WIFI_AUTH_WPA2_PSK } };
    strlcpy((char *)ap.ap.ssid, s_ap_ssid, sizeof(ap.ap.ssid));
    ap.ap.ssid_len = strlen(s_ap_ssid);
    strlcpy((char *)ap.ap.password, "timekeep", sizeof(ap.ap.password));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &ap));
    s_ap_started = true;
    start_http_server();
    ESP_LOGW(TAG, "setup access point %s started", s_ap_ssid);
}

esp_err_t tk_network_init(void)
{
    s_events = xEventGroupCreate();
    ESP_RETURN_ON_ERROR(esp_netif_init(), TAG, "netif init");
    ESP_RETURN_ON_ERROR(esp_event_loop_create_default(), TAG, "event loop");
    esp_netif_create_default_wifi_sta();
    esp_netif_create_default_wifi_ap();
    wifi_init_config_t init = WIFI_INIT_CONFIG_DEFAULT();
    ESP_RETURN_ON_ERROR(esp_wifi_init(&init), TAG, "wifi init");
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, event_handler, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, event_handler, NULL));
    uint8_t mac[6]; esp_read_mac(mac, ESP_MAC_WIFI_STA);
    snprintf(s_ap_ssid, sizeof(s_ap_ssid), "ESP-Timekeep-%02X%02X", mac[4], mac[5]);
    const tk_config_t *stored = tk_config_get();
    if (stored->configured) {
        ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
        wifi_config_t station = {0};
        strlcpy((char *)station.sta.ssid, stored->ssid, sizeof(station.sta.ssid));
        strlcpy((char *)station.sta.password, stored->wifi_password, sizeof(station.sta.password));
        station.sta.threshold.authmode = WIFI_AUTH_WPA2_PSK;
        ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &station));
    } else ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_AP));
    ESP_RETURN_ON_ERROR(esp_wifi_start(), TAG, "wifi start");
    if (!stored->configured) tk_network_start_setup_ap();
    return ESP_OK;
}

bool tk_network_connected(void) { return (xEventGroupGetBits(s_events) & CONNECTED_BIT) != 0; }
const char *tk_network_setup_ssid(void) { return s_ap_ssid; }
void tk_network_ip(char *output, size_t size) { strlcpy(output, s_ip, size); }

void tk_network_set_low_power(bool enabled)
{
    // Keep the station associated but let the radio sleep between beacons
    // while the terminal display is idle.
    esp_wifi_set_ps(enabled ? WIFI_PS_MAX_MODEM : WIFI_PS_NONE);
}
