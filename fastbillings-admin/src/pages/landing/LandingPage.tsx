import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { ExternalLink, Loader2, Save } from "lucide-react";
import { API_URLS, TENANT_APP_URL } from "@constants/config";
import type { LandingPageContent, LandingSectionKey } from "@/types/landingPage";
import { LANDING_SECTIONS } from "@/types/landingPage";
import LandingSectionForm from "@components/landing/LandingSectionForm";

export default function LandingPage() {
  const [activeSection, setActiveSection] = useState<LandingSectionKey>(LANDING_SECTIONS[0].key);
  const [content, setContent] = useState<LandingPageContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    axios
      .get(API_URLS.LANDING_PAGE)
      .then((res) => setContent(res.data?.data?.content ?? null))
      .catch(() => toast.error("Failed to load landing page"))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!content) return;
    try {
      setSaving(true);
      await axios.put(API_URLS.LANDING_PAGE, { content });
      toast.success("Landing page saved");
    } catch {
      toast.error("Failed to save landing page");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !content) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-purple-600" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Landing Page CMS</h1>
          <p className="text-sm text-gray-500 mt-1">Customize every section of the public marketing site.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <a href={TENANT_APP_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            <ExternalLink size={16} /> Preview live
          </a>
          <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save changes
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[220px_1fr] gap-6">
        <aside className="bg-white border border-gray-200 rounded-xl p-2 h-fit">
          {LANDING_SECTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveSection(key)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition ${
                activeSection === key ? "bg-purple-50 text-purple-700" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </aside>
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {LANDING_SECTIONS.find((s) => s.key === activeSection)?.label}
          </h2>
          <LandingSectionForm sectionKey={activeSection} content={content} onChange={setContent} />
        </div>
      </div>
    </div>
  );
}
