const fs = require("fs/promises");
const path = require("path");
const zlib = require("zlib");
const { ObjectId } = require("mongodb");

const {
  config,
  defaultSenderEmail,
  resolveAdminSenderEmail,
  resolveSalesSenderEmail,
} = require("../config");
const { logAction } = require("./audit");
const { deliverEmail, previewAttachment, previewEmail } = require("./emailer");
const {
  createHttpError,
  ensureObjectId,
  escapeHtml,
  isValidEmail,
  normalizeOptionalText,
  sanitizeFilename,
  serializeId,
} = require("../utils");

const LEAD_HISTORY_COLLECTION = "email_templates";
const LEAD_ASSET_ROOT = (() => {
  const explicitRoot = String(process.env.LEAD_ASSET_ROOT || "").trim();
  if (explicitRoot) {
    return explicitRoot;
  }

  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join("/tmp", "lead-assets");
  }

  return path.join(config.backendRoot, "storage", "lead-assets");
})();
const PITCH_DECK_CANDIDATES = [
  path.join(config.workspaceRoot, "docs", "CogitationWorks_PitchDeck (1).pdf"),
  path.join(
    config.workspaceRoot,
    "frontend",
    "public",
    "CogitationWorks_PitchDeck (1).pdf",
  ),
  path.join(
    config.workspaceRoot,
    "example doc",
    "CogitationWorks_PitchDeck (1).pdf",
  ),
];

const CLIENT_LEAD_VARIANTS = [
  {
    id: "precision-outreach",
    title: "Precision Outreach",
    tone: "Consultative",
    summary:
      "Direct, credible, and focused on digital execution for growing businesses.",
    preview_subject:
      "A practical website and app growth idea for {client_name}",
  },
  {
    id: "market-research-angle",
    title: "Market Research Angle",
    tone: "Research-led",
    summary:
      "Explains that we reviewed multiple platforms and identified the business as a strong fit.",
    preview_subject:
      "We came across {client_name} while researching strong digital brands",
  },
  {
    id: "product-led-pitch",
    title: "Product-Led Pitch",
    tone: "Modern",
    summary:
      "Frames the outreach around a cleaner customer journey with web and mobile products.",
    preview_subject:
      "A modern website and mobile app concept for {client_name}",
  },
  {
    id: "reputation-builder",
    title: "Reputation Builder",
    tone: "Premium",
    summary:
      "Highlights trust, brand perception, and a better lead conversion experience.",
    preview_subject: "Helping {client_name} look even stronger online",
  },
  {
    id: "quick-intro",
    title: "Quick Intro",
    tone: "Concise",
    summary: "Short, polished, and suitable for fast outreach at scale.",
    preview_subject: "Quick intro from Cogitation Works for {client_name}",
  },
];

async function ensureLeadIndexes(db) {
  await db
    .collection(LEAD_HISTORY_COLLECTION)
    .createIndex({ owner_user_id: 1, last_sent_at: -1 });
  await db.collection(LEAD_HISTORY_COLLECTION).createIndex({ created_at: -1 });
}

function getClientLeadTemplates() {
  return CLIENT_LEAD_VARIANTS;
}

function getTemplateById(templateId) {
  const template = CLIENT_LEAD_VARIANTS.find(
    (variant) => variant.id === templateId,
  );
  if (!template) {
    throw createHttpError(404, "Selected email template was not found.");
  }
  return template;
}

function getPitchDeckPath() {
  return (
    PITCH_DECK_CANDIDATES.find((candidate) => {
      try {
        return require("fs").existsSync(candidate);
      } catch (_error) {
        return false;
      }
    }) || null
  );
}

function resolveSenderEmail(senderMode, customSenderEmail) {
  if (senderMode === "gmail") {
    return normalizeOptionalText(customSenderEmail) || defaultSenderEmail();
  }
  if (senderMode === "sales") {
    return resolveSalesSenderEmail();
  }
  if (senderMode === "admin") {
    return resolveAdminSenderEmail();
  }
  return defaultSenderEmail();
}

function validateSenderAccess(actor, senderMode, customSenderEmail) {
  if (!["gmail", "sales", "admin"].includes(senderMode)) {
    throw createHttpError(422, "Select a valid sender mode.");
  }

  if (senderMode === "gmail") {
    if (!normalizeOptionalText(customSenderEmail)) {
      throw createHttpError(
        400,
        "Enter the Gmail address you want to send from.",
      );
    }
    if (!isValidEmail(customSenderEmail)) {
      throw createHttpError(422, "Enter a valid Gmail address.");
    }
    if (
      !String(customSenderEmail).trim().toLowerCase().endsWith("@gmail.com")
    ) {
      throw createHttpError(
        422,
        "Gmail Direct supports only normal Gmail addresses ending with @gmail.com.",
      );
    }
    return;
  }

  if (actor.role === "super_admin") {
    return;
  }

  if (senderMode === "sales" && !actor.can_use_sales_sender) {
    throw createHttpError(
      403,
      "You do not have access to the Sales Zoho sender.",
    );
  }

  if (senderMode === "admin" && !actor.can_use_admin_sender) {
    throw createHttpError(
      403,
      "You do not have access to the Admin Zoho sender.",
    );
  }
}

function normalizeTechnologies(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];
  for (const item of values) {
    const value = normalizeOptionalText(item);
    if (!value) {
      continue;
    }
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(value.slice(0, 80));
    if (normalized.length >= 24) {
      break;
    }
  }

  return normalized;
}

