import type { LandingPageContent } from "@/types/landingPage";

function inputClass() {
  return "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm";
}

function labelClass() {
  return "block text-sm font-medium text-gray-700 mb-1";
}

interface Props {
  sectionKey: string;
  content: LandingPageContent;
  onChange: (next: LandingPageContent) => void;
}

export default function LandingSectionForm({ sectionKey, content, onChange }: Props) {
  const patch = <K extends keyof LandingPageContent>(key: K, value: LandingPageContent[K]) => {
    onChange({ ...content, [key]: value });
  };

  switch (sectionKey) {
    case "meta":
      return (
        <div className="space-y-4">
          <div>
            <label className={labelClass()}>Page title</label>
            <input className={inputClass()} value={content.meta.title} onChange={(e) => patch("meta", { ...content.meta, title: e.target.value })} />
          </div>
          <div>
            <label className={labelClass()}>Meta description</label>
            <textarea className={inputClass()} rows={3} value={content.meta.description} onChange={(e) => patch("meta", { ...content.meta, description: e.target.value })} />
          </div>
        </div>
      );

    case "header":
      return (
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={content.header.enabled} onChange={(e) => patch("header", { ...content.header, enabled: e.target.checked })} />
            Section enabled
          </label>
          <div>
            <label className={labelClass()}>Logo URL</label>
            <input className={inputClass()} value={content.header.logoUrl} onChange={(e) => patch("header", { ...content.header, logoUrl: e.target.value })} />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass()}>Login button text</label>
              <input className={inputClass()} value={content.header.loginButton.text} onChange={(e) => patch("header", { ...content.header, loginButton: { ...content.header.loginButton, text: e.target.value } })} />
            </div>
            <div>
              <label className={labelClass()}>Login link</label>
              <input className={inputClass()} value={content.header.loginButton.href} onChange={(e) => patch("header", { ...content.header, loginButton: { ...content.header.loginButton, href: e.target.value } })} />
            </div>
            <div>
              <label className={labelClass()}>Sign up button text</label>
              <input className={inputClass()} value={content.header.signupButton.text} onChange={(e) => patch("header", { ...content.header, signupButton: { ...content.header.signupButton, text: e.target.value } })} />
            </div>
            <div>
              <label className={labelClass()}>Sign up link</label>
              <input className={inputClass()} value={content.header.signupButton.href} onChange={(e) => patch("header", { ...content.header, signupButton: { ...content.header.signupButton, href: e.target.value } })} />
            </div>
          </div>
          <NavLinksEditor links={content.header.navLinks} onChange={(navLinks) => patch("header", { ...content.header, navLinks })} />
        </div>
      );

    case "hero":
      return (
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={content.hero.enabled} onChange={(e) => patch("hero", { ...content.hero, enabled: e.target.checked })} />
            Section enabled
          </label>
          <div className="grid md:grid-cols-2 gap-4">
            <div><label className={labelClass()}>Badge</label><input className={inputClass()} value={content.hero.badge ?? ""} onChange={(e) => patch("hero", { ...content.hero, badge: e.target.value })} /></div>
            <div><label className={labelClass()}>Highlighted text</label><input className={inputClass()} value={content.hero.highlightedText ?? ""} onChange={(e) => patch("hero", { ...content.hero, highlightedText: e.target.value })} /></div>
          </div>
          <div><label className={labelClass()}>Title</label><input className={inputClass()} value={content.hero.title} onChange={(e) => patch("hero", { ...content.hero, title: e.target.value })} /></div>
          <div><label className={labelClass()}>Description</label><textarea className={inputClass()} rows={3} value={content.hero.description} onChange={(e) => patch("hero", { ...content.hero, description: e.target.value })} /></div>
          <div><label className={labelClass()}>Hero image URL</label><input className={inputClass()} value={content.hero.imageUrl ?? ""} onChange={(e) => patch("hero", { ...content.hero, imageUrl: e.target.value })} /></div>
          <ButtonPair section="hero" content={content} onChange={onChange} />
        </div>
      );

    case "modules":
      return (
        <ListSectionEditor
          enabled={content.modules.enabled}
          badge={content.modules.badge ?? ""}
          title={content.modules.title}
          onToggle={(enabled) => patch("modules", { ...content.modules, enabled })}
          onMeta={(badge, title) => patch("modules", { ...content.modules, badge, title })}
          items={content.modules.items}
          fields={["title", "description"]}
          onItems={(items) => patch("modules", { ...content.modules, items: items as { title: string; description: string }[] })}
        />
      );

    case "features":
      return (
        <ListSectionEditor
          enabled={content.features.enabled}
          badge={content.features.badge ?? ""}
          title={content.features.title}
          onToggle={(enabled) => patch("features", { ...content.features, enabled })}
          onMeta={(badge, title) => patch("features", { ...content.features, badge, title })}
          items={content.features.items}
          fields={["title", "number"]}
          onItems={(items) => patch("features", { ...content.features, items: items as { title: string; number?: string }[] })}
        />
      );

    case "howItWorks":
      return (
        <ListSectionEditor
          enabled={content.howItWorks.enabled}
          badge={content.howItWorks.badge ?? ""}
          title={content.howItWorks.title}
          onToggle={(enabled) => patch("howItWorks", { ...content.howItWorks, enabled })}
          onMeta={(badge, title) => patch("howItWorks", { ...content.howItWorks, badge, title })}
          items={content.howItWorks.steps}
          fields={["title", "description"]}
          itemLabel="Step"
          onItems={(items) => patch("howItWorks", { ...content.howItWorks, steps: items as { title: string; description: string }[] })}
        />
      );

    case "pricing":
      return (
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={content.pricing.enabled} onChange={(e) => patch("pricing", { ...content.pricing, enabled: e.target.checked })} />
            Section enabled
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={content.pricing.useLivePlans} onChange={(e) => patch("pricing", { ...content.pricing, useLivePlans: e.target.checked })} />
            Pull live plans from SaaS catalog
          </label>
          <div><label className={labelClass()}>Badge</label><input className={inputClass()} value={content.pricing.badge ?? ""} onChange={(e) => patch("pricing", { ...content.pricing, badge: e.target.value })} /></div>
          <div><label className={labelClass()}>Title</label><input className={inputClass()} value={content.pricing.title} onChange={(e) => patch("pricing", { ...content.pricing, title: e.target.value })} /></div>
          <div><label className={labelClass()}>Description</label><textarea className={inputClass()} rows={2} value={content.pricing.description ?? ""} onChange={(e) => patch("pricing", { ...content.pricing, description: e.target.value })} /></div>
        </div>
      );

    case "testimonials":
      return (
        <ListSectionEditor
          enabled={content.testimonials.enabled}
          badge={content.testimonials.badge ?? ""}
          title={content.testimonials.title}
          onToggle={(enabled) => patch("testimonials", { ...content.testimonials, enabled })}
          onMeta={(badge, title) => patch("testimonials", { ...content.testimonials, badge, title })}
          items={content.testimonials.items}
          fields={["name", "role", "quote"]}
          itemLabel="Testimonial"
          onItems={(items) => patch("testimonials", { ...content.testimonials, items: items as { name: string; role: string; quote: string }[] })}
        />
      );

    case "faq":
      return (
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={content.faq.enabled} onChange={(e) => patch("faq", { ...content.faq, enabled: e.target.checked })} />
            Section enabled
          </label>
          <div><label className={labelClass()}>Badge</label><input className={inputClass()} value={content.faq.badge ?? ""} onChange={(e) => patch("faq", { ...content.faq, badge: e.target.value })} /></div>
          <div><label className={labelClass()}>Title</label><input className={inputClass()} value={content.faq.title} onChange={(e) => patch("faq", { ...content.faq, title: e.target.value })} /></div>
          <ListSectionEditor
            enabled
            badge=""
            title=""
            onToggle={() => {}}
            onMeta={() => {}}
            items={content.faq.items}
            fields={["question", "answer"]}
            itemLabel="FAQ"
            onItems={(items) => patch("faq", { ...content.faq, items: items as { question: string; answer: string }[] })}
            hideMeta
          />
        </div>
      );

    case "cta":
      return (
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={content.cta.enabled} onChange={(e) => patch("cta", { ...content.cta, enabled: e.target.checked })} />
            Section enabled
          </label>
          <div><label className={labelClass()}>Title</label><input className={inputClass()} value={content.cta.title} onChange={(e) => patch("cta", { ...content.cta, title: e.target.value })} /></div>
          <div><label className={labelClass()}>Description</label><textarea className={inputClass()} rows={2} value={content.cta.description ?? ""} onChange={(e) => patch("cta", { ...content.cta, description: e.target.value })} /></div>
          <ButtonPair section="cta" content={content} onChange={onChange} />
        </div>
      );

    case "footer":
      return (
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={content.footer.enabled} onChange={(e) => patch("footer", { ...content.footer, enabled: e.target.checked })} />
            Section enabled
          </label>
          <div><label className={labelClass()}>Copyright</label><input className={inputClass()} value={content.footer.copyright} onChange={(e) => patch("footer", { ...content.footer, copyright: e.target.value })} /></div>
          <NavLinksEditor links={content.footer.links} onChange={(links) => patch("footer", { ...content.footer, links })} label="Footer links" />
          <NavLinksEditor links={content.footer.socialLinks} onChange={(socialLinks) => patch("footer", { ...content.footer, socialLinks })} label="Social links" />
        </div>
      );

    default:
      return <p className="text-gray-500 text-sm">Select a section to edit.</p>;
  }
}

