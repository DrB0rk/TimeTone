# ESP Timekeep firmware

ESP-IDF 6 firmware for the ESP32-2432S028R CYD. It uses LVGL 9.3, the ILI9341
LCD driver, and the XPT2046 touch controller.

```bash
source /home/drb0rk/.espressif/v6.0.1/esp-idf/export.sh
idf.py build
idf.py -p /dev/ttyUSB0 flash monitor
```

Board pin mapping, provisioning, and cold-boot clock behavior are documented in
[`../docs/HARDWARE.md`](../docs/HARDWARE.md) and
[`../docs/GETTING_STARTED.md`](../docs/GETTING_STARTED.md).
