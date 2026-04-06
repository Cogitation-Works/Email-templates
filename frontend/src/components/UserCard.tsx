import { motion } from "framer-motion";
import { KeyRound, PencilLine, Trash2 } from "lucide-react";

import { StatusPill } from "./StatusPill";
import { formatDateTime } from "../lib/utils";
import type { User } from "../types";

export function UserCard({
  user,
  onEdit,
  onDelete,
  onResetPassword,
  busyAction,
}: {
  user: User;
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
  onResetPassword: (user: User) => void;
  busyAction?: "delete" | "reset" | null;
}) {
  return (
    <motion.article
      className="interactive-card group relative flex h-full flex-col overflow-hidden rounded-2xl bg-[linear-gradient(165deg,color-mix(in_srgb,var(--surface-lowest)_84%,transparent),var(--surface-lowest))] p-7"
      transition={{ duration: 0.22, ease: "easeOut" }}
      whileHover={{ y: -6, scale: 1.01 }}
      whileTap={{ scale: 0.995 }}
    >
      <div className="absolute inset-y-0 left-0 w-1 bg-[rgba(var(--accent-rgb),0.14)] transition group-hover:bg-[var(--accent)]" />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <div className="grid h-14 w-14 place-items-center rounded-xl bg-[var(--surface-high)] text-base font-black text-[var(--accent)]">
              {user.full_name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-xl font-black tracking-tight">
                {user.full_name}
              </h3>
              <p className="truncate text-sm font-medium text-[var(--muted)]">
                {user.email}
              </p>
            </div>
          </div>
          {user.phone ? (
            <p className="mt-3 text-sm text-[var(--soft)]">{user.phone}</p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusPill
            label={user.role === "super_admin" ? "Admin" : "Operator"}
            tone="accent"
          />
          <StatusPill
            label={user.last_login ? "Active" : "Pending"}
            tone={user.last_login ? "success" : "muted"}
          />
        </div>
      </div>

      <div className="mt-6 grid gap-3 rounded-2xl bg-[var(--surface-muted)] p-5 sm:grid-cols-2 2xl:grid-cols-4">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--soft)]">
            Sent history
          </p>
          <p className="mt-2 text-sm font-bold text-[var(--text)]">
            {user.can_view_other_sent_history ? "Others visible" : "Self only"}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--soft)]">
            Client replies
          </p>
          <p className="mt-2 text-sm font-bold text-[var(--text)]">
            {user.can_view_other_client_replies
              ? "Others visible"
              : "Self only"}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--soft)]">
            Sales sender
          </p>
          <p className="mt-2 text-sm font-bold text-[var(--text)]">
            {user.can_use_sales_sender ? "Enabled" : "Disabled"}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--soft)]">
            Admin sender
          </p>
          <p className="mt-2 text-sm font-bold text-[var(--text)]">
            {user.can_use_admin_sender ? "Enabled" : "Disabled"}
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-1 flex-col justify-end gap-5 border-t border-[var(--line)] pt-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--soft)]">
            Last activity
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {formatDateTime(user.last_login)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <button
            className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-muted)] px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text)] hover:-translate-y-0.5 hover:bg-[var(--surface-high)]"
            onClick={() => onEdit(user)}
            type="button"
          >
            <PencilLine className="h-4 w-4" />
            <span>Edit</span>
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-full bg-[rgba(var(--secondary-rgb),0.14)] px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--secondary)] hover:-translate-y-0.5 hover:bg-[rgba(var(--secondary-rgb),0.2)] disabled:opacity-70"
            disabled={busyAction === "reset"}
            onClick={() => onResetPassword(user)}
            type="button"
          >
            <KeyRound
              className={
                busyAction === "reset" ? "h-4 w-4 animate-spin" : "h-4 w-4"
              }
            />
            <span>{busyAction === "reset" ? "Sending" : "Reset"}</span>
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-full bg-[rgba(var(--danger-rgb),0.12)] px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--danger)] hover:-translate-y-0.5 hover:bg-[rgba(var(--danger-rgb),0.2)] disabled:opacity-70"
            disabled={busyAction === "delete"}
            onClick={() => onDelete(user)}
            type="button"
          >
            <Trash2
              className={
                busyAction === "delete" ? "h-4 w-4 animate-pulse" : "h-4 w-4"
              }
            />
            <span>{busyAction === "delete" ? "Deleting" : "Delete"}</span>
          </button>
        </div>
      </div>
    </motion.article>
  );
}
