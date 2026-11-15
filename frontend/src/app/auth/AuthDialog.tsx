/**
 * Sign in or create an account: email and password, one dialog for both (DESIGN.md sections 3 and 8). Traps focus,
 * Escape closes, focus returns where it was.
 */
import { Loader2, X } from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Button } from "../../shared/components";
import { t } from "../../shared/i18n";
import { authApi } from "./authApi";
import type { User } from "./types";

export type AuthMode = "signin" | "signup";

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex='-1'])";
const inputCls = "w-full rounded-ctl border border-line bg-glass-hi px-3 py-2.5 text-sm text-tx placeholder:text-mut/70 focus:border-lime/60 focus:outline-none";

export function AuthDialog({ initialMode, reason, onDone, onClose }: {
  initialMode: AuthMode;
  reason?: string;
  onDone: (u: User, mode: AuthMode) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  const signup = mode === "signup";

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>("input")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
      } else if (e.key === "Tab" && box.current) {
        const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
        const [first, last] = [items[0], items[items.length - 1]];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      before?.focus?.();
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { email: email.trim(), password };
      onDone(await (signup ? authApi.signUp(body) : authApi.signIn(body)), mode);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const switchMode = () => {
    setMode(signup ? "signin" : "signup");
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-[2000] grid place-items-center bg-black/55 p-4" onMouseDown={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby={titleId} className="glass anim-in relative w-full max-w-[400px] p-6">
        <button type="button" onClick={onClose} aria-label={t("Close")}
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-ctl text-mut hover:bg-glass-hi hover:text-tx">
          <X size={16} strokeWidth={1.5} />
        </button>
        <h2 id={titleId} className="pr-8 text-[20px] font-semibold tracking-[-.01em]">
          {signup ? t("Create your account") : t("Sign in to AgroMind")}
        </h2>
        <p className="mt-2 text-sm leading-normal text-mut">
          {reason ?? (signup
            ? t("Add your own farm, draw its fields and save simulator runs. Your farms are private to your account.")
            : t("Open your own farms. The demo farm stays open to everyone, read-only."))}
        </p>
        <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
          <div>
            <label htmlFor="auth-email" className="mb-1.5 block text-[13px] font-medium text-mut">{t("Email")}</label>
            <input id="auth-email" type="email" autoComplete="email" required maxLength={254} value={email}
              onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="auth-password" className="mb-1.5 block text-[13px] font-medium text-mut">{t("Password")}</label>
            <input id="auth-password" type="password" required maxLength={200} value={password}
              autoComplete={signup ? "new-password" : "current-password"} aria-describedby={signup ? "auth-password-hint" : undefined}
              onChange={(e) => setPassword(e.target.value)} className={inputCls} />
            {signup && <p id="auth-password-hint" className="mt-1.5 text-[12px] text-mut">{t("At least 8 characters")}</p>}
          </div>
          {error && <p role="alert" className="text-[13px] leading-snug text-alert">{error}</p>}
          <Button type="submit" variant="primary" className="w-full !py-2.5 max-sm:min-h-11" disabled={busy || !email.trim() || !password}>
            {busy && <Loader2 size={16} className="animate-spin" />}
            {signup ? t("Create account") : t("Sign in")}
          </Button>
        </form>
        <p className="mt-4 text-center text-[13px] text-mut">
          {signup ? t("Already have an account?") : t("New to AgroMind?")}{" "}
          <button type="button" onClick={switchMode} className="font-medium text-tx underline-offset-4 hover:underline">
            {signup ? t("Sign in") : t("Create an account")}
          </button>
        </p>
      </div>
    </div>
  );
}
