import { formatDistanceToNow } from "date-fns";
import { Cpu, Plus, Radio } from "lucide-react";
import { createDevice } from "@/app/actions";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
                    className={online
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"}
                  >
                    {online ? "Online" : "Offline"}
                  </Badge>
                </div>
                <h2 className="mt-5 font-semibold">{device.name}</h2>
                <p className="mt-1 font-mono text-xs text-black/35">
                  {device.id}
                </p>
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
              </div>
            );
          })}
        </div>
        <div className="h-fit rounded-2xl bg-[#17211b] p-6 text-white">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[#d8ff62] text-[#17211b]">
              <Plus className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold">Register terminal</h2>
              <p className="text-xs text-white/40">
                Use the same token during setup
              </p>
            </div>
          </div>
          <form action={createDevice} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Device name</Label>
              <Input
                id="name"
                name="name"
                placeholder="Kitchen entrance"
                className="border-white/15 bg-white/8"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="token">Device token</Label>
              <Input
                id="token"
                name="token"
                placeholder="At least 12 characters"
                minLength={12}
                className="border-white/15 bg-white/8"
                required
              />
            </div>
            <Button type="submit" className="w-full bg-[#d8ff62] text-[#17211b] hover:bg-[#c9ef58]">
              <Radio className="size-4" />Register
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