function validateLeadPayload(
  payload,
  { requireSelectedTemplate = false } = {},
) {
  const senderMode = String(payload.sender_mode || "").trim();
  const customSenderEmail = normalizeOptionalText(payload.custom_sender_email);
  const customSenderAppPassword = normalizeOptionalText(
    payload.custom_sender_app_password,
  );
  const contentType = String(payload.content_type || "").trim();
  const deliveryMode = String(payload.delivery_mode || "").trim();
  const selectedTemplateId = normalizeOptionalText(
    payload.selected_template_id,
  );
  const technologies = normalizeTechnologies(payload.technologies);
  const emailDetailsParagraph = normalizeOptionalText(
    payload.email_details_paragraph,
  );
  const personalUseParagraph = normalizeOptionalText(
    payload.personal_use_paragraph,
  );
  const scheduledForInput = normalizeOptionalText(payload.scheduled_for);
  const clients = Array.isArray(payload.clients) ? payload.clients : [];
  let scheduledFor = null;

  if (contentType !== "client_lead") {
    throw createHttpError(
      422,
      "Only client lead content is supported right now.",
    );
  }
  if (!["single", "multiple"].includes(deliveryMode)) {
    throw createHttpError(
      422,
      "Choose either single or multiple delivery mode.",
    );
  }
  if (requireSelectedTemplate && !selectedTemplateId) {
    throw createHttpError(
      422,
      "Select a template before dispatching the email.",
    );
  }
  if (!clients.length || clients.length > 20) {
    throw createHttpError(422, "Provide between 1 and 20 client profiles.");
  }

  if (scheduledForInput) {
    const parsed = new Date(scheduledForInput);
    if (Number.isNaN(parsed.getTime())) {
      throw createHttpError(422, "Enter a valid schedule date and time.");
    }
    scheduledFor = parsed;
  }

  const normalizedClients = clients.map((client, index) => {
    const name = String(client?.name || "").trim();
    const email = String(client?.email || "")
      .trim()
      .toLowerCase();
    const phone = normalizeOptionalText(client?.phone);

    if (!name) {
      throw createHttpError(422, `Client ${index + 1} is missing a name.`);
    }
    if (!isValidEmail(email)) {
      throw createHttpError(
        422,
        `Client ${index + 1} needs a valid email address.`,
      );
    }

    return { name, email, phone };
  });

  return {
    sender_mode: senderMode,
    custom_sender_email: customSenderEmail,
    custom_sender_app_password: customSenderAppPassword,
    content_type: contentType,
    delivery_mode: deliveryMode,
    selected_template_id: selectedTemplateId,
    technologies,
    email_details_paragraph: emailDetailsParagraph,
    personal_use_paragraph: personalUseParagraph,
    scheduled_for: scheduledFor,
    clients: normalizedClients,
  };
}

function renderParagraph(paragraph) {
  return `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`;
}

function internalAttachmentRecord(attachment) {
  return {
    label: attachment.label,
    filename: attachment.filename,
    content_type: attachment.content_type,
    size_bytes: attachment.size_bytes ?? null,
    compressed_size_bytes: attachment.compressed_size_bytes ?? null,
    source_path: attachment.source_path ?? null,
  };
}

function publicAttachmentRecord(attachment) {
  return {
    label: attachment.label,
    filename: attachment.filename,
    content_type: attachment.content_type,
    size_bytes: attachment.size_bytes ?? null,
  };
}

function publicPreview(preview) {
  return {
    template_id: preview.template_id,
    template_title: preview.template_title,
    recipient_name: preview.recipient_name,
    recipient_email: preview.recipient_email,
    subject: preview.subject,
    html_body: preview.html_body,
    text_body: preview.text_body,
    from_name: preview.from_name,
    from_email: preview.from_email,
    attachments: (preview.attachments || []).map(publicAttachmentRecord),
  };
}

function publicSentRecord(document) {
  return {
    id: serializeId(document._id),
    content_type: document.content_type,
    template_id: document.template_id,
    template_title: document.template_title,
    sender_mode: document.sender_mode,
    custom_sender_email: document.custom_sender_email ?? null,
    from_email: document.from_email,
    delivery_mode: document.delivery_mode,
    clients: document.clients || [],
    technologies: document.technologies || [],
    email_details_paragraph: document.email_details_paragraph ?? null,
    personal_use_paragraph: document.personal_use_paragraph ?? null,
    email_attachments: (document.email_attachments || []).map(
      publicAttachmentRecord,
    ),
    personal_attachments: (document.personal_attachments || []).map(
      publicAttachmentRecord,
    ),
    emails: (document.emails || []).map(publicPreview),
    delivery_results: document.delivery_results || [],
    created_by: document.created_by,
    created_by_role: document.created_by_role,
    created_at: document.created_at,
    last_sent_at: document.last_sent_at,
    resend_count: document.resend_count || 0,
    scheduled_for: document.scheduled_for ?? null,
    dispatch_status: document.dispatch_status || "sent",
  };
}

function activeCampaignClause() {
  return {
    $or: [{ deleted_at: { $exists: false } }, { deleted_at: null }],
  };
}

function summarizeDeliveryResults(deliveryResults) {
  const total = Array.isArray(deliveryResults) ? deliveryResults.length : 0;
  const delivered = (deliveryResults || []).filter(
    (result) => result?.delivered,
  ).length;
  const failed = total - delivered;

  let dispatchStatus = "sent";
  if (total > 0 && delivered === 0) {
    dispatchStatus = "failed";
  } else if (failed > 0) {
    dispatchStatus = "partial_failed";
  }

  return {
    total,
    delivered,
    failed,
    dispatch_status: dispatchStatus,
  };
}

async function persistUploadedAttachments(files, { category, recordKey }) {
  if (!files?.length) {
    return [];
  }

  const categoryRoot = path.join(LEAD_ASSET_ROOT, recordKey, category);
  await fs.mkdir(categoryRoot, { recursive: true });

  const storedAttachments = [];
  for (let index = 0; index < files.length; index += 1) {
    const upload = files[index];
    const safeName = sanitizeFilename(
      upload.originalname,
      `${category}-${index + 1}.bin`,
    );
    const compressedBuffer = zlib.gzipSync(upload.buffer);
    const storedPath = path.join(
      categoryRoot,
      `${String(index + 1).padStart(2, "0")}-${safeName}.gz`,
    );
    await fs.writeFile(storedPath, compressedBuffer);
    storedAttachments.push(
      previewAttachment({
        label: safeName,
        filename: safeName,
        content_type: upload.mimetype || "application/octet-stream",
        size_bytes: upload.size ?? upload.buffer.length,
        compressed_size_bytes: compressedBuffer.length,
        source_path: storedPath,
      }),
    );
  }

  return storedAttachments;
}

