import { Navigate, Route, Routes } from "react-router-dom";
import { useSelector } from "react-redux";
import AdminRoute from "./AdminRoute";
import AdminRegister from "@pages/admin/auth/AdminRegister";
import SetupOrganizationInfo from "@pages/admin/auth/SetupOrganizationInfo";
import SsoLanding from "@pages/admin/auth/SsoLanding";
import PublicInvoiceViewer from "@pages/public/PublicInvoiceViewer";
import MarketingLanding from "@pages/landing/MarketingLanding";
import { useSetupStatus } from "@context/SetupStatusContext";
import type { RootState } from "@store/index";
import Seo from "@components/admin/Seo";
import NotFound from "@pages/errors/NotFound";

const AppRoutes = () => {
    const { status, isLoading } = useSetupStatus();
    const { token } = useSelector((state: RootState) => state.auth);

    if (isLoading) return <></>;

    const storedStatus = sessionStorage.getItem("setupStatus");
    const currentStatus = storedStatus
        ? JSON.parse(storedStatus)
        : status;

    const { new_register, company_settings } = currentStatus;

    // Fully setup -> marketing landing for guests, admin app for authenticated users
    if (!new_register && !company_settings) {
        const isAuthenticated = Boolean(token);

        return (
            <Routes>
                <Route
                    path="/"
                    element={isAuthenticated ? <Navigate to="/admin" replace /> : <MarketingLanding />}
                />
                <Route path="/login" element={<Navigate to="/admin/login" replace />} />
                <Route path="/landing" element={<MarketingLanding />} />
                <Route path="/sso" element={<SsoLanding />} />
                <Route path="/invoice/:token" element={<PublicInvoiceViewer />} />
                <Route path="/admin/*" element={<AdminRoute />} />
                <Route path="/register" element={<AdminRegister />} />
                <Route
                    path="/documentation"
                    element={
                        <iframe
                            src="/documentation/index.html"
                            style={{ width: "100%", height: "100vh", border: "none" }}
                            title="Documentation"
                        />
                    }
                />
                <Route
                    path="/documentation/mobile"
                    element={
                        <iframe
                            src="/documentation/mobile/index.html"
                            style={{ width: "100%", height: "100vh", border: "none" }}
                            title="Mobile Documentation"
                        />
                    }
                />
                <Route path="*" element={<><Seo title="Not Found" /><NotFound /></>} />
            </Routes>
        );
    }

    // User registered but company setup not done -> setup page only
    if (!new_register && company_settings) {
        return (
            <Routes>
                <Route path="/setup" element={<SetupOrganizationInfo />} />
                <Route path="*" element={<Navigate to="/setup" />} />
            </Routes>
        );
    }

    // Fresh install -> register page only
    if (new_register) {
        return (
            <Routes>
                <Route path="/register" element={<AdminRegister />} />
                <Route path="*" element={<Navigate to="/register" />} />
            </Routes>
        );
    }

    return <Navigate to="/register" />;
};

export default AppRoutes;
