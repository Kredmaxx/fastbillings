import type { ReactNode } from "react";

interface DashboardCardProps {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}

export function DashboardCard({ title, icon, children, action }: DashboardCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-[#D6E4FF]/80 bg-white/90 p-5 shadow-[0_8px_30px_rgba(0,11,30,0.04)] backdrop-blur-sm transition hover:shadow-[0_12px_40px_rgba(0,102,255,0.08)]">
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[radial-gradient(circle,rgba(0,210,255,0.12),transparent_70%)]" />
      <div className="relative mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#0066FF] to-[#00D2FF] text-white shadow-[0_8px_18px_rgba(0,102,255,0.28)]">
            {icon}
          </span>
          <h2 className="text-[15px] font-semibold tracking-tight text-[#0B1533]">{title}</h2>
        </div>
        {action}
      </div>
      <div className="relative grid grid-cols-1 gap-2.5 sm:grid-cols-2">{children}</div>
    </div>
  );
}
