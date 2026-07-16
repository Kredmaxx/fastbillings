import { Navigate, Route, Routes } from "react-router-dom";
import { isAuthenticated } from "@/lib/auth";
import LoginPage from "@pages/LoginPage";
import AdminLayout from "@components/AdminLayout";
import DashboardPage from "@pages/DashboardPage";
import PlansList from "@pages/plans/PlansList";
import PlanForm from "@pages/plans/PlanForm";
import SubscribersList from "@pages/subscriptions/SubscribersList";
import LandingPage from "@pages/landing/LandingPage";
import TenantsPage from "@pages/tenants/TenantsPage";

function PrivateRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <PrivateRoute>
            <AdminLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="plans" element={<PlansList />} />
        <Route path="plans/new" element={<PlanForm />} />
        <Route path="plans/edit/:id" element={<PlanForm />} />
        <Route path="subscribers" element={<SubscribersList />} />
        <Route path="tenants" element={<TenantsPage />} />
        <Route path="landing" element={<LandingPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
