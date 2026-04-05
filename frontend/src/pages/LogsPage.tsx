import { motion } from "framer-motion";
import { Download, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { api } from "../api/client";
import { AppShell } from "../components/AppShell";
import { LogCard } from "../components/LogCard";
import { useAuth } from "../context/AuthContext";
import type { AuditLog } from "../types";

function sectionMotion(delay: number) {
  return {
    initial: { opacity: 0, y: 22 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.2 },
    transition: { duration: 0.45, delay, ease: "easeOut" as const },
  };
}

export function LogsPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [recoveringId, setRecoveringId] = useState<string | null>(null);

  const loadLogs = async () => {
    try {
      setBusy(true);
      setError("");
      const response = await api.listLogs();
      setLogs(response);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load audit logs.",
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void loadLogs();
  }, []);

  const handleRecover = async (recordId: string) => {
    try {
      setRecoveringId(recordId);
      setError("");
      setMessage("");
      const response = await api.recoverDeletedClientLeadEmail(recordId);
      setMessage(response.message);
      await loadLogs();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to recover campaign.",
      );
    } finally {
      setRecoveringId(null);
    }
  };

  const filteredLogs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return logs;
    }

    return logs.filter((log) => {
      const haystack =
        `${log.action} ${log.actor_name} ${log.actor_role} ${JSON.stringify(log.metadata)}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [logs, query]);

  const dock = (
    <div className="command-dock flex items-center gap-6 px-6 py-3">
      <button
        className="flex flex-col items-center gap-1 text-[var(--accent)]"
        type="button"
      >
        <Search className="h-4 w-4" />
        <span className="text-[10px] font-extrabold uppercase tracking-[0.18em]">
          Search
        </span>
      </button>
      <div className="h-8 w-px bg-[var(--glass-line)]" />
      <button
        className="flex flex-col items-center gap-1 text-[var(--muted)]"
        type="button"
      >
        <RefreshCw className="h-4 w-4" />
        <span className="text-[10px] font-extrabold uppercase tracking-[0.18em]">
          Refresh
        </span>
      </button>
      <button
        className="flex flex-col items-center gap-1 text-[var(--secondary)]"
        type="button"
      >
        <Download className="h-4 w-4" />
        <span className="text-[10px] font-extrabold uppercase tracking-[0.18em]">
          Export
        </span>
      </button>
    </div>
  );

  return (
    <AppShell
      description="Real-time telemetry and activity recording for production environments. Monitored events reflect live system state changes."
      dock={dock}
      eyebrow="System Audit"
      searchPlaceholder="Search system logs..."
      title="Operational logs"
      topTabs={[
        { label: "Dashboard", href: "/workspace" },
        { label: "Logs", href: "/logs", active: true },
        { label: "Resources" },
        { label: "Settings", href: "/settings" },
      ]}
    >
      <section className="mb-10 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 rounded-xl bg-[var(--surface-muted)] px-4 py-2.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" />
          <span className="text-sm font-semibold text-[var(--accent)]">
            Live Monitoring
          </span>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--surface-high)] px-5 py-2.5 text-sm font-medium text-[var(--text)]"
          type="button"
        >
          <Download className="h-4 w-4" />
          <span>Export</span>
        </button>
      </section>

      <section className="mb-10">
        <div className="glass-panel flex flex-wrap items-center gap-2 rounded-2xl p-2 shadow-2xl">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--soft)]" />
            <input
              className="h-12 w-full rounded-xl bg-[var(--surface-lowest)] pl-12 pr-4 text-sm text-[var(--text)] outline-none placeholder:text-[var(--soft)]"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search operational events, users, or status..."
              value={query}
            />
          </div>
          <div className="flex gap-2 p-1">
            <button
              className="rounded-lg bg-[var(--surface-soft)] px-4 py-2 text-sm font-medium text-[var(--text)]"
              type="button"
            >
              Critical
            </button>
            <button
              className="rounded-lg bg-[var(--surface-soft)] px-4 py-2 text-sm font-medium text-[var(--text)]"
              type="button"
            >
              Security
            </button>
            <button
              className="rounded-lg bg-[var(--surface-soft)] px-4 py-2 text-sm font-medium text-[var(--text)]"
              type="button"
            >
              Auth
            </button>
          </div>
          <button
            className="ml-auto inline-flex items-center gap-2 rounded-xl bg-[rgba(var(--secondary-rgb),0.16)] px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--secondary)]"
            onClick={() => void loadLogs()}
            type="button"
          >
            <RefreshCw className={busy ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            <span>{busy ? "Refreshing" : "Refresh"}</span>
          </button>
        </div>
      </section>

      {error ? (
        <div className="mb-5 rounded-xl bg-[rgba(var(--danger-rgb),0.12)] px-4 py-3 text-sm leading-7 text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="mb-5 rounded-xl bg-[rgba(var(--accent-rgb),0.12)] px-4 py-3 text-sm leading-7 text-[var(--accent)]">
          {message}
        </div>
      ) : null}

      <section className="max-w-5xl">
        <div className="relative">
          <div className="absolute left-[31px] top-0 bottom-0 hidden w-px bg-[var(--line)] sm:block" />
          <div className="space-y-8">
            {filteredLogs.map((log, index) => (
              <motion.article
                className="relative flex flex-col gap-6 sm:flex-row"
                key={log.id}
                {...sectionMotion(index * 0.05)}
              >
                <div className="relative z-10 hidden h-12 w-12 shrink-0 items-center justify-center rounded-full border-4 border-[var(--surface)] bg-[var(--surface-soft)] ring-2 ring-[rgba(var(--accent-rgb),0.18)] sm:flex">
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
                </div>
                <div className="flex-1">
                  <LogCard
                    action={
                      user?.role === "super_admin" &&
                      log.action === "client_lead_deleted" &&
                      typeof log.target_id === "string" &&
                      log.target_id ? (
                        <button
                          className="mt-4 inline-flex items-center gap-2 rounded-full bg-[rgba(var(--accent-rgb),0.14)] px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-[var(--accent)] disabled:opacity-70"
                          disabled={recoveringId === log.target_id}
                          onClick={() =>
                            void handleRecover(log.target_id as string)
                          }
                          type="button"
                        >
                          {recoveringId === log.target_id
                            ? "Recovering"
                            : "Recover email"}
                        </button>
                      ) : undefined
                    }
                    log={log}
                  />
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
