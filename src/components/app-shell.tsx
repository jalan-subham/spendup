"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";

const AUTH_ROUTES = new Set(["/login", "/register"]);

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = AUTH_ROUTES.has(pathname);

  if (isAuthPage) {
    return <main className="min-h-screen w-full overflow-x-hidden">{children}</main>;
  }

  return (
    <div className="flex min-h-screen w-full flex-col lg:flex-row">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col lg:pl-[220px]">
        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