function renderClientLeadEmail({
  template,
  client,
  senderMode,
  customSenderEmail,
  technologies = [],
  emailDetailsParagraph,
  extraAttachments = [],
}) {
  const fromEmail = resolveSenderEmail(senderMode, customSenderEmail);
  const contactNumbers = ["+91 93608 89434", "8925210434"];
  const contactNumbersInline = contactNumbers.join(" / ");

  const senderModeLine =
    senderMode === "sales" || senderMode === "admin"
      ? `You can reach us through our managed outreach channel, or call us directly at ${contactNumbersInline}.`
      : `Feel free to reply to this email or call us at ${contactNumbersInline}.`;

  const pitchDeckPath = getPitchDeckPath();

  const documentNames = [];
  if (pitchDeckPath) {
    documentNames.push(path.basename(pitchDeckPath));
  }
  for (const attachment of extraAttachments) {
    if (attachment?.filename) {
      documentNames.push(attachment.filename);
    }
  }
  const uniqueDocumentNames = [...new Set(documentNames)];

  const technologyStyles = {
    "precision-outreach":
      "For this engagement, our recommended service focus includes: {technologies}.",
    "market-research-angle":
      "Based on our research into your segment, the most relevant capability areas are: {technologies}.",
    "product-led-pitch":
      "A practical product scope for your business could cover: {technologies}.",
    "reputation-builder":
      "To strengthen your digital credibility end-to-end, we typically combine: {technologies}.",
    "quick-intro":
      "Proposed service areas for this discussion: {technologies}.",
  };

  // ─── Template visual design ───────────────────────────────────────────────
  const templateDesigns = {
    "precision-outreach": {
      badge: "Growth Strategy",
      headline: "A Structured Digital Plan Built for Your Business",
      supporting:
        "Execution-ready website and app solutions designed to improve trust, attract quality leads, and convert them consistently.",
      accent: "#0d9488",
      accentSoft: "#ccfbf1",
      heroGradient: "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)",
      panel: "#f0fdfa",
    },
    "market-research-angle": {
      badge: "Research-Led Outreach",
      headline: "We Identified a Real Opportunity for Your Business",
      supporting:
        "After reviewing your industry's digital landscape, we believe your brand is positioned to capture significantly more online traction.",
      accent: "#1d4ed8",
      accentSoft: "#dbeafe",
      heroGradient: "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)",
      panel: "#eff6ff",
    },
    "product-led-pitch": {
      badge: "Product Strategy",
      headline: "A Better Digital Experience Starts Here",
      supporting:
        "Purpose-built websites and mobile apps that turn visitor attention into real enquiries — designed around your customers, not templates.",
      accent: "#7c3aed",
      accentSoft: "#ede9fe",
      heroGradient: "linear-gradient(135deg, #5b21b6 0%, #8b5cf6 100%)",
      panel: "#f5f3ff",
    },
    "reputation-builder": {
      badge: "Brand Elevation",
      headline: "Your Business Deserves a Presence That Matches Its Reputation",
      supporting:
        "A refined digital strategy built to strengthen credibility, sharpen perception, and attract higher-quality enquiries from day one.",
      accent: "#b45309",
      accentSoft: "#fef3c7",
      heroGradient: "linear-gradient(135deg, #92400e 0%, #f59e0b 100%)",
      panel: "#fffbeb",
    },
    "quick-intro": {
      badge: "Direct Outreach",
      headline: "A Quick, Honest Introduction from Cogitation Works",
      supporting:
        "We keep things brief because your time matters — here's who we are, what we do, and why we think it's worth a conversation.",
      accent: "#0f766e",
      accentSoft: "#d1fae5",
      heroGradient: "linear-gradient(135deg, #065f46 0%, #10b981 100%)",
      panel: "#ecfdf5",
    },
  };

  // ─── Per-template email paragraphs ────────────────────────────────────────
  const templateParagraphs = {
    "precision-outreach": [
      `Hi ${client.name},`,
      `We've been reviewing businesses across digital platforms and ${client.name} stood out as one with genuine growth potential — and a clear opportunity to convert more online interest into real customers.`,
      `At ${config.companyName}, we build professional websites and mobile applications with a single focus: making your business easier to discover, easier to trust, and easier to choose.`,
      `We'd love to put together a clear, execution-ready plan for your business — no generic proposals, just a focused approach built around what ${client.name} actually needs.`,
      `Looking forward to connecting.`,
    ],
    "market-research-angle": [
      `Hi ${client.name},`,
      `While conducting research across industry directories, search platforms, and digital channels, ${client.name} stood out as a business with a strong foundation and clear room to grow its online reach.`,
      `We specialise in building websites and mobile app experiences that help brands like yours attract better leads, hold visitor attention longer, and make a sharper first impression.`,
      `We're not reaching out broadly — we reached out because we saw something specific worth discussing. We'd be glad to share a tailored concept at your convenience.`,
      `Looking forward to hearing from you.`,
    ],
    "product-led-pitch": [
      `Hi ${client.name},`,
      `The difference between a visitor who leaves and a customer who converts often comes down to one thing: a digital experience that's clear, fast, and built for real intent. We believe ${client.name} is in a strong position to close that gap.`,
      `${config.companyName} designs and builds production-ready websites and mobile applications — built not just to look good, but to perform at every customer touchpoint that matters.`,
      `We'd love to walk you through a practical product concept tailored to ${client.name}. No guesswork, no jargon — just a clear direction you can act on.`,
      `We look forward to connecting.`,
    ],
    "reputation-builder": [
      `Hi ${client.name},`,
      `We came across ${client.name} while reviewing businesses that have earned genuine market credibility — and we noticed your digital presence, while solid, may not yet be doing full justice to what you've built.`,
      `We work with established brands to create premium websites and mobile experiences that elevate perception, reduce friction in the sales journey, and leave the right impression on every new visitor who finds you.`,
      `This isn't about starting over. It's about ensuring your digital touchpoints are as strong as the business behind them. We'd love to share a tailored roadmap.`,
      `Looking forward to the conversation.`,
    ],
    "quick-intro": [
      `Hi ${client.name},`,
      `We're ${config.companyName} — a digital product studio that builds professional websites and mobile apps for growing businesses. We came across ${client.name} and wanted to make a quick, direct introduction.`,
      `We keep our outreach short because we'd rather demonstrate value than describe it. If there's an opportunity to sharpen your digital presence, we can show you what that looks like in a brief concept note.`,
      `If you're open to it, we'd be happy to send something across — no commitment, no pressure.`,
      `Warm regards.`,
    ],
  };

  const technologyLine = technologies.length
    ? technologyStyles[template.id].replace(
        "{technologies}",
        technologies.join(", "),
      )
    : "";

  const paragraphs = [...templateParagraphs[template.id]];
  if (technologyLine) {
    paragraphs.splice(3, 0, technologyLine);
  }
  if (emailDetailsParagraph) {
    paragraphs.splice(paragraphs.length - 1, 0, emailDetailsParagraph);
  }

  const design = templateDesigns[template.id];
  const subjectLine = template.preview_subject.replace(
    "{client_name}",
    client.name,
  );
  const greetingLine = paragraphs[0] || `Hi ${client.name},`;
  const narrativeLines = paragraphs.slice(1, -1);
  const closingLine = paragraphs[paragraphs.length - 1] || "";

  const technologyChips = technologies
    .map(
      (item) =>
        `<span style="display: inline-block; margin: 0 8px 8px 0; padding: 5px 14px; border-radius: 6px; background: ${design.accentSoft}; color: ${design.accent}; font-size: 12px; font-weight: 600; letter-spacing: 0.01em;">${escapeHtml(item)}</span>`,
    )
    .join("");

  const narrativeHtml = narrativeLines
    .map(
      (line) =>
        `<p style="margin: 0 0 16px; color: #374151; font-size: 15px; line-height: 1.8;">${escapeHtml(line)}</p>`,
    )
    .join("");

  // ─── HTML email body ──────────────────────────────────────────────────────
  const htmlBody = `<div style="font-family: 'Segoe UI', Tahoma, Arial, sans-serif; background: #f1f5f9; padding: 32px 16px; color: #0f172a;">
  <div style="max-width: 660px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 32px rgba(15, 23, 42, 0.10);">

    <!-- Header -->
    <div style="background: ${design.heroGradient}; padding: 38px 36px 34px; color: #ffffff;">
      <p style="margin: 0 0 14px; font-size: 10px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; opacity: 0.78;">${escapeHtml(design.badge)}</p>
      <h1 style="margin: 0 0 12px; font-size: 23px; font-weight: 800; line-height: 1.3; letter-spacing: -0.01em;">${escapeHtml(design.headline)}</h1>
      <p style="margin: 0; font-size: 14px; line-height: 1.75; opacity: 0.92;">${escapeHtml(design.supporting)}</p>
    </div>

    <!-- Body -->
    <div style="padding: 36px 36px 4px;">
      <p style="margin: 0 0 20px; font-size: 16px; font-weight: 600; color: #0f172a;">${escapeHtml(greetingLine)}</p>
      ${narrativeHtml}
    </div>

    ${
      technologies.length
        ? `<!-- Service Focus -->
    <div style="margin: 4px 36px 0; padding: 20px 22px; border-radius: 12px; background: ${design.panel}; border: 1px solid ${design.accentSoft};">
      <p style="margin: 0 0 12px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.14em; color: ${design.accent};">Service Focus</p>
      <div style="line-height: 1;">${technologyChips}</div>
    </div>`
        : ""
    }

    <!-- Contact & Next Step -->
    <div style="padding: 28px 36px 0;">
      <hr style="margin: 0 0 24px; border: none; border-top: 1px solid #e2e8f0;" />
      <div style="padding: 20px 24px; border-radius: 12px; background: ${design.panel}; border-left: 4px solid ${design.accent}; margin-bottom: 20px;">
        <p style="margin: 0 0 8px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.14em; color: ${design.accent};">Get in Touch</p>
        <p style="margin: 0 0 10px; font-size: 14px; color: #374151; line-height: 1.75;">${escapeHtml(senderModeLine)}</p>
        <p style="margin: 0; font-size: 14px; color: #374151;">Phone / WhatsApp: <strong style="color: #0f172a;">${escapeHtml(contactNumbersInline)}</strong></p>
      </div>

      ${
        uniqueDocumentNames.length
          ? `<!-- Attachments -->
      <div style="padding: 18px 22px; border-radius: 12px; background: #f8fafc; border: 1px solid #e2e8f0; margin-bottom: 20px;">
        <p style="margin: 0 0 10px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.14em; color: #64748b;">Attached for Your Reference</p>
        <ul style="margin: 0; padding-left: 18px; color: #374151; font-size: 14px; line-height: 1.9;">
          ${uniqueDocumentNames.map((filename) => `<li>${escapeHtml(filename)}</li>`).join("")}
        </ul>
      </div>`
          : ""
      }

      <p style="margin: 0 0 32px; font-size: 14px; color: #64748b; line-height: 1.75;">${escapeHtml(closingLine)}</p>
    </div>

    <!-- Footer -->
    <div style="border-top: 1px solid #e2e8f0; padding: 20px 36px; background: #f8fafc;">
      <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 2;">
        <strong style="display: block; font-size: 14px; color: #0f172a; margin-bottom: 2px;">${escapeHtml(config.companyName)}</strong>
        ${escapeHtml(contactNumbersInline)}&nbsp;&nbsp;&middot;&nbsp;&nbsp;<a href="${escapeHtml(config.companyWebsite)}" target="_blank" rel="noreferrer" style="color: ${design.accent}; text-decoration: none;">${escapeHtml(config.companyWebsite)}</a>
      </p>
    </div>

  </div>
</div>`;

  // ─── Plain-text fallback ──────────────────────────────────────────────────
  const textBody = [
    `${design.headline}`,
    `${design.supporting}`,
    "",
    ...paragraphs,
    "",
    ...(technologies.length
      ? ["Service Focus:", technologies.map((t) => `  - ${t}`).join("\n"), ""]
      : []),
    "Get in Touch:",
    senderModeLine,
    `Phone / WhatsApp: ${contactNumbersInline}`,
    "",
    ...(uniqueDocumentNames.length
      ? [
          "Attached for Your Reference:",
          uniqueDocumentNames.map((f) => `  - ${f}`).join("\n"),
          "",
        ]
      : []),
    "---",
    `${config.companyName}`,
    `${contactNumbersInline}  |  ${config.companyWebsite}`,
  ].join("\n");

  // ─── Attachments ──────────────────────────────────────────────────────────
  const attachments = [];
  if (pitchDeckPath) {
    attachments.push(
      previewAttachment({
        label: "Cogitation Works Pitch Deck",
        filename: path.basename(pitchDeckPath),
        content_type: "application/pdf",
        source_path: pitchDeckPath,
      }),
    );
  }
  extraAttachments.forEach((attachment) => attachments.push(attachment));

  return previewEmail({
    templateId: template.id,
    templateTitle: template.title,
    recipientName: client.name,
    recipientEmail: client.email,
    subject: subjectLine,
    htmlBody,
    textBody,
    fromName: config.companyName,
    fromEmail,
    attachments,
  });
}

