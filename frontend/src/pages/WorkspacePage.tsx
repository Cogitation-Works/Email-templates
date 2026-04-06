import { motion } from "framer-motion";
import {
  BriefcaseBusiness,
  CheckCircle2,
  CircleHelp,
  Mail,
  Paperclip,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "../api/client";
import {
  ActionToast,
  actionToastDurationMs,
  type ActionToastState,
} from "../components/ActionToast";
import { AppShell } from "../components/AppShell";
import { ConfirmationDialog } from "../components/ConfirmationDialog";
import { Field } from "../components/Field";
import { FileInput } from "../components/FileInput";
import {
  formatScheduledDateTime,
  SchedulePicker,
} from "../components/SchedulePicker";
import { StatusPill } from "../components/StatusPill";
import { useAuth } from "../context/AuthContext";
import { cn } from "../lib/utils";
import type {
  LeadPreviewResponse,
  LeadSenderMode,
  TemplateVariant,
} from "../types";

function blankClient() {
  return { name: "", email: "", phone: "" };
}

function normalizeEmail(value: string) {
  return String(value || "").trim().toLowerCase();
}

const DEFAULT_OUTGOING_ATTACHMENTS_ENABLED_KEY =
  "cw.workspace.default-outgoing-attachments-enabled";
const DEFAULT_OUTGOING_ATTACHMENTS_KEY =
  "cw.workspace.default-outgoing-attachments";

type StoredOutgoingAttachment = {
  name: string;
  type: string;
  lastModified: number;
  dataUrl: string;
};

async function fileToStoredOutgoingAttachment(
  file: File,
): Promise<StoredOutgoingAttachment> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Read failed."));
    reader.readAsDataURL(file);
  });

  return {
    name: file.name,
    type: file.type,
    lastModified: file.lastModified,
    dataUrl,
  };
}

async function storedOutgoingAttachmentToFile(
  stored: StoredOutgoingAttachment,
): Promise<File> {
  const blob = await fetch(stored.dataUrl).then((response) => response.blob());
  return new File([blob], stored.name, {
    type: stored.type,
    lastModified: stored.lastModified,
  });
}

function sectionMotion(delay: number) {
  return {
    initial: { opacity: 0, y: 22 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.2 },
    transition: { duration: 0.45, delay, ease: "easeOut" as const },
  };
}

const TECHNOLOGY_OPTIONS = [
  "Website Design",
  "Website Development",
  "Website Hosting",
  "Cloud Hosting Setup",
  "Server Setup and Hardening",
  "Domain Registration",
  "Domain and DNS Configuration",
  "Business Email Setup",
  "SSL Certificate Setup",
  "Website Migration",
  "E-commerce Development",
  "Mobile App Development",
  "UI/UX Design",
  "Logo Design",
  "Brand Identity",
  "SEO Optimization",
  "Content Writing",
  "Social Media Content",
  "Video Editing",
  "Motion Graphics",
  "Product Brochure Design",
  "Pitch Deck Design",
  "CRM Integration",
  "Marketing Automation",
  "Analytics Setup",
  "Maintenance and Support",
];

