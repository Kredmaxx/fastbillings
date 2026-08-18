import { CornerDownLeft, FileSearch, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { getSearchablePages, type SearchablePage } from "@pages/admin/menus/menuHubs";

const ALL_PAGES = getSearchablePages();

function scorePage(page: SearchablePage, query: string): number {
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  const title = page.title.toLowerCase();
  const desc = page.description.toLowerCase();
  const hub = page.hub.toLowerCase();
  const section = page.section.toLowerCase();
  const path = page.to.toLowerCase();

  if (title === q) return 100;
  if (title.startsWith(q)) return 90;
  if (title.includes(q)) return 75;
  if (section.includes(q)) return 55;
  if (hub.includes(q)) return 45;
  if (desc.includes(q)) return 35;
  if (path.includes(q.replace(/\s+/g, "-"))) return 30;

  const words = q.split(/\s+/).filter(Boolean);
  const hitCount = words.filter(
    (w) => title.includes(w) || desc.includes(w) || hub.includes(w) || section.includes(w)
  ).length;
  return hitCount > 0 ? 20 + hitCount * 5 : 0;
}

type FlatRow =
  | { kind: "group"; label: string }
  | { kind: "page"; page: SearchablePage };

const HeaderSearch = () => {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const { rows, pages } = useMemo(() => {
    const q = query.trim();
    let list: SearchablePage[];

    if (!q) {
      list = ALL_PAGES;
    } else {
      list = ALL_PAGES.map((page) => ({ page, score: scorePage(page, q) }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score || a.page.title.localeCompare(b.page.title))
        .map((r) => r.page);
    }

    const flat: FlatRow[] = [];
    if (!q) {
      let lastHub = "";
      for (const page of list) {
        if (page.hub !== lastHub) {
          lastHub = page.hub;
          flat.push({ kind: "group", label: page.hub });
        }
        flat.push({ kind: "page", page });
      }
    } else {
      for (const page of list) flat.push({ kind: "page", page });
    }

    return { rows: flat, pages: list };
  }, [query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
        return;
      }
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const goTo = (page: SearchablePage) => {
    navigate(page.to);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key.length === 1)) {
      setOpen(true);
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(pages.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const page = pages[activeIndex];
      if (page) goTo(page);
    }
  };

  let pageCursor = -1;

  return (
    <div ref={rootRef} className="relative mx-3 min-w-0 flex-1 max-w-xl">
      <div
        className={`flex items-center gap-2 rounded-xl border bg-white px-3 transition-all ${
          open
            ? "border-[#007BFF] shadow-[0_0_0_3px_rgba(0,123,255,0.12)]"
            : "border-[#D6E4FF] hover:border-[#BFD5FF]"
        }`}
      >
        <Search size={16} className="shrink-0 text-[#8A97A8]" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search all pages & menus…"
          className="h-10 w-full bg-transparent text-sm text-[#0B1533] outline-none placeholder:text-[#8A97A8]"
          aria-label="Search pages and menus"
          aria-expanded={open}
          aria-controls="header-search-results"
          autoComplete="off"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="rounded-md p-1 text-[#8A97A8] hover:bg-[#F4F8FF] hover:text-[#007BFF]"
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        ) : (
          <kbd className="hidden shrink-0 rounded-md border border-[#E8EEF5] bg-[#F4F8FF] px-1.5 py-0.5 text-[10px] font-semibold text-[#8A97A8] sm:inline">
            Ctrl K
          </kbd>
        )}
      </div>

      {open && (
        <div
          id="header-search-results"
          className="absolute left-0 right-0 z-[60] mt-2 overflow-hidden rounded-2xl border border-[#E8EEF5] bg-white shadow-[0_16px_40px_rgba(0,11,30,0.14)]"
          role="listbox"
        >
          <div className="flex items-center justify-between border-b border-[#F0F4FA] px-3 py-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#8A97A8]">
              {query.trim() ? "Matching pages" : "All pages & menus"}
            </span>
            <span className="text-[10px] font-semibold text-[#007BFF]">
              {pages.length} item{pages.length !== 1 ? "s" : ""}
            </span>
          </div>

          {pages.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <FileSearch className="h-8 w-8 text-[#C7D9F5]" />
              <p className="text-sm font-semibold text-[#0B1533]">No pages found</p>
              <p className="text-xs text-[#8A97A8]">Try a menu name like Invoices, Expenses, or Reports</p>
            </div>
          ) : (
            <ul className="max-h-[min(70vh,28rem)] overflow-y-auto py-1">
              {rows.map((row) => {
                if (row.kind === "group") {
                  return (
                    <li
                      key={`group-${row.label}`}
                      className="sticky top-0 z-[1] bg-[#F8FBFF] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#007BFF]"
                    >
                      {row.label}
                    </li>
                  );
                }

                pageCursor += 1;
                const index = pageCursor;
                const { page } = row;
                const active = index === activeIndex;

                return (
                  <li key={page.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => goTo(page)}
                      className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition ${
                        active ? "bg-[#F0F7FF]" : "hover:bg-[#F8FBFF]"
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${
                          active
                            ? "bg-gradient-to-br from-[#007BFF] to-[#00C2FF] text-white"
                            : "bg-[#EEF3FB] text-[#5A6B7D]"
                        }`}
                      >
                        {page.title.charAt(0)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-[#0B1533]">
                          {page.title}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-[#8A97A8]">
                          {page.section}
                          {page.description ? ` · ${page.description}` : ""}
                        </span>
                      </span>
                      {active && (
                        <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-[#007BFF]">
                          Open <CornerDownLeft size={12} />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default HeaderSearch;
