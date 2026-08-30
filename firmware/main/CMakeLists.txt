idf_component_register(
  SRCS "main.c" "storage.c" "network.c" "api.c" "display.c"
  INCLUDE_DIRS "."
  REQUIRES esp_wifi esp_event esp_netif esp_http_server esp_http_client nvs_flash
           esp_lcd driver esp_timer mbedtls app_update esp_https_ota
)
