"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Clock3,
  Cpu,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
} from "lucide-react";
import { logout } from "@/app/actions";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/employees", label: "Employees", icon: Users },
  { href: "/entries", label: "Time entries", icon: Clock3 },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/devices", label: "Devices", icon: Cpu },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell(
  { children, companyName }: { children: React.ReactNode; companyName: string },
) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-[#f5f6f2] text-[#17211b]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col bg-[#17211b] text-white lg:flex">
        <div className="flex h-20 items-center gap-3 border-b border-white/10 px-6">
          <div className="grid size-10 place-items-center rounded-xl bg-[#d8ff62] text-[#17211b]">
            <Clock3 className="size-5" />
          </div>
          <div>
            <p className="font-semibold tracking-tight">ESP Timekeep</p>
            <p className="text-xs text-white/50">{companyName}</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-6">
          {navigation.map((item) => {
            const active = item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/60 transition hover:bg-white/8 hover:text-white",
                  active && "bg-white/10 text-white",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <form action={logout} className="border-t border-white/10 p-4">
          <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/60 transition hover:bg-white/8 hover:text-white">
            <LogOut className="size-4" />Sign out
          </button>
        </form>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-black/6 bg-[#f5f6f2]/90 px-4 backdrop-blur md:px-8 lg:h-20">
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold lg:hidden"
          >
            <span className="grid size-8 place-items-center rounded-lg bg-[#17211b] text-[#d8ff62]">
              <Clock3 className="size-4" />
            </span>Timekeep
          </Link>
          <nav className="ml-auto flex max-w-full gap-1 overflow-auto lg:hidden">
            {navigation.slice(0, 4).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className={cn(
                  "rounded-lg p-2 text-black/45",
                  pathname === item.href && "bg-white text-black shadow-sm",
                )}
              >
                <item.icon className="size-4" />
              </Link>
            ))}
          </nav>
          <div className="ml-auto hidden items-center gap-2 text-sm text-black/50 lg:flex">
            <span className="size-2 rounded-full bg-emerald-500" />System
            operational
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
