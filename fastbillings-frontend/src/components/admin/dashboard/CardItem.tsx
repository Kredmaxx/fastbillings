import type { ReactNode } from "react";

interface CardItemProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  color?: string;
}

const tone: Record<string, { wrap: string; icon: string }> = {
  purple: {
    wrap: "bg-[#F4F8FF] border-[#D6E4FF]",
    icon: "text-[#0066FF] bg-white border border-[#D6E4FF]",
  },
  blue: {
    wrap: "bg-[#F0F7FF] border-[#C7D9F5]",
    icon: "text-[#0052CC] bg-white border border-[#C7D9F5]",
  },
  cyan: {
    wrap: "bg-[#F0FBFF] border-[#B8EEFF]",
    icon: "text-[#0891B2] bg-white border border-[#B8EEFF]",
  },
  green: {
    wrap: "bg-emerald-50/80 border-emerald-200/70",
    icon: "text-emerald-600 bg-white border border-emerald-200/70",
  },
  yellow: {
    wrap: "bg-amber-50/80 border-amber-200/70",
    icon: "text-amber-600 bg-white border border-amber-200/70",
  },
  red: {
    wrap: "bg-rose-50/80 border-rose-200/70",
    icon: "text-rose-600 bg-white border border-rose-200/70",
  },
  gray: {
    wrap: "bg-slate-50 border-slate-200",
    icon: "text-slate-600 bg-white border border-slate-200",
  },
  indigo: {
    wrap: "bg-[#F4F8FF] border-[#D6E4FF]",
    icon: "text-[#0066FF] bg-white border border-[#D6E4FF]",
  },
};

export function CardItem({ icon, label, value, color = "blue" }: CardItemProps) {
  const styles = tone[color] ?? tone.blue;

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition hover:translate-y-[-1px] ${styles.wrap}`}
    >
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${styles.icon}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium uppercase tracking-[0.06em] text-[#5A6B7D]">
          {label}
        </p>
        <p className="truncate text-[15px] font-semibold tracking-tight text-[#0B1533]">{value}</p>
      </div>
    </div>
  );
}
