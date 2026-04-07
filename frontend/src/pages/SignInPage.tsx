import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
} from "react";
import { Navigate } from "react-router-dom";

import { ApiError } from "../api/client";
import { Brand } from "../components/Brand";
import { ThemeToggle } from "../components/ThemeToggle";
import { useAuth } from "../context/AuthContext";
import { useThemeMode } from "../context/ThemeContext";
import { cn } from "../lib/utils";
import type {
  ForgotPasswordStartResponse,
  LoginChallengeResponse,
} from "../types";

const OTP_LENGTH = 6;
const TOAST_DURATION_MS = 4500;

type ToastState = {
  id: number;
  kind: "error" | "success";
  message: string;
};

type AuthStep =
  | "signin"
  | "loginOtp"
  | "forgotRequest"
  | "forgotOtp"
  | "forgotReset";

export function SignInPage() {
  const {
    user,
    loading,
    startSignIn,
    verifyOtp,
    startForgotPassword,
    verifyForgotPasswordOtp,
    resetForgotPassword,
  } = useAuth();
  const { theme } = useThemeMode();
  const loginOtpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const forgotOtpRefs = useRef<Array<HTMLInputElement | null>>([]);

  const [authStep, setAuthStep] = useState<AuthStep>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loginOtpCode, setLoginOtpCode] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotOtpCode, setForgotOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loginChallenge, setLoginChallenge] =
    useState<LoginChallengeResponse | null>(null);
  const [forgotChallenge, setForgotChallenge] =
    useState<ForgotPasswordStartResponse | null>(null);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [busy, setBusy] = useState<AuthStep | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const isLight = theme === "light";

  useEffect(() => {
    if (authStep === "loginOtp") {
      loginOtpRefs.current[0]?.focus();
    }
    if (authStep === "forgotOtp") {
      forgotOtpRefs.current[0]?.focus();
    }
  }, [authStep]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeoutId = window.setTimeout(
      () => setToast(null),
      TOAST_DURATION_MS,
    );
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  if (!loading && user) {
    return <Navigate replace to="/workspace" />;
  }

  const fieldClass = isLight
    ? "w-full border-0 border-b border-[rgba(25,28,30,0.16)] bg-transparent px-0 py-3 text-base text-[var(--text)] outline-none transition placeholder:text-[var(--soft)] focus:border-[var(--accent)]"
    : "h-14 w-full rounded-xl border border-[var(--glass-line)] bg-[var(--surface-lowest)] px-4 text-sm text-[var(--text)] outline-none transition placeholder:text-[var(--soft)] focus:border-[rgba(var(--accent-rgb),0.24)] focus:ring-2 focus:ring-[rgba(var(--accent-rgb),0.1)]";

  const otpFieldClass = isLight
    ? "h-16 w-full rounded-none border-0 border-b-2 border-[rgba(25,28,30,0.16)] bg-[var(--bg-alt)] text-center text-2xl font-black text-[var(--text)] outline-none transition focus:border-[var(--accent)]"
    : "h-14 w-full rounded-xl border border-[var(--glass-line)] bg-[var(--surface-lowest)] text-center text-2xl font-black text-[var(--accent)] outline-none transition focus:border-[rgba(var(--accent-rgb),0.24)] focus:ring-2 focus:ring-[rgba(var(--accent-rgb),0.1)]";

  const authSurfaceClass = isLight
    ? "w-full max-w-[420px]"
    : "glass-panel w-full max-w-[430px] rounded-[2rem] p-8";

  const showToast = (kind: ToastState["kind"], message: string) => {
    setToast({ id: Date.now(), kind, message });
  };

  const normalizeAuthError = (error: unknown, fallback: string) => {
    if (!(error instanceof Error)) {
      return fallback;
    }

    if (error instanceof ApiError && error.status >= 500) {
      return "The server is not ready right now. Please try again in a moment.";
    }

    const message = error.message?.trim() || fallback;
    const normalized = message.toLowerCase();

    if (
      normalized.includes("smtp") ||
      normalized.includes("authentication failed") ||
      normalized.includes("service unavailable")
    ) {
      return "We could not send the verification email right now. Please try again in a moment.";
    }

    return message;
  };

  const resetForgotPasswordState = () => {
    setForgotChallenge(null);
    setForgotOtpCode("");
    setNewPassword("");
    setBusy(null);
  };

  const handleStartSignIn = async (announceResend = false) => {
    if (!email.trim() || !password) {
      showToast("error", "Enter your email and password to continue.");
      return;
    }

    try {
      setBusy("signin");
      const response = await startSignIn(email.trim(), password, rememberMe);
      setLoginChallenge(response);
      setLoginOtpCode("");
      setAuthStep("loginOtp");
      showToast(
        "success",
        announceResend
          ? "A fresh verification code has been sent to your registered email."
          : "Verification code sent. Enter the 6-digit OTP to continue.",
      );
    } catch (error) {
      showToast(
        "error",
        normalizeAuthError(error, "Unable to start sign in right now."),
      );
    } finally {
      setBusy(null);
    }
  };

  const handleVerifyLoginOtp = async () => {
    if (!loginChallenge) {
      return;
    }
    if (loginOtpCode.trim().length !== OTP_LENGTH) {
      showToast("error", "Enter the complete 6-digit OTP.");
      return;
    }

    try {
      setBusy("loginOtp");
      await verifyOtp(loginChallenge.challenge_id, loginOtpCode.trim());
    } catch (error) {
      showToast("error", normalizeAuthError(error, "OTP verification failed."));
    } finally {
      setBusy(null);
    }
  };

  const handleStartForgotPassword = async () => {
    if (!forgotEmail.trim()) {
      showToast("error", "Enter your account email to continue.");
      return;
    }

    try {
      setBusy("forgotRequest");
      const response = await startForgotPassword(forgotEmail.trim());
      setForgotChallenge(response);
      setForgotOtpCode("");
      setNewPassword("");
      setAuthStep("forgotOtp");
      showToast(
        "success",
        "Password reset code sent. Check your email to continue.",
      );
    } catch (error) {
      showToast(
        "error",
        normalizeAuthError(
          error,
          "Unable to start password recovery right now.",
        ),
      );
    } finally {
      setBusy(null);
    }
  };

  const handleVerifyForgotPasswordOtp = async () => {
    if (!forgotChallenge) {
      return;
    }
    if (forgotOtpCode.trim().length !== OTP_LENGTH) {
      showToast("error", "Enter the complete 6-digit OTP.");
      return;
    }

    try {
      setBusy("forgotOtp");
      const response = await verifyForgotPasswordOtp(
        forgotChallenge.challenge_id,
        forgotOtpCode.trim(),
      );
      setAuthStep("forgotReset");
      showToast("success", response);
    } catch (error) {
      showToast("error", normalizeAuthError(error, "OTP verification failed."));
    } finally {
      setBusy(null);
    }
  };

  const handleResetPassword = async () => {
    if (!forgotChallenge) {
      return;
    }
    if (newPassword.length < 8) {
      showToast("error", "New password must be at least 8 characters long.");
      return;
    }

    try {
      setBusy("forgotReset");
      const response = await resetForgotPassword(
        forgotChallenge.challenge_id,
        newPassword,
      );
      resetForgotPasswordState();
      setAuthStep("signin");
      setPassword("");
      setShowNewPassword(false);
      showToast("success", response);
    } catch (error) {
      showToast(
        "error",
        normalizeAuthError(error, "Unable to reset password right now."),
      );
    } finally {
      setBusy(null);
    }
  };

  const updateOtpDigit = (
    index: number,
    value: string,
    currentCode: string,
    setCode: (value: string) => void,
    refs: typeof loginOtpRefs,
  ) => {
    const sanitized = value.replace(/\D/g, "").slice(-1);
    const next = currentCode.padEnd(OTP_LENGTH, " ").split("");
    next[index] = sanitized || "";
    const normalized = next.join("").trimEnd();
    setCode(normalized);

    if (sanitized && index < OTP_LENGTH - 1) {
      refs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (
    index: number,
    key: string,
    currentCode: string,
    refs: typeof loginOtpRefs,
  ) => {
    if (key === "Backspace" && !currentCode[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (
    event: ClipboardEvent<HTMLInputElement>,
    setCode: (value: string) => void,
    refs: typeof loginOtpRefs,
  ) => {
    const pasted = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, OTP_LENGTH);
    if (!pasted) {
      return;
    }

    event.preventDefault();
    setCode(pasted);
    refs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
  };

  const goToSignIn = () => {
    setAuthStep("signin");
    setLoginChallenge(null);
    setLoginOtpCode("");
    resetForgotPasswordState();
  };

  const openForgotPassword = () => {
    setForgotEmail(email.trim() || forgotEmail);
    setLoginChallenge(null);
    setLoginOtpCode("");
    resetForgotPasswordState();
    setAuthStep("forgotRequest");
  };

  const loginOtpDigits = Array.from(
    { length: OTP_LENGTH },
    (_, index) => loginOtpCode[index] ?? "",
  );
  const forgotOtpDigits = Array.from(
    { length: OTP_LENGTH },
    (_, index) => forgotOtpCode[index] ?? "",
  );

  const renderOtpGrid = (
    digits: string[],
    currentCode: string,
    setCode: (value: string) => void,
    refs: typeof loginOtpRefs,
  ) => (
    <div className="mt-8 grid grid-cols-6 gap-3">
      {digits.map((digit, index) => (
        <input
          autoComplete={index === 0 ? "one-time-code" : "off"}
          className={otpFieldClass}
          inputMode="numeric"
          key={`otp-${index}`}
          maxLength={1}
          onChange={(event) =>
            updateOtpDigit(
              index,
              event.target.value,
              currentCode,
              setCode,
              refs,
            )
          }
          onKeyDown={(event) =>
            handleOtpKeyDown(index, event.key, currentCode, refs)
          }
          onPaste={(event) => handleOtpPaste(event, setCode, refs)}
          pattern="[0-9]*"
          ref={(element) => {
            refs.current[index] = element;
          }}
          value={digit}
        />
      ))}
    </div>
  );

  const loginFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleStartSignIn();
  };

  const loginOtpSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleVerifyLoginOtp();
  };

  const forgotRequestSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleStartForgotPassword();
  };

  const forgotOtpSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleVerifyForgotPasswordOtp();
  };

  const forgotResetSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleResetPassword();
  };

  return (
    <div
      className={cn(
        "relative min-h-screen overflow-hidden",
        isLight
          ? "bg-[linear-gradient(90deg,var(--bg-alt)_0%,var(--bg-alt)_45%,var(--bg)_45%,var(--bg)_100%)]"
          : "bg-[radial-gradient(circle_at_left_bottom,rgba(var(--accent-rgb),0.12),transparent_30%),radial-gradient(circle_at_top_right,rgba(var(--secondary-rgb),0.08),transparent_26%),linear-gradient(180deg,#071220_0%,#081425_100%)]",
      )}
    >
      <div className="pointer-events-none absolute inset-0">
        <div
          className={cn(
            "absolute blur-3xl",
            isLight
              ? "bottom-[-8rem] left-[-8rem] h-[28rem] w-[28rem] rounded-full bg-[rgba(var(--accent-rgb),0.08)]"
              : "right-[-8rem] top-[-8rem] h-[26rem] w-[26rem] rounded-full bg-[rgba(var(--accent-rgb),0.08)]",
          )}
        />
      </div>

      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 py-6 sm:px-8">
        <Brand compact />
        <ThemeToggle />
      </header>

      <AnimatePresence>
        {toast ? (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "fixed left-1/2 top-5 z-50 w-[min(92vw,30rem)] -translate-x-1/2 overflow-hidden rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-xl",
              toast.kind === "error"
                ? "border-[rgba(var(--danger-rgb),0.4)] bg-[rgba(13,17,35,0.96)] text-[#ffd7df]"
                : "border-[rgba(var(--accent-rgb),0.45)] bg-[rgba(7,25,26,0.94)] text-[#dbfff2]",
            )}
            exit={{ opacity: 0, y: -10 }}
            initial={{ opacity: 0, y: -12 }}
            key={toast.id}
          >
            <div className="pr-3">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--soft)]">
                {toast.kind === "error" ? "Action blocked" : "Action completed"}
              </p>
              <p className="mt-1 text-sm font-semibold leading-6">
                {toast.message}
              </p>
            </div>
            <div className="absolute inset-x-0 bottom-0 h-1 bg-white/6">
              <motion.div
                animate={{ scaleX: 0 }}
                className={cn(
                  "h-full origin-left",
                  toast.kind === "error"
                    ? "bg-[var(--danger)]"
                    : "bg-[var(--accent)]",
                )}
                initial={{ scaleX: 1 }}
                transition={{
                  duration: TOAST_DURATION_MS / 1000,
                  ease: "linear",
                }}
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <main className="relative mx-auto grid min-h-screen max-w-[1560px] items-center gap-10 px-4 py-24 sm:px-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden self-stretch lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="mt-10 max-w-[38rem]">
              <h1 className="font-display text-[clamp(3.2rem,7vw,5.8rem)] font-black leading-[0.98] tracking-[-0.05em] text-[var(--text)]">
                {isLight ? (
                  <>
                    The Architectural{" "}
                    <span className="text-[var(--accent)]">Editor</span> of Your
                    Outreach.
                  </>
                ) : (
                  <>
                    The Kinetic{" "}
                    <span className="text-[var(--secondary)]">Architect</span>{" "}
                    of Data.
                  </>
                )}
              </h1>
              <p className="mt-8 max-w-md text-lg leading-9 text-[var(--muted)]">
                {isLight
                  ? "High-density information management for the modern editorial workflow. Precision-engineered for authority."
                  : "Access your high-performance command editorial. Production-grade tools for modern mission control."}
              </p>
            </div>

            {!isLight ? (
              <div className="mt-14 grid max-w-md grid-cols-2 gap-4">
                {[
                  { title: "99.9%", copy: "Uptime SLA", tone: "accent" },
                  { title: "AES-256", copy: "Encryption", tone: "secondary" },
                ].map((item) => (
                  <div
                    className="rounded-2xl bg-[rgba(17,28,45,0.84)] p-6"
                    key={item.title}
                    style={{
                      borderLeft: `2px solid ${item.tone === "accent" ? "var(--accent)" : "var(--secondary)"}`,
                    }}
                  >
                    <p
                      className={cn(
                        "text-3xl font-black",
                        item.tone === "accent"
                          ? "text-[var(--accent)]"
                          : "text-[var(--secondary)]",
                      )}
                    >
                      {item.title}
                    </p>
                    <p className="mt-2 font-label text-[11px] uppercase tracking-[0.2em] text-[var(--soft)]">
                      {item.copy}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--soft)]">
            <span>(c) 2026 Cogitation Works</span>
            <span className="h-px w-8 bg-[var(--line)]" />
            <span>{isLight ? "Internal Portal" : "Global System"}</span>
          </div>
        </section>

        <section className="mx-auto w-full">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className={authSurfaceClass}
            initial={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          >
            <AnimatePresence mode="wait">
              {authStep === "signin" ? (
                <motion.div
                  animate={{ opacity: 1, x: 0 }}
                  initial={{ opacity: 0, x: 18 }}
                  key="signin"
                  transition={{ duration: 0.28, ease: "easeOut" }}
                >
                  <header>
                    <h2 className="font-display text-4xl font-black tracking-tight text-[var(--text)]">
                      {isLight ? "Sign In" : "Welcome Back"}
                    </h2>
                    <p className="mt-3 text-base leading-7 text-[var(--muted)]">
                      {isLight
                        ? "Enter your credentials to access the command center."
                        : "Enter your credentials to access the console."}
                    </p>
                  </header>

                  <form
                    autoComplete="on"
                    className="mt-10 space-y-7"
                    onSubmit={loginFormSubmit}
                  >
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <label
                          className="font-label text-[11px] font-extrabold uppercase tracking-[0.22em] text-[var(--soft)]"
                          htmlFor="login-email"
                        >
                          Email address
                        </label>
                      </div>
                      <input
                        autoCapitalize="none"
                        autoComplete="username"
                        className={fieldClass}
                        id="login-email"
                        inputMode="email"
                        name="email"
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder={
                          isLight
                            ? "editor@cogitation.works"
                            : "name@cogitationworks.com"
                        }
                        spellCheck={false}
                        type="email"
                        value={email}
                      />
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between gap-4">
                        <label
                          className="font-label text-[11px] font-extrabold uppercase tracking-[0.22em] text-[var(--soft)]"
                          htmlFor="login-password"
                        >
                          Password
                        </label>
                        <button
                          className="text-xs font-semibold text-[var(--accent)] transition hover:text-[var(--secondary)]"
                          onClick={openForgotPassword}
                          type="button"
                        >
                          Forgot password?
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          autoComplete="current-password"
                          className={`${fieldClass} pr-12`}
                          id="login-password"
                          name="password"
                          onChange={(event) => setPassword(event.target.value)}
                          placeholder="Enter your password"
                          type={showLoginPassword ? "text" : "password"}
                          value={password}
                        />
                        <button
                          aria-label={
                            showLoginPassword
                              ? "Hide password"
                              : "Show password"
                          }
                          className="absolute right-0 top-1/2 -translate-y-1/2 px-3 text-[var(--soft)] transition hover:text-[var(--text)]"
                          onClick={() =>
                            setShowLoginPassword((current) => !current)
                          }
                          type="button"
                        >
                          {showLoginPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 text-sm">
                      <label className="flex cursor-pointer items-center gap-3 text-[var(--muted)]">
                        <input
                          checked={rememberMe}
                          className="h-4 w-4 rounded border-[var(--line)] bg-[var(--surface-lowest)] accent-[var(--accent)]"
                          onChange={(event) =>
                            setRememberMe(event.target.checked)
                          }
                          type="checkbox"
                        />
                        <span>Remember me (7 days)</span>
                      </label>
                    </div>

                    <button
                      className={cn(
                        "inline-flex w-full items-center justify-center gap-2 rounded-lg px-5 py-4 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-70",
                        isLight
                          ? "bg-[var(--accent)] text-white hover:brightness-110"
                          : "bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] text-[#052113] shadow-lg shadow-[rgba(var(--accent-rgb),0.2)] hover:scale-[1.01]",
                      )}
                      disabled={busy === "signin"}
                      type="submit"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      <span>
                        {busy === "signin"
                          ? "Checking credentials"
                          : isLight
                            ? "Continue to Workspace"
                            : "Sign Into Workspace"}
                      </span>
                    </button>
                  </form>

                  <footer className="mt-10 text-center">
                    <p className="text-sm text-[var(--muted)]">
                      {isLight
                        ? "Approved access only for internal operators."
                        : "Secure access only for approved operators."}
                    </p>
                  </footer>
                </motion.div>
              ) : null}

              {authStep === "loginOtp" && loginChallenge ? (
                <motion.div
                  animate={{ opacity: 1, x: 0 }}
                  initial={{ opacity: 0, x: 18 }}
                  key="login-otp"
                  transition={{ duration: 0.28, ease: "easeOut" }}
                >
                  <button
                    className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--muted)] transition hover:text-[var(--text)]"
                    onClick={goToSignIn}
                    type="button"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>Back to login</span>
                  </button>

                  <div
                    className={cn(
                      "mt-8",
                      !isLight && "grid place-items-center",
                    )}
                  >
                    <div className="grid h-14 w-14 place-items-center rounded-xl bg-[rgba(var(--accent-rgb),0.14)] text-[var(--accent)]">
                      <LockKeyhole className="h-7 w-7" />
                    </div>
                  </div>

                  <h2 className="mt-6 font-display text-4xl font-black tracking-tight text-[var(--text)]">
                    {isLight ? "Verify Identity" : "Verification"}
                  </h2>
                  <p className="mt-3 max-w-md text-base leading-7 text-[var(--muted)]">
                    Enter the 6-digit code sent to your registered email.
                    <span className="mt-1 block font-mono text-[0.95em] font-semibold tracking-[0.01em] text-[var(--text)]">
                      {loginChallenge.masked_email}
                    </span>
                  </p>

                  <form autoComplete="off" onSubmit={loginOtpSubmit}>
                    {renderOtpGrid(
                      loginOtpDigits,
                      loginOtpCode,
                      setLoginOtpCode,
                      loginOtpRefs,
                    )}

                    <p className="mt-6 text-sm text-[var(--muted)]">
                      Code expires in{" "}
                      {Math.ceil(loginChallenge.expires_in_seconds / 60)}{" "}
                      minute(s).
                    </p>

                    <button
                      className={cn(
                        "mt-8 inline-flex w-full items-center justify-center gap-2 rounded-lg px-5 py-4 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-70",
                        isLight
                          ? "bg-[var(--accent)] text-white hover:brightness-110"
                          : "bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] text-[#052113] shadow-lg shadow-[rgba(var(--accent-rgb),0.2)] hover:scale-[1.01]",
                      )}
                      disabled={busy === "loginOtp"}
                      type="submit"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>
                        {busy === "loginOtp"
                          ? "Verifying"
                          : "Verify and Sign In"}
                      </span>
                    </button>
                  </form>

                  <button
                    className="mt-5 w-full text-center text-sm font-semibold text-[var(--muted)] transition hover:text-[var(--accent)]"
                    onClick={() => void handleStartSignIn(true)}
                    type="button"
                  >
                    Didn&apos;t receive the code?{" "}
                    <span className="text-[var(--accent)]">Resend</span>
                  </button>
                </motion.div>
              ) : null}

              {authStep === "forgotRequest" ? (
                <motion.div
                  animate={{ opacity: 1, x: 0 }}
                  initial={{ opacity: 0, x: 18 }}
                  key="forgot-request"
                  transition={{ duration: 0.28, ease: "easeOut" }}
                >
                  <button
                    className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--muted)] transition hover:text-[var(--text)]"
                    onClick={goToSignIn}
                    type="button"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>Back to login</span>
                  </button>

                  <header className="mt-8">
                    <h2 className="font-display text-4xl font-black tracking-tight text-[var(--text)]">
                      Forgot Password
                    </h2>
                    <p className="mt-3 text-base leading-7 text-[var(--muted)]">
                      Enter your registered email. We will send a verification
                      code so you can reset your password securely.
                    </p>
                  </header>

                  <form
                    autoComplete="off"
                    className="mt-10 space-y-7"
                    onSubmit={forgotRequestSubmit}
                  >
                    <div>
                      <label
                        className="mb-2 block font-label text-[11px] font-extrabold uppercase tracking-[0.22em] text-[var(--soft)]"
                        htmlFor="forgot-email"
                      >
                        Email address
                      </label>
                      <input
                        autoCapitalize="none"
                        autoComplete="email"
                        className={fieldClass}
                        id="forgot-email"
                        inputMode="email"
                        name="email"
                        onChange={(event) => setForgotEmail(event.target.value)}
                        placeholder="name@cogitationworks.com"
                        spellCheck={false}
                        type="email"
                        value={forgotEmail}
                      />
                    </div>

                    <button
                      className={cn(
                        "inline-flex w-full items-center justify-center gap-2 rounded-lg px-5 py-4 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-70",
                        isLight
                          ? "bg-[var(--accent)] text-white hover:brightness-110"
                          : "bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] text-[#052113] shadow-lg shadow-[rgba(var(--accent-rgb),0.2)] hover:scale-[1.01]",
                      )}
                      disabled={busy === "forgotRequest"}
                      type="submit"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      <span>
                        {busy === "forgotRequest"
                          ? "Sending code"
                          : "Send Reset Code"}
                      </span>
                    </button>
                  </form>
                </motion.div>
              ) : null}

              {authStep === "forgotOtp" && forgotChallenge ? (
                <motion.div
                  animate={{ opacity: 1, x: 0 }}
                  initial={{ opacity: 0, x: 18 }}
                  key="forgot-otp"
                  transition={{ duration: 0.28, ease: "easeOut" }}
                >
                  <button
                    className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--muted)] transition hover:text-[var(--text)]"
                    onClick={() => setAuthStep("forgotRequest")}
                    type="button"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>Back to email entry</span>
                  </button>

                  <div
                    className={cn(
                      "mt-8",
                      !isLight && "grid place-items-center",
                    )}
                  >
                    <div className="grid h-14 w-14 place-items-center rounded-xl bg-[rgba(var(--accent-rgb),0.14)] text-[var(--accent)]">
                      <LockKeyhole className="h-7 w-7" />
                    </div>
                  </div>

                  <h2 className="mt-6 font-display text-4xl font-black tracking-tight text-[var(--text)]">
                    Verify Reset OTP
                  </h2>
                  <p className="mt-3 max-w-md text-base leading-7 text-[var(--muted)]">
                    Enter the verification code sent to:
                    <span className="mt-1 block font-mono text-[1.02em] font-semibold tracking-[0.01em] text-[var(--text)]">
                      {forgotChallenge.masked_email}
                    </span>
                  </p>

                  <form autoComplete="off" onSubmit={forgotOtpSubmit}>
                    {renderOtpGrid(
                      forgotOtpDigits,
                      forgotOtpCode,
                      setForgotOtpCode,
                      forgotOtpRefs,
                    )}

                    <p className="mt-6 text-sm text-[var(--muted)]">
                      Code expires in{" "}
                      {Math.ceil(forgotChallenge.expires_in_seconds / 60)}{" "}
                      minute(s).
                    </p>

                    <button
                      className={cn(
                        "mt-8 inline-flex w-full items-center justify-center gap-2 rounded-lg px-5 py-4 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-70",
                        isLight
                          ? "bg-[var(--accent)] text-white hover:brightness-110"
                          : "bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] text-[#052113] shadow-lg shadow-[rgba(var(--accent-rgb),0.2)] hover:scale-[1.01]",
                      )}
                      disabled={busy === "forgotOtp"}
                      type="submit"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>
                        {busy === "forgotOtp" ? "Verifying OTP" : "Verify OTP"}
                      </span>
                    </button>
                  </form>

                  <button
                    className="mt-5 w-full text-center text-sm font-semibold text-[var(--muted)] transition hover:text-[var(--accent)]"
                    onClick={() => void handleStartForgotPassword()}
                    type="button"
                  >
                    Didn&apos;t receive the code?{" "}
                    <span className="text-[var(--accent)]">Resend</span>
                  </button>
                </motion.div>
              ) : null}

              {authStep === "forgotReset" && forgotChallenge ? (
                <motion.div
                  animate={{ opacity: 1, x: 0 }}
                  initial={{ opacity: 0, x: 18 }}
                  key="forgot-reset"
                  transition={{ duration: 0.28, ease: "easeOut" }}
                >
                  <button
                    className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--muted)] transition hover:text-[var(--text)]"
                    onClick={() => setAuthStep("forgotOtp")}
                    type="button"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>Back to OTP verification</span>
                  </button>

                  <header className="mt-8">
                    <h2 className="font-display text-4xl font-black tracking-tight text-[var(--text)]">
                      Create New Password
                    </h2>
                    <p className="mt-3 text-base leading-7 text-[var(--muted)]">
                      Enter a strong new password for your account.
                    </p>
                  </header>

                  <form
                    autoComplete="off"
                    className="mt-10 space-y-7"
                    onSubmit={forgotResetSubmit}
                  >
                    <div>
                      <label
                        className="mb-2 block font-label text-[11px] font-extrabold uppercase tracking-[0.22em] text-[var(--soft)]"
                        htmlFor="reset-password"
                      >
                        New password
                      </label>
                      <div className="relative">
                        <input
                          autoComplete="new-password"
                          className={`${fieldClass} pr-12`}
                          id="reset-password"
                          name="new-password"
                          onChange={(event) =>
                            setNewPassword(event.target.value)
                          }
                          placeholder="Enter a new password"
                          type={showNewPassword ? "text" : "password"}
                          value={newPassword}
                        />
                        <button
                          aria-label={
                            showNewPassword ? "Hide password" : "Show password"
                          }
                          className="absolute right-0 top-1/2 -translate-y-1/2 px-3 text-[var(--soft)] transition hover:text-[var(--text)]"
                          onClick={() =>
                            setShowNewPassword((current) => !current)
                          }
                          type="button"
                        >
                          {showNewPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      <p className="mt-3 text-sm text-[var(--muted)]">
                        Use at least 8 characters for better account security.
                      </p>
                    </div>

                    <button
                      className={cn(
                        "inline-flex w-full items-center justify-center gap-2 rounded-lg px-5 py-4 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-70",
                        isLight
                          ? "bg-[var(--accent)] text-white hover:brightness-110"
                          : "bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] text-[#052113] shadow-lg shadow-[rgba(var(--accent-rgb),0.2)] hover:scale-[1.01]",
                      )}
                      disabled={busy === "forgotReset"}
                      type="submit"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      <span>
                        {busy === "forgotReset"
                          ? "Updating password"
                          : "Save New Password"}
                      </span>
                    </button>
                  </form>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        </section>
      </main>

      <div className="pointer-events-none fixed bottom-8 right-8 hidden items-center gap-3 rounded-full border border-[var(--glass-line)] bg-[var(--glass)] px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--soft)] shadow-lg backdrop-blur-xl lg:flex">
        <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
        <span>Encrypted session secure</span>
      </div>
    </div>
  );
}
