import { formatDistanceToNow } from "date-fns";
import { Cpu, Pencil, Plus, SlidersHorizontal } from "lucide-react";
import { approveDevice, rejectDevice, renameDevice, saveDeviceSettings } from "@/app/actions";
import { PageHeading } from "@/components/page-heading";
import { UsbFirmwareUpdater } from "@/components/usb-firmware-updater";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDevices } from "@/lib/db";

export default function DevicesPage() {
  // Server-render timestamp used only for the five-minute health threshold.
  // eslint-disable-next-line react-hooks/purity
  const devices = getDevices(), now = Date.now();
  return (
    <>
      <PageHeading
        eyebrow="Fleet"
        title="Devices"
        description="Terminal health, firmware versions, connectivity, and offline queue status."
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="grid gap-4 md:grid-cols-2">
          {devices.map((device) => {
            const online = !!device.last_seen_at &&
              now - new Date(device.last_seen_at).getTime() < 300000;
            return (
              <div
                key={device.id}
                className="rounded-2xl border border-black/6 bg-white p-5"
              >
                <div className="flex items-start justify-between">
                  <span className="grid size-11 place-items-center rounded-xl bg-[#eef0eb]">
                    <Cpu className="size-5" />
                  </span>
                  <Badge
                    className={device.approved === 0
                      ? "bg-orange-100 text-orange-700"
                      : online
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"}
                  >
                    {device.approved === 0
                      ? "Awaiting approval"
                      : online ? "Online" : "Offline"}
                  </Badge>
                </div>
                <div className="mt-5 flex items-center justify-between gap-2">
                  <h2 className="min-w-0 truncate font-semibold">{device.name}</h2>
                  <button type="button" popoverTarget={`rename-${device.id}`} popoverTargetAction="toggle" className="grid size-8 shrink-0 place-items-center rounded-lg border border-black/10 text-black/50 hover:bg-black/[.03]" aria-label={`Rename ${device.name}`}><Pencil className="size-3.5" /></button>
                </div>
                <p className="mt-1 font-mono text-xs text-black/35">
                  {device.id}
                </p>
                <div id={`rename-${device.id}`} popover="auto" className="fixed inset-0 m-auto w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-black/10 bg-white p-5 shadow-xl shadow-black/10" style={{ margin: "auto" }}>
                  <h3 className="font-semibold">Rename terminal</h3>
                  <p className="mt-1 text-sm text-black/45">This changes the display name only; pairing and history are kept.</p>
                  <form action={renameDevice} className="mt-5 space-y-3"><input type="hidden" name="id" value={device.id} /><label className="block text-xs font-medium text-black/55" htmlFor={`name-${device.id}`}>Terminal name</label><input id={`name-${device.id}`} name="name" defaultValue={device.name} className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm" required /><Button type="submit" className="w-full bg-[#17211b] text-white hover:bg-[#26352c]">Save name</Button></form>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-black/6 pt-4 text-xs">
                  <div>
                    <dt className="text-black/35">Last contact</dt>
                    <dd className="mt-1 font-medium">
                      {device.last_seen_at
                        ? formatDistanceToNow(new Date(device.last_seen_at), {
                          addSuffix: true,
                        })
                        : "Never"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-black/35">Firmware</dt>
                    <dd className="mt-1 font-medium">
                      {device.firmware_version || "Unknown"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-black/35">IP address</dt>
                    <dd className="mt-1 font-mono">
                      {device.ip_address || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-black/35">Queue</dt>
                    <dd className="mt-1 font-medium">
                      {device.pending_events} events
                    </dd>
                  </div>
                </dl>
                {device.approved === 1 && (
                  <details className="mt-5 border-t border-black/6 pt-4">
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-black/70"><SlidersHorizontal className="size-4" />Device settings</summary>
                    <p className="mt-2 text-xs leading-4 text-black/45">These controls apply only to this terminal on its next sync.</p>
                    <form action={saveDeviceSettings} className="mt-4 grid gap-3 sm:grid-cols-2">
                      <input type="hidden" name="id" value={device.id} />
                      <label className="space-y-1.5 text-xs font-medium text-black/60">Screen off
                        <select name="screen_off_timeout_seconds" defaultValue={String(device.screen_off_timeout_seconds)} className="block h-9 w-full rounded-lg border border-black/10 bg-white px-2 text-sm font-normal">
                          <option value="0">Never</option><option value="30">30 seconds</option><option value="60">1 minute</option><option value="120">2 minutes</option><option value="300">5 minutes</option><option value="600">10 minutes</option><option value="900">15 minutes</option>
                        </select>
                      </label>
                      <label className="space-y-1.5 text-xs font-medium text-black/60">Low-power mode
                        <select name="low_power_timeout_seconds" defaultValue={String(device.low_power_timeout_seconds)} className="block h-9 w-full rounded-lg border border-black/10 bg-white px-2 text-sm font-normal">
                          <option value="0">Never</option><option value="60">1 minute</option><option value="120">2 minutes</option><option value="300">5 minutes</option><option value="600">10 minutes</option><option value="900">15 minutes</option><option value="1800">30 minutes</option><option value="3600">1 hour</option>
                        </select>
                      </label>
                      <label className="space-y-1.5 text-xs font-medium text-black/60">Sync interval
                        <select name="sync_interval_seconds" defaultValue={String(device.sync_interval_seconds)} className="block h-9 w-full rounded-lg border border-black/10 bg-white px-2 text-sm font-normal">
                          <option value="2">2 seconds</option><option value="5">5 seconds</option><option value="10">10 seconds</option><option value="30">30 seconds</option><option value="60">1 minute</option>
                        </select>
                      </label>
                      <Button type="submit" size="sm" className="sm:col-span-2 bg-[#17211b] text-white hover:bg-[#26352c]">Save device settings</Button>
                    </form>
                  </details>
                )}
                {device.approved === 0 && (
                  <div className="mt-5 flex gap-2 border-t border-black/6 pt-4">
                    <form action={approveDevice} className="flex-1">
                      <input type="hidden" name="id" value={device.id} />
                      <Button type="submit" className="w-full bg-[#17211b] text-white hover:bg-[#26352c]">
                        Approve device
                      </Button>
                    </form>
                    <form action={rejectDevice}>
                      <input type="hidden" name="id" value={device.id} />
                      <Button type="submit" variant="outline">Reject</Button>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="grid h-fit gap-6">
        <div className="rounded-2xl bg-[#17211b] p-6 text-white">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[#d8ff62] text-[#17211b]">
              <Plus className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold">Register terminal</h2>
              <p className="text-xs text-white/40">
                Pair terminals from their setup page
              </p>
            </div>
          </div>
          <div className="mt-6 space-y-3 text-sm text-white/65">
            <p>1. Join the terminal’s <span className="font-medium text-white">TimeTone</span> setup Wi-Fi.</p>
            <p>2. Enter this server URL in the setup page and save.</p>
            <p>3. The new terminal appears here automatically for approval.</p>
            <div className="rounded-xl bg-white/8 p-3 text-xs text-white/45">
              No device token is required. Each terminal creates its own secure credential.
            </div>
          </div>
        </div>
          <UsbFirmwareUpdater />
        </div>
      </div>
    </>
  );
}
