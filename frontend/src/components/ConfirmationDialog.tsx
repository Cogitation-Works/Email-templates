import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ShieldAlert } from "lucide-react";

import { cn } from "../lib/utils";

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "warning";
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[90] bg-[rgba(var(--bg-rgb),0.78)] px-4 py-6 backdrop-blur-md"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          onClick={onCancel}
        >
          <div className="flex min-h-full items-center justify-center">
            <motion.div
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="surface-panel relative w-full max-w-lg overflow-hidden rounded-[2rem] p-6 shadow-2xl shadow-[rgba(var(--shadow),0.28)]"
              exit={{ opacity: 0, y: 18, scale: 0.98 }}
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              onClick={(event) => event.stopPropagation()}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              <div
                className={cn(
                  "absolute inset-x-0 top-0 h-1",
                  tone === "danger"
                    ? "bg-[linear-gradient(90deg,var(--danger),rgba(var(--secondary-rgb),0.8))]"
                    : "bg-[linear-gradient(90deg,var(--secondary),var(--accent))]",
                )}
              />

              <div className="flex items-start gap-4">
                <div
                  className={cn(
                    "grid h-12 w-12 shrink-0 place-items-center rounded-2xl",
                    tone === "danger"
                      ? "bg-[rgba(var(--danger-rgb),0.14)] text-[var(--danger)]"
                      : "bg-[rgba(var(--secondary-rgb),0.14)] text-[var(--secondary)]",
                  )}
                >
                  {tone === "danger" ? (
                    <ShieldAlert className="h-5 w-5" />
                  ) : (
                    <AlertTriangle className="h-5 w-5" />
                  )}
                </div>

                <div className="min-w-0">
                  <p
                    className={cn(
                      "text-[11px] font-extrabold uppercase tracking-[0.18em]",
                      tone === "danger"
                        ? "text-[var(--danger)]"
                        : "text-[var(--secondary)]",
                    )}
                  >
                    Confirmation required
                  </p>
                  <h3 className="mt-2 text-2xl font-black tracking-tight text-[var(--text)]">
                    {title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                    {description}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-[var(--line)] pt-5">
                <button
                  className="inline-flex items-center justify-center rounded-full bg-[var(--surface-muted)] px-5 py-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text)] transition hover:-translate-y-0.5 disabled:opacity-60"
                  disabled={busy}
                  onClick={onCancel}
                  type="button"
                >
                  {cancelLabel}
                </button>
                <button
                  className={cn(
                    "inline-flex items-center justify-center rounded-full px-5 py-3 text-[11px] font-extrabold uppercase tracking-[0.18em] transition hover:-translate-y-0.5 disabled:opacity-60",
                    tone === "danger"
                      ? "bg-[rgba(var(--danger-rgb),0.14)] text-[var(--danger)]"
                      : "bg-[rgba(var(--secondary-rgb),0.16)] text-[var(--secondary)]",
                  )}
                  disabled={busy}
                  onClick={onConfirm}
                  type="button"
                >
                  {busy ? "Processing" : confirmLabel}
                </button>
              </div>
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
