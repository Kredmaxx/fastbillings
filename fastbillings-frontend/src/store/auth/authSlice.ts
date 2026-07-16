import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import axios from "axios";
import Cookies from "js-cookie";
import Constants from "../../constants/api";

export interface AuthState {
    isAuthenticated: boolean;
    user: any;
    token: string | null;
    tenants: TenantSummary[];
    activeTenantId: string | null;
    isLoading: boolean;
    error: string | null;
}

export interface TenantSummary {
    membershipId: string;
    tenantId: string;
    name: string;
    slug: string;
    status: string;
    role: "OWNER" | "ADMIN" | "MEMBER";
    roleId?: string | null;
}

interface AuthPayload {
    token: string;
    user: any;
    tenants?: TenantSummary[];
    activeTenantId?: string | null;
}

// initial state
const initialState: AuthState = {
    isAuthenticated: false,
    user: null,
    token: "",
    tenants: [],
    activeTenantId: null,
    isLoading: false,
    error: null,
};

function persistAuth(payload: AuthPayload) {
    Cookies.set("authToken", payload.token, { secure: true, sameSite: "Strict", expires: 7 });
    Cookies.set("authUser", JSON.stringify(payload.user), { secure: true, sameSite: "Strict", expires: 7 });
    Cookies.set("authTenants", JSON.stringify(payload.tenants ?? []), { secure: true, sameSite: "Strict", expires: 7 });
    if (payload.activeTenantId) {
        Cookies.set("activeTenantId", payload.activeTenantId, { secure: true, sameSite: "Strict", expires: 7 });
    }
}

function clearAuthCookies() {
    Cookies.remove("authToken");
    Cookies.remove("authUser");
    Cookies.remove("authTenants");
    Cookies.remove("activeTenantId");
    Cookies.remove("systemSettings");
}

// --- LOGIN ASYNC ACTION ---
export const loginUser = createAsyncThunk(
    "auth/login",
    async (credentials: { email: string; password: string }, { rejectWithValue }) => {
        try {
            const response = await axios.post(Constants.LOGIN_URL, {
                email: credentials.email,
                password: credentials.password,
            });

            const { token, user, tenants, activeTenantId } = response.data;
            persistAuth({ token, user, tenants, activeTenantId });

            return { token, user, tenants, activeTenantId };
        } catch (error: any) {
            let errorMessage = "Login failed. Please try again.";
            if (axios.isAxiosError(error) && error.response) {
                errorMessage = error.response.data.message || error.response.statusText;
            } else if (error instanceof Error) {
                errorMessage = error.message;
            }
            return rejectWithValue(errorMessage);
        }
    }
);

export const loginWithGoogle = createAsyncThunk(
    "auth/loginWithGoogle",
    async (credential: string, { rejectWithValue }) => {
        try {
            const response = await axios.post(Constants.GOOGLE_AUTH_URL, { credential });
            const { token, user, tenants, activeTenantId } = response.data;
            persistAuth({ token, user, tenants, activeTenantId });
            return { token, user, tenants, activeTenantId };
        } catch (error: any) {
            let errorMessage = "Google sign-in failed. Please try again.";
            if (axios.isAxiosError(error) && error.response) {
                errorMessage = error.response.data.message || error.response.statusText;
            } else if (error instanceof Error) {
                errorMessage = error.message;
            }
            return rejectWithValue(errorMessage);
        }
    }
);

export const switchTenant = createAsyncThunk(
    "auth/switchTenant",
    async (tenantId: string, { getState, rejectWithValue }) => {
        try {
            const state = getState() as { auth: AuthState };
            const response = await axios.post(
                Constants.SWITCH_TENANT_URL,
                { tenantId },
                {
                    headers: state.auth.token
                        ? { Authorization: `Bearer ${state.auth.token}` }
                        : undefined,
                }
            );
            const { token, user, tenants, activeTenantId } = response.data;
            persistAuth({ token, user, tenants, activeTenantId });
            return { token, user, tenants, activeTenantId };
        } catch (error: any) {
            if (axios.isAxiosError(error) && error.response) {
                return rejectWithValue(error.response.data.message || error.response.statusText);
            }
            return rejectWithValue(error instanceof Error ? error.message : "Failed to switch tenant.");
        }
    }
);

// --- SLICE ---
export const authSlice = createSlice({
    name: "auth",
    initialState,
    reducers: {
        logout: (state) => {
            state.isAuthenticated = false;
            state.user = null;
            state.token = null;
            state.tenants = [];
            state.activeTenantId = null;
            state.error = null;

            clearAuthCookies();
        },
        initializeAuth: (state) => {
            //  Read from cookies
            const token = Cookies.get("authToken");
            const user = Cookies.get("authUser");
            const tenants = Cookies.get("authTenants");
            const activeTenantId = Cookies.get("activeTenantId");

            if (token && user) {
                try {
                    state.token = token;
                    state.user = JSON.parse(user);
                    state.tenants = tenants ? JSON.parse(tenants) : [];
                    state.activeTenantId = activeTenantId ?? state.tenants[0]?.tenantId ?? null;
                    state.isAuthenticated = true;
                } catch (e) {
                    console.error("Failed to parse user data from cookies", e);
                    state.isAuthenticated = false;
                    state.user = null;
                    state.token = null;
                    state.tenants = [];
                    state.activeTenantId = null;
                    clearAuthCookies();
                }
            }
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(loginUser.pending, (state) => {
                state.isLoading = true;
                state.error = null;
            })
            .addCase(loginUser.fulfilled, (state, action: PayloadAction<AuthPayload>) => {
                state.isLoading = false;
                state.isAuthenticated = true;
                state.token = action.payload.token;
                state.user = action.payload.user;
                state.tenants = action.payload.tenants ?? [];
                state.activeTenantId = action.payload.activeTenantId ?? state.tenants[0]?.tenantId ?? null;
                state.error = null;
            })
            .addCase(loginUser.rejected, (state, action: PayloadAction<any>) => {
                state.isLoading = false;
                state.isAuthenticated = false;
                state.user = null;
                state.token = null;
                state.tenants = [];
                state.activeTenantId = null;
                state.error = action.payload || "Login failed.";
            })
            .addCase(loginWithGoogle.pending, (state) => {
                state.isLoading = true;
                state.error = null;
            })
            .addCase(loginWithGoogle.fulfilled, (state, action: PayloadAction<AuthPayload>) => {
                state.isLoading = false;
                state.isAuthenticated = true;
                state.token = action.payload.token;
                state.user = action.payload.user;
                state.tenants = action.payload.tenants ?? [];
                state.activeTenantId = action.payload.activeTenantId ?? state.tenants[0]?.tenantId ?? null;
                state.error = null;
            })
            .addCase(loginWithGoogle.rejected, (state, action: PayloadAction<any>) => {
                state.isLoading = false;
                state.error = action.payload || "Google sign-in failed.";
            })
            .addCase(switchTenant.fulfilled, (state, action: PayloadAction<AuthPayload>) => {
                state.isAuthenticated = true;
                state.token = action.payload.token;
                state.user = action.payload.user;
                state.tenants = action.payload.tenants ?? [];
                state.activeTenantId = action.payload.activeTenantId ?? null;
                state.error = null;
            })
            .addCase(switchTenant.rejected, (state, action: PayloadAction<any>) => {
                state.error = action.payload || "Failed to switch tenant.";
            });
    },
});

// export actions
export const { logout, initializeAuth } = authSlice.actions;

// export reducer
export default authSlice.reducer;
