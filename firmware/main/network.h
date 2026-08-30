#pragma once
#include <stdbool.h>
#include "esp_err.h"

esp_err_t tk_network_init(void);
bool tk_network_connected(void);
void tk_network_start_setup_ap(void);
const char *tk_network_setup_ssid(void);
void tk_network_ip(char *output, size_t size);
void tk_network_set_low_power(bool enabled);
