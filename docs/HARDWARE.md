# CYD hardware target

The default target is the **ESP32-2432S032** Cheap Yellow Display v2 with a
3.2-inch ST7789 320×240 IPS LCD and XPT2046 resistive touchscreen. The on-screen keypad
uses the touchscreen; no external keypad is required.

The ST7789 controller is conventionally documented as 240×320 native; the
firmware uses that native portrait orientation and enables panel inversion.

| Function | GPIO |
|---|---:|
| LCD clock | 14 |
| LCD MOSI | 13 |
| LCD MISO | 12 |
| LCD chip select | 15 |
| LCD data/command | 2 |
| LCD backlight | 27 (also drives 21 for S032 variants) |
| Touch clock (dedicated SPI) | 25 |
| Touch MOSI (dedicated SPI) | 32 |
| Touch MISO (dedicated SPI) | 39 |
| Touch chip select | 33 |
| Touch IRQ | 36 |

The S032 family has production variants; this unit uses a dedicated SPI bus
for the XPT2046 touch controller. The firmware uses portrait orientation and
the S032 pinout above. Backlight
enable is driven on both GPIO27 and GPIO21 because both routings exist across
S032 production runs.

The classic ESP32 has no battery-backed real-time clock. It obtains UTC from
NTP. It can keep correct time and queue events while Wi-Fi is down after a time
sync, but a cold boot with no network cannot know wall-clock time. In that case
the UI deliberately prevents time entry instead of recording a wrong time. Add
a DS3231 RTC for sites that require correct cold-boot operation during a total
network outage.
