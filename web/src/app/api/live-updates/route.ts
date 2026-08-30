import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { subscribeToLiveUpdates } from "@/lib/live-updates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const encoder = new TextEncoder();

export async function GET() {
  const store = await cookies();
  if (!(await verifySession(store.get(SESSION_COOKIE)?.value))) {
    return new Response("Unauthorized", { status: 401 });
  }

  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      send("connected", { at: new Date().toISOString() });
      unsubscribe = subscribeToLiveUpdates((update) => send("update", update));
      // Keep reverse proxies and browsers from closing an otherwise quiet feed.
      heartbeat = setInterval(() => send("ping", { at: new Date().toISOString() }), 25_000);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
    },
  });
}
