import type { LucideIcon } from "lucide-react";

export function StatCard(
  { label, value, detail, icon: Icon, accent = false }: {
    label: string;
    value: string;
    detail: string;
    icon: LucideIcon;
    accent?: boolean;
  },
) {
  return (
    <div
      className={accent
        ? "stat-card-accent rounded-2xl bg-[#d8ff62] p-5 shadow-sm"
        : "rounded-2xl border border-black/6 bg-white p-5 shadow-sm shadow-black/[.025]"}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-black/50">{label}</p>
        <span
          className={accent
            ? "grid size-9 place-items-center rounded-xl bg-[#17211b] text-[#d8ff62]"
            : "grid size-9 place-items-center rounded-xl bg-[#eef0eb] text-black/60"}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-5 text-3xl font-semibold tracking-[-.04em]">{value}</p>
      <p className="mt-1 text-xs text-black/45">{detail}</p>
    </div>
  );
}
