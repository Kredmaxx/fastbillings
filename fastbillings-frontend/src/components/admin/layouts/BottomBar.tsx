import { LogOut, Settings, UserCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { logout } from "@store/auth/authSlice";
import type { AppDispatch } from "@store/index";
import { useDispatch } from "react-redux";

interface BottomBarProps {
  isOpen?: boolean;
  user?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    profileImageUrl?: string | null;
  } | null;
  userName?: string;
}

const BottomBar: React.FC<BottomBarProps> = ({ isOpen = true, user, userName = "User" }) => {
  const navigate = useNavigate();
  const dispatch: AppDispatch = useDispatch();

  const initials =
    [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("").toUpperCase() ||
    userName.charAt(0).toUpperCase();

  const collapsedBtn =
    "group relative flex h-11 w-11 items-center justify-center rounded-[14px] text-[#9BB0CC] bg-gradient-to-br from-white/[0.1] to-white/[0.03] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] cursor-pointer transition-all duration-300 hover:text-white hover:scale-105 hover:ring-[#00D2FF]/45 hover:from-[#0066FF]/35 hover:to-[#00D2FF]/20 hover:shadow-[0_0_0_1px_rgba(0,210,255,0.25),0_8px_20px_rgba(0,102,255,0.25)]";

  const btn =
    "flex h-9 w-9 items-center justify-center rounded-xl text-[#8BA3C7] bg-white/[0.06] border border-white/10 cursor-pointer transition hover:bg-gradient-to-br hover:from-[#00D2FF] hover:to-[#0066FF] hover:text-white hover:border-transparent hover:shadow-[0_6px_18px_rgba(0,102,255,0.4)]";

  if (!isOpen) {
    return (
      <div className="relative border-t border-white/[0.08] bg-[#060F24]/80 px-1.5 py-3 backdrop-blur-md">
        <div className="flex flex-col items-center gap-2.5">
          <button
            type="button"
            title="Profile"
            onClick={() => navigate("/admin/settings/profile")}
            className={`${collapsedBtn} overflow-hidden bg-gradient-to-br from-[#0066FF] to-[#00D2FF] text-white ring-[#00D2FF]/30 shadow-[0_6px_16px_rgba(0,102,255,0.4)]`}
          >
            {user?.profileImageUrl ? (
              <img src={user.profileImageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs font-bold">{initials}</span>
            )}
          </button>
          <button
            type="button"
            title="Settings"
            onClick={() => navigate("/admin/settings/company-settings")}
            className={collapsedBtn}
          >
            <Settings size={18} />
          </button>
          <button
            type="button"
            title="Log out"
            onClick={() => dispatch(logout())}
            className={collapsedBtn}
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative border-t border-white/[0.08] bg-gradient-to-r from-[#060F24]/90 via-[#0B1533]/80 to-[#060F24]/90 px-3 py-3 backdrop-blur-md">
      <div className="mb-2.5 flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.05] p-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-[#0066FF] to-[#00D2FF] text-sm font-bold text-white shadow-[0_4px_14px_rgba(0,102,255,0.45)] ring-1 ring-white/20">
          {user?.profileImageUrl ? (
            <img src={user.profileImageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initials
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{userName}</p>
          <p className="truncate text-[11px] text-[#6B85A8]">{user?.email || "Signed in"}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-1.5">
        <button
          type="button"
          title="Log out"
          onClick={() => dispatch(logout())}
          className={btn}
        >
          <LogOut size={16} />
        </button>
        <button
          type="button"
          title="Company settings"
          onClick={() => navigate("/admin/settings/company-settings")}
          className={btn}
        >
          <Settings size={16} />
        </button>
        <button
          type="button"
          title="Profile"
          onClick={() => navigate("/admin/settings/profile")}
          className={btn}
        >
          <UserCircle2 size={16} />
        </button>
      </div>
    </div>
  );
};

export default BottomBar;
