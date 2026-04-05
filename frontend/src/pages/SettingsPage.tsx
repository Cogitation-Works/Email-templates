import { Eye, EyeOff, KeyRound, Mail, UserRound } from "lucide-react";
import { useState } from "react";

import { ActionToast, type ActionToastState } from "@/components/ActionToast";
import { AppShell } from "@/components/AppShell";
import { Field } from "@/components/Field";
import { useAuth } from "@/context/AuthContext";

export function SettingsPage() {
  const {
    user,
    updateProfile,
    startForgotPassword,
    verifyForgotPasswordOtp,
    resetForgotPassword,
    startEmailChange,
    verifyEmailChangeOtp,
    confirmEmailChange,
  } = useAuth();
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [forgotChallengeId, setForgotChallengeId] = useState("");
  const [forgotOtp, setForgotOtp] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailChangeChallengeId, setEmailChangeChallengeId] = useState("");
  const [maskedCurrentEmail, setMaskedCurrentEmail] = useState("");
  const [maskedNewEmail, setMaskedNewEmail] = useState("");
  const [currentEmailOtp, setCurrentEmailOtp] = useState("");
  const [newEmailOtp, setNewEmailOtp] = useState("");
  const [currentEmailOtpVerified, setCurrentEmailOtpVerified] = useState(false);
  const [newEmailOtpVerified, setNewEmailOtpVerified] = useState(false);
  const [busy, setBusy] = useState<
    | "profile"
    | "otp-start"
    | "otp-verify"
    | "password-reset"
    | "email-change-start"
    | "email-change-current-verify"
    | "email-change-new-verify"
    | "email-change-confirm"
    | null
  >(null);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const accountEmail = String(user?.email ?? "").trim();

  const showToast = (kind: ActionToastState["kind"], message: string) => {
    setToast({ id: Date.now(), kind, message });
    window.setTimeout(() => setToast(null), 4200);
  };

  const handleProfileUpdate = async () => {
    try {
      setBusy("profile");
      await updateProfile({ full_name: fullName, phone });
      showToast("success", "Profile updated successfully.");
    } catch (error) {
      showToast(
        "error",
        error instanceof Error ? error.message : "Unable to update profile.",
      );
    } finally {
      setBusy(null);
    }
  };

  const handleStartForgotPassword = async () => {
    if (!accountEmail) {
      showToast("error", "Signed-in email is not available.");
      return;
    }

    try {
      setBusy("otp-start");
      const response = await startForgotPassword(accountEmail);
      setForgotChallengeId(response.challenge_id);
      setOtpVerified(false);
      setForgotOtp("");
      setNewPassword("");
      setConfirmPassword("");
      showToast("success", "OTP sent to your email address.");
    } catch (error) {
      showToast(
        "error",
        error instanceof Error ? error.message : "Unable to send OTP.",
      );
    } finally {
      setBusy(null);
    }
  };

  const handleVerifyOtp = async () => {
    if (!forgotChallengeId) {
      showToast("error", "Send OTP first.");
      return;
    }
    if (!forgotOtp.trim()) {
      showToast("error", "Enter the OTP from your email.");
      return;
    }

    try {
      setBusy("otp-verify");
      const message = await verifyForgotPasswordOtp(
        forgotChallengeId,
        forgotOtp.trim(),
      );
      setOtpVerified(true);
      showToast("success", message || "OTP verified successfully.");
    } catch (error) {
      showToast(
        "error",
        error instanceof Error ? error.message : "Unable to verify OTP.",
      );
    } finally {
      setBusy(null);
    }
  };

  const handleResetForgotPassword = async () => {
    if (!forgotChallengeId) {
      showToast("error", "Send OTP first.");
      return;
    }
    if (!forgotOtp.trim()) {
      showToast("error", "Verify OTP before resetting password.");
      return;
    }
    if (!newPassword || !confirmPassword) {
      showToast("error", "Enter and confirm your new password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("error", "New password and confirm password must match.");
      return;
    }

    try {
      setBusy("password-reset");
      const message = await resetForgotPassword(forgotChallengeId, newPassword);
      showToast("success", message || "Password reset successfully.");
      setForgotChallengeId("");
      setOtpVerified(false);
      setForgotOtp("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      showToast(
        "error",
        error instanceof Error ? error.message : "Unable to reset password.",
      );
    } finally {
      setBusy(null);
    }
  };

  const resetForgotPasswordFlow = () => {
    setForgotChallengeId("");
    setOtpVerified(false);
    setForgotOtp("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const forgotStep = !forgotChallengeId
    ? "email"
    : otpVerified
      ? "password"
      : "otp";

  const resetEmailChangeFlow = () => {
    setEmailChangeChallengeId("");
    setMaskedCurrentEmail("");
    setMaskedNewEmail("");
    setCurrentEmailOtp("");
    setNewEmailOtp("");
    setCurrentEmailOtpVerified(false);
    setNewEmailOtpVerified(false);
  };

  const handleStartEmailChange = async () => {
    if (!newEmail.trim()) {
      showToast("error", "Enter the new email address.");
      return;
    }

    try {
      setBusy("email-change-start");
      const response = await startEmailChange(newEmail.trim());
      setEmailChangeChallengeId(response.challenge_id);
      setMaskedCurrentEmail(response.masked_current_email);
      setMaskedNewEmail(response.masked_new_email);
      setCurrentEmailOtp("");
      setNewEmailOtp("");
      setCurrentEmailOtpVerified(false);
      setNewEmailOtpVerified(false);
      showToast(
        "success",
        "OTPs sent to your current and new email addresses.",
      );
    } catch (error) {
      showToast(
        "error",
        error instanceof Error
          ? error.message
          : "Unable to start email change.",
      );
    } finally {
      setBusy(null);
    }
  };

  const handleVerifyCurrentEmailOtp = async () => {
    if (!emailChangeChallengeId) {
      showToast("error", "Start email change first.");
      return;
    }
    if (!currentEmailOtp.trim()) {
      showToast("error", "Enter OTP sent to your current email.");
      return;
    }

    try {
      setBusy("email-change-current-verify");
      const response = await verifyEmailChangeOtp(
        emailChangeChallengeId,
        currentEmailOtp.trim(),
        "current",
      );
      setCurrentEmailOtpVerified(response.current_email_verified);
      setNewEmailOtpVerified(response.new_email_verified);
      showToast("success", response.message);
    } catch (error) {
      showToast(
        "error",
        error instanceof Error
          ? error.message
          : "Unable to verify current email OTP.",
      );
    } finally {
      setBusy(null);
    }
  };

  const handleVerifyNewEmailOtp = async () => {
    if (!emailChangeChallengeId) {
      showToast("error", "Start email change first.");
      return;
    }
    if (!newEmailOtp.trim()) {
      showToast("error", "Enter OTP sent to your new email.");
      return;
    }

    try {
      setBusy("email-change-new-verify");
      const response = await verifyEmailChangeOtp(
        emailChangeChallengeId,
        newEmailOtp.trim(),
        "new",
      );
      setCurrentEmailOtpVerified(response.current_email_verified);
      setNewEmailOtpVerified(response.new_email_verified);
      showToast("success", response.message);
    } catch (error) {
      showToast(
        "error",
        error instanceof Error
          ? error.message
          : "Unable to verify new email OTP.",
      );
    } finally {
      setBusy(null);
    }
  };

  const handleConfirmEmailChange = async () => {
    if (!emailChangeChallengeId) {
      showToast("error", "Start email change first.");
      return;
    }
    if (!currentEmailOtpVerified || !newEmailOtpVerified) {
      showToast(
        "error",
        "Verify OTPs for current and new email before confirming.",
      );
      return;
    }

    try {
      setBusy("email-change-confirm");
      const message = await confirmEmailChange(emailChangeChallengeId);
      setNewEmail("");
      resetEmailChangeFlow();
      showToast("success", message || "Email updated successfully.");
    } catch (error) {
      showToast(
        "error",
        error instanceof Error ? error.message : "Unable to update email.",
      );
    } finally {
      setBusy(null);
    }
  };

  const emailChangeStep = !emailChangeChallengeId
    ? "new-email"
    : !currentEmailOtpVerified
      ? "current-otp"
      : !newEmailOtpVerified
        ? "new-otp"
        : "confirm";

  return (
    <>
      <ActionToast toast={toast} />
      <AppShell
        description="Update your profile details and security credentials."
        eyebrow="Account"
        title="Settings"
        topTabs={[
          { label: "Workspace", href: "/workspace" },
          { label: "Settings", href: "/settings", active: true },
        ]}
      >
        <section className="grid gap-6 xl:grid-cols-2">
          <div className="surface-panel rounded-2xl p-6">
            <div className="mb-5 flex items-center gap-2">
              <UserRound className="h-5 w-5 text-[var(--accent)]" />
              <h2 className="text-xl font-black">Profile</h2>
            </div>
            <div className="space-y-4">
              <Field
                helper="Visible in audit logs and header details."
                label="Full name"
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Enter full name"
                value={fullName}
              />
              <Field
                helper="Used in onboarding and communication context."
                label="Phone"
                onChange={(event) => setPhone(event.target.value)}
                placeholder="Enter phone number"
                value={phone}
              />
              <button
                className="rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-black text-white"
                disabled={busy === "profile"}
                onClick={() => void handleProfileUpdate()}
                type="button"
              >
                {busy === "profile" ? "Saving..." : "Save profile"}
              </button>
            </div>
          </div>

          <div className="surface-panel rounded-2xl p-6">
            <div className="mb-5 flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-[var(--secondary)]" />
              <h2 className="text-xl font-black">Change password with OTP</h2>
            </div>
            {user?.must_change_password ? (
              <p className="mb-4 rounded-xl bg-[rgba(var(--danger-rgb),0.12)] px-4 py-3 text-sm text-[var(--danger)]">
                You must change your password before continuing.
              </p>
            ) : null}
            <div className="space-y-4">
              <p className="rounded-xl bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--muted)]">
                {forgotStep === "email"
                  ? "Step 1 of 3: Send OTP to your signed-in email."
                  : forgotStep === "otp"
                    ? "Step 2 of 3: Verify OTP sent to your email."
                    : "Step 3 of 3: Set your new password."}
              </p>

              {forgotStep === "email" ? (
                <>
                  <Field
                    disabled
                    helper="Password reset OTP is always sent to your signed-in email."
                    label="Account email"
                    placeholder="Signed-in email"
                    type="email"
                    value={accountEmail}
                  />
                  <button
                    className="w-full rounded-xl bg-[var(--secondary)] px-5 py-3 text-sm font-black text-[#1f1a10]"
                    disabled={busy === "otp-start"}
                    onClick={() => void handleStartForgotPassword()}
                    type="button"
                  >
                    {busy === "otp-start" ? "Sending OTP..." : "Send OTP"}
                  </button>
                </>
              ) : null}

              {forgotStep === "otp" ? (
                <>
                  <Field
                    helper="Enter the 6-digit code sent to your email."
                    label="OTP"
                    onChange={(event) => setForgotOtp(event.target.value)}
                    placeholder="Enter OTP"
                    value={forgotOtp}
                  />
                  <div className="flex gap-2">
                    <button
                      className="flex-1 rounded-xl bg-[var(--secondary)] px-5 py-3 text-sm font-black text-[#1f1a10]"
                      disabled={busy === "otp-verify"}
                      onClick={() => void handleVerifyOtp()}
                      type="button"
                    >
                      {busy === "otp-verify" ? "Verifying..." : "Verify OTP"}
                    </button>
                    <button
                      className="rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm font-semibold text-[var(--muted)]"
                      disabled={busy === "otp-start"}
                      onClick={() => void handleStartForgotPassword()}
                      type="button"
                    >
                      {busy === "otp-start" ? "Resending..." : "Resend"}
                    </button>
                  </div>
                </>
              ) : null}

              {forgotStep === "password" ? (
                <>
                  <label className="block">
                    <span className="field-label mb-2.5 block font-label text-[11px] font-extrabold uppercase tracking-[0.22em] text-[var(--soft)]">
                      New password
                    </span>
                    <div className="relative">
                      <input
                        className="field-input h-[3.25rem] w-full rounded-xl border border-[var(--line)] bg-[var(--surface-lowest)] px-4 py-3.5 pr-12 text-sm text-[var(--text)] outline-none transition placeholder:text-[var(--soft)] focus:border-[rgba(var(--accent-rgb),0.26)] focus:ring-2 focus:ring-[rgba(var(--accent-rgb),0.12)]"
                        onChange={(event) => setNewPassword(event.target.value)}
                        placeholder="Enter new password"
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                      />
                      <button
                        aria-label={
                          showNewPassword
                            ? "Hide new password"
                            : "Show new password"
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--muted)] transition hover:text-[var(--text)]"
                        onClick={() => setShowNewPassword((value) => !value)}
                        type="button"
                      >
                        {showNewPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <span className="field-helper mt-2 block text-xs leading-6 text-[var(--muted)]">
                      Use at least 8 characters.
                    </span>
                  </label>
                  <label className="block">
                    <span className="field-label mb-2.5 block font-label text-[11px] font-extrabold uppercase tracking-[0.22em] text-[var(--soft)]">
                      Confirm new password
                    </span>
                    <div className="relative">
                      <input
                        className="field-input h-[3.25rem] w-full rounded-xl border border-[var(--line)] bg-[var(--surface-lowest)] px-4 py-3.5 pr-12 text-sm text-[var(--text)] outline-none transition placeholder:text-[var(--soft)] focus:border-[rgba(var(--accent-rgb),0.26)] focus:ring-2 focus:ring-[rgba(var(--accent-rgb),0.12)]"
                        onChange={(event) =>
                          setConfirmPassword(event.target.value)
                        }
                        placeholder="Re-enter new password"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                      />
                      <button
                        aria-label={
                          showConfirmPassword
                            ? "Hide confirm password"
                            : "Show confirm password"
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--muted)] transition hover:text-[var(--text)]"
                        onClick={() =>
                          setShowConfirmPassword((value) => !value)
                        }
                        type="button"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </label>
                  <button
                    className="w-full rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-black text-white"
                    disabled={busy === "password-reset"}
                    onClick={() => void handleResetForgotPassword()}
                    type="button"
                  >
                    {busy === "password-reset"
                      ? "Resetting..."
                      : "Reset password"}
                  </button>
                </>
              ) : null}

              {forgotStep !== "email" ? (
                <button
                  className="text-sm font-semibold text-[var(--soft)] underline underline-offset-4"
                  onClick={resetForgotPasswordFlow}
                  type="button"
                >
                  Start over
                </button>
              ) : null}
            </div>
          </div>

          <div className="surface-panel rounded-2xl p-6 xl:col-span-2">
            <div className="mb-5 flex items-center gap-2">
              <Mail className="h-5 w-5 text-[var(--accent)]" />
              <h2 className="text-xl font-black">Change email with OTP</h2>
            </div>
            <div className="space-y-4">
              <p className="rounded-xl bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--muted)]">
                {emailChangeStep === "new-email"
                  ? "Step 1 of 4: Enter your new email and send OTPs."
                  : emailChangeStep === "current-otp"
                    ? "Step 2 of 4: Verify OTP sent to your current email."
                    : emailChangeStep === "new-otp"
                      ? "Step 3 of 4: Verify OTP sent to your new email."
                      : "Step 4 of 4: Confirm email change."}
              </p>

              {emailChangeStep === "new-email" ? (
                <>
                  <Field
                    disabled
                    helper="Your current account email."
                    label="Current email"
                    type="email"
                    value={accountEmail}
                  />
                  <Field
                    helper="We will send OTP to this new address for verification."
                    label="New email"
                    onChange={(event) => setNewEmail(event.target.value)}
                    placeholder="Enter new email"
                    type="email"
                    value={newEmail}
                  />
                  <button
                    className="w-full rounded-xl bg-[var(--secondary)] px-5 py-3 text-sm font-black text-[#1f1a10]"
                    disabled={busy === "email-change-start"}
                    onClick={() => void handleStartEmailChange()}
                    type="button"
                  >
                    {busy === "email-change-start"
                      ? "Sending OTPs..."
                      : "Send OTPs"}
                  </button>
                </>
              ) : null}

              {emailChangeStep === "current-otp" ? (
                <>
                  <Field
                    disabled
                    helper="OTP destination"
                    label="Current email"
                    type="email"
                    value={maskedCurrentEmail}
                  />
                  <Field
                    label="Current email OTP"
                    onChange={(event) => setCurrentEmailOtp(event.target.value)}
                    placeholder="Enter OTP"
                    value={currentEmailOtp}
                  />
                  <button
                    className="w-full rounded-xl bg-[var(--secondary)] px-5 py-3 text-sm font-black text-[#1f1a10]"
                    disabled={busy === "email-change-current-verify"}
                    onClick={() => void handleVerifyCurrentEmailOtp()}
                    type="button"
                  >
                    {busy === "email-change-current-verify"
                      ? "Verifying..."
                      : "Verify current email OTP"}
                  </button>
                </>
              ) : null}

              {emailChangeStep === "new-otp" ? (
                <>
                  <Field
                    disabled
                    helper="OTP destination"
                    label="New email"
                    type="email"
                    value={maskedNewEmail}
                  />
                  <Field
                    label="New email OTP"
                    onChange={(event) => setNewEmailOtp(event.target.value)}
                    placeholder="Enter OTP"
                    value={newEmailOtp}
                  />
                  <button
                    className="w-full rounded-xl bg-[var(--secondary)] px-5 py-3 text-sm font-black text-[#1f1a10]"
                    disabled={busy === "email-change-new-verify"}
                    onClick={() => void handleVerifyNewEmailOtp()}
                    type="button"
                  >
                    {busy === "email-change-new-verify"
                      ? "Verifying..."
                      : "Verify new email OTP"}
                  </button>
                </>
              ) : null}

              {emailChangeStep === "confirm" ? (
                <>
                  <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--text)]">
                    OTP verification complete for both email addresses. Confirm
                    to update your account email.
                  </p>
                  <button
                    className="w-full rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-black text-white"
                    disabled={busy === "email-change-confirm"}
                    onClick={() => void handleConfirmEmailChange()}
                    type="button"
                  >
                    {busy === "email-change-confirm"
                      ? "Updating email..."
                      : "Confirm email change"}
                  </button>
                </>
              ) : null}

              {emailChangeStep !== "new-email" ? (
                <button
                  className="text-sm font-semibold text-[var(--soft)] underline underline-offset-4"
                  onClick={resetEmailChangeFlow}
                  type="button"
                >
                  Start over
                </button>
              ) : null}
            </div>
          </div>
        </section>
      </AppShell>
    </>
  );
}
