import { motion } from "framer-motion";
import {
  Eye,
  Monitor,
  RefreshCw,
  Search,
  Send,
  Smartphone,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { api } from "../api/client";
import { AppShell } from "../components/AppShell";
import { StatusPill } from "../components/StatusPill";
import { cn, formatDateTime, relativeTime } from "../lib/utils";
import type { LeadHistorySection, SentLeadRecord } from "../types";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

function sectionMotion(delay: number) {
  return {
    initial: { opacity: 0, y: 22 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.2 },
    transition: { duration: 0.45, delay, ease: "easeOut" as const },
  };
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const update = () => {
      setIsMobile(window.innerWidth < 768);
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return isMobile;
}

function getSectionLabel(sectionId: string) {
  if (sectionId === "self") {
    return "Self";
  }
  if (sectionId === "others") {
    return "Other";
  }
  return sectionId;
}

export function HistoryPage() {
  const [sections, setSections] = useState<LeadHistorySection[]>([]);
  const [activeSectionId, setActiveSectionId] = useState("");
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [previewRecordId, setPreviewRecordId] = useState("");
  const [previewMode, setPreviewMode] = useState<"mobile" | "tab">("tab");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [resendingId, setResendingId] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const loadHistory = async () => {
    try {
      setBusy(true);
      setError("");
      const response = await api.listLeadHistorySections();
      setSections(response.sections);
      setActiveSectionId(
        (current) => current || response.sections[0]?.id || "",
      );
      setSelectedRecordId(
        (current) => current || response.sections[0]?.records[0]?.id || "",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load history.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void loadHistory();
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const matchesQuery = (record: SentLeadRecord) => {
    if (!normalizedQuery) {
      return true;
    }

    const haystack = [
      record.template_title,
      record.created_by,
      record.created_by_role,
      record.from_email,
      record.email_details_paragraph ?? "",
      record.personal_use_paragraph ?? "",
      ...(record.clients ?? []).flatMap((client) => [
        client.name,
        client.email,
      ]),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  };

  const visibleSections = useMemo(
    () =>
      sections
        .map((section) => ({
          ...section,
          records: section.records.filter(matchesQuery),
        }))
        .filter((section) => section.records.length > 0 || !normalizedQuery),
    [sections, normalizedQuery],
  );

  useEffect(() => {
    if (!visibleSections.length) {
      return;
    }

    if (!visibleSections.some((section) => section.id === activeSectionId)) {
      setActiveSectionId(visibleSections[0].id);
    }
  }, [activeSectionId, visibleSections]);

  const activeSection =
    visibleSections.find((section) => section.id === activeSectionId) ??
    visibleSections[0];

  const visibleRecords = activeSection?.records ?? [];

  useEffect(() => {
    if (!visibleRecords.length) {
      return;
    }

    if (!visibleRecords.some((record) => record.id === selectedRecordId)) {
      setSelectedRecordId(visibleRecords[0].id);
    }
  }, [selectedRecordId, visibleRecords]);

  const allRecords = useMemo(
    () => sections.flatMap((section) => section.records),
    [sections],
  );

  const selectedRecord =
    visibleRecords.find((record) => record.id === selectedRecordId) ??
    visibleRecords[0] ??
    allRecords[0];
  const previewRecord =
    allRecords.find((record) => record.id === previewRecordId) ?? null;
  const previewEmail = previewRecord?.emails?.[0] ?? null;
  const internalAttachments = previewRecord?.personal_attachments ?? [];
  const outgoingAttachments = previewRecord?.email_attachments ?? [];

  const attachmentDownloadUrl = (
    recordId: string,
    category: "email" | "internal",
    filename: string,
  ) =>
    `${API_BASE}/leads/client-lead/sent/${recordId}/attachments/${category}/${encodeURIComponent(filename)}`;

  useEffect(() => {
    if (previewRecordId && isMobile) {
      setPreviewMode("mobile");
    }
  }, [isMobile, previewRecordId]);

  const handleResend = async (recordId: string) => {
    try {
      setResendingId(recordId);
      setError("");
      setMessage("");
      const response = await api.resendClientLeadEmail(recordId);
      setMessage(response.message);
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to resend email.");
    } finally {
      setResendingId(null);
    }
  };

  const openPreview = (record: SentLeadRecord) => {
    setPreviewRecordId(record.id);
    setPreviewMode(isMobile ? "mobile" : "tab");
  };

  const closePreview = () => {
    setPreviewRecordId("");
  };

  const dock = (
    <div className="command-dock flex items-center gap-4 px-6 py-3">
      <div className="flex items-center gap-3 pr-4 md:border-r md:border-[var(--glass-line)]">
        <Search className="h-4 w-4 text-[var(--accent)]" />
        <span className="text-sm font-semibold text-[var(--muted)]">
          Transmission tools
        </span>
      </div>
      <button
        className="rounded-xl bg-[var(--surface-high)] px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text)]"
        onClick={() => void loadHistory()}
        type="button"
      >
        Refresh
      </button>
    </div>
  );

  return (
    <>
      <AppShell
        description="Review sent outreach by self and other activity, inspect the exact sent time, and reopen a full preview before resending."
        dock={dock}
        eyebrow="Outreach History"
        searchPlaceholder="Search history..."
        title="Sent history"
        topTabs={[
          { label: "Workspace", href: "/workspace" },
          { label: "History", href: "/history", active: true },
          { label: "Settings", href: "/settings" },
        ]}
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

        <motion.section className="space-y-5" {...sectionMotion(0.04)}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-3xl font-black tracking-tight">
                Sent history
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--muted)]">
                Clear record of each send with date, time, sender, recipients,
                and quick actions to view or resend.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {visibleSections.map((section) => (
                <button
                  className={cn(
                    "rounded-full px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.18em] transition",
                    activeSectionId === section.id
                      ? "bg-[rgba(var(--accent-rgb),0.14)] text-[var(--accent)]"
                      : "bg-[var(--surface-high)] text-[var(--muted)]",
                  )}
                  key={section.id}
                  onClick={() => setActiveSectionId(section.id)}
                  type="button"
                >
                  {getSectionLabel(section.id)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="glass-panel flex min-w-[18rem] flex-1 items-center gap-3 rounded-full px-4 py-3 text-sm text-[var(--muted)]">
              <Search className="h-4 w-4 text-[var(--accent)]" />
              <input
                className="w-full bg-transparent outline-none placeholder:text-[var(--soft)]"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by sender, client, or template..."
                value={query}
              />
            </div>
            <button
              className="inline-flex items-center gap-2 rounded-full bg-[rgba(var(--secondary-rgb),0.16)] px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--secondary)]"
              onClick={() => void loadHistory()}
              type="button"
            >
              <RefreshCw
                className={busy ? "h-4 w-4 animate-spin" : "h-4 w-4"}
              />
              <span>{busy ? "Refreshing" : "Refresh"}</span>
            </button>
          </div>

          {busy && sections.length === 0 ? (
            <div className="surface-panel rounded-2xl p-6 text-sm text-[var(--muted)]">
              Loading history...
            </div>
          ) : visibleRecords.length === 0 ? (
            <div className="surface-panel rounded-2xl p-6 text-sm text-[var(--muted)]">
              No matching sent records yet.
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {visibleRecords.map((record) => {
                const isSelected = selectedRecord?.id === record.id;
                const deliveryResults = record.delivery_results ?? [];
                const deliveredCount = deliveryResults.filter(
                  (item) => item.delivered,
                ).length;
                const canResend = activeSection?.allow_resend ?? false;
                const internalAttachmentLabel =
                  record.personal_attachments.length > 0
                    ? ` • ${record.personal_attachments.length} internal attachment${
                        record.personal_attachments.length === 1 ? "" : "s"
                      }`
                    : "";

                return (
                  <article
                    className={cn(
                      "surface-panel rounded-[1.6rem] p-5 transition",
                      isSelected &&
                        "ring-1 ring-[rgba(var(--accent-rgb),0.28)]",
                    )}
                    key={record.id}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                          {activeSection?.id === "others"
                            ? `Sent by ${record.created_by}`
                            : "Self history"}
                        </p>
                        <h3 className="mt-2 text-xl font-black tracking-tight">
                          {record.template_title}
                        </h3>
                        <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
                          Sent by {record.created_by} to {record.clients.length}{" "}
                          client{record.clients.length === 1 ? "" : "s"}.
                        </p>
                      </div>
                      <StatusPill
                        label={
                          record.dispatch_status === "scheduled"
                            ? "Scheduled"
                            : record.dispatch_status === "failed"
                              ? "Failed"
                              : deliveredCount === deliveryResults.length &&
                                  deliveryResults.length > 0
                                ? "Delivered"
                                : "Sent"
                        }
                        tone={
                          record.dispatch_status === "failed"
                            ? "danger"
                            : record.dispatch_status === "scheduled"
                              ? "secondary"
                              : "accent"
                        }
                      />
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl bg-[var(--surface-muted)] p-4">
                        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                          Sent at
                        </p>
                        <p className="mt-2 text-sm font-bold text-[var(--text)]">
                          {formatDateTime(record.last_sent_at)}
                        </p>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {relativeTime(record.last_sent_at)}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-[var(--surface-muted)] p-4">
                        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                          Details
                        </p>
                        <p className="mt-2 text-sm font-bold text-[var(--text)]">
                          From {record.from_email}
                        </p>
                        <p className="mt-1 text-sm font-bold text-[var(--text)]">
                          To {record.clients[0]?.email ?? "-"}
                        </p>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {record.email_attachments.length} outgoing attachment
                          {record.email_attachments.length === 1 ? "" : "s"}
                          {internalAttachmentLabel}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <StatusPill label={record.sender_mode} tone="secondary" />
                      <StatusPill label={record.delivery_mode} />
                      <StatusPill
                        label={`${record.clients.length} recipient${record.clients.length === 1 ? "" : "s"}`}
                      />
                      <StatusPill
                        label={`${deliveredCount}/${deliveryResults.length} delivered`}
                        tone="accent"
                      />
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-lowest)] px-5 py-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text)] transition hover:-translate-y-0.5"
                        onClick={() => openPreview(record)}
                        type="button"
                      >
                        <Eye className="h-4 w-4" />
                        <span>View</span>
                      </button>

                      {canResend ? (
                        <button
                          className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-5 py-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#052113] transition hover:-translate-y-0.5 disabled:opacity-70"
                          disabled={resendingId === record.id}
                          onClick={() => void handleResend(record.id)}
                          type="button"
                        >
                          <Send
                            className={
                              resendingId === record.id
                                ? "h-4 w-4 animate-pulse"
                                : "h-4 w-4"
                            }
                          />
                          <span>
                            {resendingId === record.id
                              ? "Resending"
                              : "Resend email"}
                          </span>
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </motion.section>
      </AppShell>

      {previewRecord && previewEmail ? (
        <div className="fixed inset-0 z-50 bg-[rgba(var(--bg-rgb),0.82)] px-4 py-6 backdrop-blur-xl">
          <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-[var(--glass-line)] bg-[var(--surface)] shadow-2xl shadow-[rgba(var(--shadow),0.3)]">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] px-5 py-4 sm:px-6">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--accent)]">
                  Full preview
                </p>
                <h3 className="mt-2 text-2xl font-black tracking-tight">
                  {previewEmail.subject}
                </h3>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Sent by {previewRecord.created_by} on{" "}
                  {formatDateTime(previewRecord.last_sent_at)}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {!isMobile ? (
                  <div className="inline-flex rounded-full border border-[var(--line)] bg-[var(--surface-high)] p-1">
                    <button
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.18em] transition",
                        previewMode === "mobile"
                          ? "bg-[rgba(var(--accent-rgb),0.14)] text-[var(--accent)]"
                          : "text-[var(--muted)]",
                      )}
                      onClick={() => setPreviewMode("mobile")}
                      type="button"
                    >
                      <Smartphone className="h-4 w-4" />
                      <span>Mobile View</span>
                    </button>
                    <button
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.18em] transition",
                        previewMode === "tab"
                          ? "bg-[rgba(var(--accent-rgb),0.14)] text-[var(--accent)]"
                          : "text-[var(--muted)]",
                      )}
                      onClick={() => setPreviewMode("tab")}
                      type="button"
                    >
                      <Monitor className="h-4 w-4" />
                      <span>Tab View</span>
                    </button>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 rounded-full bg-[rgba(var(--accent-rgb),0.14)] px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--accent)]">
                    <Smartphone className="h-4 w-4" />
                    <span>Mobile View</span>
                  </div>
                )}
                <button
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-high)] px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text)]"
                  onClick={closePreview}
                  type="button"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 sm:p-6">
              {previewMode === "mobile" || isMobile ? (
                <div className="mx-auto max-w-[390px]">
                  <div className="overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[var(--surface-strong)] shadow-2xl shadow-[rgba(var(--shadow),0.18)]">
                    <div className="border-b border-[var(--line)] bg-[var(--surface-high)] px-5 py-4">
                      <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                        Mobile preview
                      </p>
                      <p className="mt-2 text-sm font-bold text-[var(--text)]">
                        {previewEmail.recipient_name} &lt;
                        {previewEmail.recipient_email}&gt;
                      </p>
                    </div>
                    <div className="space-y-4 p-5 text-sm leading-7 text-[var(--text)]">
                      <div className="rounded-[1.4rem] bg-[var(--surface-lowest)] p-4 text-[var(--muted)]">
                        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                          Subject
                        </p>
                        <p className="mt-2 text-base font-black text-[var(--text)]">
                          {previewEmail.subject}
                        </p>
                      </div>
                      <div
                        className="rounded-[1.4rem] bg-[var(--surface-lowest)] p-4 text-sm leading-7 text-[var(--muted)]"
                        dangerouslySetInnerHTML={{
                          __html: previewEmail.html_body,
                        }}
                      />

                      <div className="rounded-[1.4rem] bg-[var(--surface-lowest)] p-4">
                        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                          Internal notes
                        </p>
                        <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
                          {previewRecord.personal_use_paragraph ||
                            "No internal notes saved."}
                        </p>
                      </div>

                      <div className="rounded-[1.4rem] bg-[var(--surface-lowest)] p-4">
                        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                          Internal attachments
                        </p>
                        <div className="mt-3 space-y-2">
                          {internalAttachments.length === 0 ? (
                            <p className="text-sm text-[var(--muted)]">
                              No internal attachments.
                            </p>
                          ) : (
                            internalAttachments.map((attachment) => (
                              <a
                                className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] transition hover:bg-[var(--surface-high)]"
                                href={attachmentDownloadUrl(
                                  previewRecord.id,
                                  "internal",
                                  attachment.filename,
                                )}
                                key={`mobile-internal-${previewRecord.id}-${attachment.filename}`}
                                rel="noreferrer"
                                target="_blank"
                              >
                                <span className="truncate">
                                  {attachment.filename}
                                </span>
                                <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--accent)]">
                                  Download
                                </span>
                              </a>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="rounded-[1.4rem] bg-[var(--surface-lowest)] p-4">
                        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                          Email attachments
                        </p>
                        <div className="mt-3 space-y-2">
                          {outgoingAttachments.length === 0 ? (
                            <p className="text-sm text-[var(--muted)]">
                              No outgoing attachments.
                            </p>
                          ) : (
                            outgoingAttachments.map((attachment) => (
                              <a
                                className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] transition hover:bg-[var(--surface-high)]"
                                href={attachmentDownloadUrl(
                                  previewRecord.id,
                                  "email",
                                  attachment.filename,
                                )}
                                key={`mobile-outgoing-${previewRecord.id}-${attachment.filename}`}
                                rel="noreferrer"
                                target="_blank"
                              >
                                <span className="truncate">
                                  {attachment.filename}
                                </span>
                                <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--accent)]">
                                  Download
                                </span>
                              </a>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mx-auto max-w-5xl">
                  <div className="overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[var(--surface-strong)] shadow-2xl shadow-[rgba(var(--shadow),0.18)]">
                    <div className="grid gap-4 border-b border-[var(--line)] bg-[var(--surface-high)] px-5 py-4 sm:grid-cols-2 sm:px-6">
                      <div>
                        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                          Recipient
                        </p>
                        <p className="mt-2 text-sm font-bold text-[var(--text)]">
                          {previewEmail.recipient_name}
                        </p>
                        <p className="text-sm text-[var(--muted)]">
                          {previewEmail.recipient_email}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                          Sender
                        </p>
                        <p className="mt-2 text-sm font-bold text-[var(--text)]">
                          {previewEmail.from_name}
                        </p>
                        <p className="text-sm text-[var(--muted)]">
                          {previewEmail.from_email}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-5 p-5 lg:grid-cols-[1.15fr_0.85fr] lg:p-6">
                      <div>
                        <div className="rounded-[1.6rem] bg-[var(--surface-lowest)] p-5">
                          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                            Tab view
                          </p>
                          <p className="mt-2 text-base font-black text-[var(--text)]">
                            {previewEmail.subject}
                          </p>
                          <div
                            className="mt-4 rounded-[1.4rem] bg-[var(--surface)] p-5 text-sm leading-7 text-[var(--muted)]"
                            dangerouslySetInnerHTML={{
                              __html: previewEmail.html_body,
                            }}
                          />
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="rounded-[1.6rem] bg-[var(--surface-lowest)] p-5">
                          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                            Sent details
                          </p>
                          <div className="mt-3 space-y-2 text-sm text-[var(--muted)]">
                            <p>
                              Sent at{" "}
                              {formatDateTime(previewRecord.last_sent_at)}
                            </p>
                            <p>Created by {previewRecord.created_by}</p>
                            <p>
                              {previewRecord.clients.length} recipient
                              {previewRecord.clients.length === 1 ? "" : "s"}
                            </p>
                          </div>
                        </div>

                        <div className="rounded-[1.6rem] bg-[var(--surface-lowest)] p-5">
                          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                            Internal notes
                          </p>
                          <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                            {previewRecord.personal_use_paragraph ||
                              "No internal notes saved."}
                          </p>
                        </div>

                        <div className="rounded-[1.6rem] bg-[var(--surface-lowest)] p-5">
                          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                            Internal attachments
                          </p>
                          <div className="mt-3 space-y-2">
                            {internalAttachments.length === 0 ? (
                              <p className="text-sm text-[var(--muted)]">
                                No internal attachments.
                              </p>
                            ) : (
                              internalAttachments.map((attachment) => (
                                <a
                                  className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] transition hover:bg-[var(--surface-high)]"
                                  href={attachmentDownloadUrl(
                                    previewRecord.id,
                                    "internal",
                                    attachment.filename,
                                  )}
                                  key={`internal-${previewRecord.id}-${attachment.filename}`}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  <span className="truncate">
                                    {attachment.filename}
                                  </span>
                                  <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--accent)]">
                                    Download
                                  </span>
                                </a>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="rounded-[1.6rem] bg-[var(--surface-lowest)] p-5">
                          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                            Email attachments
                          </p>
                          <div className="mt-3 space-y-2">
                            {outgoingAttachments.length === 0 ? (
                              <p className="text-sm text-[var(--muted)]">
                                No outgoing attachments.
                              </p>
                            ) : (
                              outgoingAttachments.map((attachment) => (
                                <a
                                  className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] transition hover:bg-[var(--surface-high)]"
                                  href={attachmentDownloadUrl(
                                    previewRecord.id,
                                    "email",
                                    attachment.filename,
                                  )}
                                  key={`outgoing-${previewRecord.id}-${attachment.filename}`}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  <span className="truncate">
                                    {attachment.filename}
                                  </span>
                                  <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--accent)]">
                                    Download
                                  </span>
                                </a>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="rounded-[1.6rem] bg-[var(--surface-lowest)] p-5 text-sm leading-7 text-[var(--muted)]">
                          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                            Plain text
                          </p>
                          <p className="mt-2 whitespace-pre-wrap">
                            {previewEmail.text_body}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
