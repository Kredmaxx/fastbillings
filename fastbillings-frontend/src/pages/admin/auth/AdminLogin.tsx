import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Copy, Check, Mail, Lock } from "lucide-react";
import { useSelector, useDispatch } from "react-redux";
import { loginUser, loginWithGoogle } from "../../../store/auth/authSlice";
import type { RootState, AppDispatch } from "../../../store";
import { BRAND } from "@constants/brand";
import AuthShell from "./AuthShell";
import GoogleAuthButton from "@components/auth/GoogleAuthButton";

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
const DEMO_EMAIL = BRAND.demoEmail;
const DEMO_PASSWORD = "Demo123$";

const inputClass =
  "w-full rounded-lg border border-[#D5DEE9] bg-white py-2.5 pl-10 pr-3 text-sm text-[#1A2B3C] placeholder:text-[#9AA8B8] outline-none transition focus:border-[#0066FF] focus:ring-2 focus:ring-[#0066FF]/20";

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState<string>(DEMO_MODE ? DEMO_EMAIL : "");
  const [password, setPassword] = useState<string>(DEMO_MODE ? DEMO_PASSWORD : "");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const { isLoading, error, isAuthenticated } = useSelector(
    (state: RootState) => state.auth
  );
  const dispatch: AppDispatch = useDispatch();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/admin/dashboard");
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (
    e: React.FormEvent<HTMLFormElement>
  ): Promise<void> => {
    e.preventDefault();
    const resultAction = await dispatch(loginUser({ email, password }));
    if (loginUser.fulfilled.match(resultAction)) {
      navigate("/");
    }
  };

  const handleGoogleCredential = useCallback(
    async (credential: string) => {
      const resultAction = await dispatch(loginWithGoogle(credential));
      if (loginWithGoogle.fulfilled.match(resultAction)) {
        navigate("/");
      }
    },
    [dispatch, navigate]
  );

  const handleCopy = (): void => {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    const credentials = `Email: ${DEMO_EMAIL}\nPassword: ${DEMO_PASSWORD}`;
    navigator.clipboard
      .writeText(credentials)
      .then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      })
      .catch((err) => console.error("Failed to copy text: ", err));
  };

  return (
    <AuthShell>
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-[#2C3E50]">
            Email <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA8B8]" size={18} />
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="Enter your email"
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-[#2C3E50]">
            Password <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA8B8]" size={18} />
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter password"
              className={`${inputClass} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-[#8A97A8] hover:text-[#2C3E50]"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[#3D4F63]">
            <input
              id="remember_me"
              name="remember_me"
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded border-[#D5DEE9] accent-[#0066FF]"
            />
            Remember me
          </label>
          <span className="text-sm font-medium text-[#0066FF] opacity-40 cursor-default">
            Forgot password?
          </span>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-full bg-[#000B1E] py-3 text-sm font-semibold text-white transition hover:bg-[#0B1533] focus:outline-none focus:ring-2 focus:ring-[#0066FF] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? "Logging in..." : "Log in"}
        </button>
      </form>

      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-[#E8EEF5]" />
        <span className="text-xs font-medium uppercase tracking-wide text-[#8A97A8]">or</span>
        <div className="h-px flex-1 bg-[#E8EEF5]" />
      </div>

      <GoogleAuthButton
        onCredential={handleGoogleCredential}
        disabled={isLoading}
        label="Continue with Google"
      />

      <p className="mt-6 text-center text-sm text-[#5A6B7D]">
        Don&apos;t have an account?{" "}
        <Link to="/register" className="font-semibold text-[#0066FF] underline-offset-2 hover:underline">
          Sign up.
        </Link>
      </p>

      {DEMO_MODE && (
        <div className="mt-6 rounded-xl border border-[#D6E4FF] bg-[#F4F8FF] p-3">
          <div className="flex items-center justify-between gap-3 text-sm text-[#2C3E50]">
            <div>
              <p>
                <span className="font-medium">Email:</span> {DEMO_EMAIL}
              </p>
              <p>
                <span className="font-medium">Password:</span> {DEMO_PASSWORD}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-lg p-2 text-[#5A6B7D] hover:bg-white hover:text-[#0066FF]"
              aria-label="Copy demo credentials"
            >
              {isCopied ? <Check className="text-emerald-600" size={18} /> : <Copy size={18} />}
            </button>
          </div>
        </div>
      )}
    </AuthShell>
  );
};

export default LoginPage;
