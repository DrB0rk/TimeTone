"use client";

import { useEffect, useState } from "react";
import { Download, RefreshCw, Rocket } from "lucide-react";

type Release = { current: string; latest?: string; name?: string; url?: string; notes?: string; updateAvailable?: boolean; error?: string };
type UpdateStatus = { status: string; message?: string; version?: string | null };
export function ReleaseUpdater() {
  const [release, setRelease] = useState<Release | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState<UpdateStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try { const response = await fetch("/api/update/status", { cache: "no-store" }); const data = await response.json() as UpdateStatus; if (!cancelled) setProgress(data.status === "idle" ? null : data); } catch { /* status is best effort */ }
    }
    void poll();
    const timer = window.setInterval(() => void poll(), 1500);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);
  async function check() { setBusy(true); setMessage(""); try { const response = await fetch("/api/update/check", { cache: "no-store" }); const data = await response.json() as Release; setRelease(data); if (!response.ok) setMessage(data.error || "Update check failed."); } catch { setMessage("Unable to reach GitHub."); } finally { setBusy(false); } }
  async function install() {
    if (!release?.latest) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/update/install", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tag: release.latest }) });
      const raw = await response.text();
      let data: { message?: string; error?: string } = {};
      try { data = JSON.parse(raw) as { message?: string; error?: string }; } catch { /* a proxy error may be HTML */ }
      if (response.ok) setMessage(data.message || "Update started.");
      else if (response.status === 502) setMessage("The server connection was interrupted while handing off the update. Check status in a minute; it may already be restarting.");
      else setMessage(data.error || `Update failed (${response.status}).`);
    } catch { setMessage("Could not contact the update service. Check the server status and try again."); }
    finally { setBusy(false); }
  }
  const active = progress && !["complete", "error"].includes(progress.status);
  return <div className="rounded-xl border border-black/8 bg-[#f5f6f2] p-4 dark:border-white/10 dark:bg-[#243127]"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">Software updates</p><p className="mt-1 text-sm leading-5 text-black/50 dark:text-white/60">Check GitHub for the newest stable TimeTone release.</p>{release?.latest && <p className="mt-2 text-xs text-black/55 dark:text-white/65">Installed {release.current} · Latest {release.latest}</p>}</div><div className="flex gap-2"><button type="button" onClick={check} disabled={busy || !!active} className="inline-flex h-9 items-center gap-2 rounded-lg border border-black/12 bg-white px-3 text-sm font-medium transition hover:-translate-y-0.5 disabled:opacity-50 dark:border-white/15 dark:bg-[#1b261f]"><RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />Check for updates</button>{release?.updateAvailable && <button type="button" onClick={install} disabled={busy || !!active} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#17211b] px-3 text-sm font-medium text-white transition hover:-translate-y-0.5 disabled:opacity-50"><Rocket className="size-4" />Install {release.latest}</button>}</div></div>{active && <div className="mt-4 rounded-lg border border-[#d8ff62]/25 bg-[#17211b] p-3 text-white"><div className="flex items-center gap-2 text-sm font-medium"><RefreshCw className="size-4 animate-spin text-[#d8ff62]" />{progress.message || "Updating TimeTone…"}</div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full w-2/3 animate-pulse rounded-full bg-[#d8ff62]" /></div><p className="mt-2 text-xs text-white/60">Keep this page open. The server will restart automatically when the new version is ready.</p></div>}{progress?.status === "complete" && <p className="mt-3 rounded-lg bg-[#eaf4d5] px-3 py-2 text-sm text-[#40552c] dark:bg-[#33472f] dark:text-[#d8ff62]">{progress.message || "Update complete."}</p>}{progress?.status === "error" && <p className="mt-3 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{progress.message || "Update failed."}</p>}{release?.updateAvailable && <p className="mt-3 rounded-lg bg-[#eaf4d5] px-3 py-2 text-sm text-[#40552c] dark:bg-[#33472f] dark:text-[#d8ff62]">A new stable release is ready. Your current settings and database are kept during the update.</p>}{release && !release.updateAvailable && !release.error && !progress && <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">You are up to date.</p>}{message && <p className="mt-3 text-sm text-black/60 dark:text-white/70">{message}</p>}{release?.url && <a className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-black/55 hover:text-black dark:text-white/60 dark:hover:text-white" href={release.url} target="_blank" rel="noreferrer"><Download className="size-3.5" />View release notes on GitHub</a>}</div>;
}
