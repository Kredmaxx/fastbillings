import axios from "axios";
import { API_URLS } from "@constants/config";
import { isPlatformSuperAdmin } from "@constants/userTypes";

const TOKEN_KEY = "platform_auth_token";
const USER_KEY = "platform_auth_user";

export interface PlatformUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  user_type: number;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): PlatformUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlatformUser;
  } catch {
    return null;
  }
}

export function setAuth(token: string, user: PlatformUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isAuthenticated(): boolean {
  const user = getUser();
  return Boolean(getToken() && user && isPlatformSuperAdmin(user.user_type));
}

axios.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export async function platformLogin(email: string, password: string) {
  const res = await axios.post(API_URLS.LOGIN, { email, password });
  const { token, user } = res.data;
  if (!isPlatformSuperAdmin(user?.user_type)) {
    throw new Error("This account is not a platform super admin.");
  }
  setAuth(token, user);
  return res.data;
}

export function platformLogout() {
  clearAuth();
}