async function previewClientLeadEmails(db, payload, actor) {
  const validated = validateLeadPayload(payload);
  validateSenderAccess(
    actor,
    validated.sender_mode,
    validated.custom_sender_email,
  );

  const variants = CLIENT_LEAD_VARIANTS.map((template) => ({
    template,
    previews: validated.clients.map((client) =>
      publicPreview(
        renderClientLeadEmail({
          template,
          client,
          senderMode: validated.sender_mode,
          customSenderEmail: validated.custom_sender_email,
          technologies: validated.technologies,
          emailDetailsParagraph: validated.email_details_paragraph,
        }),
      ),
    ),
  }));

  const activeTemplateId =
    validated.selected_template_id || CLIENT_LEAD_VARIANTS[0]?.id || "";

  await logAction(db, {
    actorName: actor.full_name,
    actorRole: actor.role,
    action: "client_lead_preview_generated",
    targetType: "lead_preview",
    metadata: {
      client_count: validated.clients.length,
      sender_mode: validated.sender_mode,
      active_template_id: activeTemplateId,
    },
  });

  return {
    variants,
    active_template_id: activeTemplateId,
  };
}

async function sendClientLeadCampaign(
  db,
  payload,
  actor,
  emailFiles,
  personalFiles,
) {
  const validated = validateLeadPayload(payload, {
    requireSelectedTemplate: true,
  });
  validateSenderAccess(
    actor,
    validated.sender_mode,
    validated.custom_sender_email,
  );
  if (validated.sender_mode === "gmail") {
    if (!validated.custom_sender_app_password) {
      throw createHttpError(
        422,
        "Enter the Gmail app password to send using Gmail Direct.",
      );
    }
    if (validated.scheduled_for) {
      throw createHttpError(
        422,
        "Scheduled sends are not supported for Gmail Direct. Use Send now.",
      );
    }
  }
  const template = getTemplateById(validated.selected_template_id);

  const recordId = new ObjectId();
  const recordKey = serializeId(recordId);
  const emailAttachments = await persistUploadedAttachments(emailFiles, {
    category: "email",
    recordKey,
  });
  const personalAttachments = await persistUploadedAttachments(personalFiles, {
    category: "personal",
    recordKey,
  });

  const previews = validated.clients.map((client) =>
    renderClientLeadEmail({
      template,
      client,
      senderMode: validated.sender_mode,
      customSenderEmail: validated.custom_sender_email,
      technologies: validated.technologies,
      emailDetailsParagraph: validated.email_details_paragraph,
      extraAttachments: emailAttachments,
    }),
  );

  const now = new Date();
  const isScheduled =
    validated.scheduled_for &&
    validated.scheduled_for.getTime() > now.getTime();
  const deliveryResults = [];
  if (isScheduled) {
    for (const preview of previews) {
      deliveryResults.push({
        recipient_name: preview.recipient_name,
        recipient_email: preview.recipient_email,
        subject: preview.subject,
        delivered: false,
        message: `Scheduled for ${validated.scheduled_for.toISOString()}`,
      });
    }
  } else {
    for (const preview of previews) {
      const delivery = await deliverEmail(preview, {
        senderMode: validated.sender_mode,
        gmailCredentials:
          validated.sender_mode === "gmail"
            ? {
                email: validated.custom_sender_email,
                appPassword: validated.custom_sender_app_password,
              }
            : null,
      });
      deliveryResults.push({
        recipient_name: preview.recipient_name,
        recipient_email: preview.recipient_email,
        subject: preview.subject,
        delivered: delivery.delivered,
        message: delivery.message,
      });
    }
  }

  const deliverySummary = isScheduled
    ? {
        total: previews.length,
        delivered: 0,
        failed: previews.length,
        dispatch_status: "scheduled",
      }
    : summarizeDeliveryResults(deliveryResults);

  const document = {
    _id: recordId,
    owner_user_id: actor.id,
    content_type: validated.content_type,
    template_id: template.id,
    template_title: template.title,
    sender_mode: validated.sender_mode,
    custom_sender_email: validated.custom_sender_email,
    from_email: previews[0]?.from_email || defaultSenderEmail(),
    delivery_mode: validated.delivery_mode,
    clients: validated.clients,
    technologies: validated.technologies,
    email_details_paragraph: validated.email_details_paragraph,
    personal_use_paragraph: validated.personal_use_paragraph,
    email_attachments: emailAttachments.map(internalAttachmentRecord),
    personal_attachments: personalAttachments.map(internalAttachmentRecord),
    emails: previews.map((preview) => ({
      ...preview,
      attachments: (preview.attachments || []).map(internalAttachmentRecord),
    })),
    delivery_results: deliveryResults,
    created_by: actor.full_name,
    created_by_role: actor.role,
    created_at: now,
    deleted_at: null,
    last_sent_at: isScheduled ? validated.scheduled_for : now,
    resend_count: 0,
    scheduled_for: validated.scheduled_for,
    dispatch_status: deliverySummary.dispatch_status,
  };

  await db.collection(LEAD_HISTORY_COLLECTION).insertOne(document);

  await logAction(db, {
    actorName: actor.full_name,
    actorRole: actor.role,
    action: "client_lead_sent",
    targetType: "lead_campaign",
    targetId: recordKey,
    metadata: {
      template_id: template.id,
      client_count: validated.clients.length,
      sender_mode: validated.sender_mode,
      dispatch_status: deliverySummary.dispatch_status,
      scheduled_for: validated.scheduled_for,
      email_attachment_count: emailAttachments.length,
      personal_attachment_count: personalAttachments.length,
    },
  });

  if (!isScheduled && deliverySummary.delivered === 0) {
    const firstFailure = deliveryResults.find((result) => !result.delivered);
    throw createHttpError(
      502,
      firstFailure?.message ||
        "Email delivery failed for all recipients. Check SMTP credentials and sender permissions.",
    );
  }

  return {
    message: isScheduled
      ? `Client lead campaign scheduled for ${validated.scheduled_for.toLocaleString()}.`
      : deliverySummary.failed > 0
        ? `Campaign dispatched to ${deliverySummary.delivered}/${deliverySummary.total} recipient(s). ${deliverySummary.failed} failed.`
        : "Client lead email batch sent and stored successfully.",
    record: publicSentRecord(document),
  };
}

