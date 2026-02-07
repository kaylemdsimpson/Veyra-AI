"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard,
  Megaphone,
  Percent,
  BarChart3,
  Settings,
  LogOut,
  ChevronRight,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/dashboard/discounts", label: "Smart Discounts", icon: Percent },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout, isDemo } = useAuth();

  return (
    <aside className="flex h-screen w-[260px] flex-col" style={{ background: "hsl(234 25% 12%)" }}>
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(262,83%,58%)]">
          <span className="text-sm font-bold text-white">V</span>
        </div>
        <Link href="/dashboard" className="text-lg font-semibold text-white">
          Veyra
        </Link>
        {isDemo && (
          <span className="ml-auto rounded-full bg-[hsl(262,83%,58%)]/20 px-2 py-0.5 text-[10px] font-medium text-[hsl(262,83%,70%)]">
            DEMO
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="mt-4 flex-1 space-y-1 px-3">
        {navItems.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-[hsl(262,83%,58%)] text-white shadow-lg shadow-[hsl(262,83%,58%)]/25"
                  : "text-[hsl(240,10%,65%)] hover:bg-[hsl(234,20%,18%)] hover:text-white",
              )}
            >
              <item.icon className="h-[18px] w-[18px] flex-shrink-0" />
              <span className="flex-1">{item.label}</span>
              {isActive && <ChevronRight className="h-4 w-4 opacity-60" />}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(262,83%,58%)]/20">
            <span className="text-sm font-semibold text-[hsl(262,83%,70%)]">
              {(user?.name?.[0] ?? user?.email?.[0] ?? "U").toUpperCase()}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">
              {user?.name ?? "User"}
            </p>
            <p className="truncate text-xs text-[hsl(240,10%,50%)]">{user?.email}</p>
          </div>
          <button
            onClick={logout}
            className="rounded-lg p-2 text-[hsl(240,10%,50%)] transition-colors hover:bg-[hsl(234,20%,18%)] hover:text-white"
            title="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
