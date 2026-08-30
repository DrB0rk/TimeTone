# CYD hardware target

The default target is the common **ESP32-2432S028R** Cheap Yellow Display with
an ILI9341 320×240 LCD and XPT2046 resistive touchscreen. The on-screen keypad
uses the touchscreen; no external keypad is required.

| Function | GPIO |
|---|---:|
| LCD clock | 14 |
| LCD MOSI | 13 |
| LCD MISO | 12 |
| LCD chip select | 15 |
| LCD data/command | 2 |
| LCD backlight | 21 |
| Touch clock | 25 |
| Touch MOSI | 32 |
| Touch MISO | 39 |
| Touch chip select | 33 |

Some CYD revisions rotate or mirror the touch layer differently. Adjust
`touch_config.flags` in `firmware/main/display.c` if presses are mirrored. The
firmware uses landscape orientation and the standard R-board dual-SPI pinout.

The classic ESP32 has no battery-backed real-time clock. It obtains UTC from
NTP. It can keep correct time and queue events while Wi-Fi is down after a time
sync, but a cold boot with no network cannot know wall-clock time. In that case
the UI deliberately prevents time entry instead of recording a wrong time. Add
a DS3231 RTC for sites that require correct cold-boot operation during a total
network outage.