async function listSentClientLeadCampaigns(
  db,
  { ownerUserId = null, excludeOwnerUserId = null, limit = 40 } = {},
) {
  const query = {
    ...activeCampaignClause(),
  };
  if (ownerUserId) {
    query.owner_user_id = ownerUserId;
  } else if (excludeOwnerUserId) {
    query.owner_user_id = { $ne: excludeOwnerUserId };
  }

  const records = await db
    .collection(LEAD_HISTORY_COLLECTION)
    .find(query)
    .sort({ last_sent_at: -1 })
    .limit(limit)
    .toArray();

  return records.map(publicSentRecord);
}

async function getClientLeadHistorySections(db, actor) {
  const sections = [
    {
      id: "self",
      title: "My Email History",
      description:
        "Campaigns sent by your own account. You can resend from here.",
      allow_resend: true,
      records: await listSentClientLeadCampaigns(db, {
        ownerUserId: actor.id,
        limit: 60,
      }),
    },
  ];

  if (actor.role === "super_admin" || actor.can_view_team_history) {
    sections.push({
      id: "others",
      title: "Others' Email History",
      description:
        actor.role === "super_admin"
          ? "Campaigns sent by other users. Super admins can review and resend these records."
          : "Campaigns sent by other users. Visible because super admin granted access.",
      allow_resend: actor.role === "super_admin",
      records: await listSentClientLeadCampaigns(db, {
        excludeOwnerUserId: actor.id,
        limit: 60,
      }),
    });
  }

  return { sections };
}

