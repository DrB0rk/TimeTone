#include "display.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <sys/lock.h>
#include <time.h>
#include <unistd.h>
#include "driver/gpio.h"
#include "driver/spi_master.h"
#include "esp_lcd_panel_st7789.h"
#include "esp_lcd_panel_io.h"
#include "esp_lcd_panel_ops.h"
#include "esp_lcd_touch_xpt2046.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "lvgl.h"
#include "api.h"
#include "network.h"
#include "storage.h"

static const char *TAG = "display";
#define LCD_HOST SPI2_HOST
#define TOUCH_HOST SPI3_HOST
#define PIN_LCD_SCLK 14
#define PIN_LCD_MOSI 13
#define PIN_LCD_MISO 12
#define PIN_LCD_CS 15
#define PIN_LCD_DC 2
#define PIN_LCD_RST -1
#define PIN_LCD_BL 27
// Some S032 production runs route the backlight enable to GPIO21 (the
// connected unit did so with the previous firmware); GPIO27 is used by the
// other S032/ST7789 run. Drive both harmless control nets for compatibility.
#define PIN_LCD_BL_ALT 21
#define PIN_TOUCH_SCLK 25
#define PIN_TOUCH_MOSI 32
#define PIN_TOUCH_MISO 39
#define PIN_TOUCH_CS 33
#define PIN_TOUCH_IRQ 36
#define H_RES 240
#define V_RES 320

static _lock_t s_lvgl_lock;
static lv_display_t *s_display;
static lv_obj_t *s_main_screen, *s_setup_screen, *s_settings_screen, *s_calibration_screen, *s_boot_screen, *s_ota_screen, *s_header;
static lv_obj_t *s_clock_label, *s_status_label, *s_pin_label, *s_keypad, *s_count_label, *s_brand_label, *s_ip_label, *s_server_label;
static lv_obj_t *s_status_dot, *s_boot_label, *s_ota_label;
static lv_obj_t *s_setup_details;
static char s_pin[9];
static bool s_online;
static tk_display_network_state_t s_network_state = TK_DISPLAY_OFFLINE;
static uint8_t s_sync_frame;
static volatile bool s_entry_in_progress;
static volatile bool s_starting;
static volatile bool s_ota_visible;
static bool s_calibrating, s_calibration_wait_release;
static uint8_t s_calibration_step;
static uint16_t s_calibration_x[4], s_calibration_y[4];
static lv_obj_t *s_calibration_progress;
static volatile bool s_screen_sleeping;
static volatile bool s_screen_off;
static bool s_discard_wake_touch;
static int64_t s_last_activity_us;

static bool dark_theme(void) { return strcmp(tk_config_get()->terminal_theme, "dark") == 0; }
static uint32_t bg_color(void) { return dark_theme() ? 0x17211B : 0xF5F6F2; }
static uint32_t fg_color(void) { return dark_theme() ? 0xF4F7F2 : 0x17211B; }
static void apply_theme_styles(void);

static void set_backlight(bool on)
{
    gpio_set_level(PIN_LCD_BL, on ? 1 : 0);
    gpio_set_level(PIN_LCD_BL_ALT, on ? 1 : 0);
}

static void set_screen_off(bool off)
{
    if (s_screen_off == off) return;
    s_screen_off = off;
    set_backlight(!off);
}

static void set_screen_sleeping(bool sleeping)
{
    if (s_screen_sleeping == sleeping) return;
    s_screen_sleeping = sleeping;
    if (sleeping) set_screen_off(true);
    tk_network_set_low_power(sleeping);
    if (!sleeping) tk_api_wake();
}

static void register_activity(void)
{
    s_last_activity_us = esp_timer_get_time();
    if (s_screen_off) set_screen_off(false);
    if (s_screen_sleeping) set_screen_sleeping(false);
}

static bool flush_done(esp_lcd_panel_io_handle_t io, esp_lcd_panel_io_event_data_t *data, void *ctx)
{
    lv_display_flush_ready((lv_display_t *)ctx);
    return false;
}

static void flush_cb(lv_display_t *display, const lv_area_t *area, uint8_t *pixels)
{
    esp_lcd_panel_handle_t panel = lv_display_get_user_data(display);
    lv_draw_sw_rgb565_swap(pixels, (area->x2 + 1 - area->x1) * (area->y2 + 1 - area->y1));
    esp_lcd_panel_draw_bitmap(panel, area->x1, area->y1, area->x2 + 1, area->y2 + 1, pixels);
}

static void touch_cb(lv_indev_t *indev, lv_indev_data_t *data)
{
    esp_lcd_touch_handle_t touch = lv_indev_get_user_data(indev);
    uint16_t x[1], y[1]; uint8_t count = 0;
    esp_lcd_touch_read_data(touch);
    if (esp_lcd_touch_get_coordinates(touch, x, y, NULL, &count, 1) && count) {
        bool woke_screen = s_screen_off;
        register_activity();
        // The first tap only wakes a sleeping screen; it must not also clock
        // somebody in or activate a settings button.
        if (woke_screen || s_discard_wake_touch) { s_discard_wake_touch = false; data->state = LV_INDEV_STATE_RELEASED; return; }
        if (s_calibrating) {
            if (!s_calibration_wait_release) {
                s_calibration_x[s_calibration_step] = x[0];
                s_calibration_y[s_calibration_step] = y[0];
                s_calibration_wait_release = true;
                s_calibration_step++;
                if (s_calibration_step >= 4) {
                    int left = (s_calibration_x[0] + s_calibration_x[2]) / 2;
                    int right = (s_calibration_x[1] + s_calibration_x[3]) / 2;
                    int top = (s_calibration_y[0] + s_calibration_y[1]) / 2;
                    int bottom = (s_calibration_y[2] + s_calibration_y[3]) / 2;
                    tk_config_t updated = *tk_config_get();
                    if (right != left && bottom != top) {
                        updated.touch_x_scale = (uint16_t)((190 * 1000) / (right - left));
                        updated.touch_y_scale = (uint16_t)((150 * 1000) / (bottom - top));
                        updated.touch_x_offset = 25 - (int16_t)((left * updated.touch_x_scale) / 1000);
                        updated.touch_y_offset = 92 - (int16_t)((top * updated.touch_y_scale) / 1000);
                        tk_config_save(&updated);
                        lv_label_set_text(s_calibration_progress, "Calibration saved\nTap BACK to return");
                    } else lv_label_set_text(s_calibration_progress, "Calibration failed\nTap BACK to retry");
                    s_calibrating = false;
                } else {
                    static const char *steps[] = { "Top left", "Top right", "Bottom left", "Bottom right" };
                    char hint[72]; snprintf(hint, sizeof(hint), "Touch %s target", steps[s_calibration_step]);
                    lv_label_set_text(s_calibration_progress, hint);
                }
            }
            data->state = LV_INDEV_STATE_RELEASED;
            return;
        }
        int adjusted_x = (x[0] * tk_config_get()->touch_x_scale) / 1000 + tk_config_get()->touch_x_offset;
        int adjusted_y = (y[0] * tk_config_get()->touch_y_scale) / 1000 + tk_config_get()->touch_y_offset;
        data->point.x = adjusted_x < 0 ? 0 : adjusted_x >= H_RES ? H_RES - 1 : adjusted_x;
        data->point.y = adjusted_y < 0 ? 0 : adjusted_y >= V_RES ? V_RES - 1 : adjusted_y;
        data->state = LV_INDEV_STATE_PRESSED;
    } else { s_calibration_wait_release = false; data->state = LV_INDEV_STATE_RELEASED; }
}

