#pragma once
#include "esp_err.h"

esp_err_t tk_api_start(void);
void tk_api_wake(void);
esp_err_t tk_api_submit_code(const char *code, char employee_name[48], bool *clocked_in);
