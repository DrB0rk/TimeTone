import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";
const repository = "DrB0rk/TimeTone";

function statusPath() {
  const databasePath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "timekeep.db");
  return path.join(path.dirname(databasePath), "update-status.json");
}

function installRoot(docker: boolean) {
  if (process.env.TIMETONE_UPDATE_ROOT) return process.env.TIMETONE_UPDATE_ROOT;
  const candidates = docker
    ? ["/host", path.resolve(process.cwd(), "../.."), path.resolve(process.cwd(), "..")]
    : [path.resolve(process.cwd(), "../.."), path.resolve(process.cwd(), "../../.."), path.resolve(process.cwd(), "..")];
  return candidates.find((candidate) => {
    try { return fsSync.existsSync(path.join(candidate, "scripts", docker ? "install-release-docker.sh" : "install-release.sh")); } catch { return false; }
  }) || candidates[0];
}

async function writeStatus(status: string, message: string, version?: string) {
  await fs.writeFile(statusPath(), JSON.stringify({ status, message, version: version || null, updatedAt: new Date().toISOString() }));
}

export async function POST(request: Request) {
  try {
    await requireAuth();
    const body = await request.json().catch(() => ({})) as { tag?: string };
    const tag = String(body.tag || "").match(/^v?\d+\.\d+\.\d+$/)?.[0];
    if (!tag) return Response.json({ error: "Choose a valid release version first." }, { status: 400 });
    const releaseTag = tag.startsWith("v") ? tag : `v${tag}`;
    const response = await fetch(`https://api.github.com/repos/${repository}/releases/tags/${releaseTag}`, { headers: { Accept: "application/vnd.github+json", "User-Agent": "TimeTone-updater" }, signal: AbortSignal.timeout(10000), cache: "no-store" });
    if (!response.ok) return Response.json({ error: `GitHub release lookup failed (${response.status}).` }, { status: 502 });
    const release = await response.json() as { tag_name?: string; tarball_url?: string; draft?: boolean; prerelease?: boolean };
    if (!release.tarball_url || release.draft || release.prerelease) return Response.json({ error: "Only published stable releases can be installed." }, { status: 400 });
    const archiveResponse = await fetch(release.tarball_url, { headers: { Accept: "application/octet-stream", "User-Agent": "TimeTone-updater" }, signal: AbortSignal.timeout(30000), cache: "no-store" });
    if (!archiveResponse.ok) return Response.json({ error: `Could not download the release archive (${archiveResponse.status}).` }, { status: 502 });
    const stage = await fs.mkdtemp(path.join(os.tmpdir(), "timetone-update-"));
    const archive = path.join(stage, "release.tar.gz");
    await writeStatus("downloading", `Downloading TimeTone ${tag.replace(/^v/, "")}…`, tag.replace(/^v/, ""));
    await fs.writeFile(archive, Buffer.from(await archiveResponse.arrayBuffer()));
    const docker = process.env.TIMETONE_INSTALL_MODE === "docker";
    const root = installRoot(docker);
    const script = path.join(root, "scripts", docker ? "install-release-docker.sh" : "install-release.sh");
    if (!fsSync.existsSync(script)) return Response.json({ error: `Update helper not found at ${script}.` }, { status: 500 });
    const { spawn } = await import("node:child_process");
    const child = spawn("sh", [script, root, stage, tag], { detached: true, stdio: "ignore", env: { ...process.env, TIMETONE_UPDATE_ROOT: root, TIMETONE_UPDATE_STATUS: statusPath() } });
    child.unref();
    return Response.json({ ok: true, version: tag.replace(/^v/, ""), message: docker ? "Update downloaded. Docker is rebuilding the server now." : "Update downloaded. The server is building and will restart automatically." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected update error";
    return Response.json({ error: `Update could not start: ${message}` }, { status: 500 });
  }
}
