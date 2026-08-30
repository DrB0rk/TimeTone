# ESP Timekeep firmware

ESP-IDF 6 firmware for the ESP32-2432S032 CYD. It uses LVGL 9.3, the ST7789
LCD driver, and the XPT2046 touch controller.

The S032's 3.2in ST7789 is used in native 240x320 portrait mode. Its
backlight is GPIO27 on the common run (GPIO21 on some production runs; the
firmware drives both). Its XPT2046 uses dedicated SPI pins 25/32/39 (CS33,
IRQ36).

```bash
source /home/drb0rk/.espressif/v6.0.1/esp-idf/export.sh
idf.py build
idf.py -p /dev/ttyUSB0 flash monitor
```

Board pin mapping, provisioning, and cold-boot clock behavior are documented in
[`../docs/HARDWARE.md`](../docs/HARDWARE.md) and
[`../docs/GETTING_STARTED.md`](../docs/GETTING_STARTED.md).
