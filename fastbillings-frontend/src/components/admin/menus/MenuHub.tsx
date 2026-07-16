import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export type MenuCard = {
  title: string;
  description: string;
  to: string;
  icon: ReactNode;
  accent: string;
};

export type MenuSection = {
  title: string;
  eyebrow: string;
  items: MenuCard[];
};

type MenuHubProps = {
  title: string;
  description: string;
  sections: MenuSection[];
};

export default function MenuHub({ title, description, sections }: MenuHubProps) {
  return (
    <div className="relative min-h-full overflow-hidden bg-[#F4F8FF] px-4 py-4 font-sans md:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_12%_-10%,rgba(0,102,255,0.1),transparent_55%),radial-gradient(ellipse_60%_45%_at_90%_0%,rgba(0,210,255,0.1),transparent_50%)]" />

      <div className="relative space-y-5">
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#000B1E] via-[#0B1533] to-[#0066FF] p-6 text-white shadow-[0_20px_50px_rgba(0,11,30,0.22)] md:p-7">
          <div className="pointer-events-none absolute right-8 top-5 h-24 w-24 rounded-full bg-[#00D2FF]/20 blur-2xl" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#00D2FF]">
            Menu Hub
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-white/75">{description}</p>
        </section>

        {sections.map((section) => (
          <section
            key={section.title}
            className="rounded-2xl border border-[#D6E4FF]/80 bg-white/90 p-5 shadow-[0_8px_30px_rgba(0,11,30,0.04)] backdrop-blur-sm"
          >
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#0066FF]">
                  {section.eyebrow}
                </p>
                <h2 className="text-lg font-bold tracking-tight text-[#0B1533]">
                  {section.title}
                </h2>
              </div>
              <span className="text-xs font-semibold text-[#8A97A8]">
                {section.items.length} shortcuts
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {section.items.map((item) => (
                <Link
                  key={`${item.to}-${item.title}`}
                  to={item.to}
                  className="group relative overflow-hidden rounded-2xl border border-[#E8EEF5] bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#BFD5FF] hover:shadow-[0_14px_34px_rgba(0,102,255,0.12)]"
                >
                  <div
                    className={`absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br ${item.accent} opacity-[0.1] transition-opacity group-hover:opacity-[0.18]`}
                  />
                  <div className="relative flex items-start justify-between gap-3">
                    <span
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${item.accent} text-white shadow-[0_8px_20px_rgba(0,102,255,0.22)]`}
                    >
                      {item.icon}
                    </span>
                    <ArrowRight className="mt-1 h-4 w-4 text-[#A5B4C8] transition group-hover:translate-x-0.5 group-hover:text-[#0066FF]" />
                  </div>
                  <h3 className="relative mt-4 text-[15px] font-bold text-[#0B1533]">
                    {item.title}
                  </h3>
                  <p className="relative mt-1.5 line-clamp-2 text-xs leading-5 text-[#5A6B7D]">
                    {item.description}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
