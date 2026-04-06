import { motion } from "framer-motion";
import {
  ArrowRight,
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { api } from "../api/client";
import { AppShell } from "../components/AppShell";
import { StatusPill } from "../components/StatusPill";
import type { ExportDatasetOption } from "../types";

const fallbackDatasets: ExportDatasetOption[] = [
  {
    id: "whole_database",
    label: "Whole database",
    description:
      "Exports the full application data set including users, logs, campaigns, replies, scheduler data, and auth challenges.",
    supportsRecordId: false,
    formats: ["json", "csv"],
  },
  {
    id: "users",
    label: "Users",
    description: "Export full user records or a single user by id.",
    supportsRecordId: true,
    formats: ["json", "csv"],
  },
  {
    id: "audit_logs",
    label: "Logs",
    description: "Export audit logs or a single log entry by id.",
    supportsRecordId: true,
    formats: ["json", "csv"],
  },
  {
    id: "sent_history",
    label: "Email history",
    description:
      "Export sent outreach campaigns, including body content and attachments metadata.",
    supportsRecordId: true,
    formats: ["json", "csv"],
  },
  {
    id: "client_replies",
    label: "Client replies",
    description:
      "Export client reply records, including bodies, attachments metadata, and linkage to campaigns.",
    supportsRecordId: true,
    formats: ["json", "csv"],
  },
  {
    id: "scheduled_emails",
    label: "Scheduled emails",
    description: "Export queued and processed scheduled email jobs.",
    supportsRecordId: true,
    formats: ["json", "csv"],
  },
];

function sectionMotion(delay: number) {
  return {
    initial: { opacity: 0, y: 22 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.2 },
    transition: { duration: 0.45, delay, ease: "easeOut" as const },
  };
}

export function ExportsPage() {
  const [datasets, setDatasets] = useState<ExportDatasetOption[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [format, setFormat] = useState<"json" | "csv">("json");
  const [recordId, setRecordId] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [manifestLive, setManifestLive] = useState(true);

  useEffect(() => {
    const loadManifest = async () => {
      try {
        setBusy(true);
        setError("");
        const response = await api.listExportManifest();
        const safeDatasets = Array.isArray(response.datasets)
          ? response.datasets
          : [];
        setDatasets(safeDatasets);
        setSelectedDatasetId((current) => current || safeDatasets[0]?.id || "");
        setManifestLive(true);
      } catch (err) {
        const fallback = [...fallbackDatasets];
        setDatasets(fallback);
        setSelectedDatasetId((current) => current || fallback[0]?.id || "");
        setManifestLive(false);
        setError(
          err instanceof Error && /404/.test(err.message)
            ? "Export routes are not available from the running backend process. Restart the backend server, then refresh this page."
            : err instanceof Error
              ? err.message
              : "Unable to load export options.",
        );
      } finally {
        setBusy(false);
      }
    };

    void loadManifest();
  }, []);

  const selectedDataset =
    datasets.find((item) => item.id === selectedDatasetId) ?? datasets[0] ?? null;
  const exportCounts = useMemo(
    () => ({
      datasets: datasets.length,
      jsonReady: datasets.filter((item) => item.formats.includes("json")).length,
      csvReady: datasets.filter((item) => item.formats.includes("csv")).length,
      recordScoped: datasets.filter((item) => item.supportsRecordId).length,
    }),
    [datasets],
  );

  const triggerDownload = async (
    datasetId: string,
    nextFormat: "json" | "csv",
    nextRecordId?: string,
  ) => {
    try {
      const key = `${datasetId}:${nextFormat}:${nextRecordId || "all"}`;
      setDownloadingKey(key);
      setError("");
      setMessage("");

      const response = await api.downloadAdminExport({
        dataset: datasetId,
        format: nextFormat,
        record_id: nextRecordId?.trim() || undefined,
      });

      const url = window.URL.createObjectURL(response.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = response.filename;
      link.click();
      window.URL.revokeObjectURL(url);

      setMessage(
        nextRecordId?.trim()
          ? `Exported a targeted ${datasetId.replaceAll("_", " ")} record as ${nextFormat.toUpperCase()}.`
          : `Exported ${datasetId.replaceAll("_", " ")} as ${nextFormat.toUpperCase()}.`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to complete the export.",
      );
    } finally {
      setDownloadingKey(null);
    }
  };

  const aside = (
    <div className="space-y-5">
      <div className="surface-panel overflow-hidden rounded-[1.8rem] p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--accent)]">
              Coverage
            </p>
            <h3 className="mt-2 text-xl font-black tracking-tight">
              Export surface
            </h3>
          </div>
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[rgba(var(--accent-rgb),0.14)] text-[var(--accent)]">
            <Database className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          {[
            { label: "Datasets", value: exportCounts.datasets },
            { label: "JSON ready", value: exportCounts.jsonReady },
            { label: "CSV ready", value: exportCounts.csvReady },
            { label: "Single record", value: exportCounts.recordScoped },
          ].map((item) => (
            <div
              className="rounded-2xl bg-[var(--surface-muted)] px-4 py-3"
              key={item.label}
            >
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--soft)]">
                {item.label}
              </p>
              <p className="mt-2 text-2xl font-black text-[var(--text)]">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-panel rounded-[1.8rem] p-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-[var(--secondary)]" />
          <p className="text-sm font-bold text-[var(--text)]">
            Export guidance
          </p>
        </div>
        <div className="mt-4 space-y-3 text-sm leading-7 text-[var(--muted)]">
          <p>
            Use `Whole database` for full disaster-recovery snapshots and
            migration checks.
          </p>
          <p>
            Use a record ID when you need one user, one log, one campaign, or
            one reply without exposing a larger data set.
          </p>
          <p>
            CSV is best for handoff and spreadsheet review. JSON is better for
            backup, import, and engineering workflows.
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <AppShell
      aside={aside}
      description="Export operational data with production-safe controls for audits, migration snapshots, incident review, and client reporting."
      eyebrow="Data Export"
      title="Export studio"
    >
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

      {!manifestLive ? (
        <div className="mb-5 rounded-xl bg-[rgba(var(--secondary-rgb),0.12)] px-4 py-3 text-sm leading-7 text-[var(--secondary)]">
          Export UI is loaded in fallback mode. Downloads stay disabled until the
          backend server is restarted with the latest code.
        </div>
      ) : null}

      <motion.section
        className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]"
        {...sectionMotion(0.02)}
      >
        <div className="interactive-card relative overflow-hidden rounded-[2rem] bg-[linear-gradient(160deg,rgba(var(--accent-rgb),0.16),rgba(var(--secondary-rgb),0.07)_48%,var(--surface-strong)_100%)] p-7">
          <div className="absolute right-[-3.5rem] top-[-3.5rem] h-36 w-36 rounded-full bg-[rgba(var(--secondary-rgb),0.12)] blur-3xl" />
          <div className="absolute bottom-[-4rem] left-[-2rem] h-40 w-40 rounded-full bg-[rgba(var(--accent-rgb),0.12)] blur-3xl" />
          <div className="relative">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[var(--accent)]">
              Production snapshot
            </p>
            <h2 className="mt-3 max-w-2xl text-3xl font-black tracking-tight">
              Export the whole system or drill into one exact record without
              leaving the admin workspace.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--muted)]">
              This console covers users, logs, email history, replies,
              scheduler jobs, and full database snapshots in both JSON and CSV.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <button
                className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-5 py-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#052113] transition hover:-translate-y-0.5 disabled:opacity-70"
                disabled={
                  !manifestLive || downloadingKey === "whole_database:json:all"
                }
                onClick={() => void triggerDownload("whole_database", "json")}
                type="button"
              >
                <FileJson className="h-4 w-4" />
                <span>
                  {downloadingKey === "whole_database:json:all"
                    ? "Preparing JSON"
                    : "Full DB JSON"}
                </span>
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-full bg-[rgba(var(--secondary-rgb),0.16)] px-5 py-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--secondary)] transition hover:-translate-y-0.5 disabled:opacity-70"
                disabled={
                  !manifestLive || downloadingKey === "whole_database:csv:all"
                }
                onClick={() => void triggerDownload("whole_database", "csv")}
                type="button"
              >
                <FileSpreadsheet className="h-4 w-4" />
                <span>
                  {downloadingKey === "whole_database:csv:all"
                    ? "Preparing CSV"
                    : "Full DB CSV"}
                </span>
              </button>
            </div>
          </div>
        </div>

        <div className="surface-panel rounded-[2rem] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                Targeted export
              </p>
              <h3 className="mt-2 text-2xl font-black tracking-tight">
                Download one data set
              </h3>
            </div>
            <StatusPill label={selectedDataset?.label || "Select"} tone="accent" />
          </div>

          <div className="mt-6 space-y-5">
            <label className="block">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                Dataset
              </span>
              <select
                className="mt-2 h-12 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] px-4 text-sm text-[var(--text)] outline-none"
                onChange={(event) => setSelectedDatasetId(event.target.value)}
                value={selectedDataset?.id || ""}
              >
                {datasets.map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>
                    {dataset.label}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                Format
              </p>
              <div className="mt-2 inline-flex rounded-full border border-[var(--line)] bg-[var(--surface-muted)] p-1">
                {(["json", "csv"] as const).map((item) => {
                  const disabled =
                    selectedDataset && !selectedDataset.formats.includes(item);
                  return (
                    <button
                      className={`rounded-full px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.18em] ${
                        disabled
                          ? "cursor-not-allowed opacity-45"
                          : format === item
                            ? "bg-[rgba(var(--accent-rgb),0.2)] text-[var(--accent)] shadow-[0_0_0_1px_rgba(var(--accent-rgb),0.35)]"
                            : "text-[var(--muted)]"
                      }`}
                      disabled={disabled}
                      key={item}
                      onClick={() => setFormat(item)}
                      type="button"
                    >
                      {item.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedDataset?.supportsRecordId ? (
              <label className="block">
                <span className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                  Record id
                </span>
                <input
                  className="mt-2 h-12 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] px-4 text-sm text-[var(--text)] outline-none placeholder:text-[var(--soft)]"
                  onChange={(event) => setRecordId(event.target.value)}
                  placeholder="Leave blank to export the full dataset, or enter one exact id"
                  type="text"
                  value={recordId}
                />
              </label>
            ) : (
              <div className="rounded-2xl bg-[rgba(var(--secondary-rgb),0.1)] px-4 py-3 text-sm leading-7 text-[var(--muted)]">
                This dataset exports as a full snapshot only.
              </div>
            )}

            <div className="rounded-2xl bg-[var(--surface-muted)] p-4">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--accent)]">
                Scope
              </p>
              <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
                {selectedDataset?.description || "Select an export dataset."}
              </p>
            </div>

            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-[1.3rem] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-5 py-4 text-sm font-black uppercase tracking-[0.18em] text-[#052113] transition hover:-translate-y-0.5 disabled:opacity-70"
              disabled={
                !selectedDataset ||
                busy ||
                Boolean(downloadingKey) ||
                !manifestLive
              }
              onClick={() =>
                selectedDataset
                  ? void triggerDownload(selectedDataset.id, format, recordId)
                  : undefined
              }
              type="button"
            >
              <Download className="h-4 w-4" />
              <span>
                {downloadingKey &&
                downloadingKey.startsWith(`${selectedDataset?.id}:${format}`)
                  ? "Preparing export"
                  : "Download export"}
              </span>
            </button>
          </div>
        </div>
      </motion.section>

      <motion.section className="mt-8" {...sectionMotion(0.06)}>
        <div className="mb-4">
          <h2 className="text-2xl font-black tracking-tight">
            Available export paths
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--muted)]">
            Every export option is available here. Full snapshots are one click,
            and any data set with record-level support can be scoped to a single
            id for audits or incident review.
          </p>
        </div>

        {busy ? (
          <div className="surface-panel rounded-[1.8rem] p-6 text-sm text-[var(--muted)]">
            Loading export options...
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {datasets.map((dataset, index) => (
              <motion.article
                className="interactive-card group relative overflow-hidden rounded-[1.8rem] bg-[linear-gradient(165deg,color-mix(in_srgb,var(--surface-lowest)_85%,transparent),var(--surface-strong))] p-6"
                key={dataset.id}
                whileHover={{ y: -6, scale: 1.01 }}
                whileTap={{ scale: 0.995 }}
                {...sectionMotion(index * 0.04)}
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,var(--accent),var(--secondary))] opacity-65" />
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                      {dataset.supportsRecordId ? "Full + targeted" : "Full snapshot"}
                    </p>
                    <h3 className="mt-2 text-2xl font-black tracking-tight">
                      {dataset.label}
                    </h3>
                  </div>
                  <StatusPill
                    label={dataset.formats.join(" / ").toUpperCase()}
                    tone="secondary"
                  />
                </div>

                <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
                  {dataset.description}
                </p>

                <div className="mt-5 flex flex-wrap gap-2">
                  {dataset.formats.includes("json") ? (
                    <button
                      className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-muted)] px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text)] transition hover:-translate-y-0.5 disabled:opacity-70"
                      disabled={Boolean(downloadingKey) || !manifestLive}
                      onClick={() => void triggerDownload(dataset.id, "json")}
                      type="button"
                    >
                      <FileJson className="h-4 w-4" />
                      <span>Export JSON</span>
                    </button>
                  ) : null}
                  {dataset.formats.includes("csv") ? (
                    <button
                      className="inline-flex items-center gap-2 rounded-full bg-[rgba(var(--secondary-rgb),0.14)] px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--secondary)] transition hover:-translate-y-0.5 disabled:opacity-70"
                      disabled={Boolean(downloadingKey) || !manifestLive}
                      onClick={() => void triggerDownload(dataset.id, "csv")}
                      type="button"
                    >
                      <FileSpreadsheet className="h-4 w-4" />
                      <span>Export CSV</span>
                    </button>
                  ) : null}
                </div>

                {dataset.supportsRecordId ? (
                  <button
                    className="mt-5 inline-flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--accent)] transition group-hover:translate-x-1"
                    onClick={() => {
                      setSelectedDatasetId(dataset.id);
                      setRecordId("");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    type="button"
                  >
                    <span>Configure single-record export</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                ) : null}
              </motion.article>
            ))}
          </div>
        )}
      </motion.section>
    </AppShell>
  );
}
