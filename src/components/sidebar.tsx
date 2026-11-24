"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Settings,
  Upload,
  LogOut,
  Sun,
  Moon,
  CreditCard,
  ShieldCheck,
  Landmark,
  Layers,
  FileText,
  Ban,
  Menu,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";
import { BrandMark } from "@/components/brand-mark";

const navItems = [
  { name: "Overview", href: "/", icon: LayoutDashboard },
  { name: "Import", href: "/transactions", icon: Upload },
  { name: "Bills & CC", href: "/bills", icon: CreditCard },
  { name: "Sanity", href: "/sanity", icon: ShieldCheck },
  { name: "Balances", href: "/balances", icon: Landmark },
  { name: "Snapshots", href: "/snapshots", icon: Layers },
  { name: "Files", href: "/files", icon: FileText },
  { name: "Excluded", href: "/excluded", icon: Ban },
];

const bottomItems = [{ name: "Settings", href: "/settings", icon: Settings }];

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="flex h-full flex-col justify-between">
      <div>
        {/* Brand */}
        <Link
          href="/"
          onClick={onNavigate}
          className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4 transition-colors duration-120 hover:bg-sidebar-accent/50"
        >
          <BrandMark />
          <span className="text-[15px] font-semibold tracking-tight text-sidebar-foreground">
            SpendUp
          </span>
        </Link>

        {/* Primary nav */}
        <nav aria-label="Primary navigation" className="space-y-0.5 px-2.5 py-3">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center justify-between rounded-[2px] px-2.5 py-2 text-[13px] font-medium transition-colors duration-120",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-sidebar-foreground"
                )}
              >
                <span className="flex items-center gap-2.5">
                  <item.icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
                  {item.name}
                </span>
                {active && (
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-[1px] bg-primary"
                  />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom utilities */}
      <div className="space-y-0.5 border-t border-sidebar-border px-2.5 py-3">
        {bottomItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center justify-between rounded-[2px] px-2.5 py-2 text-[13px] font-medium transition-colors duration-120",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-sidebar-foreground"
              )}
            >
              <span className="flex items-center gap-2.5">
                <item.icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
                {item.name}
              </span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          className="flex w-full items-center gap-2.5 rounded-[2px] px-2.5 py-2 text-[13px] font-medium text-muted-foreground transition-colors duration-120 hover:bg-muted/70 hover:text-sidebar-foreground"
        >
          {resolvedTheme === "dark" ? (
            <Sun className="h-4 w-4 shrink-0" />
          ) : (
            <Moon className="h-4 w-4 shrink-0" />
          )}
          {resolvedTheme === "dark" ? "Light Mode" : "Dark Mode"}
        </button>

        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded-[2px] px-2.5 py-2 text-[13px] font-medium text-muted-foreground transition-colors duration-120 hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Logout
        </button>
      </div>
    </div>
  );
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop architectural rail */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[220px] border-r border-sidebar-border bg-sidebar lg:block">
        <NavContent />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-sidebar px-4 lg:hidden">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandMark />
          <span className="text-[15px] font-semibold tracking-tight">SpendUp</span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation menu"
          className="inline-flex h-8 w-8 items-center justify-center rounded-[2px] border border-border bg-background text-foreground hover:bg-secondary"
        >
          <Menu className="h-4 w-4" />
        </button>
      </header>

      {/* Mobile slide-over drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-[240px] border-r border-sidebar-border bg-sidebar">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation menu"
              className="absolute top-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-[2px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
            <NavContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
