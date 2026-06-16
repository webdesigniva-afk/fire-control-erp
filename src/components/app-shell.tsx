import type { ReactNode } from "react";
import { AppSidebar } from "./app-sidebar";
import { ProtocolsAutoSync } from "./protocols-auto-sync";
import { Topbar } from "./topbar";

type AppShellProps = {
  title: string;
  description: string;
  children: ReactNode;
  headerAction?: ReactNode;
};

export function AppShell({ title, description, children, headerAction }: AppShellProps) {
  return (
    <main className="app-shell min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.08),transparent_32rem),linear-gradient(180deg,#f8fafc_0%,#f4f6f8_100%)] text-slate-900">
      <ProtocolsAutoSync />
      <div className="flex min-h-screen flex-col md:flex-row">
        <AppSidebar />

        <section className="min-w-0 flex-1 overflow-x-hidden">
          <Topbar title={title} description={description} headerAction={headerAction} />
          <div className="mx-auto w-full max-w-[1760px] p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
