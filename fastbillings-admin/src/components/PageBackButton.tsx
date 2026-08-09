import { ArrowLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  canNavigateBack,
  getBackFallbackPath,
  shouldShowPageBack,
} from "@/lib/navigationBack";

export default function PageBackButton() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  if (!shouldShowPageBack(pathname)) return null;

  const handleBack = () => {
    if (canNavigateBack()) {
      navigate(-1);
      return;
    }
    navigate(getBackFallbackPath(pathname));
  };

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={handleBack}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#D6E4FF] bg-white px-3 py-1.5 text-sm font-semibold text-[#3D4F63] shadow-sm transition hover:border-[#0066FF]/40 hover:bg-[#F4F8FF] hover:text-[#0066FF]"
        aria-label="Go back"
      >
        <ArrowLeft size={16} aria-hidden />
        Back
      </button>
    </div>
  );
}