static void tick_cb(void *argument) { lv_tick_inc(2); }

static void lvgl_task(void *argument)
{
    while (true) {
        // The XPT2046 IRQ remains asserted while the panel backlight is off.
        // Watch it directly so the first physical tap wakes a blank display
        // even on boards whose coordinate poll pauses during inactivity.
        if (s_screen_off && gpio_get_level(PIN_TOUCH_IRQ) == 0) {
            s_discard_wake_touch = true;
            s_last_activity_us = esp_timer_get_time();
            set_screen_off(false);
            set_screen_sleeping(false);
        }
        _lock_acquire(&s_lvgl_lock);
        uint32_t wait = lv_timer_handler();
        _lock_release(&s_lvgl_lock);
        int64_t idle_us = esp_timer_get_time() - s_last_activity_us;
        uint16_t screen_off_timeout = tk_config_get()->screen_off_timeout_seconds;
        uint16_t low_power_timeout = tk_config_get()->low_power_timeout_seconds;
        if (screen_off_timeout && !s_screen_off && idle_us >= (int64_t)screen_off_timeout * 1000000LL) {
            set_screen_off(true);
        }
        if (low_power_timeout && !s_screen_sleeping && idle_us >= (int64_t)low_power_timeout * 1000000LL) {
            set_screen_sleeping(true);
        }
        wait = wait < 2 ? 2 : (wait > 100 ? 100 : wait);
        if (s_screen_sleeping && wait < 250) wait = 250;
        usleep(wait * 1000);
    }
}

static void set_status(const char *text, uint32_t color)
{
    lv_label_set_text(s_status_label, text);
    lv_obj_set_style_text_color(s_status_label, lv_color_hex(color), 0);
}

static void update_pin_label(void)
{
    char hidden[9] = {0};
    for (size_t i = 0; i < strlen(s_pin); ++i) hidden[i] = '*';
    lv_label_set_text(s_pin_label, hidden[0] ? hidden : "Choose your colors");
    lv_obj_set_style_text_color(s_pin_label, lv_color_hex(hidden[0] ? 0x17211B : 0x788078), 0);
}

static void code_submit_task(void *argument)
{
    char code[8]; strlcpy(code, (const char *)argument, sizeof(code)); free(argument);
    char employee_name[48] = {0}; bool clocked_in = false;
    esp_err_t err = tk_api_submit_code(code, employee_name, &clocked_in);
    _lock_acquire(&s_lvgl_lock);
    s_entry_in_progress = false;
    if (err == ESP_ERR_NOT_FOUND) set_status("Code not recognised - try again", 0xC43D3D);
    else if (err == ESP_ERR_INVALID_STATE || err == ESP_FAIL) set_status("Offline - connect to clock in", 0xC47B24);
    else if (err == ESP_OK) {
        char message[96]; snprintf(message, sizeof(message), "%s, %s!", clocked_in ? "Welcome" : "Goodbye", employee_name);
        set_status(message, clocked_in ? 0x168455 : 0x526159);
        // A clock response already proves server health. Wake the health loop
        // without forcing an expensive employee/config refresh after each tap.
        tk_api_poke();
    } else set_status("Could not reach server - try again", 0xC47B24);
    _lock_release(&s_lvgl_lock);
    vTaskDelete(NULL);
}

static void handle_keypress(const char *text)
{
    if (!text) return;
    if (s_entry_in_progress) return;
    if (strlen(s_pin) < 4) {
        strlcat(s_pin, text, sizeof(s_pin));
        if (strlen(s_pin) == 4) {
            char *code = strdup(s_pin);
            s_pin[0] = 0;
            s_entry_in_progress = true;
            if (!code || xTaskCreate(code_submit_task, "code_submit", 8192, code, 3, NULL) != pdPASS) {
                free(code); s_entry_in_progress = false; set_status("Could not send code - try again", 0xC47B24);
            } else {
                set_status("Checking code", 0xC47B24);
            }
        }
    }
    update_pin_label();
}

static void keypad_button_event(lv_event_t *event)
{
    handle_keypress((const char *)lv_event_get_user_data(event));
}

static void clear_keypad_event(lv_event_t *event)
{
    (void)event;
    s_pin[0] = 0;
    update_pin_label();
    set_status("Sequence cleared", 0x526159);
}

static void clock_timer(lv_timer_t *timer)
{
    time_t now; struct tm local;
    time(&now); localtime_r(&now, &local);
    char text[24];
    if (tk_time_is_valid()) strftime(text, sizeof(text), "%H:%M", &local);
    else strlcpy(text, "--:--", sizeof(text));
    lv_label_set_text(s_clock_label, text);
}

static void sync_animation_timer(lv_timer_t *timer)
{
    (void)timer;
    const char *frames[] = { "", ".", "..", "..." };
    if (s_ota_visible) {
        char text[48]; snprintf(text, sizeof(text), "Installing update%s", frames[s_sync_frame++ % 4]);
        lv_label_set_text(s_ota_label, text);
    } else if (s_starting) {
        char text[48]; snprintf(text, sizeof(text), "Starting terminal%s", frames[s_sync_frame++ % 4]);
        lv_label_set_text(s_boot_label, text);
    } else if (s_entry_in_progress) {
        char text[32]; snprintf(text, sizeof(text), "Checking code%s", frames[s_sync_frame++ % 4]);
        set_status(text, 0xC47B24);
    } else if (s_status_dot) {
        // Keep the header compact: the LED itself is the complete status
        // indicator. Connecting/syncing/retrying pulse; online/offline stay
        // steady and use distinct, color-blind-friendly colors.
        bool pulse = s_network_state == TK_DISPLAY_CONNECTING || s_network_state == TK_DISPLAY_SYNCING || s_network_state == TK_DISPLAY_SYNC_RETRYING;
        if (pulse) {
            if (s_sync_frame++ & 1) lv_led_off(s_status_dot); else lv_led_on(s_status_dot);
        } else lv_led_on(s_status_dot);
    }
}

