"use client";

import { useEffect, useRef } from "react";

type Person = { id: string; name: string; color: string; since: string };
type Node = Person & { x: number; y: number; vx: number; vy: number; r: number };

export function OfficePresenceCanvas({ people }: { people: Person[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0, width = 1, height = 1, dpr = 1;
    const nodes: Node[] = people.map((person, index) => ({ ...person, x: 55 + (index % 3) * 72, y: 54 + Math.floor(index / 3) * 70, vx: (index % 2 ? .34 : -.34), vy: .18 + (index % 3) * .05, r: 25 }));
    const resize = () => { const rect = canvas.getBoundingClientRect(); dpr = Math.min(window.devicePixelRatio || 1, 2); width = rect.width; height = rect.height; canvas.width = width * dpr; canvas.height = height * dpr; context.setTransform(dpr, 0, 0, dpr, 0, 0); };
    const render = () => {
      context.clearRect(0, 0, width, height);
      for (let a = 0; a < nodes.length; a++) for (let b = a + 1; b < nodes.length; b++) {
        const dx = nodes[b].x - nodes[a].x, dy = nodes[b].y - nodes[a].y, distance = Math.hypot(dx, dy);
        if (distance < 140) { context.strokeStyle = `rgba(216,255,98,${(1 - distance / 140) * .24})`; context.lineWidth = 1; context.beginPath(); context.moveTo(nodes[a].x, nodes[a].y); context.lineTo(nodes[b].x, nodes[b].y); context.stroke(); }
      }
      for (const node of nodes) {
        node.x += node.vx; node.y += node.vy;
        if (node.x < node.r || node.x > width - node.r) node.vx *= -1;
        if (node.y < node.r || node.y > height - node.r) node.vy *= -1;
        for (const other of nodes) if (other !== node) { const dx = node.x - other.x, dy = node.y - other.y, distance = Math.max(1, Math.hypot(dx, dy)); if (distance < node.r * 2.1) { node.vx += dx / distance * .035; node.vy += dy / distance * .035; } }
        node.vx *= .996; node.vy *= .996;
        context.beginPath(); context.fillStyle = `${node.color}33`; context.arc(node.x, node.y, node.r + 7, 0, Math.PI * 2); context.fill();
        context.beginPath(); context.fillStyle = node.color; context.arc(node.x, node.y, node.r, 0, Math.PI * 2); context.fill();
        context.fillStyle = "#17211b"; context.font = "700 12px system-ui"; context.textAlign = "center"; context.textBaseline = "middle"; context.fillText(node.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(), node.x, node.y + 1);
      }
      frame = requestAnimationFrame(render);
    };
    let dragging: Node | null = null, lastX = 0, lastY = 0;
    const point = (event: PointerEvent) => { const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
    const pointerDown = (event: PointerEvent) => { const { x, y } = point(event); dragging = nodes.find((node) => Math.hypot(node.x - x, node.y - y) <= node.r + 10) || null; if (dragging) { lastX = x; lastY = y; canvas.setPointerCapture(event.pointerId); } };
    const pointerMove = (event: PointerEvent) => { if (!dragging) return; const { x, y } = point(event); dragging.vx = (x - lastX) * .35; dragging.vy = (y - lastY) * .35; dragging.x = x; dragging.y = y; lastX = x; lastY = y; };
    const pointerUp = (event: PointerEvent) => { if (dragging) canvas.releasePointerCapture(event.pointerId); dragging = null; };
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize(); render(); canvas.addEventListener("pointerdown", pointerDown); canvas.addEventListener("pointermove", pointerMove); canvas.addEventListener("pointerup", pointerUp); canvas.addEventListener("pointercancel", pointerUp);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); canvas.removeEventListener("pointerdown", pointerDown); canvas.removeEventListener("pointermove", pointerMove); canvas.removeEventListener("pointerup", pointerUp); canvas.removeEventListener("pointercancel", pointerUp); };
  }, [people]);
  if (!people.length) return <div className="grid h-56 place-items-center rounded-2xl border border-dashed border-white/15 text-center text-sm text-white/45">The nodes come alive when someone checks in.</div>;
  return <canvas ref={canvasRef} aria-label="Interactive office presence map; drag a person to move them" className="mt-5 h-56 w-full cursor-grab rounded-2xl bg-[#0e1610] active:cursor-grabbing" />;
}
