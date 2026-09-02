#pragma once
#include <stdbool.h>
#include "esp_err.h"

esp_err_t tk_display_init(void);
typedef enum {
    TK_DISPLAY_OFFLINE = 0,
    TK_DISPLAY_CONNECTING,
    TK_DISPLAY_SYNCING,
    TK_DISPLAY_ONLINE,
} tk_display_network_state_t;
void tk_display_set_network_state(tk_display_network_state_t state);
void tk_display_set_ip(const char *ip);
void tk_display_set_online(bool online);
void tk_display_refresh(void);
void tk_display_show_setup(void);
void tk_display_apply_settings(void);
void tk_display_set_company_name(const char *name);
bool tk_display_is_sleeping(void);