static void show_main_screen(void)
{
    lv_obj_clear_flag(s_main_screen, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(s_settings_screen, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(s_calibration_screen, LV_OBJ_FLAG_HIDDEN);
}

static void settings_back_event(lv_event_t *event) { show_main_screen(); }
static void settings_sync_event(lv_event_t *event)
{
    (void)event;
    tk_api_wake();
    set_status("Sync requested", 0x3D8BFD);
}

static void settings_theme_event(lv_event_t *event)
{
    tk_config_t updated = *tk_config_get();
    strlcpy(updated.terminal_theme, dark_theme() ? "light" : "dark", sizeof(updated.terminal_theme));
    updated.terminal_theme_override = true;
    tk_config_save(&updated);
    // Event callbacks already execute inside lv_timer_handler while the LVGL
    // lock is held. Taking it again here deadlocks the UI task, so use the
    // lock-free helper that is specifically safe from this context.
    apply_theme_styles();
}

static void settings_calibrate_event(lv_event_t *event)
{
    s_calibrating = true; s_calibration_wait_release = true; s_calibration_step = 0;
    // This label belongs to the calibration screen. Updating the former
    // settings hint here made the instruction disappear behind the overlay.
    lv_label_set_text(s_calibration_progress, "Touch top left target");
    lv_obj_add_flag(s_settings_screen, LV_OBJ_FLAG_HIDDEN);
    lv_obj_clear_flag(s_calibration_screen, LV_OBJ_FLAG_HIDDEN);
}

static void calibration_back_event(lv_event_t *event)
{
    s_calibrating = false;
    lv_obj_add_flag(s_calibration_screen, LV_OBJ_FLAG_HIDDEN);
    lv_obj_clear_flag(s_settings_screen, LV_OBJ_FLAG_HIDDEN);
}

static lv_obj_t *settings_button(lv_obj_t *parent, const char *text, int x, int y, int width, int height, lv_event_cb_t callback)
{
    lv_obj_t *button = lv_button_create(parent);
    lv_obj_set_size(button, width, height); lv_obj_set_pos(button, x, y);
    lv_obj_set_style_radius(button, 10, 0); lv_obj_set_style_bg_color(button, lv_color_hex(0x2D3D33), 0);
    lv_obj_set_style_bg_color(button, lv_color_hex(0xD8FF62), LV_STATE_PRESSED);
    lv_obj_set_style_border_width(button, 1, 0); lv_obj_set_style_border_color(button, lv_color_hex(0x405249), 0); lv_obj_add_event_cb(button, callback, LV_EVENT_CLICKED, NULL);
    lv_obj_t *label = lv_label_create(button); lv_label_set_text(label, text); lv_obj_set_style_text_color(label, lv_color_white(), 0); lv_obj_set_style_text_font(label, &lv_font_montserrat_14, 0); lv_obj_center(label);
    return button;
}

static void open_settings_event(lv_event_t *event)
{
    lv_obj_add_flag(s_main_screen, LV_OBJ_FLAG_HIDDEN);
    lv_obj_clear_flag(s_settings_screen, LV_OBJ_FLAG_HIDDEN);
    s_calibrating = false;
}

static void build_clock_ui(void)
{
    s_main_screen = lv_obj_create(lv_screen_active());
    lv_obj_remove_style_all(s_main_screen); lv_obj_set_size(s_main_screen, H_RES, V_RES); lv_obj_set_style_bg_color(s_main_screen, lv_color_hex(bg_color()), 0); lv_obj_set_style_bg_opa(s_main_screen, LV_OPA_COVER, 0);
    s_header = lv_obj_create(s_main_screen);
    lv_obj_remove_style_all(s_header); lv_obj_set_size(s_header, H_RES, 46); lv_obj_set_style_bg_color(s_header, lv_color_hex(0x17211B), 0); lv_obj_set_style_bg_opa(s_header, LV_OPA_COVER, 0);
    s_brand_label = lv_label_create(s_header); lv_label_set_text(s_brand_label, "TIMETONE"); lv_label_set_long_mode(s_brand_label, LV_LABEL_LONG_DOT); lv_obj_set_width(s_brand_label, 112); lv_obj_set_style_text_color(s_brand_label, lv_color_hex(0xD8FF62), 0); lv_obj_set_style_text_font(s_brand_label, &lv_font_montserrat_14, 0); lv_obj_align(s_brand_label, LV_ALIGN_LEFT_MID, 14, 0);
    s_clock_label = lv_label_create(s_header); lv_obj_set_style_text_color(s_clock_label, lv_color_white(), 0); lv_obj_set_style_text_font(s_clock_label, &lv_font_montserrat_14, 0); lv_obj_align(s_clock_label, LV_ALIGN_CENTER, 0, 0);
    s_status_dot = lv_led_create(s_header); lv_obj_set_size(s_status_dot, 12, 12); lv_obj_set_style_radius(s_status_dot, LV_RADIUS_CIRCLE, 0); lv_led_set_color(s_status_dot, lv_color_hex(0x788078)); lv_led_on(s_status_dot); lv_obj_align(s_status_dot, LV_ALIGN_RIGHT_MID, -58, 0);
    lv_obj_t *settings = lv_button_create(s_header); lv_obj_set_size(settings, 38, 32); lv_obj_align(settings, LV_ALIGN_RIGHT_MID, -8, 0); lv_obj_set_style_bg_color(settings, lv_color_hex(0x2D3D33), 0); lv_obj_set_style_bg_color(settings, lv_color_hex(0x405249), LV_STATE_PRESSED); lv_obj_set_style_radius(settings, 10, 0); lv_obj_set_style_border_width(settings, 1, 0); lv_obj_set_style_border_color(settings, lv_color_hex(0x52665A), 0); lv_obj_add_event_cb(settings, open_settings_event, LV_EVENT_CLICKED, NULL);
    // LVGL ships this Font Awesome settings glyph with Montserrat 14.  Using
    // the bundled icon font is more reliable than composing a cog from child
    // objects (which caused rendering artefacts on the CYD display driver).
    lv_obj_t *settings_icon = lv_label_create(settings);
    lv_label_set_text(settings_icon, LV_SYMBOL_SETTINGS);
    lv_obj_set_style_text_font(settings_icon, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(settings_icon, lv_color_hex(0xD8FF62), 0);
    lv_obj_center(settings_icon);
    lv_obj_clear_flag(settings_icon, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_t *prompt = lv_label_create(s_main_screen); lv_label_set_text(prompt, "Clock in or out"); lv_obj_set_style_text_font(prompt, &lv_font_montserrat_14, 0); lv_obj_set_style_text_color(prompt, lv_color_hex(fg_color()), 0); lv_obj_set_pos(prompt, 14, 55);
    s_pin_label = lv_label_create(s_main_screen); lv_obj_set_size(s_pin_label, 212, 38); lv_obj_set_style_bg_color(s_pin_label, lv_color_white(), 0); lv_obj_set_style_bg_opa(s_pin_label, LV_OPA_COVER, 0); lv_obj_set_style_border_width(s_pin_label, 1, 0); lv_obj_set_style_border_color(s_pin_label, lv_color_hex(0xD4D8D1), 0); lv_obj_set_style_radius(s_pin_label, 10, 0); lv_obj_set_style_pad_left(s_pin_label, 12, 0); lv_obj_set_style_pad_top(s_pin_label, 9, 0); lv_obj_set_style_text_font(s_pin_label, &lv_font_montserrat_14, 0); lv_obj_set_pos(s_pin_label, 14, 78);
    s_status_label = lv_label_create(s_main_screen); lv_obj_set_size(s_status_label, 212, 30); lv_label_set_long_mode(s_status_label, LV_LABEL_LONG_WRAP); lv_obj_set_style_text_font(s_status_label, &lv_font_montserrat_14, 0); lv_obj_set_pos(s_status_label, 14, 120);
    s_keypad = lv_obj_create(s_main_screen); lv_obj_remove_style_all(s_keypad); lv_obj_set_size(s_keypad, 212, 112); lv_obj_set_pos(s_keypad, 14, 149);
    // Keep this row-major order in sync with the web color picker:
    // top-left Coral (A), top-right Ocean (B), bottom-left Lime (C),
    // bottom-right Violet (D).
    static const char *keys[] = { "A", "B", "C", "D" };
    static const uint32_t colors[] = { 0xEF6F61, 0x3D8BFD, 0x9ACB3C, 0x9B72CF };
    for (int i = 0; i < 4; ++i) {
        lv_obj_t *button = lv_button_create(s_keypad);
        lv_obj_set_size(button, 104, 54); lv_obj_set_pos(button, (i % 2) * 108, (i / 2) * 58);
        lv_obj_set_style_bg_color(button, lv_color_hex(colors[i]), 0); lv_obj_set_style_bg_color(button, lv_color_hex(0xFFFFFF), LV_STATE_PRESSED); lv_obj_set_style_text_color(button, lv_color_hex(0x17211B), 0); lv_obj_set_style_text_font(button, &lv_font_montserrat_14, 0); lv_obj_set_style_radius(button, 12, 0); lv_obj_set_style_border_width(button, 1, 0); lv_obj_set_style_border_color(button, lv_color_hex(0xC8CEC7), 0); lv_obj_set_style_shadow_width(button, 3, 0); lv_obj_set_style_shadow_opa(button, LV_OPA_20, 0); lv_obj_add_event_cb(button, keypad_button_event, LV_EVENT_CLICKED, (void *)keys[i]);
    }
    lv_obj_t *clear = lv_button_create(s_main_screen);
    lv_obj_set_size(clear, 212, 30); lv_obj_set_pos(clear, 14, 266);
    lv_obj_set_style_bg_color(clear, lv_color_hex(0x34443A), 0); lv_obj_set_style_bg_color(clear, lv_color_hex(0xD8FF62), LV_STATE_PRESSED);
    lv_obj_set_style_text_color(clear, lv_color_white(), 0); lv_obj_set_style_text_font(clear, &lv_font_montserrat_14, 0); lv_obj_set_style_radius(clear, 9, 0); lv_obj_set_style_border_width(clear, 0, 0);
    lv_obj_add_event_cb(clear, clear_keypad_event, LV_EVENT_CLICKED, NULL);
    lv_obj_t *clear_label = lv_label_create(clear); lv_label_set_text(clear_label, "CLEAR"); lv_obj_center(clear_label);
    s_count_label = lv_label_create(s_main_screen); lv_obj_set_style_text_color(s_count_label, lv_color_hex(0x788078), 0); lv_obj_set_style_text_font(s_count_label, &lv_font_montserrat_14, 0); lv_obj_set_pos(s_count_label, 14, 304);
    set_status("Ready", 0x168455); update_pin_label();
    lv_timer_create(clock_timer, 1000, NULL); clock_timer(NULL);
    lv_timer_create(sync_animation_timer, 420, NULL);
}

static void build_setup_ui(void)
{
    s_setup_screen = lv_obj_create(lv_screen_active());
    lv_obj_remove_style_all(s_setup_screen); lv_obj_set_size(s_setup_screen, H_RES, V_RES); lv_obj_set_style_bg_color(s_setup_screen, lv_color_hex(0x17211B), 0); lv_obj_set_style_bg_opa(s_setup_screen, LV_OPA_COVER, 0); lv_obj_add_flag(s_setup_screen, LV_OBJ_FLAG_HIDDEN);
    lv_obj_t *eyebrow = lv_label_create(s_setup_screen); lv_label_set_text(eyebrow, "TIMETONE  -  OFFLINE"); lv_obj_set_style_text_color(eyebrow, lv_color_hex(0xD8FF62), 0); lv_obj_set_style_text_font(eyebrow, &lv_font_montserrat_14, 0); lv_obj_set_pos(eyebrow, 18, 24);
    lv_obj_t *title = lv_label_create(s_setup_screen); lv_label_set_text(title, "NO NETWORK"); lv_obj_set_style_text_color(title, lv_color_white(), 0); lv_obj_set_style_text_font(title, &lv_font_montserrat_14, 0); lv_obj_set_pos(title, 18, 58);
    lv_obj_t *message = lv_label_create(s_setup_screen); lv_label_set_text(message, "Connect to this access point\nto configure the terminal."); lv_obj_set_style_text_color(message, lv_color_hex(0xC8D0C9), 0); lv_obj_set_style_text_font(message, &lv_font_montserrat_14, 0); lv_obj_set_pos(message, 18, 100);
    lv_obj_t *card = lv_obj_create(s_setup_screen); lv_obj_remove_style_all(card); lv_obj_set_size(card, 204, 122); lv_obj_set_pos(card, 18, 158); lv_obj_set_style_bg_color(card, lv_color_hex(0x26352C), 0); lv_obj_set_style_bg_opa(card, LV_OPA_COVER, 0); lv_obj_set_style_radius(card, 12, 0); lv_obj_set_style_pad_all(card, 14, 0);
    lv_obj_t *details = lv_label_create(card); lv_label_set_text(details, "SETUP WI-FI"); lv_obj_set_style_text_color(details, lv_color_hex(0xA9B6A9), 0); lv_obj_set_style_text_font(details, &lv_font_montserrat_14, 0); lv_obj_set_pos(details, 14, 12);
    s_setup_details = lv_label_create(card); lv_obj_set_style_text_color(s_setup_details, lv_color_white(), 0); lv_obj_set_style_text_font(s_setup_details, &lv_font_montserrat_14, 0); lv_obj_set_pos(s_setup_details, 14, 38);
    lv_obj_t *hint = lv_label_create(s_setup_screen); lv_label_set_text(hint, "Open 192.168.4.1 in your browser"); lv_obj_set_style_text_color(hint, lv_color_hex(0xD8FF62), 0); lv_obj_set_style_text_font(hint, &lv_font_montserrat_14, 0); lv_obj_set_pos(hint, 18, 300);
}

static void build_boot_ui(void)
{
    s_boot_screen = lv_obj_create(lv_screen_active());
    lv_obj_remove_style_all(s_boot_screen); lv_obj_set_size(s_boot_screen, H_RES, V_RES); lv_obj_set_style_bg_color(s_boot_screen, lv_color_hex(0x17211B), 0); lv_obj_set_style_bg_opa(s_boot_screen, LV_OPA_COVER, 0); lv_obj_add_flag(s_boot_screen, LV_OBJ_FLAG_HIDDEN);
    lv_obj_t *brand = lv_label_create(s_boot_screen); lv_label_set_text(brand, "TIMETONE"); lv_obj_set_style_text_color(brand, lv_color_hex(0xD8FF62), 0); lv_obj_set_style_text_font(brand, &lv_font_montserrat_14, 0); lv_obj_align(brand, LV_ALIGN_TOP_MID, 0, 76);
    lv_obj_t *title = lv_label_create(s_boot_screen); lv_label_set_text(title, "Getting things ready"); lv_obj_set_style_text_color(title, lv_color_white(), 0); lv_obj_set_style_text_font(title, &lv_font_montserrat_14, 0); lv_obj_align(title, LV_ALIGN_CENTER, 0, -18);
    s_boot_label = lv_label_create(s_boot_screen); lv_label_set_text(s_boot_label, "Starting terminal"); lv_obj_set_style_text_color(s_boot_label, lv_color_hex(0xC8D0C9), 0); lv_obj_set_style_text_font(s_boot_label, &lv_font_montserrat_14, 0); lv_obj_align(s_boot_label, LV_ALIGN_CENTER, 0, 16);
    lv_obj_t *hint = lv_label_create(s_boot_screen); lv_label_set_text(hint, "Connecting to Wi-Fi and server"); lv_obj_set_style_text_color(hint, lv_color_hex(0xA9B6A9), 0); lv_obj_set_style_text_font(hint, &lv_font_montserrat_14, 0); lv_obj_align(hint, LV_ALIGN_BOTTOM_MID, 0, -64);
}

static void build_ota_ui(void)
{
    s_ota_screen = lv_obj_create(lv_screen_active());
    lv_obj_remove_style_all(s_ota_screen); lv_obj_set_size(s_ota_screen, H_RES, V_RES); lv_obj_set_style_bg_color(s_ota_screen, lv_color_hex(0x17211B), 0); lv_obj_set_style_bg_opa(s_ota_screen, LV_OPA_COVER, 0); lv_obj_add_flag(s_ota_screen, LV_OBJ_FLAG_HIDDEN);
    lv_obj_t *brand = lv_label_create(s_ota_screen); lv_label_set_text(brand, "TIMETONE"); lv_obj_set_style_text_color(brand, lv_color_hex(0xD8FF62), 0); lv_obj_set_style_text_font(brand, &lv_font_montserrat_14, 0); lv_obj_align(brand, LV_ALIGN_TOP_MID, 0, 76);
    lv_obj_t *title = lv_label_create(s_ota_screen); lv_label_set_text(title, "Terminal update"); lv_obj_set_style_text_color(title, lv_color_white(), 0); lv_obj_set_style_text_font(title, &lv_font_montserrat_14, 0); lv_obj_align(title, LV_ALIGN_CENTER, 0, -24);
    s_ota_label = lv_label_create(s_ota_screen); lv_label_set_text(s_ota_label, "Preparing update"); lv_obj_set_style_text_color(s_ota_label, lv_color_hex(0xC8D0C9), 0); lv_obj_set_style_text_font(s_ota_label, &lv_font_montserrat_14, 0); lv_obj_align(s_ota_label, LV_ALIGN_CENTER, 0, 12);
    lv_obj_t *hint = lv_label_create(s_ota_screen); lv_label_set_text(hint, "Do not disconnect power"); lv_obj_set_style_text_color(hint, lv_color_hex(0xA9B6A9), 0); lv_obj_set_style_text_font(hint, &lv_font_montserrat_14, 0); lv_obj_align(hint, LV_ALIGN_BOTTOM_MID, 0, -64);
}

static void build_settings_ui(void)
{
    s_settings_screen = lv_obj_create(lv_screen_active());
    lv_obj_remove_style_all(s_settings_screen); lv_obj_set_size(s_settings_screen, H_RES, V_RES); lv_obj_set_style_bg_color(s_settings_screen, lv_color_hex(0x17211B), 0); lv_obj_set_style_bg_opa(s_settings_screen, LV_OPA_COVER, 0); lv_obj_add_flag(s_settings_screen, LV_OBJ_FLAG_HIDDEN);
    lv_obj_t *title = lv_label_create(s_settings_screen); lv_label_set_text(title, "TERMINAL SETTINGS"); lv_obj_set_style_text_color(title, lv_color_hex(0xD8FF62), 0); lv_obj_set_style_text_font(title, &lv_font_montserrat_14, 0); lv_obj_set_pos(title, 14, 14);
    lv_obj_t *subtitle = lv_label_create(s_settings_screen); lv_label_set_text(subtitle, "Connection and terminal controls"); lv_obj_set_style_text_color(subtitle, lv_color_hex(0xA9B6A9), 0); lv_obj_set_style_text_font(subtitle, &lv_font_montserrat_14, 0); lv_obj_set_pos(subtitle, 14, 36);
    lv_obj_t *connection = lv_obj_create(s_settings_screen); lv_obj_remove_style_all(connection); lv_obj_set_size(connection, 212, 62); lv_obj_set_pos(connection, 14, 60); lv_obj_set_style_bg_color(connection, lv_color_hex(0x26352C), 0); lv_obj_set_style_bg_opa(connection, LV_OPA_COVER, 0); lv_obj_set_style_radius(connection, 12, 0); lv_obj_set_style_border_width(connection, 1, 0); lv_obj_set_style_border_color(connection, lv_color_hex(0x405249), 0);
    s_ip_label = lv_label_create(connection); lv_obj_set_style_text_color(s_ip_label, lv_color_hex(0xD8FF62), 0); lv_obj_set_style_text_font(s_ip_label, &lv_font_montserrat_14, 0); lv_obj_set_pos(s_ip_label, 12, 10); lv_label_set_text(s_ip_label, "IP: 0.0.0.0");
    s_server_label = lv_label_create(connection); lv_obj_set_width(s_server_label, 186); lv_label_set_long_mode(s_server_label, LV_LABEL_LONG_DOT); lv_obj_set_style_text_color(s_server_label, lv_color_hex(0xC8D0C9), 0); lv_obj_set_style_text_font(s_server_label, &lv_font_montserrat_14, 0); lv_obj_set_pos(s_server_label, 12, 34); lv_label_set_text(s_server_label, "Server: not configured");
    lv_obj_t *section = lv_label_create(s_settings_screen); lv_label_set_text(section, "ACTIONS"); lv_obj_set_style_text_color(section, lv_color_hex(0x788078), 0); lv_obj_set_style_text_font(section, &lv_font_montserrat_14, 0); lv_obj_set_pos(section, 14, 134);
    settings_button(s_settings_screen, "THEME", 14, 154, 102, 40, settings_theme_event);
    settings_button(s_settings_screen, "SYNC", 124, 154, 102, 40, settings_sync_event);
    settings_button(s_settings_screen, "CALIBRATE TOUCH", 14, 204, 212, 38, settings_calibrate_event);
    lv_obj_t *hint = lv_label_create(s_settings_screen); lv_label_set_text(hint, "Calibration uses 4 corner taps."); lv_obj_set_style_text_font(hint, &lv_font_montserrat_14, 0); lv_obj_set_style_text_color(hint, lv_color_hex(0xA9B6A9), 0); lv_obj_set_pos(hint, 14, 250);
    settings_button(s_settings_screen, "BACK", 14, 272, 212, 36, settings_back_event);
}

static void build_calibration_ui(void)
{
    s_calibration_screen = lv_obj_create(lv_screen_active());
    lv_obj_remove_style_all(s_calibration_screen); lv_obj_set_size(s_calibration_screen, H_RES, V_RES); lv_obj_set_style_bg_color(s_calibration_screen, lv_color_hex(0x17211B), 0); lv_obj_set_style_bg_opa(s_calibration_screen, LV_OPA_COVER, 0); lv_obj_add_flag(s_calibration_screen, LV_OBJ_FLAG_HIDDEN);
    lv_obj_t *title = lv_label_create(s_calibration_screen); lv_label_set_text(title, "TOUCH CALIBRATION"); lv_obj_set_style_text_color(title, lv_color_hex(0xD8FF62), 0); lv_obj_set_style_text_font(title, &lv_font_montserrat_14, 0); lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 22);
    s_calibration_progress = lv_label_create(s_calibration_screen); lv_label_set_text(s_calibration_progress, "Touch top left target"); lv_obj_set_style_text_color(s_calibration_progress, lv_color_white(), 0); lv_obj_set_style_text_font(s_calibration_progress, &lv_font_montserrat_14, 0); lv_obj_align(s_calibration_progress, LV_ALIGN_TOP_MID, 0, 54);
    static const int points[4][2] = { {25, 92}, {215, 92}, {25, 242}, {215, 242} };
    for (int i = 0; i < 4; ++i) {
        lv_obj_t *target = lv_label_create(s_calibration_screen); lv_label_set_text(target, "+"); lv_obj_set_style_text_color(target, lv_color_hex(0xD8FF62), 0); lv_obj_set_style_text_font(target, &lv_font_montserrat_14, 0); lv_obj_set_pos(target, points[i][0] - 4, points[i][1] - 7);
    }
    lv_obj_t *back = lv_button_create(s_calibration_screen); lv_obj_set_size(back, 100, 32); lv_obj_align(back, LV_ALIGN_BOTTOM_MID, 0, -14); lv_obj_set_style_bg_color(back, lv_color_hex(0x34443A), 0); lv_obj_set_style_border_width(back, 0, 0); lv_obj_set_style_radius(back, 9, 0); lv_obj_add_event_cb(back, calibration_back_event, LV_EVENT_CLICKED, NULL); lv_obj_t *back_label = lv_label_create(back); lv_label_set_text(back_label, "BACK"); lv_obj_set_style_text_font(back_label, &lv_font_montserrat_14, 0); lv_obj_center(back_label);
}

esp_err_t tk_display_init(void)
{
    gpio_config_t backlight = { .pin_bit_mask = (1ULL << PIN_LCD_BL) | (1ULL << PIN_LCD_BL_ALT), .mode = GPIO_MODE_OUTPUT };
    ESP_ERROR_CHECK(gpio_config(&backlight)); gpio_set_level(PIN_LCD_BL, 0); gpio_set_level(PIN_LCD_BL_ALT, 0);
    spi_bus_config_t lcd_bus = { .sclk_io_num = PIN_LCD_SCLK, .mosi_io_num = PIN_LCD_MOSI, .miso_io_num = PIN_LCD_MISO, .quadwp_io_num = -1, .quadhd_io_num = -1, .max_transfer_sz = H_RES * 40 * 2 };
    ESP_ERROR_CHECK(spi_bus_initialize(LCD_HOST, &lcd_bus, SPI_DMA_CH_AUTO));
    esp_lcd_panel_io_spi_config_t io_config = { .dc_gpio_num = PIN_LCD_DC, .cs_gpio_num = PIN_LCD_CS, .pclk_hz = 40 * 1000 * 1000, .lcd_cmd_bits = 8, .lcd_param_bits = 8, .spi_mode = 0, .trans_queue_depth = 10 };
    esp_lcd_panel_io_handle_t io;
    ESP_ERROR_CHECK(esp_lcd_new_panel_io_spi((esp_lcd_spi_bus_handle_t)LCD_HOST, &io_config, &io));
    // The web palette is RGB; use the panel's RGB order so Coral/Ocean/Lime/
    // Violet render with the same hues on the physical terminal.
    esp_lcd_panel_dev_config_t panel_config = { .reset_gpio_num = PIN_LCD_RST, .rgb_ele_order = LCD_RGB_ELEMENT_ORDER_RGB, .bits_per_pixel = 16 };
    esp_lcd_panel_handle_t panel;
    ESP_ERROR_CHECK(esp_lcd_new_panel_st7789(io, &panel_config, &panel));
    ESP_ERROR_CHECK(esp_lcd_panel_reset(panel)); ESP_ERROR_CHECK(esp_lcd_panel_init(panel));
    // The S032 uses a native 240x320 ST7789 portrait panel. Clear MV/MX/MY
    // for the requested 90-degree counter-clockwise portrait orientation.
    // This panel revision already uses normal polarity.  Inverting here makes
    // the palette render as its complementary colors (Coral becomes cyan,
    // Ocean becomes yellow, etc.), so leave inversion disabled.
    ESP_ERROR_CHECK(esp_lcd_panel_invert_color(panel, false)); ESP_ERROR_CHECK(esp_lcd_panel_swap_xy(panel, false)); ESP_ERROR_CHECK(esp_lcd_panel_mirror(panel, false, false)); ESP_ERROR_CHECK(esp_lcd_panel_disp_on_off(panel, true));
    lv_init();
    s_display = lv_display_create(H_RES, V_RES);
    size_t buffer_size = H_RES * 30 * sizeof(lv_color16_t);
    void *buffer1 = spi_bus_dma_memory_alloc(LCD_HOST, buffer_size, 0), *buffer2 = spi_bus_dma_memory_alloc(LCD_HOST, buffer_size, 0);
    assert(buffer1 && buffer2);
    lv_display_set_buffers(s_display, buffer1, buffer2, buffer_size, LV_DISPLAY_RENDER_MODE_PARTIAL);
    lv_display_set_user_data(s_display, panel); lv_display_set_color_format(s_display, LV_COLOR_FORMAT_RGB565); lv_display_set_flush_cb(s_display, flush_cb);
    esp_lcd_panel_io_callbacks_t callbacks = { .on_color_trans_done = flush_done };
    ESP_ERROR_CHECK(esp_lcd_panel_io_register_event_callbacks(io, &callbacks, s_display));
    // The XPT2046 on this unit is on the dedicated touch SPI bus.
    spi_bus_config_t touch_bus = { .sclk_io_num = PIN_TOUCH_SCLK, .mosi_io_num = PIN_TOUCH_MOSI, .miso_io_num = PIN_TOUCH_MISO, .quadwp_io_num = -1, .quadhd_io_num = -1, .max_transfer_sz = 64 };
    ESP_ERROR_CHECK(spi_bus_initialize(TOUCH_HOST, &touch_bus, SPI_DMA_CH_AUTO));
    esp_lcd_panel_io_spi_config_t touch_io_config = ESP_LCD_TOUCH_IO_SPI_XPT2046_CONFIG(PIN_TOUCH_CS);
    esp_lcd_panel_io_handle_t touch_io; ESP_ERROR_CHECK(esp_lcd_new_panel_io_spi((esp_lcd_spi_bus_handle_t)TOUCH_HOST, &touch_io_config, &touch_io));
    // Portrait panel coordinates are correct except for the resistive layer's
    // left/right orientation on this board revision.
    esp_lcd_touch_config_t touch_config = { .x_max = H_RES, .y_max = V_RES, .rst_gpio_num = -1, .int_gpio_num = PIN_TOUCH_IRQ, .flags = { .swap_xy = 0, .mirror_x = 1, .mirror_y = 0 } };
    esp_lcd_touch_handle_t touch; ESP_ERROR_CHECK(esp_lcd_touch_new_spi_xpt2046(touch_io, &touch_config, &touch));
    lv_indev_t *indev = lv_indev_create(); lv_indev_set_type(indev, LV_INDEV_TYPE_POINTER); lv_indev_set_display(indev, s_display); lv_indev_set_user_data(indev, touch); lv_indev_set_read_cb(indev, touch_cb);
    const esp_timer_create_args_t tick_args = { .callback = tick_cb, .name = "lvgl_tick" };
    esp_timer_handle_t timer; ESP_ERROR_CHECK(esp_timer_create(&tick_args, &timer)); ESP_ERROR_CHECK(esp_timer_start_periodic(timer, 2000));
    build_clock_ui(); build_setup_ui(); build_settings_ui(); build_calibration_ui(); build_boot_ui(); build_ota_ui(); tk_display_refresh();
    char current_ip[16]; tk_network_ip(current_ip, sizeof(current_ip)); tk_display_set_ip(current_ip);
    if (s_server_label) lv_label_set_text_fmt(s_server_label, "Server: %s", tk_config_get()->server_url[0] ? tk_config_get()->server_url : "not configured");
    xTaskCreate(lvgl_task, "lvgl", 6144, NULL, 5, NULL);
    s_last_activity_us = esp_timer_get_time(); set_backlight(true);
    ESP_LOGI(TAG, "display initialized");
    return ESP_OK;
}

void tk_display_set_network_state(tk_display_network_state_t state)
{
    if (!s_status_label || !s_setup_screen) return;
    bool changed = s_network_state != state;
    s_network_state = state;
    s_online = state == TK_DISPLAY_ONLINE;
    _lock_acquire(&s_lvgl_lock);
    if (s_status_dot) {
        uint32_t color = state == TK_DISPLAY_ONLINE ? 0x72D572 :
            state == TK_DISPLAY_OFFLINE ? 0xC43D3D :
            state == TK_DISPLAY_CONNECTING ? 0x3D8BFD :
            state == TK_DISPLAY_SYNCING ? 0x9B72CF : 0xD8A33A;
        lv_led_set_color(s_status_dot, lv_color_hex(color)); lv_led_on(s_status_dot);
    }
    if (state != TK_DISPLAY_OFFLINE) {
        if (s_starting && state != TK_DISPLAY_ONLINE && state != TK_DISPLAY_SYNC_RETRYING) { _lock_release(&s_lvgl_lock); return; }
        if (state == TK_DISPLAY_ONLINE || state == TK_DISPLAY_SYNC_RETRYING) { s_starting = false; lv_obj_add_flag(s_boot_screen, LV_OBJ_FLAG_HIDDEN); }
        lv_obj_clear_flag(s_main_screen, LV_OBJ_FLAG_HIDDEN); lv_obj_add_flag(s_setup_screen, LV_OBJ_FLAG_HIDDEN);
        // Health checks run frequently. Preserve useful interaction feedback
        // (such as a successful clock-in) while the connection state is
        // unchanged instead of rewriting it every few seconds.
        if (changed) {
            if (state == TK_DISPLAY_CONNECTING) set_status("Connecting to server", 0xC47B24);
            else if (state == TK_DISPLAY_SYNCING) set_status("Syncing data", 0xC47B24);
            else if (state == TK_DISPLAY_SYNC_RETRYING) set_status("Sync delayed - retrying", 0xC47B24);
            else set_status("Online - synced", 0x168455);
        }
    } else {
        if (s_starting) { _lock_release(&s_lvgl_lock); return; }
        char details[96]; snprintf(details, sizeof(details), "%s\nPassword: timekeep", tk_network_setup_ssid());
        lv_label_set_text(s_setup_details, details);
        lv_obj_add_flag(s_main_screen, LV_OBJ_FLAG_HIDDEN); lv_obj_clear_flag(s_setup_screen, LV_OBJ_FLAG_HIDDEN);
        set_status("Offline - events will queue", 0xC47B24);
    }
    _lock_release(&s_lvgl_lock);
}

void tk_display_set_online(bool online)
{
    tk_display_set_network_state(online ? TK_DISPLAY_ONLINE : TK_DISPLAY_OFFLINE);
}

void tk_display_set_ip(const char *ip)
{
    if (!s_ip_label || !ip) return;
    char text[32]; snprintf(text, sizeof(text), "IP: %s", ip);
    _lock_acquire(&s_lvgl_lock); lv_label_set_text(s_ip_label, text); _lock_release(&s_lvgl_lock);
}

void tk_display_refresh(void)
{
    if (!s_count_label) return;
    int employees, pending; tk_state_t *state = tk_state_lock(); employees = state->employee_count; pending = state->event_count; tk_state_unlock();
    char text[64]; snprintf(text, sizeof(text), "%d people - %d pending", employees, pending);
    _lock_acquire(&s_lvgl_lock); lv_label_set_text(s_count_label, text); _lock_release(&s_lvgl_lock);
}

void tk_display_show_setup(void)
{
    if (!s_setup_screen) return;
    _lock_acquire(&s_lvgl_lock);
    s_starting = false;
    char details[96]; snprintf(details, sizeof(details), "%s\nPassword: timekeep", tk_network_setup_ssid());
    lv_label_set_text(s_setup_details, details);
    lv_obj_add_flag(s_main_screen, LV_OBJ_FLAG_HIDDEN); lv_obj_clear_flag(s_setup_screen, LV_OBJ_FLAG_HIDDEN);
    _lock_release(&s_lvgl_lock);
}

void tk_display_show_startup(void)
{
    if (!s_boot_screen) return;
    _lock_acquire(&s_lvgl_lock); s_starting = true;
    lv_obj_add_flag(s_main_screen, LV_OBJ_FLAG_HIDDEN); lv_obj_add_flag(s_setup_screen, LV_OBJ_FLAG_HIDDEN); lv_obj_add_flag(s_settings_screen, LV_OBJ_FLAG_HIDDEN); lv_obj_clear_flag(s_boot_screen, LV_OBJ_FLAG_HIDDEN);
    _lock_release(&s_lvgl_lock);
}

void tk_display_show_ota(const char *version)
{
    if (!s_ota_screen) return;
    _lock_acquire(&s_lvgl_lock); s_ota_visible = true; s_starting = false;
    lv_obj_add_flag(s_main_screen, LV_OBJ_FLAG_HIDDEN); lv_obj_add_flag(s_setup_screen, LV_OBJ_FLAG_HIDDEN); lv_obj_add_flag(s_settings_screen, LV_OBJ_FLAG_HIDDEN); lv_obj_add_flag(s_boot_screen, LV_OBJ_FLAG_HIDDEN); lv_obj_clear_flag(s_ota_screen, LV_OBJ_FLAG_HIDDEN);
    if (version && version[0]) { char text[48]; snprintf(text, sizeof(text), "Preparing %s", version); lv_label_set_text(s_ota_label, text); }
    _lock_release(&s_lvgl_lock);
}

void tk_display_finish_ota(bool success)
{
    if (!s_ota_screen) return;
    _lock_acquire(&s_lvgl_lock); s_ota_visible = false; lv_obj_add_flag(s_ota_screen, LV_OBJ_FLAG_HIDDEN); lv_obj_clear_flag(s_main_screen, LV_OBJ_FLAG_HIDDEN); set_status(success ? "Update complete" : "Update failed - try again", success ? 0x168455 : 0xC43D3D); _lock_release(&s_lvgl_lock);
}

static void apply_theme_styles(void)
{
    bool dark = dark_theme();
    lv_obj_set_style_bg_color(s_main_screen, lv_color_hex(dark ? 0x17211B : 0xF5F6F2), 0);
    lv_obj_set_style_bg_color(s_pin_label, lv_color_hex(dark ? 0x26352C : 0xFFFFFF), 0);
    lv_obj_set_style_border_color(s_pin_label, lv_color_hex(dark ? 0x45564A : 0xD4D8D1), 0);
    lv_obj_set_style_text_color(s_pin_label, lv_color_hex(dark ? 0xF4F7F2 : 0x17211B), 0);
    lv_obj_set_style_text_color(s_count_label, lv_color_hex(dark ? 0xB5C0B6 : 0x788078), 0);
}

void tk_display_apply_settings(void)
{
    if (!s_main_screen) return;
    _lock_acquire(&s_lvgl_lock);
    apply_theme_styles();
    if (s_server_label) lv_label_set_text_fmt(s_server_label, "Server: %s", tk_config_get()->server_url[0] ? tk_config_get()->server_url : "not configured");
    _lock_release(&s_lvgl_lock);
}

void tk_display_set_company_name(const char *name)
{
    if (!s_brand_label || !name || !name[0]) return;
    _lock_acquire(&s_lvgl_lock);
    lv_label_set_text(s_brand_label, name);
    _lock_release(&s_lvgl_lock);
}

bool tk_display_is_sleeping(void) { return s_screen_sleeping; }
