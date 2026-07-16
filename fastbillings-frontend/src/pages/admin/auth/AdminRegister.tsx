import React, { useState } from "react";
import { Eye, EyeOff, User, Mail, Phone, Lock, Loader2Icon } from "lucide-react";
import type { RegisterFormData } from "@models/register";
import axios from "axios";
import Constants from "@constants/api";
import { toast } from "sonner";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { useSetupStatus } from "@context/SetupStatusContext";
import { isValidPhone, PHONE_ERROR } from "@utils/validation";
import Cookies from "js-cookie";
import { BRAND } from "@constants/brand";
import AuthShell from "./AuthShell";
import GoogleAuthButton from "@components/auth/GoogleAuthButton";
import { loginWithGoogle } from "../../../store/auth/authSlice";
import type { AppDispatch } from "../../../store";

const inputClass =
  "w-full rounded-lg border border-[#D5DEE9] bg-white py-2.5 pl-10 pr-3 text-sm text-[#1A2B3C] placeholder:text-[#9AA8B8] outline-none transition focus:border-[#0066FF] focus:ring-2 focus:ring-[#0066FF]/20";

const AdminRegister: React.FC = () => {
  const navigate = useNavigate();
  const dispatch: AppDispatch = useDispatch();
  const prepareInitialFormData = () => ({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [formData, setFormData] = useState<RegisterFormData>(prepareInitialFormData());
  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { setStatus } = useSetupStatus();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};
    if (!formData.firstName.trim()) {
      newErrors.firstName = "First name is required.";
    } else if (formData.firstName.length < 3 || formData.firstName.length > 50) {
      newErrors.firstName = "First name must be between 3 and 50 characters.";
    }

    if (!formData.lastName.trim()) {
      newErrors.lastName = "Last name is required.";
    } else if (formData.lastName.length < 3 || formData.lastName.length > 50) {
      newErrors.lastName = "Last name must be between 3 and 50 characters.";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Invalid email format.";
    }
    if (!formData.phone) {
      newErrors.phone = "Phone number is required.";
    } else if (formData.phone && !isValidPhone(formData.phone)) {
      newErrors.phone = PHONE_ERROR;
    }

    if (!formData.password.trim()) {
      newErrors.password = "Password is required.";
    } else if (formData.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters.";
    }

    if (!formData.confirmPassword.trim()) {
      newErrors.confirmPassword = "Confirm password is required.";
    } else if (formData.confirmPassword !== formData.password) {
      newErrors.confirmPassword = "Passwords do not match.";
    }

    setFormErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validateForm()) return;
    try {
      setIsSaving(true);
      const response = await axios.post(Constants.REGISTER_URL, formData);
      const { token, user, tenants = [], activeTenantId } = response.data;
      Cookies.set("authToken", token, { secure: true, sameSite: "Strict", expires: 7 });
      Cookies.set("authUser", JSON.stringify(user), { secure: true, sameSite: "Strict", expires: 7 });
      Cookies.set("authTenants", JSON.stringify(tenants), { secure: true, sameSite: "Strict", expires: 7 });
      if (activeTenantId) {
        Cookies.set("activeTenantId", activeTenantId, { secure: true, sameSite: "Strict", expires: 7 });
      }
      sessionStorage.setItem(
        "setupStatus",
        JSON.stringify({
          new_register: false,
          company_settings: true,
        })
      );
      setStatus({
        new_register: false,
        company_settings: true,
      });

      navigate("/setup");
    } catch {
      toast.error("Failed to register admin.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AuthShell wideForm>
      <p className="mb-5 text-center text-sm text-[#5A6B7D]">
        Create your {BRAND.name} account
      </p>

      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
        <div className="flex flex-col">
          <label className="mb-1.5 text-sm font-medium text-[#2C3E50]">
            First Name <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA8B8]" size={18} />
            <input
              type="text"
              placeholder="Enter your first name"
              name="firstName"
              value={formData.firstName}
              onChange={handleChange}
              maxLength={30}
              className={inputClass}
            />
          </div>
          {formErrors.firstName && <p className="mt-1 text-xs text-red-500">{formErrors.firstName}</p>}
        </div>

        <div className="flex flex-col">
          <label className="mb-1.5 text-sm font-medium text-[#2C3E50]">
            Last Name <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA8B8]" size={18} />
            <input
              type="text"
              placeholder="Enter your last name"
              name="lastName"
              value={formData.lastName}
              onChange={handleChange}
              maxLength={30}
              className={inputClass}
            />
          </div>
          {formErrors.lastName && <p className="mt-1 text-xs text-red-500">{formErrors.lastName}</p>}
        </div>

        <div className="flex flex-col">
          <label className="mb-1.5 text-sm font-medium text-[#2C3E50]">
            Email <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA8B8]" size={18} />
            <input
              type="email"
              placeholder="Enter your email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              maxLength={70}
              className={inputClass}
            />
          </div>
          {formErrors.email && <p className="mt-1 text-xs text-red-500">{formErrors.email}</p>}
        </div>

        <div className="flex flex-col">
          <label className="mb-1.5 text-sm font-medium text-[#2C3E50]">
            Phone <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA8B8]" size={18} />
            <input
              type="text"
              placeholder="Enter your phone number"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              maxLength={20}
              className={inputClass}
            />
          </div>
          {formErrors.phone && <p className="mt-1 text-xs text-red-500">{formErrors.phone}</p>}
        </div>

        <div className="flex flex-col">
          <label className="mb-1.5 text-sm font-medium text-[#2C3E50]">
            Password <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA8B8]" size={18} />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              maxLength={30}
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
          {formErrors.password && <p className="mt-1 text-xs text-red-500">{formErrors.password}</p>}
        </div>

        <div className="flex flex-col">
          <label className="mb-1.5 text-sm font-medium text-[#2C3E50]">
            Confirm Password <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA8B8]" size={18} />
            <input
              type={showConfirmPassword ? "text" : "password"}
              placeholder="Re-enter your password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              maxLength={30}
              className={`${inputClass} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-[#8A97A8] hover:text-[#2C3E50]"
              aria-label={showConfirmPassword ? "Hide password" : "Show password"}
            >
              {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {formErrors.confirmPassword && (
            <p className="mt-1 text-xs text-red-500">{formErrors.confirmPassword}</p>
          )}
        </div>

        <div className="sm:col-span-2 mt-2">
          <button
            type="submit"
            disabled={isSaving}
            className={`flex w-full items-center justify-center gap-2 rounded-full bg-[#000B1E] py-3 text-sm font-semibold text-white transition hover:bg-[#0B1533] focus:outline-none focus:ring-2 focus:ring-[#0066FF] focus:ring-offset-2 ${
              isSaving ? "cursor-not-allowed opacity-60" : ""
            }`}
          >
            {isSaving ? (
              <>
                <Loader2Icon size={18} className="animate-spin" />
                <span>Registering...</span>
              </>
            ) : (
              "Sign up"
            )}
          </button>
        </div>
      </form>

      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-[#E8EEF5]" />
        <span className="text-xs font-medium uppercase tracking-wide text-[#8A97A8]">or</span>
        <div className="h-px flex-1 bg-[#E8EEF5]" />
      </div>

      <GoogleAuthButton
        onCredential={async (credential) => {
          const resultAction = await dispatch(loginWithGoogle(credential));
          if (loginWithGoogle.fulfilled.match(resultAction)) {
            navigate("/");
          }
        }}
        disabled={isSaving}
        label="Continue with Google"
      />

      <p className="mt-6 text-center text-sm text-[#5A6B7D]">
        Already have an account?{" "}
        <Link
          to="/admin/login"
          className="font-semibold text-[#0066FF] underline-offset-2 hover:underline"
        >
          Log in.
        </Link>
      </p>
    </AuthShell>
  );
};

export default AdminRegister;
