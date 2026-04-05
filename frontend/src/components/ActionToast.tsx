import { AnimatePresence, motion } from "framer-motion";

import { cn } from "../lib/utils";

const TOAST_DURATION_MS = 4500;

export type ActionToastState = {
  id: number;
  kind: "success" | "error" | "info";
  message: string;
};

export function ActionToast({ toast }: { toast: ActionToastState | null }) {
  return (
    <AnimatePresence>
      {toast ? (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "action-toast fixed left-1/2 top-5 z-[70] w-[min(92vw,30rem)] -translate-x-1/2 overflow-hidden rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-xl",
            toast.kind === "error"
              ? "action-toast-error border-[rgba(var(--danger-rgb),0.4)] bg-[rgba(13,17,35,0.96)] text-[#ffd7df]"
              : toast.kind === "success"
                ? "action-toast-success border-[rgba(var(--accent-rgb),0.45)] bg-[rgba(7,25,26,0.94)] text-[#dbfff2]"
                : "action-toast-info border-[rgba(var(--secondary-rgb),0.38)] bg-[rgba(33,25,11,0.94)] text-[#fff2d7]",
          )}
          exit={{ opacity: 0, y: -12 }}
          initial={{ opacity: 0, y: -12 }}
          key={toast.id}
        >
          <div className="pr-3">
            <p className="action-toast-label text-[11px] font-black uppercase tracking-[0.18em] text-[var(--soft)]">
              {toast.kind === "error"
                ? "Action blocked"
                : toast.kind === "success"
                  ? "Action completed"
                  : "Action updated"}
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
                  : toast.kind === "success"
                    ? "bg-[var(--accent)]"
                    : "bg-[var(--secondary)]",
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
  );
}

export const actionToastDurationMs = TOAST_DURATION_MS;
