import React, { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          prompt: (momentListener?: (notification: {
            isNotDisplayed: () => boolean;
            isSkippedMoment: () => boolean;
            isDismissedMoment: () => boolean;
          }) => void) => void;
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const GSI_SRC = "https://accounts.google.com/gsi/client";

function loadGsiScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Sign-In")));
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Sign-In"));
    document.head.appendChild(script);
  });
}

type GoogleAuthButtonProps = {
  onCredential: (credential: string) => Promise<void> | void;
  label?: string;
  disabled?: boolean;
};

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
    <path
      fill="#FFC107"
      d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
    />
    <path
      fill="#FF3D00"
      d="M6.306 14.691l6.571 5.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
    />
    <path
      fill="#4CAF50"
      d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
    />
    <path
      fill="#1976D2"
      d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 01-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
    />
  </svg>
);

/** Custom-styled Google sign-in using Google Identity Services. */
const GoogleAuthButton: React.FC<GoogleAuthButtonProps> = ({
  onCredential,
  label = "Continue with Google",
  disabled = false,
}) => {
  const [busy, setBusy] = useState(false);
  const readyRef = useRef(false);

  const handleCredential = useCallback(
    async (credential: string) => {
      setBusy(true);
      try {
        await onCredential(credential);
      } finally {
        setBusy(false);
      }
    },
    [onCredential]
  );

  const handleClick = async () => {
    if (disabled || busy) return;

    if (!GOOGLE_CLIENT_ID) {
      toast.message("Google sign-in is not configured yet.", {
        description: "Add VITE_GOOGLE_CLIENT_ID to enable Continue with Google.",
      });
      return;
    }

    try {
      setBusy(true);
      await loadGsiScript();
      if (!window.google?.accounts?.id) {
        throw new Error("Google Sign-In unavailable");
      }

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => {
          void handleCredential(response.credential);
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      readyRef.current = true;

      window.google.accounts.id.prompt((notification) => {
        if (
          notification.isNotDisplayed() ||
          notification.isSkippedMoment() ||
          notification.isDismissedMoment()
        ) {
          setBusy(false);
          toast.message("Google sign-in was cancelled or blocked.", {
            description: "Allow pop-ups for this site and try again.",
          });
        }
      });
    } catch (err) {
      setBusy(false);
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={disabled || busy}
      className="flex w-full items-center justify-center gap-3 rounded-full border border-[#D5DEE9] bg-white py-3 text-sm font-semibold text-[#1A2B3C] transition hover:bg-[#F7FAFC] focus:outline-none focus:ring-2 focus:ring-[#0066FF]/30 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <GoogleIcon />
      {busy ? "Connecting..." : label}
    </button>
  );
};

export default GoogleAuthButton;
