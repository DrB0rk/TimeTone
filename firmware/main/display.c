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
static lv_obj_t *s_main_screen, *s_setup_screen;
static lv_obj_t *s_clock_label, *s_status_label, *s_pin_label, *s_keypad, *s_count_label;
static lv_obj_t *s_setup_details;
static char s_pin[9];
static bool s_online;

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
        data->point.x = x[0]; data->point.y = y[0]; data->state = LV_INDEV_STATE_PRESSED;
    } else data->state = LV_INDEV_STATE_RELEASED;
}

static void tick_cb(void *argument) { lv_tick_inc(2); }

static void lvgl_task(void *argument)
{
    while (true) {
        _lock_acquire(&s_lvgl_lock);
        uint32_t wait = lv_timer_handler();
        _lock_release(&s_lvgl_lock);
        wait = wait < 2 ? 2 : (wait > 100 ? 100 : wait);
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
    lv_label_set_text(s_pin_label, hidden[0] ? hidden : "Enter your PIN");
    lv_obj_set_style_text_color(s_pin_label, lv_color_hex(hidden[0] ? 0x17211B : 0x788078), 0);
}

static void handle_keypress(const char *text)
{
    if (!text) return;
    if (strcmp(text, "<") == 0) {
        size_t length = strlen(s_pin); if (length) s_pin[length - 1] = 0;
    } else if (strcmp(text, "OK") == 0) {
        const tk_employee_t *employee = tk_find_employee_by_code(s_pin);
        if (!employee) set_status("PIN not recognised — try again", 0xC43D3D);
        else {
            bool clocked_in;
            esp_err_t err = tk_toggle_employee(employee->id, NULL, &clocked_in);
            if (err == ESP_ERR_INVALID_STATE) set_status("Waiting for a valid time — connect Wi-Fi", 0xC47B24);
            else if (err == ESP_ERR_NO_MEM) set_status("Offline queue full — connect Wi-Fi", 0xC43D3D);
            else if (err == ESP_OK) {
                char message[96];
                snprintf(message, sizeof(message), "%s, %s!", clocked_in ? "Welcome" : "Goodbye", employee->name);
                set_status(message, clocked_in ? 0x168455 : 0x526159);
                tk_api_wake();
            }
        }
        s_pin[0] = 0;
    } else if (strlen(s_pin) < 8) strlcat(s_pin, text, sizeof(s_pin));
    update_pin_label();
}

static void keypad_button_event(lv_event_t *event)
{
    handle_keypress((const char *)lv_event_get_user_data(event));
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

static void build_clock_ui(void)
{
    s_main_screen = lv_obj_create(lv_screen_active());
    lv_obj_remove_style_all(s_main_screen); lv_obj_set_size(s_main_screen, H_RES, V_RES); lv_obj_set_style_bg_color(s_main_screen, lv_color_hex(0xF5F6F2), 0); lv_obj_set_style_bg_opa(s_main_screen, LV_OPA_COVER, 0);
    lv_obj_t *header = lv_obj_create(s_main_screen);
    lv_obj_remove_style_all(header); lv_obj_set_size(header, H_RES, 46); lv_obj_set_style_bg_color(header, lv_color_hex(0x17211B), 0); lv_obj_set_style_bg_opa(header, LV_OPA_COVER, 0);
    lv_obj_t *brand = lv_label_create(header); lv_label_set_text(brand, "ESP TIMEKEEP"); lv_obj_set_style_text_color(brand, lv_color_hex(0xD8FF62), 0); lv_obj_set_style_text_font(brand, &lv_font_montserrat_14, 0); lv_obj_align(brand, LV_ALIGN_LEFT_MID, 14, 0);
    s_clock_label = lv_label_create(header); lv_obj_set_style_text_color(s_clock_label, lv_color_white(), 0); lv_obj_set_style_text_font(s_clock_label, &lv_font_montserrat_14, 0); lv_obj_align(s_clock_label, LV_ALIGN_RIGHT_MID, -14, 0);
    lv_obj_t *prompt = lv_label_create(s_main_screen); lv_label_set_text(prompt, "Clock in or out"); lv_obj_set_style_text_font(prompt, &lv_font_montserrat_14, 0); lv_obj_set_style_text_color(prompt, lv_color_hex(0x17211B), 0); lv_obj_set_pos(prompt, 14, 55);
    s_pin_label = lv_label_create(s_main_screen); lv_obj_set_size(s_pin_label, 212, 38); lv_obj_set_style_bg_color(s_pin_label, lv_color_white(), 0); lv_obj_set_style_bg_opa(s_pin_label, LV_OPA_COVER, 0); lv_obj_set_style_border_width(s_pin_label, 1, 0); lv_obj_set_style_border_color(s_pin_label, lv_color_hex(0xD4D8D1), 0); lv_obj_set_style_radius(s_pin_label, 10, 0); lv_obj_set_style_pad_left(s_pin_label, 12, 0); lv_obj_set_style_pad_top(s_pin_label, 9, 0); lv_obj_set_style_text_font(s_pin_label, &lv_font_montserrat_14, 0); lv_obj_set_pos(s_pin_label, 14, 78);
    s_status_label = lv_label_create(s_main_screen); lv_obj_set_size(s_status_label, 212, 30); lv_label_set_long_mode(s_status_label, LV_LABEL_LONG_WRAP); lv_obj_set_style_text_font(s_status_label, &lv_font_montserrat_14, 0); lv_obj_set_pos(s_status_label, 14, 120);
    s_keypad = lv_obj_create(s_main_screen); lv_obj_remove_style_all(s_keypad); lv_obj_set_size(s_keypad, 212, 144); lv_obj_set_pos(s_keypad, 14, 157);
    static const char *keys[] = { "1", "2", "3", "4", "5", "6", "7", "8", "9", "<", "0", "OK" };
    for (int i = 0; i < 12; ++i) {
        lv_obj_t *button = lv_button_create(s_keypad);
        lv_obj_set_size(button, 64, 30); lv_obj_set_pos(button, (i % 3) * 74, (i / 3) * 37);
        lv_obj_set_style_bg_color(button, lv_color_white(), 0); lv_obj_set_style_bg_color(button, lv_color_hex(0xD8FF62), LV_STATE_PRESSED); lv_obj_set_style_text_color(button, lv_color_hex(0x17211B), 0); lv_obj_set_style_text_font(button, &lv_font_montserrat_14, 0); lv_obj_set_style_radius(button, 9, 0); lv_obj_set_style_border_width(button, 1, 0); lv_obj_set_style_border_color(button, lv_color_hex(0xC8CEC7), 0); lv_obj_set_style_shadow_width(button, 3, 0); lv_obj_set_style_shadow_opa(button, LV_OPA_20, 0); lv_obj_add_event_cb(button, keypad_button_event, LV_EVENT_CLICKED, (void *)keys[i]);
        lv_obj_t *label = lv_label_create(button); lv_label_set_text(label, keys[i]); lv_obj_center(label);
    }
    s_count_label = lv_label_create(s_main_screen); lv_obj_set_style_text_color(s_count_label, lv_color_hex(0x788078), 0); lv_obj_set_style_text_font(s_count_label, &lv_font_montserrat_14, 0); lv_obj_set_pos(s_count_label, 14, 304);
    set_status("Ready", 0x168455); update_pin_label();
    lv_timer_create(clock_timer, 1000, NULL); clock_timer(NULL);
}

static void build_setup_ui(void)
{
    s_setup_screen = lv_obj_create(lv_screen_active());
    lv_obj_remove_style_all(s_setup_screen); lv_obj_set_size(s_setup_screen, H_RES, V_RES); lv_obj_set_style_bg_color(s_setup_screen, lv_color_hex(0x17211B), 0); lv_obj_set_style_bg_opa(s_setup_screen, LV_OPA_COVER, 0); lv_obj_add_flag(s_setup_screen, LV_OBJ_FLAG_HIDDEN);
    lv_obj_t *eyebrow = lv_label_create(s_setup_screen); lv_label_set_text(eyebrow, "ESP TIMEKEEP  •  OFFLINE"); lv_obj_set_style_text_color(eyebrow, lv_color_hex(0xD8FF62), 0); lv_obj_set_style_text_font(eyebrow, &lv_font_montserrat_14, 0); lv_obj_set_pos(eyebrow, 18, 24);
    lv_obj_t *title = lv_label_create(s_setup_screen); lv_label_set_text(title, "NO NETWORK"); lv_obj_set_style_text_color(title, lv_color_white(), 0); lv_obj_set_style_text_font(title, &lv_font_montserrat_14, 0); lv_obj_set_pos(title, 18, 58);
    lv_obj_t *message = lv_label_create(s_setup_screen); lv_label_set_text(message, "Connect to this access point\nto configure the terminal."); lv_obj_set_style_text_color(message, lv_color_hex(0xC8D0C9), 0); lv_obj_set_style_text_font(message, &lv_font_montserrat_14, 0); lv_obj_set_pos(message, 18, 100);
    lv_obj_t *card = lv_obj_create(s_setup_screen); lv_obj_remove_style_all(card); lv_obj_set_size(card, 204, 122); lv_obj_set_pos(card, 18, 158); lv_obj_set_style_bg_color(card, lv_color_hex(0x26352C), 0); lv_obj_set_style_bg_opa(card, LV_OPA_COVER, 0); lv_obj_set_style_radius(card, 12, 0); lv_obj_set_style_pad_all(card, 14, 0);
    lv_obj_t *details = lv_label_create(card); lv_label_set_text(details, "SETUP WI-FI"); lv_obj_set_style_text_color(details, lv_color_hex(0xA9B6A9), 0); lv_obj_set_style_text_font(details, &lv_font_montserrat_14, 0); lv_obj_set_pos(details, 14, 12);
    s_setup_details = lv_label_create(card); lv_obj_set_style_text_color(s_setup_details, lv_color_white(), 0); lv_obj_set_style_text_font(s_setup_details, &lv_font_montserrat_14, 0); lv_obj_set_pos(s_setup_details, 14, 38);
    lv_obj_t *hint = lv_label_create(s_setup_screen); lv_label_set_text(hint, "Open 192.168.4.1 in your browser"); lv_obj_set_style_text_color(hint, lv_color_hex(0xD8FF62), 0); lv_obj_set_style_text_font(hint, &lv_font_montserrat_14, 0); lv_obj_set_pos(hint, 18, 300);
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
    esp_lcd_panel_dev_config_t panel_config = { .reset_gpio_num = PIN_LCD_RST, .rgb_ele_order = LCD_RGB_ELEMENT_ORDER_BGR, .bits_per_pixel = 16 };
    esp_lcd_panel_handle_t panel;
    ESP_ERROR_CHECK(esp_lcd_new_panel_st7789(io, &panel_config, &panel));
    ESP_ERROR_CHECK(esp_lcd_panel_reset(panel)); ESP_ERROR_CHECK(esp_lcd_panel_init(panel));
    // The S032 uses a native 240x320 ST7789 portrait panel. Clear MV/MX/MY
    // for the requested 90-degree counter-clockwise portrait orientation.
    ESP_ERROR_CHECK(esp_lcd_panel_invert_color(panel, true)); ESP_ERROR_CHECK(esp_lcd_panel_swap_xy(panel, false)); ESP_ERROR_CHECK(esp_lcd_panel_mirror(panel, false, false)); ESP_ERROR_CHECK(esp_lcd_panel_disp_on_off(panel, true));
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
    esp_lcd_touch_config_t touch_config = { .x_max = H_RES, .y_max = V_RES, .rst_gpio_num = -1, .int_gpio_num = PIN_TOUCH_IRQ, .flags = { .swap_xy = 0, .mirror_x = 0, .mirror_y = 0 } };
    esp_lcd_touch_handle_t touch; ESP_ERROR_CHECK(esp_lcd_touch_new_spi_xpt2046(touch_io, &touch_config, &touch));
    lv_indev_t *indev = lv_indev_create(); lv_indev_set_type(indev, LV_INDEV_TYPE_POINTER); lv_indev_set_display(indev, s_display); lv_indev_set_user_data(indev, touch); lv_indev_set_read_cb(indev, touch_cb);
    const esp_timer_create_args_t tick_args = { .callback = tick_cb, .name = "lvgl_tick" };
    esp_timer_handle_t timer; ESP_ERROR_CHECK(esp_timer_create(&tick_args, &timer)); ESP_ERROR_CHECK(esp_timer_start_periodic(timer, 2000));
    build_clock_ui(); build_setup_ui(); tk_display_refresh();
    xTaskCreate(lvgl_task, "lvgl", 6144, NULL, 5, NULL);
    gpio_set_level(PIN_LCD_BL, 1); gpio_set_level(PIN_LCD_BL_ALT, 1);
    ESP_LOGI(TAG, "display initialized");
    return ESP_OK;
}

void tk_display_set_online(bool online)
{
    if (!s_status_label || !s_setup_screen) return;
    s_online = online; _lock_acquire(&s_lvgl_lock);
    if (online) {
        lv_obj_clear_flag(s_main_screen, LV_OBJ_FLAG_HIDDEN); lv_obj_add_flag(s_setup_screen, LV_OBJ_FLAG_HIDDEN);
        set_status("Online · synced", 0x168455);
    } else {
        char details[96]; snprintf(details, sizeof(details), "%s\nPassword: timekeep", tk_network_setup_ssid());
        lv_label_set_text(s_setup_details, details);
        lv_obj_add_flag(s_main_screen, LV_OBJ_FLAG_HIDDEN); lv_obj_clear_flag(s_setup_screen, LV_OBJ_FLAG_HIDDEN);
        set_status("Offline · events will queue", 0xC47B24);
    }
    _lock_release(&s_lvgl_lock);
}

void tk_display_refresh(void)
{
    if (!s_count_label) return;
    int employees, pending; tk_state_t *state = tk_state_lock(); employees = state->employee_count; pending = state->event_count; tk_state_unlock();
    char text[64]; snprintf(text, sizeof(text), "%d people · %d pending", employees, pending);
    _lock_acquire(&s_lvgl_lock); lv_label_set_text(s_count_label, text); _lock_release(&s_lvgl_lock);
}

void tk_display_show_setup(void)
{
    if (!s_setup_screen) return;
    _lock_acquire(&s_lvgl_lock);
    char details[96]; snprintf(details, sizeof(details), "%s\nPassword: timekeep", tk_network_setup_ssid());
    lv_label_set_text(s_setup_details, details);
    lv_obj_add_flag(s_main_screen, LV_OBJ_FLAG_HIDDEN); lv_obj_clear_flag(s_setup_screen, LV_OBJ_FLAG_HIDDEN);
    _lock_release(&s_lvgl_lock);
}
