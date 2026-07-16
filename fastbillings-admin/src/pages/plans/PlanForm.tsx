import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { API_URLS } from "@constants/config";
import type { PlanMeta, PlanFeatures, SaasPlan } from "@/types/plan";

const defaultForm = {
  name: "",
  slug: "",
  description: "",
  price: 0,
  currencyCode: "USD",
  billingCycle: "monthly",
  trialDays: 14,
  isFeatured: false,
  isActive: true,
  sortOrder: 0,
  maxUsers: 5,
  maxInvoices: 100,
  maxCustomers: 100,
  maxProducts: 100,
  maxStorageMb: 500,
  features: {} as PlanFeatures,
};

export default function PlanForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const [meta, setMeta] = useState<PlanMeta | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  useEffect(() => {
    axios.get(API_URLS.PLANS_META).then((res) => setMeta(res.data?.data));
  }, []);

  useEffect(() => {
    if (!id) return;
    axios
      .get(`${API_URLS.PLANS}/${id}`)
      .then((res) => {
        const plan: SaasPlan = res.data.data;
        setForm({
          name: plan.name,
          slug: plan.slug,
          description: plan.description ?? "",
          price: plan.price,
          currencyCode: plan.currencyCode,
          billingCycle: plan.billingCycle,
          trialDays: plan.trialDays,
          isFeatured: plan.isFeatured,
          isActive: plan.isActive,
          sortOrder: plan.sortOrder,
          maxUsers: plan.maxUsers,
          maxInvoices: plan.maxInvoices,
          maxCustomers: plan.maxCustomers,
          maxProducts: plan.maxProducts,
          maxStorageMb: plan.maxStorageMb,
          features: plan.features ?? {},
        });
      })
      .catch(() => toast.error("Failed to load plan"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleChange = (field: string, value: string | number | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleFeature = (key: string) => {
    setForm((prev) => ({
      ...prev,
      features: { ...prev.features, [key]: !prev.features[key] },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Plan name is required");
      return;
    }
    try {
      setSaving(true);
      if (isEdit && id) {
        await axios.put(`${API_URLS.PLANS}/${id}`, form);
        toast.success("Plan updated");
      } else {
        await axios.post(API_URLS.PLANS, form);
        toast.success("Plan created");
      }
      navigate("/plans");
    } catch {
      toast.error("Failed to save plan");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-20 text-center text-gray-500">Loading plan…</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{isEdit ? "Edit Plan" : "New Pricing Plan"}</h1>
        <p className="text-sm text-gray-500 mt-1">Define pricing, limits, and feature entitlements for tenants.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Basic Info</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                value={form.name}
                onChange={(e) => handleChange("name", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                value={form.slug}
                placeholder="auto-generated if empty"
                onChange={(e) => handleChange("slug", e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                rows={3}
                value={form.description}
                onChange={(e) => handleChange("description", e.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Pricing</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
              <input
                type="number"
                min={0}
                step="0.01"
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                value={form.price}
                onChange={(e) => handleChange("price", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                value={form.currencyCode}
                onChange={(e) => handleChange("currencyCode", e.target.value.toUpperCase())}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Billing Cycle</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                value={form.billingCycle}
                onChange={(e) => handleChange("billingCycle", e.target.value)}
              >
                {(meta?.billingCycles ?? ["monthly", "yearly"]).map((cycle) => (
                  <option key={cycle} value={cycle}>
                    {cycle}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Trial Days</label>
              <input
                type="number"
                min={0}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                value={form.trialDays}
                onChange={(e) => handleChange("trialDays", parseInt(e.target.value, 10) || 0)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
              <input
                type="number"
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                value={form.sortOrder}
                onChange={(e) => handleChange("sortOrder", parseInt(e.target.value, 10) || 0)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-4 pt-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => handleChange("isActive", e.target.checked)} />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isFeatured} onChange={(e) => handleChange("isFeatured", e.target.checked)} />
              Featured on pricing page
            </label>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Usage Limits</h2>
          <p className="text-xs text-gray-500">Set to 0 for unlimited.</p>
          <div className="grid md:grid-cols-3 gap-4">
            {(["maxUsers", "maxInvoices", "maxCustomers", "maxProducts", "maxStorageMb"] as const).map((key) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {meta?.featureLabels?.[key] ?? key}
                </label>
                <input
                  type="number"
                  min={0}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  value={form[key]}
                  onChange={(e) => handleChange(key, parseInt(e.target.value, 10) || 0)}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Feature Entitlements</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {(meta?.booleanFeatures ?? []).map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={Boolean(form.features[key])} onChange={() => toggleFeature(key)} />
                {meta?.featureLabels?.[key] ?? key}
              </label>
            ))}
          </div>
        </section>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-lg font-medium disabled:opacity-60"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {isEdit ? "Save Changes" : "Create Plan"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/plans")}
            className="px-6 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
