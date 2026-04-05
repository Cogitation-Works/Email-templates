import { CheckCircle2, Eye, Mail, RotateCw } from "lucide-react";
import { useState } from "react";

import { StatusPill } from "@/components/StatusPill";
import { compactText, formatDateTime, relativeTime } from "@/lib/utils";
import type { SentLeadRecord } from "@/types";

export function HistoryCard({
  record,
  allowResend,
  onResend,
  busy,
}: {
  record: SentLeadRecord;
  allowResend: boolean;
  onResend?: (recordId: string) => void;
  busy?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const deliveryResults = record.delivery_results ?? [];
  const emailPreviews = record.emails ?? [];
  const clients = record.clients ?? [];
  const emailAttachments = record.email_attachments ?? [];
  const personalAttachments = record.personal_attachments ?? [];
  const deliveredCount = deliveryResults.filter(
    (item) => item.delivered,
  ).length;
  const senderName = record.created_by?.trim() || "Unknown sender";

  return (
    <article className="surface-panel interactive-card overflow-hidden rounded-2xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-[rgba(var(--accent-rgb),0.12)] text-xs font-black text-[var(--accent)]">
            {senderName.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
              {allowResend ? "Self history" : `Sent by ${senderName}`}
            </p>
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              {relativeTime(record.last_sent_at)}
            </p>
          </div>
        </div>
        <StatusPill
          label={
            deliveredCount === deliveryResults.length
              ? "Delivered"
              : deliveredCount === 0
                ? "Bounced"
                : "Opened log"
          }
          tone={
            deliveredCount === deliveryResults.length
              ? "success"
              : deliveredCount === 0
                ? "danger"
                : "secondary"
          }
        />
      </div>

      <h3 className="mt-5 text-xl font-black tracking-tight">
        {record.template_title}
      </h3>
      <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
        {compactText(
          emailPreviews[0]?.text_body ?? record.email_details_paragraph ?? "",
          180,
        )}
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <StatusPill label={`From ${record.from_email}`} />
        <StatusPill label={`${clients.length} contact(s)`} tone="secondary" />
        <StatusPill label={record.created_by_role} />
        {record.dispatch_status === "scheduled" ? (
          <StatusPill label="Scheduled" tone="secondary" />
        ) : (
          <StatusPill label="Sent" tone="success" />
        )}
      </div>

      {record.scheduled_for ? (
        <p className="mt-3 text-xs text-[var(--soft)]">
          Scheduled at {formatDateTime(record.scheduled_for)}
        </p>
      ) : null}

      <div className="mt-5 rounded-2xl bg-[var(--surface-muted)] p-4">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
          Recipients
        </p>
        <div className="mt-4 space-y-3">
          {clients.map((client) => (
            <div
              className="flex items-center justify-between gap-4 rounded-xl bg-[var(--surface-lowest)] px-4 py-3"
              key={`${record.id}-${client.email}`}
            >
              <div>
                <p className="text-sm font-bold text-[var(--text)]">
                  {client.name}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {client.email}
                  {client.phone ? ` • ${client.phone}` : ""}
                </p>
              </div>
              <Mail className="h-4 w-4 text-[var(--soft)]" />
            </div>
          ))}
        </div>
      </div>

      {record.personal_use_paragraph ? (
        <div className="mt-4 rounded-2xl bg-[var(--surface-muted)] p-4">
          <p className="font-label text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
            Internal note
          </p>
          <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
            {record.personal_use_paragraph}
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {emailAttachments.map((attachment) => (
          <StatusPill
            key={`${record.id}-${attachment.filename}`}
            label={attachment.filename}
            tone="accent"
          />
        ))}
        {personalAttachments.map((attachment) => (
          <StatusPill
            key={`${record.id}-personal-${attachment.filename}`}
            label={`Internal ${attachment.filename}`}
            tone="secondary"
          />
        ))}
      </div>

      {expanded ? (
        <div className="mt-5 space-y-4 rounded-2xl bg-[var(--surface-muted)] p-4">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
              Delivery status
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {deliveryResults.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">
                  No delivery records yet.
                </p>
              ) : (
                deliveryResults.map((item) => (
                  <div
                    className="rounded-xl bg-[var(--surface-lowest)] p-3"
                    key={`${record.id}-${item.recipient_email}`}
                  >
                    <p className="text-sm font-bold text-[var(--text)]">
                      {item.recipient_name}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {item.recipient_email}
                    </p>
                    <p className="mt-2 text-xs text-[var(--soft)]">
                      {item.message}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
              Internal notes
            </p>
            <p className="mt-2 rounded-xl bg-[var(--surface-lowest)] p-3 text-sm text-[var(--muted)]">
              {record.personal_use_paragraph || "No internal note attached."}
            </p>
          </div>

          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
              Preview body
            </p>
            <div className="mt-2 max-h-64 overflow-auto rounded-xl bg-[var(--surface-lowest)] p-3 text-sm leading-7 text-[var(--muted)]">
              {emailPreviews[0]?.text_body || "No email body stored."}
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-4 border-t border-[var(--line)] pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <CheckCircle2 className="h-4 w-4 text-[var(--accent)]" />
          <span>
            Resent {record.resend_count} time(s) •{" "}
            {formatDateTime(record.last_sent_at)}
          </span>
        </div>
        {allowResend ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--surface-lowest)] px-5 py-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text)] transition hover:-translate-y-0.5"
              onClick={() => setExpanded((current) => !current)}
              type="button"
            >
              <Eye className="h-4 w-4" />
              <span>{expanded ? "Hide details" : "View details"}</span>
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--surface-lowest)] px-5 py-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={busy}
              onClick={() => onResend?.(record.id)}
              type="button"
            >
              <RotateCw className={busy ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              <span>{busy ? "Resending" : "Resend email"}</span>
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}
