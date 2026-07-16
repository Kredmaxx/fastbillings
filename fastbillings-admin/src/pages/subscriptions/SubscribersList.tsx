import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Users, CreditCard, TrendingUp, Building2, Loader2 } from "lucide-react";
import { API_URLS } from "@constants/config";
import type { SaasPlan, SubscriptionStats, TenantSubscriptionRow } from "@/types/plan";

export default function SubscribersList() {
  const [stats, setStats] = useState<SubscriptionStats | null>(null);
  const [subscriptions, setSubscriptions] = useState<TenantSubscriptionRow[]>([]);
  const [plans, setPlans] = useState<SaasPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [selectedPlans, setSelectedPlans] = useState<Record<string, string>>({});

  const load = async () => {
    try {
      setLoading(true);
      const [statsRes, subsRes, plansRes] = await Promise.all([
        axios.get(API_URLS.SUBSCRIPTION_STATS),
        axios.get(API_URLS.SUBSCRIPTIONS, { params: { limit: 50 } }),
        axios.get(API_URLS.PLANS, { params: { active: true, limit: 50 } }),
      ]);
      setStats(statsRes.data?.data ?? null);
      setSubscriptions(subsRes.data?.data?.subscriptions ?? []);
      setPlans(plansRes.data?.data?.plans ?? []);
    } catch {
      toast.error("Failed to load subscribers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const assignPlan = async (tenantId: string) => {
    const planId = selectedPlans[tenantId];
    if (!planId) {
      toast.error("Select a plan first");
      return;
    }
    try {
      setAssigning(tenantId);
      await axios.post(API_URLS.ASSIGN_PLAN, { tenantId, planId });
      toast.success("Plan assigned to tenant");
      load();
    } catch {
      toast.error("Failed to assign plan");
    } finally {
      setAssigning(null);
    }
  };

  const cancelSub = async (id: string) => {
    if (!confirm("Cancel this subscription?")) return;
    try {
      await axios.post(`${API_URLS.CANCEL_SUBSCRIPTION}/${id}/cancel`);
      toast.success("Subscription cancelled");
      load();
    } catch {
      toast.error("Failed to cancel subscription");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-purple-600" size={32} />
      </div>
    );
  }

  const statCards = [
    { label: "Total Tenants", value: stats?.totalTenants ?? 0, icon: Building2 },
    { label: "Active Subs", value: stats?.activeSubs ?? 0, icon: Users },
    { label: "Trialing", value: stats?.trialingSubs ?? 0, icon: TrendingUp },
    { label: "Est. MRR", value: `$${(stats?.estimatedMrr ?? 0).toFixed(0)}`, icon: CreditCard },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tenant Subscriptions</h1>
        <p className="text-sm text-gray-500 mt-1">View and manage workspace subscriptions across the platform.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
            <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
              <Icon size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-xl font-bold text-gray-900">{value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-3">Tenant</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Period End</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {subscriptions.map((sub) => (
              <tr key={sub.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{sub.tenant?.name}</p>
                  <p className="text-xs text-gray-500">{sub.tenant?.slug}</p>
                </td>
                <td className="px-4 py-3 text-gray-600">{sub.tenant?.owner?.email ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className="font-medium">{sub.plan?.name ?? sub.planCode}</span>
                  {sub.plan && (
                    <span className="block text-xs text-gray-500">
                      {sub.plan.currencyCode} {sub.plan.price}/{sub.plan.billingCycle}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      sub.status === "active"
                        ? "bg-green-100 text-green-800"
                        : sub.status === "trialing"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {sub.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs">
                  {sub.currentPeriodEndsAt ? new Date(sub.currentPeriodEndsAt).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <select
                      className="text-xs border border-gray-300 rounded px-2 py-1"
                      value={selectedPlans[sub.tenantId] ?? sub.planId ?? ""}
                      onChange={(e) => setSelectedPlans((prev) => ({ ...prev, [sub.tenantId]: e.target.value }))}
                    >
                      <option value="">Change plan…</option>
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={assigning === sub.tenantId}
                      onClick={() => assignPlan(sub.tenantId)}
                      className="text-xs font-medium text-purple-600 hover:underline disabled:opacity-50"
                    >
                      Assign
                    </button>
                    {sub.status !== "cancelled" && (
                      <button
                        type="button"
                        onClick={() => cancelSub(sub.id)}
                        className="text-xs font-medium text-red-600 hover:underline"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {subscriptions.length === 0 && (
          <p className="text-center py-12 text-gray-500">No tenant subscriptions yet.</p>
        )}
      </div>
    </div>
  );
}