async function resendClientLeadCampaign(db, recordId, actor) {
  const objectId = ensureObjectId(recordId, "Sent email record not found.");
  const query =
    actor.role === "super_admin"
      ? { _id: objectId, ...activeCampaignClause() }
      : { _id: objectId, owner_user_id: actor.id, ...activeCampaignClause() };

  const document = await db.collection(LEAD_HISTORY_COLLECTION).findOne(query);
  if (!document) {
    throw createHttpError(404, "Sent email record not found.");
  }

  if (document.dispatch_status === "scheduled" && document.scheduled_for) {
    const scheduledAt = new Date(document.scheduled_for);
    if (scheduledAt.getTime() > Date.now()) {
      throw createHttpError(
        409,
        `Campaign is scheduled for ${scheduledAt.toLocaleString()} and cannot be resent yet.`,
      );
    }
  }

  if (document.sender_mode === "gmail") {
    throw createHttpError(
      409,
      "Resend is not available for Gmail Direct because app passwords are never stored. Create a new send from Workspace.",
    );
  }

  const deliveryResults = [];
  for (const preview of document.emails || []) {
    const delivery = await deliverEmail(preview);
    deliveryResults.push({
      recipient_name: preview.recipient_name,
      recipient_email: preview.recipient_email,
      subject: preview.subject,
      delivered: delivery.delivered,
      message: delivery.message,
    });
  }

  const now = new Date();
  const deliverySummary = summarizeDeliveryResults(deliveryResults);
  await db.collection(LEAD_HISTORY_COLLECTION).updateOne(
    { _id: document._id },
    {
      $set: {
        delivery_results: deliveryResults,
        last_sent_at: now,
        dispatch_status: deliverySummary.dispatch_status,
      },
      $inc: {
        resend_count: 1,
      },
    },
  );

  const updated = await db
    .collection(LEAD_HISTORY_COLLECTION)
    .findOne({ _id: document._id });

  await logAction(db, {
    actorName: actor.full_name,
    actorRole: actor.role,
    action: "client_lead_resent",
    targetType: "lead_campaign",
    targetId: recordId,
    metadata: {
      template_id: updated.template_id,
      client_count: (updated.clients || []).length,
      resend_count: updated.resend_count || 1,
    },
  });

  return {
    message:
      deliverySummary.delivered === 0
        ? "Resend failed for all recipients."
        : deliverySummary.failed > 0
          ? `Resent to ${deliverySummary.delivered}/${deliverySummary.total} recipient(s). ${deliverySummary.failed} failed.`
          : "Client lead email batch resent successfully.",
    record: publicSentRecord(updated),
  };
}

