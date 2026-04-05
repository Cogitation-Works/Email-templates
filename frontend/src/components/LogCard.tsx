import {
  Activity,
  KeyRound,
  Mail,
  ShieldCheck,
  UserRoundPlus,
} from "lucide-react";

import {
  formatDateTime,
  formatMetadata,
  humanize,
  relativeTime,
} from "@/lib/utils";
import type { AuditLog } from "@/types";

function toneForAction(action: string) {
  if (action.includes("password")) {
    return {
      icon: KeyRound,
      color: "text-[var(--danger)]",
      background: "bg-[rgba(var(--danger-rgb),0.12)]",
      border: "border-l-[rgba(var(--danger-rgb),0.28)]",
    };
  }

  if (action.includes("sent") || action.includes("resent")) {
    return {
      icon: Mail,
      color: "text-[var(--secondary)]",
      background: "bg-[rgba(var(--secondary-rgb),0.14)]",
      border: "border-l-[rgba(var(--secondary-rgb),0.32)]",
    };
  }

  if (action.includes("created") || action.includes("provisioned")) {
    return {
      icon: UserRoundPlus,
      color: "text-[var(--secondary)]",
      background: "bg-[rgba(var(--secondary-rgb),0.14)]",
      border: "border-l-[rgba(var(--secondary-rgb),0.32)]",
    };
  }

  if (
    action.includes("login") ||
    action.includes("otp") ||
    action.includes("auth")
  ) {
    return {
      icon: ShieldCheck,
      color: "text-[var(--accent)]",
      background: "bg-[rgba(var(--accent-rgb),0.14)]",
      border: "border-l-[rgba(var(--accent-rgb),0.32)]",
    };
  }

  return {
    icon: Activity,
    color: "text-[var(--accent)]",
    background: "bg-[rgba(var(--accent-rgb),0.14)]",
    border: "border-l-[rgba(var(--accent-rgb),0.22)]",
  };
}

export function LogCard({
  log,
  action,
}: {
  log: AuditLog;
  action?: React.ReactNode;
}) {
  const tone = toneForAction(log.action);
  const Icon = tone.icon;

  return (
    <article
      className={`surface-panel interactive-card relative overflow-hidden rounded-2xl border-l-4 p-6 ${tone.border}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row">
        <div
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${tone.background}`}
        >
          <Icon className={`h-5 w-5 ${tone.color}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h3 className="text-xl font-black tracking-tight">
                {humanize(log.action)}
              </h3>
              <p className="mt-2 text-sm text-[var(--muted)]">
                {log.actor_name} • {log.actor_role}
              </p>
            </div>
            <div className="shrink-0 text-left sm:text-right">
              <p
                className={`font-label text-[11px] font-extrabold uppercase tracking-[0.18em] ${tone.color}`}
              >
                {relativeTime(log.created_at)}
              </p>
              <p className="mt-2 text-xs text-[var(--soft)]">
                {formatDateTime(log.created_at)}
              </p>
            </div>
          </div>

          {Object.keys(log.metadata).length > 0 ? (
            <div className="surface-strong mt-4 rounded-xl p-4">
              <p className="text-sm leading-7 text-[var(--muted)]">
                {formatMetadata(log.metadata)}
              </p>
            </div>
          ) : null}
          {action}
        </div>
      </div>
    </article>
  );
}