export function WorkspacePage() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<TemplateVariant[]>([]);
  const [senderMode, setSenderMode] = useState<LeadSenderMode>("gmail");
  const [gmailAddress, setGmailAddress] = useState("");
  const [gmailAppPassword, setGmailAppPassword] = useState("");
  const [deliveryMode, setDeliveryMode] = useState<"single" | "multiple">(
    "single",
  );
  const [clients, setClients] = useState([blankClient()]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedTechnologies, setSelectedTechnologies] = useState<string[]>(
    [],
  );
  const [emailDetailsParagraph, setEmailDetailsParagraph] = useState("");
  const [includeOutboundParagraph, setIncludeOutboundParagraph] =
    useState(false);
  const [personalUseParagraph, setPersonalUseParagraph] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [preview, setPreview] = useState<LeadPreviewResponse | null>(null);
  const [emailAttachments, setEmailAttachments] = useState<File[]>([]);
  const [personalAttachments, setPersonalAttachments] = useState<File[]>([]);
  const [
    defaultOutgoingAttachmentsEnabled,
    setDefaultOutgoingAttachmentsEnabled,
  ] = useState(false);
  const [defaultOutgoingAttachments, setDefaultOutgoingAttachments] = useState<
    File[]
  >([]);
  const [attachmentsHydrated, setAttachmentsHydrated] = useState(false);
  const [busyAction, setBusyAction] = useState<
    "loading" | "preview" | "send" | null
  >("loading");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const [pendingDuplicateRecipients, setPendingDuplicateRecipients] = useState<
    string[] | null
  >(null);
  const [previewViewport, setPreviewViewport] = useState<"mobile" | "tab">(
    "tab",
  );
  const clientEmailInputRefs = useRef<Array<HTMLInputElement | null>>([]);

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

  useEffect(() => {
    const storedEnabled = window.localStorage.getItem(
      DEFAULT_OUTGOING_ATTACHMENTS_ENABLED_KEY,
    );
    const storedAttachments = window.localStorage.getItem(
      DEFAULT_OUTGOING_ATTACHMENTS_KEY,
    );

    setDefaultOutgoingAttachmentsEnabled(storedEnabled === "true");

    const loadAttachments = async () => {
      if (!storedAttachments) {
        setAttachmentsHydrated(true);
        return;
      }

      try {
        const parsed = JSON.parse(
          storedAttachments,
        ) as StoredOutgoingAttachment[];
        const files = await Promise.all(
          parsed.map((item) => storedOutgoingAttachmentToFile(item)),
        );
        setDefaultOutgoingAttachments(files);
      } catch {
        window.localStorage.removeItem(DEFAULT_OUTGOING_ATTACHMENTS_KEY);
      } finally {
        setAttachmentsHydrated(true);
      }
    };

    void loadAttachments();
  }, []);

  useEffect(() => {
    if (!attachmentsHydrated) {
      return;
    }

    window.localStorage.setItem(
      DEFAULT_OUTGOING_ATTACHMENTS_ENABLED_KEY,
      String(defaultOutgoingAttachmentsEnabled),
    );
  }, [attachmentsHydrated, defaultOutgoingAttachmentsEnabled]);

  useEffect(() => {
    if (!attachmentsHydrated) {
      return;
    }

    const saveAttachments = async () => {
      try {
        const stored = await Promise.all(
          defaultOutgoingAttachments.map((file) =>
            fileToStoredOutgoingAttachment(file),
          ),
        );
        window.localStorage.setItem(
          DEFAULT_OUTGOING_ATTACHMENTS_KEY,
          JSON.stringify(stored),
        );
      } catch {
        window.localStorage.removeItem(DEFAULT_OUTGOING_ATTACHMENTS_KEY);
      }
    };

    void saveAttachments();
  }, [attachmentsHydrated, defaultOutgoingAttachments]);

  useEffect(() => {
    const load = async () => {
      try {
        setBusyAction("loading");
        const catalog = await api.listClientLeadTemplates();
        const safeVariants = Array.isArray(catalog?.variants)
          ? catalog.variants
          : [];
        setTemplates(safeVariants);
        setSelectedTemplateId(
          (current) => current || safeVariants[0]?.id || "",
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load the workspace.";
        setError(message);
        showToast("error", message);
      } finally {
        setBusyAction(null);
      }
    };

    void load();
  }, []);

  const senderOptions = [
    {
      id: "gmail" as const,
      title: "Gmail Direct",
      subtitle: "Normal Gmail + app password",
      description:
        "For normal Gmail (@gmail.com), provide Gmail address and app password for delivery.",
      enabled: true,
      icon: Mail,
      tone: "accent",
    },
    {
      id: "sales" as const,
      title: "Sales Zoho",
      subtitle: "Enterprise sales unit",
      description:
        "Uses the shared sales sender provisioned by super admin access.",
      enabled: Boolean(
        user?.can_use_sales_sender || user?.role === "super_admin",
      ),
      icon: BriefcaseBusiness,
      tone: "secondary",
    },
    {
      id: "admin" as const,
      title: "Admin Zoho",
      subtitle: "Administrative tier",
      description:
        "Uses the administrative sender account when this permission is granted.",
      enabled: Boolean(
        user?.can_use_admin_sender || user?.role === "super_admin",
      ),
      icon: ShieldCheck,
      tone: "accent",
    },
  ];

  useEffect(() => {
    if (
      (senderMode === "sales" &&
        !senderOptions.find((item) => item.id === "sales")?.enabled) ||
      (senderMode === "admin" &&
        !senderOptions.find((item) => item.id === "admin")?.enabled)
    ) {
      setSenderMode("gmail");
    }
  }, [senderMode, senderOptions]);

  useEffect(() => {
    if (senderMode === "gmail") {
      setGmailAddress("");
      setGmailAppPassword("");
      setScheduledFor("");

      // Some browsers/password managers autofill after initial paint.
      const timeoutA = window.setTimeout(() => {
        setGmailAddress("");
        setGmailAppPassword("");
      }, 60);
      const timeoutB = window.setTimeout(() => {
        setGmailAddress("");
        setGmailAppPassword("");
      }, 300);

      return () => {
        window.clearTimeout(timeoutA);
        window.clearTimeout(timeoutB);
      };
    }
  }, [senderMode]);

  const combinedOutgoingAttachments = useMemo(() => {
    const attachments = defaultOutgoingAttachmentsEnabled
      ? [...defaultOutgoingAttachments, ...emailAttachments]
      : emailAttachments;

    const seen = new Set<string>();
    return attachments.filter((file) => {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, [
    defaultOutgoingAttachmentsEnabled,
    defaultOutgoingAttachments,
    emailAttachments,
  ]);

  const previewPayload = useMemo(
    () => ({
      sender_mode: senderMode,
      custom_sender_email:
        senderMode === "gmail" ? gmailAddress.trim() : undefined,
      custom_sender_app_password:
        senderMode === "gmail"
          ? gmailAppPassword.replace(/\s+/g, "").trim()
          : undefined,
      content_type: "client_lead" as const,
      delivery_mode: deliveryMode,
      selected_template_id: selectedTemplateId || undefined,
      technologies: selectedTechnologies,
      email_details_paragraph:
        includeOutboundParagraph && emailDetailsParagraph.trim()
          ? emailDetailsParagraph.trim()
          : undefined,
      scheduled_for: scheduledFor
        ? new Date(scheduledFor).toISOString()
        : undefined,
      clients: clients.map((client) => ({
        name: client.name.trim(),
        email: client.email.trim(),
        phone: client.phone.trim() || undefined,
      })),
    }),
    [
      senderMode,
      gmailAddress,
      gmailAppPassword,
      deliveryMode,
      selectedTemplateId,
      selectedTechnologies,
      emailDetailsParagraph,
      includeOutboundParagraph,
      scheduledFor,
      clients,
    ],
  );

  const previewVariants = preview?.variants ?? [];
  const activeVariant =
    previewVariants.find(
      (variant) => variant.template.id === selectedTemplateId,
    ) ?? previewVariants[0];
  const previewEmail = activeVariant?.previews[0];
  const previewViewportClass =
    previewViewport === "mobile" ? "max-w-[390px]" : "w-full max-w-[720px]";
  const previewViewportFrameClass =
    previewViewport === "mobile" ? "max-h-[36rem] p-4" : "max-h-[52rem] p-0";

  const validateBeforeSubmit = () => {
    if (senderMode === "gmail" && !gmailAddress.trim()) {
      throw new Error("Enter the Gmail address you want to send from.");
    }
    if (
      senderMode === "gmail" &&
      !gmailAddress.trim().toLowerCase().endsWith("@gmail.com")
    ) {
      throw new Error(
        "Gmail Direct supports only normal Gmail addresses ending with @gmail.com.",
      );
    }
    if (
      senderMode === "gmail" &&
      !gmailAppPassword.replace(/\s+/g, "").trim()
    ) {
      throw new Error("Enter the Gmail app password.");
    }

    if (
      !previewPayload.clients.every((client) => client.name && client.email)
    ) {
      throw new Error("Each client needs at least a name and email address.");
    }

    if (!selectedTechnologies.length) {
      throw new Error("Select at least one technology or service focus.");
    }
  };

  const handleGeneratePreview = async () => {
    try {
      validateBeforeSubmit();
      setBusyAction("preview");
      setError("");
      setMessage("");
      const response = await api.previewClientLeadEmails(previewPayload);
      setPreview(response);
      setSelectedTemplateId(response.active_template_id);
      setMessage("Preview regenerated successfully.");
      showToast("success", "Preview generated successfully.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to generate preview.";
      setError(message);
      showToast("error", message);
    } finally {
      setBusyAction(null);
    }
  };

  const focusClientEmail = (email: string) => {
    const normalizedTarget = normalizeEmail(email);
    const clientIndex = clients.findIndex(
      (client) => normalizeEmail(client.email) === normalizedTarget,
    );
    if (clientIndex < 0) {
      return;
    }

    const emailInput = clientEmailInputRefs.current[clientIndex];
    if (!emailInput) {
      return;
    }

    emailInput.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => {
      emailInput.focus({ preventScroll: true });
    }, 320);
  };

  const findDuplicateRecipientEmails = async () => {
    const currentRecipients = [...new Set(
      previewPayload.clients
        .map((client) => normalizeEmail(client.email))
        .filter(Boolean),
    )];
    if (!currentRecipients.length) {
      return [];
    }

    const history = await api.listLeadHistorySections();
    const alreadySentRecipients = new Set<string>();

    for (const section of history.sections || []) {
      for (const record of section.records || []) {
        for (const recipient of record.clients || []) {
          const recipientEmail = normalizeEmail(recipient.email);
          if (recipientEmail) {
            alreadySentRecipients.add(recipientEmail);
          }
        }
      }
    }

    return currentRecipients.filter((email) =>
      alreadySentRecipients.has(email),
    );
  };

  const executeSend = async () => {
    try {
      setBusyAction("send");
      setError("");
      setMessage("");
      const response = await api.sendClientLeadEmails(
        {
          ...previewPayload,
          selected_template_id: selectedTemplateId,
          personal_use_paragraph: personalUseParagraph.trim() || undefined,
        },
        combinedOutgoingAttachments,
        personalAttachments,
      );
      setSenderMode("gmail");
      setGmailAddress("");
      setGmailAppPassword("");
      setDeliveryMode("single");
      setClients([blankClient()]);
      setSelectedTechnologies([]);
      setEmailDetailsParagraph("");
      setIncludeOutboundParagraph(false);
      setPersonalUseParagraph("");
      setScheduledFor("");
      setPreview(null);
      setEmailAttachments([]);
      setPersonalAttachments([]);
      setPreviewViewport("tab");
      setMessage(response.message);
      showToast("success", response.message);
    } finally {
      setBusyAction(null);
    }
  };

  const handleConfirmDuplicateSend = async () => {
    try {
      setPendingDuplicateRecipients(null);
      await executeSend();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to send the campaign.";
      setError(message);
      showToast("error", message);
    }
  };

  const handleCancelDuplicateSend = () => {
    const focusEmail = pendingDuplicateRecipients?.[0];
    setPendingDuplicateRecipients(null);
    if (focusEmail) {
      focusClientEmail(focusEmail);
    }
  };

  const handleSend = async () => {
    try {
      validateBeforeSubmit();
      if (!selectedTemplateId) {
        throw new Error("Select a template before dispatching the email.");
      }

      const duplicates = await findDuplicateRecipientEmails();
      if (duplicates.length) {
        setPendingDuplicateRecipients(duplicates);
        return;
      }

      await executeSend();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to send the campaign.";
      setError(message);
      showToast("error", message);
    }
  };

  const resetSequence = () => {
    setSenderMode("gmail");
    setGmailAddress("");
    setGmailAppPassword("");
    setDeliveryMode("single");
    setClients([blankClient()]);
    setSelectedTechnologies([]);
    setEmailDetailsParagraph("");
    setIncludeOutboundParagraph(false);
    setPersonalUseParagraph("");
    setScheduledFor("");
    setPreview(null);
    setEmailAttachments([]);
    setPersonalAttachments([]);
    setError("");
    setMessage("");
    setSelectedTemplateId((current) => current || templates[0]?.id || "");
  };

  const dock = (
    <div className="command-dock flex items-center gap-6 px-6 py-3">
      <button
        className="flex items-center gap-2 text-sm font-bold text-[var(--accent)]"
        type="button"
      >
        <Search className="h-4 w-4" />
        <span>Search Command</span>
      </button>
      <div className="h-4 w-px bg-[var(--glass-line)]" />
      <div className="flex items-center gap-4 text-[var(--muted)]">
        <Sparkles className="h-4 w-4" />
        <Paperclip className="h-4 w-4" />
        <ShieldCheck className="h-4 w-4" />
      </div>
    </div>
  );

  return (
    <>
      <ActionToast toast={toast} />
      <ConfirmationDialog
        busy={busyAction === "send"}
        cancelLabel="Cancel"
        confirmLabel="Send anyway"
        description={
          pendingDuplicateRecipients?.length
            ? `You have already sent mail to ${pendingDuplicateRecipients.join(", ")}. Are you sure you want to send again?`
            : ""
        }
        onCancel={handleCancelDuplicateSend}
        onConfirm={() => void handleConfirmDuplicateSend()}
        open={Boolean(pendingDuplicateRecipients?.length)}
        title={
          pendingDuplicateRecipients?.length
            ? "Already sent to this client email"
            : "Already sent to this client email"
        }
        tone="warning"
      />
      <AppShell
        actions={
          <>
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--surface-muted)] px-5 py-3 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--surface-high)]"
              onClick={() => {
                setMessage("Draft saved locally in your current session.");
                setError("");
                showToast(
                  "success",
                  "Draft saved locally in your current session.",
                );
              }}
              type="button"
            >
              Save Draft
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-3 text-sm font-black text-white transition hover:brightness-110 disabled:opacity-70"
              disabled={busyAction === "preview"}
              onClick={() => void handleGeneratePreview()}
              type="button"
            >
              <Sparkles
                className={
                  busyAction === "preview" ? "h-4 w-4 animate-spin" : "h-4 w-4"
                }
              />
              <span>
                {busyAction === "preview" ? "Generating" : "Initialize Flow"}
              </span>
            </button>
          </>
        }
        description="Configure your outreach mission. Every sender, target, attachment, and dispatch is recorded into the internal transmission ledger."
        dock={dock}
        eyebrow="Campaign Configuration"
        searchPlaceholder="Search interactions..."
        aside={
          <motion.section className="space-y-4" {...sectionMotion(0.1)}>
            <div className="surface-panel rounded-[1.5rem] p-5">
              <h3 className="text-lg font-black tracking-tight">
                Default outgoing attachments
              </h3>
              <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
                Keep files ready on the right panel. When enabled, these files
                are added automatically to every outgoing send.
              </p>

              <button
                className={cn(
                  "mt-4 inline-flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-sm font-black uppercase tracking-[0.14em] transition",
                  defaultOutgoingAttachmentsEnabled
                    ? "bg-[rgba(var(--accent-rgb),0.14)] text-[var(--accent)]"
                    : "bg-[var(--surface-muted)] text-[var(--muted)]",
                )}
                onClick={() =>
                  setDefaultOutgoingAttachmentsEnabled((current) => !current)
                }
                type="button"
              >
                <span>Default attachments</span>
                <span className="rounded-full border border-current px-3 py-1 text-[10px] tracking-[0.18em]">
                  {defaultOutgoingAttachmentsEnabled ? "ON" : "OFF"}
                </span>
              </button>

              {defaultOutgoingAttachmentsEnabled ? (
                <div className="mt-4 space-y-3">
                  <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--surface-muted)] px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text)] transition hover:border-[rgba(var(--accent-rgb),0.38)]">
                    <Paperclip className="h-4 w-4 text-[var(--accent)]" />
                    <span>Add attachments</span>
                    <input
                      className="hidden"
                      multiple
                      onChange={(event) => {
                        const nextFiles = Array.from(event.target.files ?? []);
                        if (!nextFiles.length) {
                          return;
                        }
                        setDefaultOutgoingAttachments((current) => [
                          ...current,
                          ...nextFiles,
                        ]);
                        event.target.value = "";
                      }}
                      type="file"
                    />
                  </label>

                  <div className="max-h-[16rem] space-y-2 overflow-auto pr-1 scrollbar-thin">
                    {defaultOutgoingAttachments.length === 0 ? (
                      <p className="rounded-xl bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--soft)]">
                        No default attachments saved yet.
                      </p>
                    ) : (
                      defaultOutgoingAttachments.map((file, index) => (
                        <div
                          className="rounded-xl bg-[var(--surface-muted)] px-3 py-2"
                          key={`${file.name}-${file.size}-${index}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[var(--text)]">
                                {file.name}
                              </p>
                              <p className="text-xs text-[var(--soft)]">
                                {(file.size / 1024).toFixed(1)} KB
                              </p>
                            </div>
                            <button
                              className="rounded-full border border-[var(--line)] px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--text)]"
                              onClick={() =>
                                setDefaultOutgoingAttachments((current) =>
                                  current.filter(
                                    (_, fileIndex) => fileIndex !== index,
                                  ),
                                )
                              }
                              type="button"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </motion.section>
        }
        sidebarAction={
          <button
            className="mx-2 mb-8 inline-flex w-[calc(100%-1rem)] items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-4 py-3 text-sm font-black text-[#052113] shadow-lg shadow-[rgba(var(--accent-rgb),0.14)] transition hover:scale-[0.985]"
            onClick={resetSequence}
            type="button"
          >
            <Plus className="h-4 w-4" />
            <span>New Outreach</span>
          </button>
        }
        title="New Outreach Sequence"
      >
        <section className="space-y-6">
          <motion.section
            className="surface-panel rounded-[1.9rem] p-5 sm:p-6"
            {...sectionMotion(0.04)}
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-[rgba(var(--accent-rgb),0.12)] font-black text-[var(--accent)]">
                1
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black tracking-tight">
                    Choose sender
                  </h2>
                  <span title="Select the email channel used for delivery.">
                    <CircleHelp className="h-4 w-4 text-[var(--soft)]" />
                  </span>
                </div>
                <p className="text-sm text-[var(--muted)]">
                  Switch between Gmail or approved Zoho channels.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {senderOptions.map((option) =>
                (() => {
                  const Icon = option.icon;
                  return (
                    <button
                      className={cn(
                        "rounded-xl border p-5 text-left transition",
                        senderMode === option.id
                          ? "border-[rgba(var(--accent-rgb),0.28)] bg-[var(--surface-high)]"
                          : "border-transparent bg-[var(--surface-muted)] hover:bg-[var(--surface-high)]",
                      )}
                      disabled={!option.enabled}
                      key={option.id}
                      onClick={() => option.enabled && setSenderMode(option.id)}
                      type="button"
                      style={{ opacity: option.enabled ? 1 : 0.45 }}
                    >
                      <Icon
                        className={cn(
                          "mb-4 h-6 w-6",
                          option.tone === "secondary"
                            ? "text-[var(--secondary)]"
                            : "text-[var(--accent)]",
                        )}
                      />
                      <p className="text-lg font-black tracking-tight text-[var(--text)]">
                        {option.title}
                      </p>
                      <p className="mt-1 font-label text-[11px] uppercase tracking-[0.18em] text-[var(--soft)]">
                        {option.subtitle}
                      </p>
                      <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                        {option.description}
                      </p>
                    </button>
                  );
                })(),
              )}
            </div>

            {senderMode === "gmail" ? (
              <div className="mt-5">
                <div
                  className="h-0 overflow-hidden opacity-0"
                  aria-hidden="true"
                >
                  <input
                    autoComplete="username"
                    name="username"
                    tabIndex={-1}
                    type="text"
                  />
                  <input
                    autoComplete="current-password"
                    name="password"
                    tabIndex={-1}
                    type="password"
                  />
                </div>
                <Field
                  autoCapitalize="none"
                  autoComplete="new-password"
                  autoCorrect="off"
                  helper="Use a normal Gmail address (@gmail.com)."
                  label="Which Gmail should be used?"
                  name="cw-gmail-direct-email-new"
                  onChange={(event) => setGmailAddress(event.target.value)}
                  placeholder="sender@gmail.com"
                  spellCheck={false}
                  type="text"
                  inputMode="email"
                  value={gmailAddress}
                />
                <div className="mt-4">
                  <Field
                    autoComplete="new-password"
                    helper="Enter Gmail App Password (16-character). This is required for normal Gmail SMTP sends."
                    label="Gmail App Password"
                    name="cw-gmail-direct-app-password-new"
                    onChange={(event) =>
                      setGmailAppPassword(event.target.value)
                    }
                    placeholder="abcd efgh ijkl mnop"
                    type="password"
                    value={gmailAppPassword}
                  />
                </div>
                <details className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--muted)]">
                  <summary className="cursor-pointer font-semibold text-[var(--text)]">
                    How to generate Gmail App Password
                  </summary>
                  <ol className="mt-3 list-decimal space-y-1 pl-5 leading-7">
                    <li>Sign in to your Gmail account.</li>
                    <li>
                      Turn on 2-Step Verification in Google Account security.
                    </li>
                    <li>
                      Open App Passwords:
                      https://myaccount.google.com/apppasswords
                    </li>
                    <li>
                      Create a new app password (Mail), then copy the
                      16-character password.
                    </li>
                    <li>Paste it here. Spaces are optional.</li>
                  </ol>
                  <p className="mt-2 text-xs text-[var(--soft)]">
                    This option is only for normal Gmail addresses (@gmail.com).
                  </p>
                </details>
              </div>
            ) : null}
          </motion.section>

          <motion.section
            className="surface-panel rounded-[1.9rem] p-5 sm:p-6"
            {...sectionMotion(0.08)}
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-[rgba(var(--accent-rgb),0.12)] font-black text-[var(--accent)]">
                2
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight">
                  Content type and lead mode
                </h2>
                <p className="text-sm text-[var(--muted)]">
                  Select content type, then choose the client lead delivery
                  mode.
                </p>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                Content type
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="rounded-full border border-[rgba(var(--accent-rgb),0.32)] bg-[rgba(var(--accent-rgb),0.14)] px-4 py-2.5 text-sm font-black text-[var(--accent)]"
                  type="button"
                >
                  Client Lead
                </button>
                <button
                  className="rounded-full border border-[var(--line)] bg-transparent px-4 py-2.5 text-sm font-semibold text-[var(--soft)] opacity-70"
                  disabled
                  type="button"
                >
                  Partnership
                </button>
                <button
                  className="rounded-full border border-[var(--line)] bg-transparent px-4 py-2.5 text-sm font-semibold text-[var(--soft)] opacity-70"
                  disabled
                  type="button"
                >
                  Other
                </button>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--secondary)]">
                Client lead delivery mode
              </p>
              <div className="mt-3 inline-flex w-full flex-col gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-2 sm:flex-row">
                <button
                  className={cn(
                    "flex-1 rounded-xl border px-4 py-3 text-left transition",
                    deliveryMode === "single"
                      ? "border-[rgba(var(--secondary-rgb),0.55)] bg-[rgba(var(--secondary-rgb),0.2)] ring-1 ring-[rgba(var(--secondary-rgb),0.45)] shadow-[0_10px_24px_rgba(var(--secondary-rgb),0.2)]"
                      : "border-[var(--line)] bg-transparent hover:bg-[var(--surface-muted)] hover:border-[var(--line-strong)]",
                  )}
                  onClick={() => {
                    setDeliveryMode("single");
                    setClients((current) => current.slice(0, 1));
                  }}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-black text-[var(--text)]">
                      Single lead
                    </p>
                    {deliveryMode === "single" ? (
                      <span className="rounded-full bg-[rgba(var(--secondary-rgb),0.24)] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--secondary)]">
                        Selected
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Send to one client profile.
                  </p>
                </button>
                <button
                  className={cn(
                    "flex-1 rounded-xl border px-4 py-3 text-left transition",
                    deliveryMode === "multiple"
                      ? "border-[rgba(var(--secondary-rgb),0.55)] bg-[rgba(var(--secondary-rgb),0.2)] ring-1 ring-[rgba(var(--secondary-rgb),0.45)] shadow-[0_10px_24px_rgba(var(--secondary-rgb),0.2)]"
                      : "border-[var(--line)] bg-transparent hover:bg-[var(--surface-muted)] hover:border-[var(--line-strong)]",
                  )}
                  onClick={() => setDeliveryMode("multiple")}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-black text-[var(--text)]">
                      Multiple client leads
                    </p>
                    {deliveryMode === "multiple" ? (
                      <span className="rounded-full bg-[rgba(var(--secondary-rgb),0.24)] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--secondary)]">
                        Selected
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Send to multiple clients in one sequence.
                  </p>
                </button>
              </div>
            </div>
          </motion.section>

          <motion.section
            className="surface-panel rounded-[1.9rem] p-5 sm:p-6"
            {...sectionMotion(0.12)}
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-[rgba(var(--accent-rgb),0.12)] font-black text-[var(--accent)]">
                3
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight">
                  Lead details
                </h2>
                <p className="text-sm text-[var(--muted)]">
                  Name and email are mandatory, phone is optional.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {clients.map((client, index) => (
                <div
                  className="surface-strong rounded-[1.6rem] p-4 sm:p-5"
                  key={`client-${index}`}
                >
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-lg font-black">Client {index + 1}</p>
                    {clients.length > 1 ? (
                      <button
                        className="text-xs font-extrabold uppercase tracking-[0.18em] text-[var(--danger)]"
                        onClick={() =>
                          setClients((current) =>
                            current.filter(
                              (_, clientIndex) => clientIndex !== index,
                            ),
                          )
                        }
                        type="button"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field
                      helper="Enter the full client name as it should appear in the email."
                      label="Client name"
                      onChange={(event) =>
                        setClients((current) =>
                          current.map((item, clientIndex) =>
                            clientIndex === index
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="Enter client name"
                      value={client.name}
                    />
                    <Field
                      helper="This is used for delivery and tracking in sent history."
                      label="Client email"
                      ref={(input) => {
                        clientEmailInputRefs.current[index] =
                          input as HTMLInputElement | null;
                      }}
                      onChange={(event) =>
                        setClients((current) =>
                          current.map((item, clientIndex) =>
                            clientIndex === index
                              ? { ...item, email: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="Enter client email"
                      type="email"
                      value={client.email}
                    />
                    <Field
                      className="md:col-span-2"
                      helper="Optional contact number for internal context."
                      label="Client phone"
                      onChange={(event) =>
                        setClients((current) =>
                          current.map((item, clientIndex) =>
                            clientIndex === index
                              ? { ...item, phone: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="Optional phone number"
                      value={client.phone}
                    />
                  </div>
                </div>
              ))}
            </div>

            {deliveryMode === "multiple" && clients.length < 20 ? (
              <button
                className="mt-5 inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface-strong)] px-5 py-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text)]"
                onClick={() =>
                  setClients((current) => [...current, blankClient()])
                }
                type="button"
              >
                <Plus className="h-4 w-4" />
                <span>Add another client</span>
              </button>
            ) : null}
          </motion.section>

          <motion.section
            className="surface-panel rounded-[1.9rem] p-5 sm:p-6"
            {...sectionMotion(0.16)}
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-[rgba(var(--accent-rgb),0.12)] font-black text-[var(--accent)]">
                4
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight">
                  Communication payload
                </h2>
                <p className="text-sm text-[var(--muted)]">
                  Shape the outgoing paragraph, internal note, and supporting
                  attachments.
                </p>
              </div>
            </div>

            <div className="space-y-5">
              <button
                className={cn(
                  "inline-flex w-full items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-left transition",
                  includeOutboundParagraph
                    ? "border-[rgba(var(--accent-rgb),0.3)] bg-[rgba(var(--accent-rgb),0.12)] text-[var(--accent)]"
                    : "border-[var(--line)] bg-[var(--surface-muted)] text-[var(--muted)]",
                )}
                onClick={() =>
                  setIncludeOutboundParagraph((current) => !current)
                }
                type="button"
              >
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.16em]">
                    Outgoing paragraph
                  </p>
                  <p className="mt-1 text-xs leading-6">
                    {includeOutboundParagraph
                      ? "This paragraph will be included in the email."
                      : "This paragraph is hidden and will not be sent."}
                  </p>
                </div>
                <span className="rounded-full border border-current px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]">
                  {includeOutboundParagraph ? "ON" : "OFF"}
                </span>
              </button>
              {includeOutboundParagraph ? (
                <Field
                  helper="This paragraph appears in the client-facing email body."
                  label="Outgoing email details paragraph"
                  onChange={(event) =>
                    setEmailDetailsParagraph(event.target.value)
                  }
                  placeholder="Add your tailored paragraph for the outbound email."
                  textarea
                  value={emailDetailsParagraph}
                />
              ) : null}
              <Field
                helper="Internal-only note stored in history for your team."
                label="Internal narrative notes"
                onChange={(event) =>
                  setPersonalUseParagraph(event.target.value)
                }
                placeholder="Add notes for internal use only."
                textarea
                value={personalUseParagraph}
              />
              <div>
                <p className="text-sm font-semibold text-[var(--text)]">
                  Schedule send date and time
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Optional. Use the planner below to send now or lock in a future dispatch window.
                </p>
                <div className="mt-3 space-y-3">
                  {senderMode === "gmail" ? (
                    <div className="rounded-[1.4rem] border border-[rgba(var(--danger-rgb),0.16)] bg-[rgba(var(--danger-rgb),0.08)] px-4 py-3 text-sm leading-7 text-[var(--danger)]">
                      Gmail Direct can send immediately only. Switch to Sales or Admin sender to schedule this campaign.
                    </div>
                  ) : null}
                  <SchedulePicker
                    description="Choose a polished schedule slot with quick dates, a calendar grid, and exact time control."
                    disabled={senderMode === "gmail"}
                    onChange={setScheduledFor}
                    value={scheduledFor}
                  />
                  <div className="rounded-[1.2rem] border border-[var(--line)] bg-[rgba(var(--bg-rgb),0.18)] px-4 py-3">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                      Dispatch summary
                    </p>
                    <p className="mt-2 text-sm font-bold text-[var(--text)]">
                      {formatScheduledDateTime(scheduledFor)}
                    </p>
                  </div>
                </div>
              </div>
              <FileInput
                files={emailAttachments}
                helper={
                  defaultOutgoingAttachmentsEnabled &&
                  defaultOutgoingAttachments.length > 0
                    ? `These files go to the client. ${defaultOutgoingAttachments.length} default attachment(s) are added automatically.`
                    : "These files go to the client. The pitch deck is handled by the backend when available."
                }
                label="Outgoing attachments"
                onChange={setEmailAttachments}
              />
              <FileInput
                files={personalAttachments}
                helper="These files stay only in your internal history record."
                label="Internal attachments"
                onChange={setPersonalAttachments}
              />
            </div>
          </motion.section>

          <motion.section
            className="surface-panel rounded-[1.9rem] p-5 sm:p-6"
            {...sectionMotion(0.2)}
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-[rgba(var(--accent-rgb),0.12)] font-black text-[var(--accent)]">
                5
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight">
                  Technology focus
                </h2>
                <p className="text-sm text-[var(--muted)]">
                  Select the services you want highlighted in every template.
                </p>
              </div>
            </div>

            <div className="rounded-[1.6rem] border border-[var(--line)] bg-[var(--surface-muted)] p-4 sm:p-5">
              <p className="text-sm font-bold text-[var(--text)]">
                Selected ({selectedTechnologies.length})
              </p>
              {selectedTechnologies.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Choose one or more options from below.
                </p>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedTechnologies.map((technology) => (
                    <button
                      className="rounded-full border border-[rgba(var(--accent-rgb),0.32)] bg-[rgba(var(--accent-rgb),0.12)] px-3 py-1.5 text-xs font-extrabold tracking-[0.04em] text-[var(--accent)]"
                      key={technology}
                      onClick={() =>
                        setSelectedTechnologies((current) =>
                          current.filter((item) => item !== technology),
                        )
                      }
                      type="button"
                    >
                      {technology} ×
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {TECHNOLOGY_OPTIONS.map((technology) => {
                const active = selectedTechnologies.includes(technology);
                return (
                  <button
                    className={cn(
                      "rounded-full border px-3 py-2 text-xs font-extrabold tracking-[0.08em] transition",
                      active
                        ? "border-[rgba(var(--accent-rgb),0.34)] bg-[rgba(var(--accent-rgb),0.14)] text-[var(--accent)]"
                        : "border-[var(--line)] bg-[var(--surface-strong)] text-[var(--text)] hover:border-[var(--line-strong)]",
                    )}
                    key={technology}
                    onClick={() =>
                      setSelectedTechnologies((current) =>
                        current.includes(technology)
                          ? current.filter((item) => item !== technology)
                          : [...current, technology],
                      )
                    }
                    type="button"
                  >
                    {technology}
                  </button>
                );
              })}
            </div>
          </motion.section>

          <div className="surface-panel rounded-[1.9rem] p-5 sm:p-6">
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="mb-3 flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-[rgba(var(--accent-rgb),0.12)] font-black text-[var(--accent)]">
                    6
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-black tracking-tight">
                        Variant selector
                      </h2>
                      <span title="Variant controls tone and subject for this campaign.">
                        <CircleHelp className="h-4 w-4 text-[var(--soft)]" />
                      </span>
                    </div>
                    <p className="text-sm text-[var(--muted)]">
                      Pick from 5 polished client-lead outreach angles.
                    </p>
                  </div>
                </div>
              </div>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[rgba(var(--secondary-rgb),0.16)] px-5 py-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--secondary)] transition hover:-translate-y-0.5 disabled:opacity-70"
                disabled={busyAction === "preview"}
                onClick={() => void handleGeneratePreview()}
                type="button"
              >
                <Sparkles
                  className={
                    busyAction === "preview"
                      ? "h-4 w-4 animate-spin"
                      : "h-4 w-4"
                  }
                />
                <span>
                  {busyAction === "preview" ? "Generating" : "Generate preview"}
                </span>
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <p className="font-label text-[11px] font-extrabold uppercase tracking-[0.22em] text-[var(--accent)]">
                  Templates
                </p>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Pick one template name to shape the email before previewing
                  it.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {templates.map((template) => (
                  <button
                    className={`inline-flex items-center gap-3 rounded-full border px-4 py-3 text-left transition ${
                      selectedTemplateId === template.id
                        ? "border-[rgba(var(--accent-rgb),0.38)] bg-[rgba(var(--accent-rgb),0.12)] text-[var(--accent)]"
                        : "border-[var(--line)] bg-[var(--surface-strong)] text-[var(--text)] hover:border-[var(--line-strong)]"
                    }`}
                    key={template.id}
                    onClick={() => setSelectedTemplateId(template.id)}
                    type="button"
                  >
                    <span className="text-sm font-black tracking-tight">
                      {template.title}
                    </span>
                    {selectedTemplateId === template.id ? (
                      <CheckCircle2 className="h-4 w-4 text-[var(--accent)]" />
                    ) : null}
                  </button>
                ))}
              </div>

              <div className="surface-strong overflow-hidden rounded-[1.8rem] border border-[var(--line)]">
                <div className="border-b border-[var(--line)] bg-[var(--surface-high)] p-5 sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-label text-[11px] font-extrabold uppercase tracking-[0.22em] text-[var(--accent)]">
                        Email preview
                      </p>
                      <h3 className="mt-2 text-2xl font-black tracking-tight">
                        {previewEmail?.subject ??
                          "Generate a preview to see the full email"}
                      </h3>
                      <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
                        This is the message view you can read before you send
                        it.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-3">
                      <div className="hidden items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface)] p-1 md:inline-flex">
                        {[
                          { id: "mobile", label: "Mobile" },
                          { id: "tab", label: "Tab" },
                        ].map((option) => (
                          <button
                            className={cn(
                              "rounded-full px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] transition",
                              previewViewport === option.id
                                ? "bg-[rgba(var(--accent-rgb),0.18)] text-[var(--accent)]"
                                : "text-[var(--soft)] hover:text-[var(--text)]",
                            )}
                            key={option.id}
                            onClick={() =>
                              setPreviewViewport(option.id as "mobile" | "tab")
                            }
                            type="button"
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>

                      <button
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-5 py-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#052113] transition hover:-translate-y-0.5 disabled:opacity-70"
                        disabled={busyAction === "send"}
                        onClick={() => void handleSend()}
                        type="button"
                      >
                        <Mail
                          className={
                            busyAction === "send"
                              ? "h-4 w-4 animate-pulse"
                              : "h-4 w-4"
                          }
                        />
                        <span>
                          {busyAction === "send" ? "Sending" : "Send email"}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                {previewEmail ? (
                  <div className="p-5 sm:p-6">
                    <div className="flex flex-wrap gap-2">
                      <StatusPill
                        label={`From ${previewEmail.from_email}`}
                        tone="accent"
                      />
                      <StatusPill
                        label={`To ${previewEmail.recipient_email}`}
                      />
                      <StatusPill
                        label={activeVariant?.template.title ?? "Template"}
                        tone="secondary"
                      />
                    </div>

                    <div
                      className={cn(
                        "mt-5 grid gap-4 grid-cols-1",
                        previewViewport === "mobile"
                          ? "xl:grid-cols-[1.15fr_0.85fr]"
                          : "",
                      )}
                    >
                      <div
                        className={cn(
                          "rounded-[1.6rem] border border-[var(--line)] bg-[var(--surface)] p-5",
                          previewViewport === "tab" && "xl:col-span-full",
                        )}
                      >
                        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                          Message body
                        </p>
                        <div className="mt-2 text-xs font-semibold text-[var(--soft)] md:hidden">
                          Mobile preview is shown on small screens.
                        </div>
                        <div
                          className={cn(
                            "mx-auto mt-4 overflow-hidden rounded-[1.4rem] border border-[var(--line)] bg-[var(--surface-strong)]",
                            previewViewportClass,
                          )}
                        >
                          <div
                            className={cn(
                              "overflow-auto scrollbar-thin",
                              previewViewportFrameClass,
                            )}
                          >
                            <div
                              dangerouslySetInnerHTML={{
                                __html: previewEmail.html_body,
                              }}
                            />
                          </div>
                        </div>
                        <div className="mt-4 border-t border-[var(--line)] pt-4">
                          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                            Plain text view
                          </p>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[var(--muted)]">
                            {previewEmail.text_body}
                          </p>
                        </div>
                      </div>

                      <div
                        className={cn(
                          "space-y-4",
                          previewViewport === "tab" && "xl:col-span-full",
                        )}
                      >
                        <div className="rounded-[1.6rem] bg-[var(--surface-muted)] p-5">
                          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                            Recipient
                          </p>
                          <p className="mt-2 text-base font-bold text-[var(--text)]">
                            {previewEmail.recipient_name}
                          </p>
                          <p className="mt-1 text-sm text-[var(--muted)]">
                            {previewEmail.recipient_email}
                          </p>
                        </div>

                        <div className="rounded-[1.6rem] bg-[var(--surface-muted)] p-5">
                          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                            Attached files
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {previewEmail.attachments.map((attachment) => (
                              <StatusPill
                                key={attachment.filename}
                                label={attachment.filename}
                                tone="accent"
                              />
                            ))}
                          </div>
                          <p className="mt-3 text-sm text-[var(--muted)]">
                            {emailAttachments.length === 0
                              ? "No local files selected yet."
                              : `${emailAttachments.length} local file(s) selected.`}
                          </p>
                        </div>

                        <div className="rounded-[1.6rem] bg-[var(--surface-muted)] p-5 text-sm leading-7 text-[var(--muted)]">
                          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                            Before send
                          </p>
                          <p className="mt-2">
                            This section keeps the email preview visible below
                            the editor, like an inbox reading pane.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="px-5 py-8 text-sm leading-7 text-[var(--muted)] sm:px-6">
                    Generate a preview to render the full email here.
                  </div>
                )}
              </div>
            </div>

            {error ? (
              <div className="mt-5 rounded-[1.35rem] bg-[rgba(var(--danger-rgb),0.12)] px-4 py-3 text-sm leading-7 text-[var(--danger)]">
                {error}
              </div>
            ) : null}

            {message ? (
              <div className="mt-5 rounded-[1.35rem] bg-[rgba(var(--accent-rgb),0.12)] px-4 py-3 text-sm leading-7 text-[var(--accent)]">
                {message}
              </div>
            ) : null}
          </div>
        </section>
      </AppShell>
    </>
  );
}