async function dispatchScheduledCampaignDocument(db, document) {
  if (document.sender_mode === "gmail") {
    const errorMessage =
      "Scheduled dispatch is not supported for Gmail Direct. Use Sales/Admin sender for scheduled campaigns.";
    const deliveryResults = (document.emails || []).map((preview) => ({
      recipient_name: preview.recipient_name,
      recipient_email: preview.recipient_email,
      subject: preview.subject,
      delivered: false,
      message: errorMessage,
    }));

    const now = new Date();
    await db.collection(LEAD_HISTORY_COLLECTION).updateOne(
      { _id: document._id },
      {
        $set: {
          delivery_results: deliveryResults,
          last_sent_at: now,
          dispatch_status: "failed",
          scheduled_dispatched_at: now,
          scheduled_error: errorMessage,
        },
      },
    );

    return {
      processed: 1,
      delivered: 0,
      failed: 1,
      errors: [
        {
          id: serializeId(document._id),
          error: errorMessage,
        },
      ],
    };
  }

  const deliveryResults = [];
  for (const preview of document.emails || []) {
    const delivery = await deliverEmail(preview);
    deliveryResults.push({
      recipient_name: preview.recipient_name,
      recipient_email: preview.recipient_email,
      subject: preview.subject,
      delivered: delivery.delivered,
      message: delivery.message,
    });
  }

  const now = new Date();
  const deliverySummary = summarizeDeliveryResults(deliveryResults);
  const updatePayload = {
    $set: {
      delivery_results: deliveryResults,
      last_sent_at: now,
      dispatch_status: deliverySummary.dispatch_status,
      scheduled_dispatched_at: now,
    },
  };
  if (deliverySummary.delivered === 0) {
    updatePayload.$set.scheduled_error =
      deliveryResults.find((result) => !result.delivered)?.message ||
      "Scheduled dispatch failed for all recipients.";
  } else {
    updatePayload.$unset = { scheduled_error: "" };
  }

  await db
    .collection(LEAD_HISTORY_COLLECTION)
    .updateOne({ _id: document._id }, updatePayload);

  await logAction(db, {
    actorName: document.created_by,
    actorRole: document.created_by_role,
    action: "client_lead_scheduled_dispatched",
    targetType: "lead_campaign",
    targetId: serializeId(document._id),
    metadata: {
      template_id: document.template_id,
      client_count: (document.clients || []).length,
      scheduled_for: document.scheduled_for || null,
    },
  });
}

async function dispatchDueScheduledCampaigns(db, { batchSize = 10 } = {}) {
  let processed = 0;

  for (let index = 0; index < batchSize; index += 1) {
    const now = new Date();
    const claimed = await db
      .collection(LEAD_HISTORY_COLLECTION)
      .findOneAndUpdate(
        {
          dispatch_status: "scheduled",
          scheduled_for: { $lte: now },
          ...activeCampaignClause(),
        },
        {
          $set: {
            dispatch_status: "sending",
            scheduled_claimed_at: now,
          },
        },
        {
          sort: { scheduled_for: 1 },
          returnDocument: "after",
        },
      );

    const document = claimed?.value;
    if (!document) {
      break;
    }

    try {
      await dispatchScheduledCampaignDocument(db, document);
      processed += 1;
    } catch (error) {
      await db.collection(LEAD_HISTORY_COLLECTION).updateOne(
        { _id: document._id },
        {
          $set: {
            dispatch_status: "failed",
            scheduled_error:
              error instanceof Error
                ? error.message
                : "Scheduled dispatch failed.",
          },
        },
      );
    }
  }

  return processed;
}

function buildCampaignOwnershipQuery(recordId, actor) {
  const objectId = ensureObjectId(recordId, "Sent email record not found.");
  if (actor.role === "super_admin") {
    return { _id: objectId, ...activeCampaignClause() };
  }
  return { _id: objectId, owner_user_id: actor.id, ...activeCampaignClause() };
}

async function getClientLeadAttachmentForDownload(
  db,
  recordId,
  actor,
  category,
  filename,
) {
  const normalizedCategory = String(category || "")
    .trim()
    .toLowerCase();
  if (!["email", "internal", "personal"].includes(normalizedCategory)) {
    throw createHttpError(422, "Invalid attachment category.");
  }

  const requestedName = String(filename || "").trim();
  if (!requestedName) {
    throw createHttpError(404, "Attachment not found.");
  }

  const query = buildCampaignOwnershipQuery(recordId, actor);
  const document = await db.collection(LEAD_HISTORY_COLLECTION).findOne(query);
  if (!document) {
    throw createHttpError(404, "Sent email record not found.");
  }

  const categoryKey =
    normalizedCategory === "personal" ? "internal" : normalizedCategory;

  const internalAttachments = document.personal_attachments || [];
  const outgoingAttachments = [
    ...(document.email_attachments || []),
    ...(document.emails || []).flatMap((email) => email.attachments || []),
  ];

  const candidates =
    categoryKey === "internal" ? internalAttachments : outgoingAttachments;
  const normalizedRequestedName = requestedName.toLowerCase();
  const attachment = candidates.find(
    (item) =>
      String(item?.filename || "")
        .trim()
        .toLowerCase() === normalizedRequestedName && item?.source_path,
  );

  if (!attachment) {
    throw createHttpError(404, "Attachment not found.");
  }

  return {
    filename: attachment.filename,
    content_type: attachment.content_type || "application/octet-stream",
    source_path: attachment.source_path,
  };
}

