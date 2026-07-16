import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Plus, Pencil, Trash2, Star, ToggleLeft, ToggleRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { API_URLS } from "@constants/config";
import type { SaasPlan } from "@/types/plan";

export default function PlansList() {
  const [plans, setPlans] = useState<SaasPlan[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPlans = async () => {
    try {
      setLoading(true);
      const res = await axios.get(API_URLS.PLANS, { params: { limit: 50 } });
      setPlans(res.data?.data?.plans ?? []);
    } catch {
      toast.error("Failed to load pricing plans");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlans();
  }, []);

  const toggleStatus = async (plan: SaasPlan) => {
    try {
      await axios.patch(`${API_URLS.PLANS}/${plan.id}/status`, { isActive: !plan.isActive });
      toast.success(`Plan ${plan.isActive ? "deactivated" : "activated"}`);
      loadPlans();
    } catch {
      toast.error("Failed to update plan status");
    }
  };

  const deletePlan = async (plan: SaasPlan) => {
    if (!confirm(`Archive plan "${plan.name}"?`)) return;
    try {
      await axios.delete(`${API_URLS.PLANS}/${plan.id}`);
      toast.success("Plan archived");
      loadPlans();
    } catch {
      toast.error("Failed to archive plan");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-purple-600" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pricing Plans</h1>
          <p className="text-sm text-gray-500 mt-1">SaaS subscription catalog for all tenants.</p>
        </div>
        <Link
          to="/plans/new"
          className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> New Plan
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`rounded-xl border bg-white p-5 shadow-sm ${plan.isFeatured ? "border-purple-300 ring-1 ring-purple-100" : "border-gray-200"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-gray-900">{plan.name}</h2>
                  {plan.isFeatured && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                      <Star size={12} /> Featured
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{plan.slug}</p>
              </div>
              <button type="button" onClick={() => toggleStatus(plan)} className="text-gray-500 hover:text-purple-600">
                {plan.isActive ? <ToggleRight size={22} className="text-green-600" /> : <ToggleLeft size={22} />}
              </button>
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-3">
              {plan.currencyCode} {plan.price.toFixed(2)}
              <span className="text-sm font-normal text-gray-500"> / {plan.billingCycle}</span>
            </p>
            <p className="text-sm text-gray-600 mt-2 line-clamp-2">{plan.description}</p>
            <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
              <Link
                to={`/plans/edit/${plan.id}`}
                className="flex-1 inline-flex items-center justify-center gap-1 text-sm font-medium text-purple-600 hover:bg-purple-50 py-2 rounded-lg"
              >
                <Pencil size={14} /> Edit
              </Link>
              <button
                type="button"
                onClick={() => deletePlan(plan)}
                className="inline-flex items-center justify-center text-sm font-medium text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
