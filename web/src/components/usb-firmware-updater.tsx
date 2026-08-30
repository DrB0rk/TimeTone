"use client";

import { useMemo, useRef, useState } from "react";
import { ESPLoader, Transport } from "esptool-js";
import { AlertTriangle, CheckCircle2, Cpu, LoaderCircle, Upload, Usb } from "lucide-react";
import { Button } from "@/components/ui/button";

const FIRMWARE_OFFSET = 0x20000;

type FlashState = "idle" | "flashing" | "complete" | "error";
type SerialEnabledNavigator = Navigator & {
  serial: { requestPort: () => Promise<ConstructorParameters<typeof Transport>[0]> };
};

export function UsbFirmwareUpdater() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<FlashState>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("Choose a TimeTone .bin application image to begin.");
  const supported = useMemo(
    () => typeof navigator !== "undefined" && "serial" in navigator,
    [],
  );

  const selectFile = (selected: File | null) => {
    setFile(selected);
    setState("idle");
    setProgress(0);
    setMessage(selected
      ? `${selected.name} is ready to flash.`
      : "Choose a TimeTone .bin application image to begin.");
  };

  const flash = async () => {
    if (!file || !supported || state === "flashing") return;
    if (!file.name.toLowerCase().endsWith(".bin")) {
      setState("error");
      setMessage("Please select an ESP-IDF .bin firmware image.");
      return;
    }

    let transport: Transport | undefined;
    try {
      setState("flashing");
      setProgress(0);
      setMessage("Select the ESP32 serial port in your browser.");
      const port = await (navigator as SerialEnabledNavigator).serial.requestPort();
      transport = new Transport(port, false);
      const loader = new ESPLoader({
        transport,
        baudrate: 115200,
        terminal: {
          clean() {},
          write(line) {
            if (line.includes("Connecting") || line.includes("Chip")) setMessage(line.trim());
          },
          writeLine(line) {
            if (line.includes("Connecting") || line.includes("Chip")) setMessage(line.trim());
          },
        },
      });
      const chip = await loader.main();
      if (!chip.toLowerCase().includes("esp32")) {
        throw new Error(`This firmware supports ESP32 terminals, not ${chip}.`);
      }
      setMessage(`${chip} detected. Writing firmware… Keep the cable connected.`);
      const data = new Uint8Array(await file.arrayBuffer());
      await loader.writeFlash({
        fileArray: [{ data, address: FIRMWARE_OFFSET }],
        flashMode: "dio",
        flashFreq: "40m",
        flashSize: "4MB",
        eraseAll: false,
        compress: true,
        reportProgress: (_index, written, total) => {
          setProgress(Math.min(100, Math.round((written / total) * 100)));
        },
      });
      await loader.after("hard_reset");
      setProgress(100);
      setState("complete");
      setMessage("Firmware installed. The terminal is restarting and will reconnect shortly.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown serial error";
      setState("error");
      setMessage(`Update stopped: ${detail}`);
    } finally {
      await transport?.disconnect().catch(() => undefined);
    }
  };

  return (
    <section className="rounded-2xl border border-black/6 bg-white p-6 dark:border-white/10 dark:bg-[#1b261f]">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#d8ff62] text-[#17211b]">
          <Usb className="size-5" />
        </span>
        <div>
          <h2 className="font-semibold">USB firmware update</h2>
          <p className="mt-1 text-sm leading-5 text-black/50 dark:text-white/55">
            Update a connected TimeTone terminal directly from this browser. Existing Wi-Fi and server settings stay in place.
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-dashed border-black/12 bg-[#f7f8f5] p-4 dark:border-white/15 dark:bg-white/5">
        <input ref={input} type="file" accept=".bin,application/octet-stream" className="sr-only" onChange={(event) => selectFile(event.target.files?.[0] ?? null)} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={() => input.current?.click()} disabled={state === "flashing"}>
            <Upload className="size-4" /> Choose firmware
          </Button>
          <span className="min-w-0 truncate text-sm text-black/55 dark:text-white/60">{file?.name || "No file selected"}</span>
        </div>
        <p className="mt-3 text-xs leading-5 text-black/45 dark:text-white/45">
          Use the <code className="rounded bg-black/5 px-1 py-0.5 dark:bg-white/10">timetone.bin</code> application image from a TimeTone release or a local ESP-IDF build. This is an update tool; use the USB installer for a factory-fresh board.
        </p>
      </div>

      {!supported && (
        <div className="mt-4 flex gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Web Serial needs Chrome or Edge on desktop, opened from <strong>HTTPS</strong> (or localhost). Open TimeTone through its HTTPS address, then try again.
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 text-sm" aria-live="polite">
        {state === "flashing" ? <LoaderCircle className="size-4 animate-spin text-[#4b6e28]" /> : state === "complete" ? <CheckCircle2 className="size-4 text-emerald-600" /> : state === "error" ? <AlertTriangle className="size-4 text-red-600" /> : <Cpu className="size-4 text-black/40 dark:text-white/45" />}
        <span className={state === "error" ? "text-red-700 dark:text-red-300" : "text-black/60 dark:text-white/65"}>{message}</span>
      </div>
      {state === "flashing" && <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/8 dark:bg-white/10"><div className="h-full rounded-full bg-[#a4d64c] transition-[width] duration-200" style={{ width: `${progress}%` }} /></div>}
      <Button type="button" className="mt-5 w-full bg-[#17211b] text-white hover:bg-[#26352c] dark:!text-white" disabled={!file || !supported || state === "flashing"} onClick={flash}>
        {state === "flashing" ? `Flashing ${progress}%` : "Flash connected terminal"}
      </Button>
    </section>
  );
}