async function deleteClientLeadCampaign(db, recordId, actor) {
  if (actor.role !== "super_admin") {
    throw createHttpError(403, "Only super admin can delete sent campaigns.");
  }

  const objectId = ensureObjectId(recordId, "Sent email record not found.");
  const current = await db.collection(LEAD_HISTORY_COLLECTION).findOne({
    _id: objectId,
    ...activeCampaignClause(),
  });
  if (!current) {
    throw createHttpError(404, "Sent email record not found.");
  }

  const deletedAt = new Date();
  await db.collection(LEAD_HISTORY_COLLECTION).updateOne(
    { _id: current._id },
    {
      $set: {
        deleted_at: deletedAt,
        deleted_by: actor.full_name,
        deleted_by_role: actor.role,
        updated_at: deletedAt,
      },
    },
  );

  await logAction(db, {
    actorName: actor.full_name,
    actorRole: actor.role,
    action: "client_lead_deleted",
    targetType: "lead_campaign",
    targetId: recordId,
    metadata: {
      template_id: current.template_id,
      owner_user_id: current.owner_user_id,
      deleted_at: deletedAt,
    },
  });

  const updated = await db
    .collection(LEAD_HISTORY_COLLECTION)
    .findOne({ _id: current._id });
  return {
    message: "Campaign deleted successfully.",
    record: publicSentRecord(updated),
  };
}

async function recoverDeletedClientLeadCampaign(db, recordId, actor) {
  if (actor.role !== "super_admin") {
    throw createHttpError(
      403,
      "Only super admin can recover deleted campaigns.",
    );
  }

  const objectId = ensureObjectId(recordId, "Sent email record not found.");
  const current = await db.collection(LEAD_HISTORY_COLLECTION).findOne({
    _id: objectId,
    deleted_at: { $exists: true, $ne: null },
  });
  if (!current) {
    throw createHttpError(404, "Deleted campaign not found.");
  }

  const recoveredAt = new Date();
  await db.collection(LEAD_HISTORY_COLLECTION).updateOne(
    { _id: current._id },
    {
      $set: {
        deleted_at: null,
        updated_at: recoveredAt,
      },
      $unset: {
        deleted_by: "",
        deleted_by_role: "",
      },
    },
  );

  await logAction(db, {
    actorName: actor.full_name,
    actorRole: actor.role,
    action: "client_lead_recovered",
    targetType: "lead_campaign",
    targetId: recordId,
    metadata: {
      template_id: current.template_id,
      owner_user_id: current.owner_user_id,
      recovered_at: recoveredAt,
    },
  });

  const updated = await db
    .collection(LEAD_HISTORY_COLLECTION)
    .findOne({ _id: current._id });
  return {
    message: "Deleted campaign recovered successfully.",
    record: publicSentRecord(updated),
  };
}

async function cancelScheduledClientLeadCampaign(db, recordId, actor) {
  const query = buildCampaignOwnershipQuery(recordId, actor);
  const current = await db.collection(LEAD_HISTORY_COLLECTION).findOne(query);
  if (!current) {
    throw createHttpError(404, "Sent email record not found.");
  }
  if (current.dispatch_status !== "scheduled") {
    throw createHttpError(409, "Only scheduled campaigns can be cancelled.");
  }

  await db.collection(LEAD_HISTORY_COLLECTION).updateOne(
    { _id: current._id },
    {
      $set: {
        dispatch_status: "cancelled",
        updated_at: new Date(),
      },
    },
  );

  const updated = await db
    .collection(LEAD_HISTORY_COLLECTION)
    .findOne({ _id: current._id });
  return {
    message: "Scheduled campaign cancelled successfully.",
    record: publicSentRecord(updated),
  };
}

async function rescheduleClientLeadCampaign(db, recordId, actor, payload) {
  const scheduledForInput = normalizeOptionalText(payload?.scheduled_for);
  if (!scheduledForInput) {
    throw createHttpError(422, "Schedule date and time is required.");
  }

  const scheduledFor = new Date(scheduledForInput);
  if (Number.isNaN(scheduledFor.getTime())) {
    throw createHttpError(422, "Enter a valid schedule date and time.");
  }
  if (scheduledFor.getTime() <= Date.now()) {
    throw createHttpError(422, "Schedule time must be in the future.");
  }

  const query = buildCampaignOwnershipQuery(recordId, actor);
  const current = await db.collection(LEAD_HISTORY_COLLECTION).findOne(query);
  if (!current) {
    throw createHttpError(404, "Sent email record not found.");
  }
  if (
    !["scheduled", "failed", "cancelled"].includes(
      current.dispatch_status || "scheduled",
    )
  ) {
    throw createHttpError(
      409,
      "Only scheduled/failed/cancelled campaigns can be rescheduled.",
    );
  }

  await db.collection(LEAD_HISTORY_COLLECTION).updateOne(
    { _id: current._id },
    {
      $set: {
        dispatch_status: "scheduled",
        scheduled_for: scheduledFor,
        updated_at: new Date(),
      },
      $unset: {
        scheduled_error: "",
      },
    },
  );

  const updated = await db
    .collection(LEAD_HISTORY_COLLECTION)
    .findOne({ _id: current._id });
  return {
    message: `Campaign rescheduled for ${scheduledFor.toLocaleString()}.`,
    record: publicSentRecord(updated),
  };
}

module.exports = {
  cancelScheduledClientLeadCampaign,
  deleteClientLeadCampaign,
  dispatchDueScheduledCampaigns,
  ensureLeadIndexes,
  getClientLeadAttachmentForDownload,
  getClientLeadHistorySections,
  getClientLeadTemplates,
  previewClientLeadEmails,
  recoverDeletedClientLeadCampaign,
  rescheduleClientLeadCampaign,
  resendClientLeadCampaign,
  sendClientLeadCampaign,
};
