import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, Send, X } from "lucide-react";

import {
  formatScheduledDateTime,
  isFutureScheduledDateTimeValue,
  SchedulePicker,
} from "./SchedulePicker";
import { cn } from "../lib/utils";

type DispatchMode = "now" | "schedule";

export function DispatchPlanDialog({
  open,
  title,
  description,
  busy = false,
  mode,
  scheduledFor,
  scheduleDisabledReason = "",
  onModeChange,
  onScheduledForChange,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  busy?: boolean;
  mode: DispatchMode;
  scheduledFor: string;
  scheduleDisabledReason?: string;
  onModeChange: (mode: DispatchMode) => void;
  onScheduledForChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const scheduleBlocked = Boolean(scheduleDisabledReason.trim());
  const scheduleReady =
    mode === "now" || isFutureScheduledDateTimeValue(scheduledFor);
  const confirmDisabled =
    busy || (mode === "schedule" && (scheduleBlocked || !scheduleReady));

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[140] bg-[rgba(var(--bg-rgb),0.78)] px-4 py-6 backdrop-blur-md"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          onClick={onCancel}
        >
          <div className="flex min-h-full items-center justify-center">
            <motion.div
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="surface-panel relative flex max-h-[92vh] w-full max-w-[min(92rem,94vw)] flex-col overflow-hidden rounded-[2rem] shadow-2xl shadow-[rgba(var(--shadow),0.24)]"
              exit={{ opacity: 0, y: 18, scale: 0.98 }}
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              onClick={(event) => event.stopPropagation()}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,var(--accent),var(--secondary),var(--accent-strong))]" />

              <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] bg-[var(--surface-high)] px-5 py-5 sm:px-6">
                <div className="min-w-0">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--accent)]">
                    Dispatch plan
                  </p>
                  <h3 className="mt-2 text-2xl font-black tracking-tight text-[var(--text)] sm:text-3xl">
                    {title}
                  </h3>
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted)]">
                    {description}
                  </p>
                </div>
                <button
                  aria-label="Close dispatch plan"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--text)] transition hover:bg-[var(--surface-lowest)]"
                  onClick={onCancel}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-auto p-5 sm:p-6">
                <div className="rounded-[1.7rem] border border-[var(--line)] bg-[rgba(var(--bg-rgb),0.22)] p-2">
                  <div className="grid gap-2 lg:grid-cols-2">
                    <button
                      className={cn(
                        "rounded-[1.2rem] border px-5 py-4 text-left transition",
                        mode === "now"
                          ? "border-[rgba(var(--accent-rgb),0.35)] bg-[linear-gradient(135deg,rgba(var(--accent-rgb),0.2),rgba(var(--accent-rgb),0.08))] shadow-[0_18px_36px_rgba(var(--shadow),0.16)]"
                          : "border-[var(--line)] bg-[var(--surface)] hover:border-[rgba(var(--accent-rgb),0.2)] hover:bg-[var(--surface-high)]",
                      )}
                      onClick={() => onModeChange("now")}
                      type="button"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-3 text-base font-black text-[var(--text)]">
                          <Send className="h-4 w-4 text-[var(--accent)]" />
                          Send immediately
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.18em]",
                            mode === "now"
                              ? "bg-[rgba(var(--accent-rgb),0.16)] text-[var(--accent)]"
                              : "bg-[var(--surface-lowest)] text-[var(--soft)]",
                          )}
                        >
                          {mode === "now" ? "Active" : "Instant"}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                        Re-dispatch this campaign right away using the stored sender path.
                      </p>
                    </button>

                    <button
                      className={cn(
                        "rounded-[1.2rem] border px-5 py-4 text-left transition",
                        mode === "schedule"
                          ? "border-[rgba(var(--secondary-rgb),0.35)] bg-[linear-gradient(135deg,rgba(var(--secondary-rgb),0.18),rgba(var(--accent-rgb),0.08))] shadow-[0_18px_36px_rgba(var(--shadow),0.16)]"
                          : "border-[var(--line)] bg-[var(--surface)] hover:border-[rgba(var(--secondary-rgb),0.2)] hover:bg-[var(--surface-high)]",
                        scheduleBlocked && "cursor-not-allowed opacity-55",
                      )}
                      disabled={scheduleBlocked}
                      onClick={() => onModeChange("schedule")}
                      type="button"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-3 text-base font-black text-[var(--text)]">
                          <CalendarDays className="h-4 w-4 text-[var(--secondary)]" />
                          Schedule email
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.18em]",
                            mode === "schedule"
                              ? "bg-[rgba(var(--secondary-rgb),0.16)] text-[var(--secondary)]"
                              : "bg-[var(--surface-lowest)] text-[var(--soft)]",
                          )}
                        >
                          {mode === "schedule" ? "Active" : "Timed"}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                        Queue this resend for a future date and time without losing the original history record.
                      </p>
                    </button>
                  </div>
                </div>

                {scheduleBlocked ? (
                  <div className="mt-5 rounded-[1.5rem] border border-[rgba(var(--danger-rgb),0.18)] bg-[rgba(var(--danger-rgb),0.08)] px-5 py-4 text-sm leading-7 text-[var(--danger)]">
                    {scheduleDisabledReason}
                  </div>
                ) : null}

                {mode === "schedule" && !scheduleBlocked ? (
                  <div className="mt-5">
                    <SchedulePicker
                      description="This same picker is used across the product, so scheduled sends stay consistent in both themes."
                      onChange={onScheduledForChange}
                      value={scheduledFor}
                    />
                  </div>
                ) : null}

                <div className="mt-5 rounded-[1.5rem] border border-[var(--line)] bg-[rgba(var(--bg-rgb),0.18)] px-5 py-4">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                    Final action
                  </p>
                  <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
                    {mode === "schedule"
                      ? `This resend will be queued for ${formatScheduledDateTime(scheduledFor)}.`
                      : "This resend will be dispatched immediately after confirmation."}
                  </p>
                  {mode === "schedule" && !scheduleReady ? (
                    <p className="mt-2 text-sm text-[var(--danger)]">
                      Choose a future date and time before scheduling this resend.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] bg-[rgba(var(--surface-high-rgb,31,42,60),0.96)] px-5 py-4 backdrop-blur-xl sm:px-6">
                <div className="text-sm text-[var(--muted)]">
                  {mode === "schedule"
                    ? "Confirm to queue this resend."
                    : "Confirm to dispatch this email now."}
                </div>
                <div className="flex flex-wrap justify-end gap-3">
                <button
                  className="inline-flex items-center justify-center rounded-full bg-[var(--surface)] px-5 py-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text)] transition hover:-translate-y-0.5 disabled:opacity-60"
                  disabled={busy}
                  onClick={onCancel}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className={cn(
                    "inline-flex items-center justify-center rounded-full px-5 py-3 text-[11px] font-extrabold uppercase tracking-[0.18em] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60",
                    mode === "schedule"
                      ? "bg-[rgba(var(--secondary-rgb),0.18)] text-[var(--secondary)]"
                      : "bg-[rgba(var(--accent-rgb),0.18)] text-[var(--accent)]",
                  )}
                  disabled={confirmDisabled}
                  onClick={onConfirm}
                  type="button"
                >
                  {busy
                    ? "Processing"
                    : mode === "schedule"
                      ? "Schedule email"
                      : "Send email"}
                </button>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
