#include <stdlib.h>
#include <time.h>
#include "esp_check.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "api.h"
#include "display.h"
#include "network.h"
#include "storage.h"

static const char *TAG = "timekeep";

static void fallback_task(void *argument)
{
    vTaskDelay(pdMS_TO_TICKS(20000));
    if (!tk_network_connected()) {
        ESP_LOGW(TAG, "Wi-Fi unavailable; enabling setup fallback");
        tk_network_start_setup_ap();
        tk_display_show_setup();
    }
    vTaskDelete(NULL);
}

void app_main(void)
{
    setenv("TZ", "CET-1CEST,M3.5.0,M10.5.0/3", 1);
    tzset();
    ESP_ERROR_CHECK(tk_storage_init());
    ESP_ERROR_CHECK(tk_network_init());
    ESP_ERROR_CHECK(tk_display_init());
    ESP_ERROR_CHECK(tk_api_start());
    if (!tk_config_get()->configured) tk_display_show_setup();
    else xTaskCreate(fallback_task, "wifi_fallback", 3072, NULL, 2, NULL);
    ESP_LOGI(TAG, "ESP Timekeep %s ready", TK_FIRMWARE_VERSION);
}