function NavLinksEditor({
  links,
  onChange,
  label = "Navigation links",
}: {
  links: { label: string; href: string }[];
  onChange: (links: { label: string; href: string }[]) => void;
  label?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className={labelClass()}>{label}</label>
        <button type="button" className="text-xs text-purple-600 font-medium" onClick={() => onChange([...links, { label: "New", href: "#" }])}>
          + Add link
        </button>
      </div>
      {links.map((link, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <input className={inputClass()} placeholder="Label" value={link.label} onChange={(e) => { const next = [...links]; next[i] = { ...link, label: e.target.value }; onChange(next); }} />
          <input className={inputClass()} placeholder="Href" value={link.href} onChange={(e) => { const next = [...links]; next[i] = { ...link, href: e.target.value }; onChange(next); }} />
          <button type="button" className="text-red-500 text-sm px-2" onClick={() => onChange(links.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
    </div>
  );
}

function ListSectionEditor({
  enabled,
  badge,
  title,
  onToggle,
  onMeta,
  items,
  fields,
  itemLabel = "Item",
  onItems,
  hideMeta,
}: {
  enabled: boolean;
  badge: string;
  title: string;
  onToggle: (v: boolean) => void;
  onMeta: (badge: string, title: string) => void;
  items: Record<string, string>[];
  fields: string[];
  itemLabel?: string;
  onItems: (items: Record<string, string>[]) => void;
  hideMeta?: boolean;
}) {
  return (
    <div className="space-y-4">
      {!hideMeta && (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
            Section enabled
          </label>
          <div className="grid md:grid-cols-2 gap-4">
            <div><label className={labelClass()}>Badge</label><input className={inputClass()} value={badge} onChange={(e) => onMeta(e.target.value, title)} /></div>
            <div><label className={labelClass()}>Title</label><input className={inputClass()} value={title} onChange={(e) => onMeta(badge, e.target.value)} /></div>
          </div>
        </>
      )}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">{itemLabel}s</span>
        <button type="button" className="text-xs text-purple-600 font-medium" onClick={() => onItems([...items, Object.fromEntries(fields.map((f) => [f, ""]))])}>
          + Add {itemLabel.toLowerCase()}
        </button>
      </div>
      {items.map((item, i) => (
        <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-gray-500">{itemLabel} {i + 1}</span>
            <button type="button" className="text-red-500 text-xs" onClick={() => onItems(items.filter((_, j) => j !== i))}>Remove</button>
          </div>
          {fields.map((field) => (
            <div key={field}>
              <label className={labelClass()}>{field}</label>
              {field === "description" || field === "quote" || field === "answer" ? (
                <textarea className={inputClass()} rows={2} value={item[field] ?? ""} onChange={(e) => { const next = [...items]; next[i] = { ...item, [field]: e.target.value }; onItems(next); }} />
              ) : (
                <input className={inputClass()} value={item[field] ?? ""} onChange={(e) => { const next = [...items]; next[i] = { ...item, [field]: e.target.value }; onItems(next); }} />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ButtonPair({ section, content, onChange }: { section: "hero" | "cta"; content: LandingPageContent; onChange: (c: LandingPageContent) => void }) {
  const data = content[section];
  const primary = data.primaryButton;
  const secondary = data.secondaryButton;
  const patchBtn = (key: "primaryButton" | "secondaryButton", field: "text" | "href", value: string) => {
    const btn = data[key] ?? { text: "", href: "", variant: "primary" as const };
    onChange({ ...content, [section]: { ...data, [key]: { ...btn, [field]: value } } });
  };
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div><label className={labelClass()}>Primary button text</label><input className={inputClass()} value={primary.text} onChange={(e) => patchBtn("primaryButton", "text", e.target.value)} /></div>
      <div><label className={labelClass()}>Primary link</label><input className={inputClass()} value={primary.href} onChange={(e) => patchBtn("primaryButton", "href", e.target.value)} /></div>
      <div><label className={labelClass()}>Secondary button text</label><input className={inputClass()} value={secondary?.text ?? ""} onChange={(e) => patchBtn("secondaryButton", "text", e.target.value)} /></div>
      <div><label className={labelClass()}>Secondary link</label><input className={inputClass()} value={secondary?.href ?? ""} onChange={(e) => patchBtn("secondaryButton", "href", e.target.value)} /></div>
    </div>
  );
}
