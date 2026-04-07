import { AnimatePresence, motion } from "framer-motion";
import {
  Eye,
  Inbox,
  Mail,
  Paperclip,
  RefreshCw,
  Reply,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { api } from "../api/client";
import {
  ActionToast,
  actionToastDurationMs,
  type ActionToastState,
} from "../components/ActionToast";
import { AppShell } from "../components/AppShell";
import { ConfirmationDialog } from "../components/ConfirmationDialog";
import { DispatchPlanDialog } from "../components/DispatchPlanDialog";
import { defaultScheduledDateTimeValue } from "../components/SchedulePicker";
import { StatusPill } from "../components/StatusPill";
import { useAuth } from "../context/AuthContext";
import { cn, compactText, formatDateTime, relativeTime } from "../lib/utils";
import type {
  LeadLinkedCampaignDetail,
  LeadReplyHistoryRecord,
  LeadReplyHistorySection,
  LeadHistorySection,
  SchedulerStatus,
  SentLeadRecord,
} from "../types";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

type HistoryViewMode = "sent" | "replies";
type PreviewState =
  | { kind: "sent"; id: string }
  | { kind: "reply"; id: string }
  | null;

function parseHistoryViewParam(value: string | null): HistoryViewMode {
  return value === "replies" ? "replies" : "sent";
}

function sectionMotion(delay: number) {
  return {
    initial: { opacity: 0, y: 22 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.2 },
    transition: { duration: 0.45, delay, ease: "easeOut" as const },
  };
}

function getSectionLabel(sectionId: string) {
  return sectionId === "others" ? "Other" : "Self";
}

function getSenderModeLabel(value?: string) {
  if (value === "sales") {
    return "Sales";
  }
  if (value === "admin") {
    return "Admin";
  }
  if (value === "gmail") {
    return "Gmail";
  }
  return "Mailbox";
}

function getSenderModeTone(value?: string) {
  if (value === "sales") {
    return "accent" as const;
  }
  if (value === "admin") {
    return "secondary" as const;
  }
  return "muted" as const;
}

function getDispatchTone(value?: string) {
  if (value === "failed") {
    return "danger" as const;
  }
  if (value === "cancelled") {
    return "muted" as const;
  }
  if (value === "scheduled" || value === "sending") {
    return "secondary" as const;
  }
  return "success" as const;
}

function getDispatchLabel(value?: string) {
  return (value || "sent").replace(/_/g, " ");
}

function normalizeDispatchBucket(value?: string) {
  if (value === "scheduled") {
    return "scheduled";
  }
  if (value === "sending") {
    return "sending";
  }
  if (value === "failed" || value === "partial_failed") {
    return "failed";
  }
  return "sent";
}

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function attachmentUrl(
  recordId: string,
  category: "email" | "internal",
  filename: string,
) {
  return `${API_BASE}/leads/client-lead/sent/${recordId}/attachments/${category}/${encodeURIComponent(filename)}`;
}

function replyAttachmentUrl(replyId: string, filename: string) {
  return `${API_BASE}/leads/client-lead/replies/${replyId}/attachments/${encodeURIComponent(filename)}`;
}

function matchSentRecord(record: SentLeadRecord, query: string) {
  if (!query) {
    return true;
  }

  return [
    record.template_title,
    record.created_by,
    record.created_by_role,
    record.from_email,
    record.email_details_paragraph ?? "",
    record.personal_use_paragraph ?? "",
    ...(record.clients ?? []).flatMap((client) => [client.name, client.email]),
    ...(record.emails ?? []).flatMap((email) => [
      email.subject,
      email.recipient_name,
      email.recipient_email,
    ]),
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function normalizeRole(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeName(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isSuperAdminSentRecord(record: SentLeadRecord) {
  const role = normalizeRole(record.created_by_role);
  const name = normalizeName(record.created_by);
  return role === "super_admin" || name === "superadmin" || name === "super admin";
}

function isSuperAdminReplyRecord(record: LeadReplyHistoryRecord) {
  const role = normalizeRole(record.campaign_created_by_role);
  const name = normalizeName(record.campaign_created_by);
  return role === "super_admin" || name === "superadmin" || name === "super admin";
}

function matchReplyRecord(record: LeadReplyHistoryRecord, query: string) {
  if (!query) {
    return true;
  }

  return [
    record.subject,
    record.preview_text,
    record.body_text,
    record.client_name,
    record.client_email,
    record.from_email,
    record.to_email ?? "",
    record.campaign_template_title,
    record.campaign_created_by,
    record.mailbox_user ?? "",
    ...(record.attachments ?? []).map((attachment) => attachment.filename),
    record.linked_campaign?.template_title ?? "",
    record.linked_campaign?.email_details_paragraph ?? "",
    record.linked_campaign?.personal_use_paragraph ?? "",
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function AttachmentLinks({
  attachments,
  emptyLabel,
  hrefFor,
}: {
  attachments: Array<{ filename: string }>;
  emptyLabel: string;
  hrefFor: (filename: string) => string;
}) {
  if (!attachments.length) {
    return <p className="text-sm text-[var(--muted)]">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-2">
      {attachments.map((attachment) => (
        <a
          className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] transition hover:bg-[var(--surface-high)]"
          href={hrefFor(attachment.filename)}
          key={attachment.filename}
          rel="noreferrer"
          target="_blank"
        >
          <span className="truncate">{attachment.filename}</span>
          <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--accent)]">
            Download
          </span>
        </a>
      ))}
    </div>
  );
}

function SentPreview({ record }: { record: SentLeadRecord }) {
  const email = record.emails?.[0] ?? null;

  return (
    <div className="overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[var(--surface-strong)] shadow-2xl shadow-[rgba(var(--shadow),0.18)]">
      <div className="border-b border-[var(--line)] bg-[var(--surface-high)] px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill label={getDispatchLabel(record.dispatch_status)} tone={getDispatchTone(record.dispatch_status)} />
          <StatusPill label={getSenderModeLabel(record.sender_mode)} tone={getSenderModeTone(record.sender_mode)} />
          <StatusPill label={record.created_by} tone="muted" />
        </div>
        <h3 className="mt-4 text-2xl font-black tracking-tight text-[var(--text)]">
          {record.template_title}
        </h3>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Sent at {formatDateTime(record.last_sent_at)} to{" "}
          {countLabel(record.clients.length, "client")}.
        </p>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[1.15fr_0.85fr] lg:p-6">
        <div className="space-y-4">
          <div className="rounded-[1.6rem] bg-[var(--surface-lowest)] p-5">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
              Sent body
            </p>
            {email ? (
              <>
                <p className="mt-2 text-base font-black text-[var(--text)]">
                  {email.subject}
                </p>
                <div
                  className="mt-4 rounded-[1.4rem] bg-[var(--surface)] p-5 text-sm leading-7 text-[var(--muted)]"
                  dangerouslySetInnerHTML={{ __html: email.html_body }}
                />
              </>
            ) : (
              <p className="mt-3 text-sm text-[var(--muted)]">
                No email preview available.
              </p>
            )}
          </div>
          {email ? (
            <div className="rounded-[1.6rem] bg-[var(--surface-lowest)] p-5 text-sm leading-7 text-[var(--muted)]">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                Plain text
              </p>
              <p className="mt-3 whitespace-pre-wrap">{email.text_body}</p>
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-[1.6rem] bg-[var(--surface-lowest)] p-5">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
              Email details
            </p>
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
              {record.email_details_paragraph || "No email details saved."}
            </p>
          </div>

          <div className="rounded-[1.6rem] bg-[var(--surface-lowest)] p-5">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
              Internal notes
            </p>
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
              {record.personal_use_paragraph || "No internal notes saved."}
            </p>
          </div>

          <div className="rounded-[1.6rem] bg-[var(--surface-lowest)] p-5">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
              Internal attachments
            </p>
            <div className="mt-3">
              <AttachmentLinks
                attachments={record.personal_attachments}
                emptyLabel="No internal attachments."
                hrefFor={(filename) => attachmentUrl(record.id, "internal", filename)}
              />
            </div>
          </div>

          <div className="rounded-[1.6rem] bg-[var(--surface-lowest)] p-5">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
              Outgoing attachments
            </p>
            <div className="mt-3">
              <AttachmentLinks
                attachments={record.email_attachments}
                emptyLabel="No outgoing attachments."
                hrefFor={(filename) => attachmentUrl(record.id, "email", filename)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LinkedCampaignPreview({
  campaign,
}: {
  campaign: LeadLinkedCampaignDetail;
}) {
  const email = campaign.emails?.[0] ?? null;

  return (
    <div className="rounded-[1.6rem] bg-[var(--surface-lowest)] p-5">
      <div className="flex flex-wrap items-center gap-3">
        <StatusPill label="Linked sent email" tone="secondary" />
        <StatusPill
          label={getSenderModeLabel(campaign.sender_mode)}
          tone={getSenderModeTone(campaign.sender_mode)}
        />
      </div>
      <h4 className="mt-4 text-lg font-black text-[var(--text)]">
        {campaign.template_title}
      </h4>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Sent at {formatDateTime(campaign.last_sent_at)} by {campaign.created_by}
      </p>

      <div className="mt-5 grid gap-4 2xl:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-[1.3rem] bg-[var(--surface)] p-4">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
            Sent body
          </p>
          {email ? (
            <>
              <p className="mt-2 text-sm font-bold text-[var(--text)]">
                {email.subject}
              </p>
              <div
                className="mt-3 min-h-[20rem] max-h-[34rem] overflow-auto rounded-[1rem] bg-[var(--surface-high)] p-4 text-sm leading-7 text-[var(--muted)]"
                dangerouslySetInnerHTML={{ __html: email.html_body }}
              />
            </>
          ) : (
            <p className="mt-3 text-sm text-[var(--muted)]">
              No sent preview available.
            </p>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-[1.3rem] bg-[var(--surface)] p-4 min-h-[8.5rem]">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
              Email details
            </p>
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
              {campaign.email_details_paragraph || "No email details saved."}
            </p>
          </div>
          <div className="rounded-[1.3rem] bg-[var(--surface)] p-4 min-h-[8.5rem]">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
              Internal notes
            </p>
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
              {campaign.personal_use_paragraph || "No internal notes saved."}
            </p>
          </div>
          <div className="rounded-[1.3rem] bg-[var(--surface)] p-4">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
              Internal attachments
            </p>
            <div className="mt-3">
              <AttachmentLinks
                attachments={campaign.personal_attachments}
                emptyLabel="No internal attachments."
                hrefFor={(filename) => attachmentUrl(campaign.id, "internal", filename)}
              />
            </div>
          </div>
          <div className="rounded-[1.3rem] bg-[var(--surface)] p-4">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
              Outgoing attachments
            </p>
            <div className="mt-3">
              <AttachmentLinks
                attachments={campaign.email_attachments}
                emptyLabel="No outgoing attachments."
                hrefFor={(filename) => attachmentUrl(campaign.id, "email", filename)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReplyPreview({ record }: { record: LeadReplyHistoryRecord }) {
  return (
    <div className="overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[var(--surface-strong)] shadow-2xl shadow-[rgba(var(--shadow),0.18)]">
      <div className="border-b border-[var(--line)] bg-[var(--surface-high)] px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill
            label={record.message_kind === "reply" ? "Reply" : "Inbox"}
            tone={record.message_kind === "reply" ? "secondary" : "accent"}
          />
          <StatusPill
            label={getSenderModeLabel(record.campaign_sender_mode)}
            tone={getSenderModeTone(record.campaign_sender_mode)}
          />
          <StatusPill label={record.mailbox_user || "Mailbox"} tone="muted" />
        </div>
        <h3 className="mt-4 text-2xl font-black tracking-tight text-[var(--text)]">
          {record.subject || "(No subject)"}
        </h3>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Received {formatDateTime(record.received_at)} from {record.from_email}
        </p>
      </div>

      <div className="grid gap-5 p-5 xl:grid-cols-[1.05fr_0.95fr] lg:p-6">
        <div className="space-y-4">
          <div className="rounded-[1.6rem] bg-[var(--surface-lowest)] p-5">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
              Incoming message
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.2rem] bg-[var(--surface)] p-4">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--secondary)]">
                  From
                </p>
                <p className="mt-2 break-all text-sm font-bold text-[var(--text)]">
                  {record.from_email}
                </p>
              </div>
              <div className="rounded-[1.2rem] bg-[var(--surface)] p-4">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--accent)]">
                  To
                </p>
                <p className="mt-2 break-all text-sm font-bold text-[var(--text)]">
                  {record.to_email || record.campaign_from_email || "-"}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-[1.3rem] bg-[var(--surface)] p-4">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                Body
              </p>
              {record.body_html ? (
                <div
                  className="mt-3 rounded-[1rem] bg-[var(--surface-high)] p-4 text-sm leading-7 text-[var(--muted)]"
                  dangerouslySetInnerHTML={{ __html: record.body_html }}
                />
              ) : (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[var(--muted)]">
                  {record.body_text || "No body text available."}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[1.6rem] bg-[var(--surface-lowest)] p-5">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
              Message details
            </p>
            <div className="mt-3 space-y-2 text-sm text-[var(--muted)]">
              <p>Client {record.client_name || record.from_name || record.from_email}</p>
              <p>Sent from mailbox {record.mailbox_user || "-"}</p>
              <p>Handled by {record.campaign_created_by || "Unknown owner"}</p>
            </div>
          </div>

          <div className="rounded-[1.6rem] bg-[var(--surface-lowest)] p-5">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
              Attachments
            </p>
            <div className="mt-3">
              <AttachmentLinks
                attachments={record.attachments ?? []}
                emptyLabel="No client attachments."
                hrefFor={(filename) => replyAttachmentUrl(record.id, filename)}
              />
            </div>
          </div>

        </div>
      </div>
      {record.message_kind === "reply" && record.linked_campaign ? (
        <div className="border-t border-[var(--line)] px-5 pb-5 pt-0 lg:px-6 lg:pb-6">
          <LinkedCampaignPreview campaign={record.linked_campaign} />
        </div>
      ) : null}
    </div>
  );
}

export function HistoryPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [historyViewMode, setHistoryViewMode] =
    useState<HistoryViewMode>(() => parseHistoryViewParam(searchParams.get("view")));
  const [sentSections, setSentSections] = useState<LeadHistorySection[]>([]);
  const [replySections, setReplySections] = useState<LeadReplyHistorySection[]>([]);
  const [activeSentSectionId, setActiveSentSectionId] = useState("self");
  const [activeReplySectionId, setActiveReplySectionId] = useState("self");
  const [previewState, setPreviewState] = useState<PreviewState>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [syncingReplies, setSyncingReplies] = useState(false);
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(
    null,
  );
  const [pendingResendRecord, setPendingResendRecord] =
    useState<SentLeadRecord | null>(null);
  const [resendDispatchMode, setResendDispatchMode] = useState<
    "now" | "schedule"
  >("now");
  const [resendScheduledFor, setResendScheduledFor] = useState(
    defaultScheduledDateTimeValue(),
  );
  const [pendingDeleteRecord, setPendingDeleteRecord] =
    useState<SentLeadRecord | null>(null);
  const historyRequestRef = useRef(false);
  const syncRequestRef = useRef(false);

  const canViewOtherSentHistory =
    user?.role === "super_admin" || user?.can_view_other_sent_history;
  const canViewOtherClientReplies =
    user?.role === "super_admin" || user?.can_view_other_client_replies;
  const canDeleteCampaigns = user?.role === "super_admin";

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeoutId = window.setTimeout(
      () => setToast(null),
      actionToastDurationMs,
    );
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const showToast = (kind: ActionToastState["kind"], toastMessage: string) => {
    setToast({ id: Date.now(), kind, message: toastMessage });
  };

  const setHistoryView = (nextMode: HistoryViewMode) => {
    setHistoryViewMode(nextMode);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (nextMode === "replies") {
        next.set("view", "replies");
      } else {
        next.delete("view");
      }
      return next;
    }, { replace: true });
  };

  const loadHistory = async ({ force = false } = {}) => {
    if ((historyRequestRef.current || syncRequestRef.current) && !force) {
      return false;
    }

    historyRequestRef.current = true;
    try {
      setBusy(true);
      setError("");
      const [sentResult, replyResult, schedulerResult] = await Promise.allSettled([
        api.listLeadHistorySections(),
        api.listClientReplyHistorySections(),
        api.getSchedulerStatus(),
      ]);
      if (sentResult.status !== "fulfilled") {
        throw sentResult.reason;
      }
      if (replyResult.status !== "fulfilled") {
        throw replyResult.reason;
      }
      setSentSections(
        Array.isArray(sentResult.value?.sections) ? sentResult.value.sections : [],
      );
      setReplySections(
        Array.isArray(replyResult.value?.sections) ? replyResult.value.sections : [],
      );
      if (schedulerResult.status === "fulfilled") {
        setSchedulerStatus(schedulerResult.value?.status ?? null);
      }
      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to load history.";
      setError(message);
      showToast("error", message);
      return false;
    } finally {
      historyRequestRef.current = false;
      setBusy(false);
    }
  };

  useEffect(() => {
    void loadHistory();
  }, []);

  useEffect(() => {
    const requestedMode = parseHistoryViewParam(searchParams.get("view"));
    setHistoryViewMode((currentMode) =>
      currentMode === requestedMode ? currentMode : requestedMode,
    );
  }, [searchParams]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredSentSections = useMemo(
    () =>
      sentSections
        .map((section) => ({
          ...section,
          records: section.records.filter((record) => {
            if (section.id === "others" && isSuperAdminSentRecord(record)) {
              return false;
            }
            return matchSentRecord(record, normalizedQuery);
          }),
        }))
        .filter((section) => section.records.length > 0 || !normalizedQuery),
    [normalizedQuery, sentSections],
  );
  const filteredReplySections = useMemo(
    () =>
      replySections
        .map((section) => ({
          ...section,
          records: section.records.filter((record) => {
            if (section.id === "others" && isSuperAdminReplyRecord(record)) {
              return false;
            }
            return matchReplyRecord(record, normalizedQuery);
          }),
        }))
        .filter((section) => section.records.length > 0 || !normalizedQuery),
    [normalizedQuery, replySections],
  );

  useEffect(() => {
    if (!canViewOtherSentHistory) {
      setActiveSentSectionId("self");
    }
  }, [canViewOtherSentHistory]);

  useEffect(() => {
    if (!canViewOtherClientReplies) {
      setActiveReplySectionId("self");
    }
  }, [canViewOtherClientReplies]);

  const activeSentSection =
    filteredSentSections.find((section) => section.id === activeSentSectionId) ??
    filteredSentSections[0];
  const activeReplySection =
    filteredReplySections.find((section) => section.id === activeReplySectionId) ??
    filteredReplySections[0];

  const sentTabs = canViewOtherSentHistory
    ? filteredSentSections.map((section) => ({
        id: section.id,
        label: getSectionLabel(section.id),
        count: section.records.length,
        disabled: false,
      }))
    : [
        {
          id: "self",
          label: "Self",
          count:
            filteredSentSections.find((section) => section.id === "self")?.records
              .length ?? 0,
          disabled: false,
        },
        { id: "others", label: "Other", count: 0, disabled: true },
      ];
  const replyTabs = canViewOtherClientReplies
    ? filteredReplySections.map((section) => ({
        id: section.id,
        label: getSectionLabel(section.id),
        count: section.records.length,
        disabled: false,
      }))
    : [];

  const sentSummary = filteredSentSections.flatMap((section) => section.records);
  const replySummary = filteredReplySections.flatMap((section) => section.records);
  const allSentRecords = useMemo(() => {
    const unique = new Map<string, SentLeadRecord>();
    sentSections.forEach((section) => {
      section.records.forEach((record) => {
        unique.set(record.id, record);
      });
    });
    return [...unique.values()];
  }, [sentSections]);
  const sentStatusSummary = useMemo(() => {
    return allSentRecords.reduce(
      (summary, record) => {
        const bucket = normalizeDispatchBucket(record.dispatch_status);
        summary[bucket] += 1;
        return summary;
      },
      { scheduled: 0, sending: 0, sent: 0, failed: 0 },
    );
  }, [allSentRecords]);
  const schedulerLastTick =
    schedulerStatus?.last_success_at ||
    schedulerStatus?.last_completed_at ||
    schedulerStatus?.last_started_at ||
    null;
  const schedulerHeartbeatLabel = schedulerStatus?.enabled
    ? schedulerStatus.in_flight
      ? "Tick running"
      : schedulerStatus.last_error
        ? "Attention needed"
        : "Scheduler active"
    : "Scheduler off";

  const previewRecord = useMemo(() => {
    if (!previewState) {
      return null;
    }
    if (previewState.kind === "sent") {
      return sentSections.flatMap((section) => section.records).find((record) => record.id === previewState.id) ?? null;
    }
    return replySections.flatMap((section) => section.records).find((record) => record.id === previewState.id) ?? null;
  }, [previewState, replySections, sentSections]);
  const activeSentPreview =
    previewState?.kind === "sent" ? (previewRecord as SentLeadRecord | null) : null;
  const activeReplyPreview =
    previewState?.kind === "reply" ? (previewRecord as LeadReplyHistoryRecord | null) : null;
  const scheduleResendDisabledReason =
    pendingResendRecord?.sender_mode === "gmail"
      ? "Gmail Direct resends are not available because app passwords are never stored. Create a fresh send from Workspace."
      : "";

  useEffect(() => {
    if (!activeSentPreview && !activeReplyPreview) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreviewState(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeReplyPreview, activeSentPreview]);

  const handleSyncReplies = async () => {
    if (syncRequestRef.current || historyRequestRef.current) {
      return;
    }

    syncRequestRef.current = true;
    try {
      setSyncingReplies(true);
      setError("");
      setMessage("");
      const response = await api.syncClientReplies();
      const accounts = Array.isArray(response?.result?.accounts)
        ? response.result.accounts
        : [];
      const accountErrors = accounts
        .map((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }
          const maybeItem = item as { account?: unknown; error?: unknown };
          if (
            typeof maybeItem.account === "string" &&
            typeof maybeItem.error === "string" &&
            maybeItem.error.trim()
          ) {
            return `${maybeItem.account}: ${maybeItem.error.trim()}`;
          }
          return null;
        })
        .filter(Boolean);

      if (accountErrors.length) {
        const syncErrorMessage = accountErrors.join(" | ");
        setError(syncErrorMessage);
        showToast(
          "error",
          `IMAP connection issue: ${accountErrors[0]}${accountErrors.length > 1 ? ` (+${accountErrors.length - 1} more)` : ""}`,
        );
      } else {
        setMessage(response.message);
        showToast("success", response.message);
      }
      await loadHistory({ force: true });
    } catch (err) {
      const syncMessage =
        err instanceof Error ? err.message : "Unable to sync client messages.";
      setError(syncMessage);
      showToast("error", `IMAP connection issue: ${syncMessage}`);
    } finally {
      syncRequestRef.current = false;
      setSyncingReplies(false);
    }
  };

  const handleOpenResendDialog = (record: SentLeadRecord) => {
    if (record.sender_mode === "gmail") {
      const resendError =
        "Resend is not available for Gmail Direct. Create a fresh send from Workspace.";
      setError(resendError);
      showToast("error", resendError);
      return;
    }

    setPendingResendRecord(record);
    setResendDispatchMode("now");
    setResendScheduledFor(defaultScheduledDateTimeValue());
  };

  const handleResendModeChange = (mode: "now" | "schedule") => {
    setResendDispatchMode(mode);
    if (mode === "schedule" && !resendScheduledFor) {
      setResendScheduledFor(defaultScheduledDateTimeValue());
    }
  };

  const handleConfirmResend = async () => {
    if (!pendingResendRecord) {
      return;
    }

    if (
      resendDispatchMode === "schedule" &&
      new Date(resendScheduledFor).getTime() <= Date.now()
    ) {
      const resendError = "Choose a future date and time for scheduled resend.";
      setError(resendError);
      showToast("error", resendError);
      return;
    }

    try {
      setResendingId(pendingResendRecord.id);
      setError("");
      setMessage("");
      const response = await api.resendClientLeadEmail(
        pendingResendRecord.id,
        resendDispatchMode === "schedule"
          ? {
              dispatch_mode: "schedule",
              scheduled_for: new Date(resendScheduledFor).toISOString(),
            }
          : { dispatch_mode: "now" },
      );
      setMessage(response.message);
      showToast("success", response.message);
      setPendingResendRecord(null);
      await loadHistory();
    } catch (err) {
      const resendError =
        err instanceof Error ? err.message : "Unable to resend email.";
      setError(resendError);
      showToast("error", resendError);
    } finally {
      setResendingId(null);
    }
  };

  const confirmDeleteRecord = async () => {
    if (!pendingDeleteRecord) {
      return;
    }
    if (!canDeleteCampaigns) {
      setPendingDeleteRecord(null);
      showToast("error", "Only superadmin can delete campaigns.");
      return;
    }
    try {
      setDeletingId(pendingDeleteRecord.id);
      setError("");
      setMessage("");
      const response = await api.deleteClientLeadEmail(pendingDeleteRecord.id);
      setMessage(response.message);
      if (previewState?.kind === "sent" && previewState.id === pendingDeleteRecord.id) {
        setPreviewState(null);
      }
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete email.");
    } finally {
      setPendingDeleteRecord(null);
      setDeletingId(null);
    }
  };

  const historyActionsLocked = busy || syncingReplies;

  const dock = (
    <div className="command-dock flex items-center gap-4 px-6 py-3">
      <div className="flex items-center gap-3 pr-4 md:border-r md:border-[var(--glass-line)]">
        <Search className="h-4 w-4 text-[var(--accent)]" />
        <span className="text-sm font-semibold text-[var(--muted)]">
          Transmission tools
        </span>
      </div>
      <button
        className={cn(
          "rounded-xl bg-[var(--surface-high)] px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text)] transition",
          historyActionsLocked && "cursor-not-allowed opacity-60",
        )}
        disabled={historyActionsLocked}
        onClick={() => void loadHistory()}
        type="button"
      >
        {busy ? "Refreshing" : "Refresh"}
      </button>
    </div>
  );

  const scopeLabel =
    historyViewMode === "sent"
      ? sentTabs.find((tab) => tab.id === activeSentSectionId)?.label || "Self"
      : canViewOtherClientReplies
        ? replyTabs.find((tab) => tab.id === activeReplySectionId)?.label || "Self"
        : "Self";

  return (
    <>
      <ActionToast toast={toast} />
      <ConfirmationDialog
        busy={Boolean(deletingId)}
        confirmLabel="Delete email"
        description={
          pendingDeleteRecord
            ? `"${pendingDeleteRecord.template_title}" will be hidden from users and the delete action will remain in logs.`
            : ""
        }
        onCancel={() => {
          if (!deletingId) {
            setPendingDeleteRecord(null);
          }
        }}
        onConfirm={() => void confirmDeleteRecord()}
        open={Boolean(pendingDeleteRecord && canDeleteCampaigns)}
        title={
          pendingDeleteRecord
            ? `Delete ${pendingDeleteRecord.template_title}?`
            : "Delete email?"
        }
        tone="danger"
      />
      <DispatchPlanDialog
        busy={Boolean(
          pendingResendRecord && resendingId === pendingResendRecord.id,
        )}
        description={
          pendingResendRecord
            ? `You are about to dispatch ${pendingResendRecord.template_title} again to ${pendingResendRecord.clients.map((client) => client.email).join(", ")}.`
            : ""
        }
        mode={resendDispatchMode}
        onCancel={() => {
          if (!resendingId) {
            setPendingResendRecord(null);
          }
        }}
        onConfirm={() => void handleConfirmResend()}
        onModeChange={handleResendModeChange}
        onScheduledForChange={setResendScheduledFor}
        open={Boolean(pendingResendRecord)}
        scheduleDisabledReason={scheduleResendDisabledReason}
        scheduledFor={resendScheduledFor}
        title={
          pendingResendRecord
            ? `Redispatch ${pendingResendRecord.template_title}?`
            : "Redispatch email?"
        }
      />
      <AnimatePresence>
        {activeSentPreview ? (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[120] bg-[rgba(var(--bg-rgb),0.68)] backdrop-blur-md"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={() => setPreviewState(null)}
          >
            <motion.div
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="mx-[5%] my-[2.5vh] h-[95vh] w-[90%] overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[var(--surface-strong)] shadow-[0_40px_120px_rgba(var(--shadow),0.4)]"
              exit={{ opacity: 0, scale: 0.98, y: 12 }}
              initial={{ opacity: 0, scale: 0.98, y: 18 }}
              onClick={(event) => event.stopPropagation()}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] bg-[var(--surface-high)] px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                    Sent email details
                  </p>
                  <h3 className="mt-2 truncate text-xl font-black text-[var(--text)] sm:text-2xl">
                    {activeSentPreview.template_title}
                  </h3>
                </div>
                <button
                  aria-label="Close details"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--text)] transition hover:bg-[var(--surface-lowest)]"
                  onClick={() => setPreviewState(null)}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="h-[calc(100%-5rem)] overflow-auto p-4 sm:p-6">
                <SentPreview record={activeSentPreview} />
              </div>
            </motion.div>
          </motion.div>
        ) : null}
        {activeReplyPreview ? (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[120] bg-[rgba(var(--bg-rgb),0.68)] backdrop-blur-md"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={() => setPreviewState(null)}
          >
            <motion.div
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="mx-[5%] my-[2.5vh] h-[95vh] w-[90%] overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[var(--surface-strong)] shadow-[0_40px_120px_rgba(var(--shadow),0.4)]"
              exit={{ opacity: 0, scale: 0.98, y: 12 }}
              initial={{ opacity: 0, scale: 0.98, y: 18 }}
              onClick={(event) => event.stopPropagation()}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] bg-[var(--surface-high)] px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                    Client message details
                  </p>
                  <h3 className="mt-2 truncate text-xl font-black text-[var(--text)] sm:text-2xl">
                    {activeReplyPreview.subject || "(No subject)"}
                  </h3>
                </div>
                <button
                  aria-label="Close details"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--text)] transition hover:bg-[var(--surface-lowest)]"
                  onClick={() => setPreviewState(null)}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="h-[calc(100%-5rem)] overflow-auto p-4 sm:p-6">
                <ReplyPreview record={activeReplyPreview} />
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <AppShell
        description={
          historyViewMode === "sent"
            ? "Review sent outreach without mixing inbound conversations into the same cards."
            : "Review inbound client replies and inbox messages as a separate history stream."
        }
        dock={dock}
        eyebrow="Outreach History"
        searchPlaceholder="Search history..."
        searchValue={query}
        onSearchChange={setQuery}
        title={historyViewMode === "sent" ? "Sent history" : "Client messages"}
      >
        {error ? <div className="mb-5 rounded-xl bg-[rgba(var(--danger-rgb),0.12)] px-4 py-3 text-sm leading-7 text-[var(--danger)]">{error}</div> : null}
        {message ? <div className="mb-5 rounded-xl bg-[rgba(var(--accent-rgb),0.12)] px-4 py-3 text-sm leading-7 text-[var(--accent)]">{message}</div> : null}

        <motion.section className="space-y-5" {...sectionMotion(0.04)}>
          <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="interactive-card relative overflow-hidden rounded-[2rem] bg-[linear-gradient(165deg,rgba(var(--accent-rgb),0.12),rgba(var(--secondary-rgb),0.06)_42%,var(--surface-strong)_100%)] p-6 sm:p-7">
              <div className="absolute right-[-3rem] top-[-4rem] h-36 w-36 rounded-full bg-[rgba(var(--secondary-rgb),0.12)] blur-3xl" />
              <div className="absolute bottom-[-4rem] left-[-2rem] h-40 w-40 rounded-full bg-[rgba(var(--accent-rgb),0.12)] blur-3xl" />
              <div className="relative">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[var(--accent)]">
                  {historyViewMode === "sent" ? "Outbound intelligence" : "Inbound command feed"}
                </p>
                <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                  {historyViewMode === "sent"
                    ? "Sent campaigns stay separate from client replies."
                    : "Client replies and inbox messages now live in their own archive."}
                </h2>
                <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--muted)]">
                  {historyViewMode === "sent"
                    ? "Sent history focuses on what your team dispatched, who received it, and the exact outbound package."
                    : "Client message history focuses on inbound email, and only direct replies expose the linked sent email details inside view details."}
                </p>

                <div className="mt-6 inline-flex flex-wrap gap-2 rounded-[1.4rem] border border-[rgba(var(--accent-rgb),0.14)] bg-[rgba(var(--bg-rgb),0.34)] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] backdrop-blur-xl">
                  <button
                    className={cn(
                      "inline-flex min-w-[11.5rem] items-center justify-center gap-2 rounded-[1rem] px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.18em] transition",
                      historyViewMode === "sent"
                        ? "bg-[linear-gradient(135deg,rgba(var(--accent-rgb),0.28),rgba(var(--accent-rgb),0.12))] text-[var(--accent)] shadow-[0_16px_32px_rgba(var(--shadow),0.18),0_0_0_1px_rgba(var(--accent-rgb),0.32)]"
                        : "bg-[rgba(var(--surface-high-rgb,17,24,39),0.42)] text-[var(--muted)] hover:bg-[rgba(var(--accent-rgb),0.08)] hover:text-[var(--text)]",
                    )}
                    onClick={() => setHistoryView("sent")}
                    type="button"
                  >
                    <Mail className="h-4 w-4" />
                    Email sent
                  </button>
                  <button
                    className={cn(
                      "inline-flex min-w-[11.5rem] items-center justify-center gap-2 rounded-[1rem] px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.18em] transition",
                      historyViewMode === "replies"
                        ? "bg-[linear-gradient(135deg,rgba(var(--secondary-rgb),0.24),rgba(var(--accent-rgb),0.1))] text-[var(--secondary)] shadow-[0_16px_32px_rgba(var(--shadow),0.18),0_0_0_1px_rgba(var(--secondary-rgb),0.28)]"
                        : "bg-[rgba(var(--surface-high-rgb,17,24,39),0.42)] text-[var(--muted)] hover:bg-[rgba(var(--secondary-rgb),0.08)] hover:text-[var(--text)]",
                    )}
                    onClick={() => setHistoryView("replies")}
                    type="button"
                  >
                    <Reply className="h-4 w-4" />
                    Client reply
                  </button>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[1.5rem] bg-[rgba(var(--bg-rgb),0.26)] px-4 py-4 backdrop-blur-xl">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--soft)]">Current scope</p>
                    <p className="mt-2 text-2xl font-black text-[var(--text)]">{scopeLabel}</p>
                  </div>
                  {historyViewMode === "sent" ? (
                    <>
                      <div className="rounded-[1.5rem] bg-[rgba(var(--bg-rgb),0.26)] px-4 py-4 backdrop-blur-xl">
                        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--soft)]">Campaigns</p>
                        <p className="mt-2 text-2xl font-black text-[var(--text)]">{sentSummary.length}</p>
                      </div>
                      <div className="rounded-[1.5rem] bg-[rgba(var(--bg-rgb),0.26)] px-4 py-4 backdrop-blur-xl">
                        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--soft)]">Recipients</p>
                        <p className="mt-2 text-2xl font-black text-[var(--text)]">{sentSummary.reduce((sum, record) => sum + record.clients.length, 0)}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="rounded-[1.5rem] bg-[rgba(var(--bg-rgb),0.26)] px-4 py-4 backdrop-blur-xl">
                        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--soft)]">Messages</p>
                        <p className="mt-2 text-2xl font-black text-[var(--text)]">{replySummary.length}</p>
                      </div>
                      <div className="rounded-[1.5rem] bg-[rgba(var(--bg-rgb),0.26)] px-4 py-4 backdrop-blur-xl">
                        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--soft)]">Reply / Inbox</p>
                        <p className="mt-2 text-2xl font-black text-[var(--text)]">{replySummary.filter((item) => item.message_kind === "reply").length}/{replySummary.filter((item) => item.message_kind !== "reply").length}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="surface-panel rounded-[2rem] p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                    Live controls
                  </p>
                  <h3 className="mt-3 text-2xl font-black tracking-tight text-[var(--text)]">
                    {historyViewMode === "sent"
                      ? "Campaign archive"
                      : "Client message archive"}
                  </h3>
                </div>
                <div className="grid h-12 w-12 place-items-center rounded-2xl border border-[var(--line)] bg-[var(--surface-high)] text-[var(--accent)]">
                  {historyViewMode === "sent" ? (
                    <Mail className="h-5 w-5" />
                  ) : (
                    <Inbox className="h-5 w-5" />
                  )}
                </div>
              </div>

              <div className="mt-6 space-y-4">
                {historyViewMode === "sent" ? (
                  <div className="inline-flex flex-wrap gap-2 rounded-[1.2rem] border border-[var(--line)] bg-[rgba(var(--bg-rgb),0.26)] p-2">
                    {sentTabs.map((tab) => (
                      <button
                        className={cn(
                          "inline-flex min-w-[8rem] items-center justify-center gap-2 rounded-[0.95rem] px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.18em] transition",
                          tab.disabled
                            ? "cursor-not-allowed text-[var(--soft)] opacity-50"
                            : activeSentSectionId === tab.id
                              ? "bg-[linear-gradient(135deg,rgba(var(--accent-rgb),0.22),rgba(var(--accent-rgb),0.08))] text-[var(--accent)] shadow-[0_10px_24px_rgba(var(--shadow),0.16),0_0_0_1px_rgba(var(--accent-rgb),0.35)]"
                              : "bg-[rgba(var(--surface-high-rgb,17,24,39),0.36)] text-[var(--muted)] hover:bg-[rgba(var(--accent-rgb),0.08)] hover:text-[var(--text)]",
                        )}
                        disabled={tab.disabled}
                        key={tab.id}
                        onClick={() => setActiveSentSectionId(tab.id)}
                        type="button"
                      >
                        {activeSentSectionId === tab.id ? (
                          <Sparkles className="h-3.5 w-3.5" />
                        ) : null}
                        {tab.label} ({tab.count})
                      </button>
                    ))}
                  </div>
                ) : replyTabs.length ? (
                  <div className="inline-flex flex-wrap gap-2 rounded-[1.2rem] border border-[var(--line)] bg-[rgba(var(--bg-rgb),0.26)] p-2">
                    {replyTabs.map((tab) => (
                      <button
                        className={cn(
                          "inline-flex min-w-[8rem] items-center justify-center gap-2 rounded-[0.95rem] px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.18em] transition",
                          activeReplySectionId === tab.id
                            ? "bg-[linear-gradient(135deg,rgba(var(--secondary-rgb),0.22),rgba(var(--accent-rgb),0.08))] text-[var(--secondary)] shadow-[0_10px_24px_rgba(var(--shadow),0.16),0_0_0_1px_rgba(var(--secondary-rgb),0.35)]"
                            : "bg-[rgba(var(--surface-high-rgb,17,24,39),0.36)] text-[var(--muted)] hover:bg-[rgba(var(--secondary-rgb),0.08)] hover:text-[var(--text)]",
                        )}
                        key={tab.id}
                        onClick={() => setActiveReplySectionId(tab.id)}
                        type="button"
                      >
                        {activeReplySectionId === tab.id ? (
                          <Sparkles className="h-3.5 w-3.5" />
                        ) : null}
                        {tab.label} ({tab.count})
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--muted)]">
                    Only your own client replies and inbox messages are visible.
                  </p>
                )}

                <div className="flex flex-wrap gap-3">
                  <button
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface-high)] px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text)] transition hover:border-[rgba(var(--accent-rgb),0.35)] hover:text-[var(--accent)]",
                      historyActionsLocked && "cursor-not-allowed opacity-60 hover:border-[var(--line)] hover:text-[var(--text)]",
                    )}
                    disabled={historyActionsLocked}
                    onClick={() => void loadHistory()}
                    type="button"
                  >
                    <RefreshCw
                      className={cn("h-4 w-4", busy && "animate-spin")}
                    />
                    {busy ? "Refreshing" : "Refresh records"}
                  </button>
                  <button
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border border-[rgba(var(--accent-rgb),0.28)] bg-[rgba(var(--accent-rgb),0.1)] px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--accent)] transition hover:bg-[rgba(var(--accent-rgb),0.16)]",
                      historyActionsLocked && "cursor-not-allowed opacity-60 hover:bg-[rgba(var(--accent-rgb),0.1)]",
                    )}
                    disabled={historyActionsLocked}
                    onClick={() => void handleSyncReplies()}
                    type="button"
                  >
                    <Reply className={cn("h-4 w-4", syncingReplies && "animate-spin")} />
                    {syncingReplies ? "Syncing inbox" : "Sync inbox"}
                  </button>
                </div>

                {historyViewMode === "sent" ? (
                  <div className="grid gap-3 pt-2 sm:grid-cols-2">
                    <div className="min-h-[8.75rem] overflow-hidden rounded-[1.45rem] border border-[rgba(255,190,92,0.12)] bg-[linear-gradient(155deg,rgba(255,190,92,0.12),rgba(var(--bg-rgb),0.18)_72%)] px-4 py-4 shadow-[0_18px_32px_rgba(var(--shadow),0.12)]">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--soft)]">
                        Scheduled
                      </p>
                      <p className="mt-2 text-3xl font-black text-[#ffbe5c]">
                        {sentStatusSummary.scheduled}
                      </p>
                      <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
                        Waiting queue
                      </p>
                    </div>
                    <div className="min-h-[8.75rem] overflow-hidden rounded-[1.45rem] border border-[rgba(var(--accent-rgb),0.14)] bg-[linear-gradient(155deg,rgba(var(--accent-rgb),0.12),rgba(var(--bg-rgb),0.18)_72%)] px-4 py-4 shadow-[0_18px_32px_rgba(var(--shadow),0.12)]">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--soft)]">
                        Processing
                      </p>
                      <p className="mt-2 text-3xl font-black text-[var(--accent)]">
                        {sentStatusSummary.sending}
                      </p>
                      <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
                        In flight
                      </p>
                    </div>
                    <div className="min-h-[8.75rem] overflow-hidden rounded-[1.45rem] border border-[rgba(var(--secondary-rgb),0.16)] bg-[linear-gradient(155deg,rgba(var(--secondary-rgb),0.14),rgba(var(--bg-rgb),0.18)_72%)] px-4 py-4 shadow-[0_18px_32px_rgba(var(--shadow),0.12)]">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--soft)]">
                        Sent
                      </p>
                      <p className="mt-2 text-3xl font-black text-[var(--secondary)]">
                        {sentStatusSummary.sent}
                      </p>
                      <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
                        Delivered archive
                      </p>
                    </div>
                    <div className="min-h-[8.75rem] overflow-hidden rounded-[1.45rem] border border-[rgba(255,124,153,0.16)] bg-[linear-gradient(155deg,rgba(255,124,153,0.12),rgba(var(--bg-rgb),0.18)_72%)] px-4 py-4 shadow-[0_18px_32px_rgba(var(--shadow),0.12)]">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--soft)]">
                        Failed
                      </p>
                      <p className="mt-2 text-3xl font-black text-[var(--danger)]">
                        {sentStatusSummary.failed}
                      </p>
                      <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
                        Needs review
                      </p>
                    </div>
                    <div className="overflow-hidden rounded-[1.6rem] border border-[var(--line)] bg-[linear-gradient(140deg,rgba(var(--accent-rgb),0.08),rgba(var(--secondary-rgb),0.06)_42%,rgba(var(--bg-rgb),0.24)_100%)] px-4 py-4 shadow-[0_24px_44px_rgba(var(--shadow),0.14)] sm:col-span-2">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--soft)]">
                        Last scheduler tick
                      </p>
                      <div className="mt-3 flex flex-col gap-4">
                        <div className="space-y-2">
                          <p className="text-base font-black leading-tight text-[var(--text)] sm:text-[1.1rem]">
                            {schedulerLastTick
                              ? formatDateTime(schedulerLastTick)
                              : "No tick yet"}
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-[rgba(var(--accent-rgb),0.24)] bg-[rgba(var(--bg-rgb),0.38)] px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--accent)]">
                              {schedulerStatus?.in_flight ? "Running" : "Healthy"}
                            </span>
                            <p className="text-sm text-[var(--muted)]">
                              {schedulerLastTick
                                ? `${relativeTime(schedulerLastTick)} | ${schedulerHeartbeatLabel}`
                                : schedulerHeartbeatLabel}
                            </p>
                          </div>
                        </div>
                      <p className="hidden mt-1 text-xs text-[var(--muted)]">
                        {schedulerLastTick
                          ? `${relativeTime(schedulerLastTick)} • ${schedulerHeartbeatLabel}`
                          : schedulerHeartbeatLabel}
                      </p>
                      <div className="grid grid-cols-2 gap-3 2xl:grid-cols-3">
                        <div className="rounded-[1.15rem] border border-[rgba(var(--line-rgb),0.8)] bg-[rgba(var(--bg-rgb),0.22)] px-3 py-3">
                          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--soft)]">
                            Interval
                          </p>
                          <p className="mt-2 text-sm font-black text-[var(--text)]">
                            {schedulerStatus?.interval_seconds
                              ? `${schedulerStatus.interval_seconds}s`
                              : "Default"}
                          </p>
                        </div>
                        <div className="rounded-[1.15rem] border border-[rgba(var(--line-rgb),0.8)] bg-[rgba(var(--bg-rgb),0.22)] px-3 py-3">
                          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--soft)]">
                            Last duration
                          </p>
                          <p className="mt-2 text-sm font-black text-[var(--text)]">
                            {schedulerStatus?.last_duration_ms
                              ? `${Math.max(1, Math.round(schedulerStatus.last_duration_ms / 1000))}s`
                              : "-"}
                          </p>
                        </div>
                        <div className="col-span-2 rounded-[1.15rem] border border-[rgba(var(--line-rgb),0.8)] bg-[rgba(var(--bg-rgb),0.22)] px-3 py-3 2xl:col-span-1">
                          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--soft)]">
                            Campaigns processed
                          </p>
                          <p className="mt-2 text-sm font-black text-[var(--text)]">
                            {schedulerStatus?.last_result?.campaignProcessed ?? 0}
                          </p>
                        </div>
                      </div>
                    </div>
                      {schedulerStatus?.last_error ? (
                        <p className="mt-2 text-xs leading-6 text-[var(--danger)]">
                          {schedulerStatus.last_error}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </motion.section>
        {busy ? (
          <div className="surface-panel mt-5 rounded-[2rem] p-6 text-sm text-[var(--muted)]">
            Loading history...
          </div>
        ) : null}

        {!busy && historyViewMode === "sent" ? (
          <motion.section className="mt-5 space-y-5" {...sectionMotion(0.08)}>
            {(activeSentSection?.records ?? []).length === 0 ? (
              <div className="surface-panel rounded-[2rem] p-6 text-sm text-[var(--muted)]">
                No sent campaigns found in this section.
              </div>
            ) : (
              <>
                <div className="grid gap-5 xl:grid-cols-2">
                  {(activeSentSection?.records ?? []).map((record, index) => (
                    <motion.article
                      className="interactive-card rounded-[2rem] border border-[var(--line)] bg-[var(--surface-strong)] p-5 shadow-[0_24px_50px_rgba(var(--shadow),0.12)]"
                      key={record.id}
                      {...sectionMotion(0.12 + index * 0.03)}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                            {activeSentSectionId === "others" ? "Other history" : "Self history"}
                          </p>
                          <h3 className="mt-3 text-3xl font-black tracking-tight text-[var(--text)]">
                            {record.template_title}
                          </h3>
                          <p className="mt-2 text-sm text-[var(--muted)]">
                            Sent by {record.created_by} to {countLabel(record.clients.length, "client")}.
                          </p>
                        </div>
                        <StatusPill label={getDispatchLabel(record.dispatch_status)} tone={getDispatchTone(record.dispatch_status)} />
                      </div>

                      <div className="mt-5 grid gap-4 sm:grid-cols-2">
                        <div className="rounded-[1.4rem] bg-[var(--surface-lowest)] p-4">
                          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">Sent at</p>
                          <p className="mt-3 text-2xl font-black text-[var(--text)]">{formatDateTime(record.last_sent_at)}</p>
                          <p className="mt-2 text-sm text-[var(--muted)]">{relativeTime(record.last_sent_at)}</p>
                        </div>
                        <div className="rounded-[1.4rem] bg-[var(--surface-lowest)] p-4">
                          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">Routing</p>
                          <p className="mt-3 break-all text-sm font-bold text-[var(--text)]">From {record.from_email}</p>
                          <p className="mt-2 text-sm text-[var(--muted)]">{record.clients.map((client) => client.email).join(", ")}</p>
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2">
                        <StatusPill label={getSenderModeLabel(record.sender_mode)} tone={getSenderModeTone(record.sender_mode)} />
                        <StatusPill label={record.delivery_mode} tone="muted" />
                        <StatusPill label={countLabel(record.email_attachments.length, "attachment")} tone="muted" />
                      </div>

                      <div className="mt-6 flex flex-wrap gap-3 border-t border-[var(--line)] pt-5">
                        <button className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-lowest)] px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text)] transition hover:bg-[var(--surface-high)]" onClick={() => setPreviewState({ kind: "sent", id: record.id })} type="button">
                          <Eye className="h-4 w-4" />
                          View
                        </button>
                        {activeSentSection?.allow_resend ? (
                          <button className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-5 py-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#052113] transition hover:brightness-105 disabled:cursor-wait disabled:opacity-70" disabled={resendingId === record.id} onClick={() => handleOpenResendDialog(record)} type="button">
                            <Send className="h-4 w-4" />
                            {resendingId === record.id ? "Processing" : "Resend email"}
                          </button>
                        ) : null}
                        {canDeleteCampaigns ? (
                          <button className="inline-flex items-center gap-2 rounded-full px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--danger)] transition hover:bg-[rgba(var(--danger-rgb),0.08)]" onClick={() => setPendingDeleteRecord(record)} type="button">
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </motion.article>
                  ))}
                </div>

              </>
            )}
          </motion.section>
        ) : null}

        {!busy && historyViewMode === "replies" ? (
          <motion.section className="mt-5 space-y-5" {...sectionMotion(0.08)}>
            {(activeReplySection?.records ?? []).length === 0 ? (
              <div className="surface-panel rounded-[2rem] p-6 text-sm text-[var(--muted)]">
                No client replies or inbox messages found in this section.
              </div>
            ) : (
              <>
                <div className="grid gap-5 xl:grid-cols-2">
                  {(activeReplySection?.records ?? []).map((record, index) => (
                    <motion.article className="interactive-card rounded-[2rem] border border-[var(--line)] bg-[var(--surface-strong)] p-5 shadow-[0_24px_50px_rgba(var(--shadow),0.12)]" key={record.id} {...sectionMotion(0.12 + index * 0.03)}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">{activeReplySectionId === "others" ? "Other client messages" : "Self client messages"}</p>
                          <h3 className="mt-3 text-2xl font-black tracking-tight text-[var(--text)]">{record.subject || "(No subject)"}</h3>
                          <p className="mt-2 text-sm text-[var(--muted)]">{record.client_name || record.from_email}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <StatusPill label={record.message_kind === "reply" ? "Reply" : "Inbox"} tone={record.message_kind === "reply" ? "secondary" : "accent"} />
                          <StatusPill label={getSenderModeLabel(record.campaign_sender_mode)} tone={getSenderModeTone(record.campaign_sender_mode)} />
                        </div>
                      </div>

                      <div className="mt-5 grid gap-4 sm:grid-cols-2">
                        <div className="rounded-[1.4rem] bg-[var(--surface-lowest)] p-4">
                          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">Received</p>
                          <p className="mt-3 text-2xl font-black text-[var(--text)]">{formatDateTime(record.received_at)}</p>
                          <p className="mt-2 text-sm text-[var(--muted)]">{relativeTime(record.received_at)}</p>
                        </div>
                        <div className="rounded-[1.4rem] bg-[var(--surface-lowest)] p-4">
                          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">Routing</p>
                          <p className="mt-3 break-all text-sm font-bold text-[var(--text)]">From {record.from_email}</p>
                          <p className="mt-2 break-all text-sm text-[var(--muted)]">To {record.to_email || record.campaign_from_email || "-"}</p>
                        </div>
                      </div>

                      <div className="mt-5 rounded-[1.4rem] bg-[var(--surface-lowest)] p-4">
                        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">Preview</p>
                        <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{compactText(record.preview_text || record.body_text, 240) || "No preview text available."}</p>
                        {record.attachments?.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {record.attachments.map((attachment) => (
                              <a className="inline-flex items-center gap-2 rounded-full bg-[var(--surface)] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--accent)]" href={replyAttachmentUrl(record.id, attachment.filename)} key={`${record.id}-${attachment.filename}`} rel="noreferrer" target="_blank">
                                <Paperclip className="h-3.5 w-3.5" />
                                {attachment.filename}
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-6 flex flex-wrap gap-3 border-t border-[var(--line)] pt-5">
                        <button className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-lowest)] px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text)] transition hover:bg-[var(--surface-high)]" onClick={() => setPreviewState({ kind: "reply", id: record.id })} type="button">
                          <Eye className="h-4 w-4" />
                          View details
                        </button>
                      </div>
                    </motion.article>
                  ))}
                </div>

              </>
            )}
          </motion.section>
        ) : null}
      </AppShell>
    </>
  );
}
