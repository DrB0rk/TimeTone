#pragma once
#include <stdbool.h>
#include "esp_err.h"

esp_err_t tk_display_init(void);
void tk_display_set_online(bool online);
void tk_display_refresh(void);
void tk_display_show_setup(void);
void tk_display_apply_settings(void);
void tk_display_set_company_name(const char *name);
bool tk_display_is_sleeping(void);
