#pragma once

#include <stdbool.h>
#include <stdint.h>

#define TK_MAX_EMPLOYEES 32
#define TK_MAX_EVENTS 48
#define TK_FIRMWARE_VERSION "0.1.0"

typedef struct {
    char ssid[33];
    char wifi_password[65];
    char server_url[160];
    char device_token[129];
    char timezone[64];
    bool configured;
} tk_config_t;

typedef struct {
    char id[64];
    char name[48];
    char code_digest[65];
    bool clocked_in;
} tk_employee_t;

typedef struct {
    char id[48];
    char employee_id[64];
    char occurred_at[25];
    bool clock_in;
} tk_event_t;

typedef struct {
    uint32_t version;
    uint16_t employee_count;
    uint16_t event_count;
    tk_employee_t employees[TK_MAX_EMPLOYEES];
    tk_event_t events[TK_MAX_EVENTS];
} tk_state_t;

