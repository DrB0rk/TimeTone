# TimeTone firmware

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

This writes the bootloader, partition table and app required by a factory-fresh
board. After first boot, provision Wi-Fi at `http://192.168.4.1` through the
terminal setup access point.

## Build a USB update image

```bash
idf.py build
ls build/timetone.bin
```

Upload that file in the dashboard at **Devices → USB firmware update**. The
web updater writes it to the application partition (`0x20000`) and keeps NVS
configuration intact. It is intended for an already flashed TimeTone terminal.

## Validate

```bash
idf.py build
```

The build must report `timetone.bin` and leave space in the app partition.

Board pin mapping, provisioning, and cold-boot clock behavior are documented in
[`../docs/HARDWARE.md`](../docs/HARDWARE.md) and
[`../docs/GETTING_STARTED.md`](../docs/GETTING_STARTED.md).
