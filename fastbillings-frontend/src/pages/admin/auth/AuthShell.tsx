import React from "react";
import { MessageCircle } from "lucide-react";
import { BRAND } from "@constants/brand";

type AuthShellProps = {
  children: React.ReactNode;
  /** Slightly wider card when the form has more fields */
  wideForm?: boolean;
};

/** Split-screen auth frame: photo panel + form (b.well-style layout). */
const AuthShell: React.FC<AuthShellProps> = ({ children, wideForm = false }) => {
  return (
    <div className="auth-shell min-h-screen flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div
        className={`auth-shell__card w-full overflow-hidden bg-white shadow-[0_24px_80px_rgba(0,11,30,0.12)] ${
          wideForm ? "max-w-5xl" : "max-w-[980px]"
        }`}
      >
        <div className="flex min-h-[min(640px,calc(100vh-4rem))] flex-col lg:flex-row">
          <aside className="auth-shell__visual relative hidden lg:block lg:w-[52%] shrink-0 overflow-hidden">
            <img
              src="https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=1400&q=80"
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-center scale-[1.02]"
              decoding="async"
            />
            <div className="auth-shell__tint absolute inset-0" aria-hidden />
            <svg
              className="pointer-events-none absolute -right-px top-0 z-10 h-full w-14"
              viewBox="0 0 56 800"
              preserveAspectRatio="none"
              aria-hidden
            >
              <path
                d="M56 0 C40 80 12 140 28 220 C44 300 8 360 24 440 C40 520 4 580 20 660 C32 720 40 760 56 800 L56 800 L56 0 Z"
                fill="#ffffff"
              />
            </svg>
            <div className="relative z-[1] flex h-full flex-col justify-end p-10 pb-12">
              <p className="max-w-xs text-2xl font-semibold leading-snug text-white drop-shadow-sm">
                Invoicing that keeps your business moving.
              </p>
              <p className="mt-2 max-w-xs text-sm text-white/85">{BRAND.tagline}</p>
            </div>
          </aside>

          <section className="relative flex flex-1 flex-col px-6 py-8 sm:px-10 sm:py-10 lg:px-12 lg:py-12">
            <div
              className={`mx-auto flex w-full flex-1 flex-col ${
                wideForm ? "max-w-lg" : "max-w-md"
              }`}
            >
              <div className="mb-8 flex flex-col items-center text-center">
                <img
                  src={`${BRAND.logos.auth}?v=2`}
                  alt={BRAND.displayName}
                  className="h-14 w-auto max-w-[280px] object-contain sm:h-16 sm:max-w-[320px]"
                />
                <p className="mt-3 text-[15px] font-medium tracking-tight text-[#4A6FA5]">
                  {BRAND.tagline}
                </p>
              </div>

              <div className="flex-1">{children}</div>

              <footer className="mt-8 border-t border-[#E8EEF5] pt-5">
                <p className="text-center text-[11px] leading-relaxed text-[#8A97A8]">
                  By continuing, you agree to our{" "}
                  <span className="text-[#0066FF]">Terms of Service</span> and{" "}
                  <span className="text-[#0066FF]">Privacy Policy</span>.
                </p>
                <div className="mt-4 flex items-center justify-between text-xs text-[#5A6B7D]">
                  <span>English</span>
                  <a
                    href={`mailto:${BRAND.supportEmail}`}
                    className="inline-flex items-center gap-1.5 font-medium text-[#0066FF] hover:underline"
                  >
                    <MessageCircle size={14} aria-hidden />
                    Get Support
                  </a>
                </div>
              </footer>
            </div>
          </section>
        </div>
      </div>

      <style>{`
        .auth-shell {
          font-family: "Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif;
          background:
            radial-gradient(ellipse 80% 60% at 20% 10%, rgba(0, 102, 255, 0.08), transparent 55%),
            radial-gradient(ellipse 70% 50% at 90% 90%, rgba(0, 11, 30, 0.06), transparent 50%),
            linear-gradient(165deg, #eef3f9 0%, #e4ecf6 45%, #dce6f2 100%);
        }
        .auth-shell__card {
          border-radius: 1.5rem;
        }
        .auth-shell__tint {
          background: linear-gradient(
            135deg,
            rgba(0, 40, 120, 0.55) 0%,
            rgba(0, 102, 255, 0.35) 45%,
            rgba(0, 11, 30, 0.5) 100%
          );
          mix-blend-mode: multiply;
        }
        .auth-shell__visual::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(to top, rgba(0, 11, 30, 0.55) 0%, transparent 45%);
          pointer-events: none;
          z-index: 0;
        }
        @media (prefers-reduced-motion: no-preference) {
          .auth-shell__card {
            animation: auth-card-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
          }
          .auth-shell__visual img {
            animation: auth-img-in 1.1s cubic-bezier(0.22, 1, 0.36, 1) both;
          }
        }
        @keyframes auth-card-in {
          from { opacity: 0; transform: translateY(12px) scale(0.985); }
          to { opacity: 1; transform: none; }
        }
        @keyframes auth-img-in {
          from { transform: scale(1.08); }
          to { transform: scale(1.02); }
        }
      `}</style>
    </div>
  );
};

export default AuthShell;
