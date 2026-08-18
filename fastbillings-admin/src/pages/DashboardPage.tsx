import { useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { API_URLS } from "@constants/config";
import type { SubscriptionStats } from "@/types/plan";

export default function DashboardPage() {
  const [stats, setStats] = useState<SubscriptionStats | null>(null);

  useEffect(() => {
    axios.get(API_URLS.SUBSCRIPTION_STATS).then((res) => setStats(res.data?.data ?? null));
  }, []);

  const cards = [
    { label: "Total Tenants", value: stats?.totalTenants ?? "—" },
    { label: "Active Subscriptions", value: stats?.activeSubs ?? "—" },
    { label: "Trialing", value: stats?.trialingSubs ?? "—" },
    { label: "Est. MRR", value: stats ? `$${stats.estimatedMrr.toFixed(0)}` : "—" },
    { label: "Active Plans", value: stats?.activePlans ?? "—" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Platform Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Manage plans, tenants, and marketing for Byzkon.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500">{c.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{c.value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Link to="/plans" className="bg-white border border-gray-200 rounded-xl p-5 hover:border-purple-300 transition">
          <h2 className="font-semibold text-gray-900">Pricing Plans</h2>
          <p className="text-sm text-gray-500 mt-1">Create and manage subscription tiers.</p>
        </Link>
        <Link to="/subscribers" className="bg-white border border-gray-200 rounded-xl p-5 hover:border-purple-300 transition">
          <h2 className="font-semibold text-gray-900">Subscribers</h2>
          <p className="text-sm text-gray-500 mt-1">Assign plans and monitor tenant billing.</p>
        </Link>
        <Link to="/landing" className="bg-white border border-gray-200 rounded-xl p-5 hover:border-purple-300 transition">
          <h2 className="font-semibold text-gray-900">Landing Page</h2>
          <p className="text-sm text-gray-500 mt-1">Preview and manage the marketing site.</p>
        </Link>
      </div>
    </div>
  );
}
