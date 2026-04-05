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
const LEAD_ASSET_ROOT = path.join(config.backendRoot, "storage", "lead-assets");
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
  const contactNumbersInline = contactNumbers.join(", ");
  const senderModeLine =
    senderMode === "sales" || senderMode === "admin"
      ? "We can continue this conversation directly from our managed Zoho outreach setup."
      : `You can reply directly to this email at ${fromEmail}.`;
  const websiteLine = `Explore our work at ${config.companyWebsite}.`;
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
  const documentsLine = uniqueDocumentNames.length
    ? `Documents prepared: ${uniqueDocumentNames.join(", ")}.`
    : "Documents can be shared on request.";

  const technologyStyles = {
    "precision-outreach":
      "For this opportunity, we can focus on: {technologies}.",
    "market-research-angle":
      "Based on our research, relevant capability areas include: {technologies}.",
    "product-led-pitch":
      "A practical product scope could include: {technologies}.",
    "reputation-builder":
      "To strengthen trust and visibility, we typically combine: {technologies}.",
    "quick-intro": "Service focus for this discussion: {technologies}.",
  };

  const templateDesigns = {
    "precision-outreach": {
      badge: "Precision Brief",
      headline: "Structured Digital Growth Plan",
      supporting:
        "A clear, execution-ready approach for stronger web presence and measurable lead conversion.",
      accent: "#0d9488",
      accentSoft: "#ccfbf1",
      heroGradient: "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)",
      panel: "#f0fdfa",
    },
    "market-research-angle": {
      badge: "Research Insight",
      headline: "Opportunity Identified Through Market Signals",
      supporting:
        "Positioned to convert discovery traffic into higher-quality enquiries with a stronger digital journey.",
      accent: "#1d4ed8",
      accentSoft: "#dbeafe",
      heroGradient: "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)",
      panel: "#eff6ff",
    },
    "product-led-pitch": {
      badge: "Product Lens",
      headline: "Website + App Experience Blueprint",
      supporting:
        "A modern product-focused direction that improves clarity, response speed, and customer engagement.",
      accent: "#7c3aed",
      accentSoft: "#ede9fe",
      heroGradient: "linear-gradient(135deg, #5b21b6 0%, #8b5cf6 100%)",
      panel: "#f5f3ff",
    },
    "reputation-builder": {
      badge: "Brand Elevation",
      headline: "Premium Presence, Greater Trust",
      supporting:
        "A refined digital identity strategy designed to strengthen perception and improve long-term conversion quality.",
      accent: "#b45309",
      accentSoft: "#fef3c7",
      heroGradient: "linear-gradient(135deg, #92400e 0%, #f59e0b 100%)",
      panel: "#fffbeb",
    },
    "quick-intro": {
      badge: "Executive Summary",
      headline: "Fast Intro, Clear Next Step",
      supporting:
        "A concise proposal format for teams that prefer immediate clarity and practical action points.",
      accent: "#0f766e",
      accentSoft: "#d1fae5",
      heroGradient: "linear-gradient(135deg, #065f46 0%, #10b981 100%)",
      panel: "#ecfdf5",
    },
  };

  const technologyLine = technologies.length
    ? technologyStyles[template.id].replace(
        "{technologies}",
        technologies.join(", "),
      )
    : "";

  const templateParagraphs = {
    "precision-outreach": [
      `Hi ${client.name},`,
      `We are reaching out from ${config.companyName} after reviewing businesses across multiple digital platforms and noticing the potential in ${client.name}.`,
      "Our team builds professional websites and mobile apps that are designed to improve trust, lead capture, and day-to-day customer engagement.",
      `If you are planning your next digital move, we would be happy to outline a clean solution tailored to your business. ${senderModeLine}`,
      `${websiteLine} ${documentsLine}`,
    ],
    "market-research-angle": [
      `Hi ${client.name},`,
      `During a recent research exercise across industry directories, search listings, and social channels, ${client.name} stood out to us as a business that could benefit from a sharper digital presence.`,
      "We help brands launch impressive websites and mobile app experiences that feel modern, credible, and built for real business growth.",
      "We would be glad to share a focused concept for your brand with no fluff and no unnecessary complexity.",
      `${websiteLine} ${documentsLine}`,
    ],
    "product-led-pitch": [
      `Hi ${client.name},`,
      `We believe ${client.name} has an opportunity to turn more interest into enquiries through a stronger website and a well-structured mobile app experience.`,
      "At Cogitation Works, we design and build production-ready digital products that help businesses present services clearly and convert attention into action.",
      `If useful, we can prepare a practical concept showing what this could look like for your business. ${senderModeLine}`,
      `${websiteLine} ${documentsLine}`,
    ],
    "reputation-builder": [
      `Hi ${client.name},`,
      `We came across ${client.name} while reviewing businesses that already have strong market credibility and could become even more impressive online.`,
      "Our work focuses on premium websites and mobile apps that elevate perception, improve responsiveness, and support long-term digital reputation.",
      `If the timing is right, we would love to introduce a polished roadmap built specifically around your business goals. ${senderModeLine}`,
      `${websiteLine} ${documentsLine}`,
    ],
    "quick-intro": [
      `Hi ${client.name},`,
      `This is a quick introduction from ${config.companyName}. We found ${client.name} while exploring businesses that would benefit from a better digital experience.`,
      "We create professional websites and mobile apps that help brands look stronger and respond faster to new leads.",
      `If you are open to it, we can share a short concept note and estimated approach. ${senderModeLine}`,
      `${websiteLine} ${documentsLine}`,
    ],
  };

  const paragraphs = [...templateParagraphs[template.id]];
  if (technologyLine) {
    paragraphs.splice(3, 0, technologyLine);
  }
  if (emailDetailsParagraph) {
    paragraphs.splice(paragraphs.length - 1, 0, emailDetailsParagraph);
  }

  const resourceItems = [
    `<li style="margin-bottom: 6px;">Website: <a href="${escapeHtml(config.companyWebsite)}" target="_blank" rel="noreferrer">${escapeHtml(config.companyWebsite)}</a></li>`,
    ...uniqueDocumentNames.map(
      (filename) =>
        `<li style="margin-bottom: 6px;">Document: ${escapeHtml(filename)}</li>`,
    ),
  ];

  const design = templateDesigns[template.id];
  const subjectLine = template.preview_subject.replace(
    "{client_name}",
    client.name,
  );
  const greetingLine = paragraphs[0] || `Hi ${client.name},`;
  const narrativeLines = paragraphs.slice(1, -1);
  const closingLine = paragraphs[paragraphs.length - 1] || "";
  const technologyChips = technologies.length
    ? technologies
        .map(
          (item) =>
            `<span style="display: inline-block; margin: 0 8px 8px 0; padding: 6px 10px; border-radius: 999px; background: ${design.accentSoft}; color: ${design.accent}; font-size: 12px; font-weight: 700;">${escapeHtml(item)}</span>`,
        )
        .join("")
    : `<span style="color: #475569; font-size: 13px;">Capability focus will be tailored after your preferred scope is confirmed.</span>`;
  const narrativeHtml = narrativeLines
    .map(
      (line) =>
        `<p style="margin: 0 0 14px; color: #1e293b; font-size: 15px; line-height: 1.78;">${escapeHtml(line)}</p>`,
    )
    .join("");

  const htmlBody = `<div style="font-family: 'Segoe UI', Tahoma, Arial, sans-serif; color: #0f172a; background: #eef2f7; padding: 28px 16px;">
  <div style="max-width: 740px; margin: 0 auto; background: #ffffff; border: 1px solid #dbe5f0; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 48px rgba(15, 23, 42, 0.08);">
    <div style="padding: 28px 28px 24px; background: ${design.heroGradient}; color: #ffffff;">
      <p style="margin: 0 0 12px; display: inline-block; padding: 6px 12px; border-radius: 999px; background: rgba(255,255,255,0.18); font-size: 11px; letter-spacing: 0.14em; font-weight: 700; text-transform: uppercase;">${escapeHtml(design.badge)}</p>
      <h2 style="margin: 0; font-size: 30px; line-height: 1.2; letter-spacing: -0.02em; font-weight: 800;">${escapeHtml(design.headline)}</h2>
      <p style="margin: 12px 0 0; font-size: 15px; line-height: 1.7; opacity: 0.96;">${escapeHtml(design.supporting)}</p>
    </div>

    <div style="padding: 22px 28px; border-bottom: 1px solid #e2e8f0; background: #f8fafc;">
      <div style="display: inline-block; margin-right: 10px; margin-bottom: 8px; padding: 8px 12px; border-radius: 999px; background: #ffffff; border: 1px solid #dbe5f0; color: #334155; font-size: 12px;"><strong style="color: #0f172a;">Subject:</strong> ${escapeHtml(subjectLine)}</div>
      <div style="display: inline-block; margin-right: 10px; margin-bottom: 8px; padding: 8px 12px; border-radius: 999px; background: #ffffff; border: 1px solid #dbe5f0; color: #334155; font-size: 12px;"><strong style="color: #0f172a;">Welcome:</strong> ${escapeHtml(greetingLine)}</div>
      <div style="display: inline-block; margin-right: 10px; margin-bottom: 8px; padding: 8px 12px; border-radius: 999px; background: #ffffff; border: 1px solid #dbe5f0; color: #334155; font-size: 12px;"><strong style="color: #0f172a;">Message:</strong> Professional outreach introduction</div>
      <div style="display: inline-block; margin-bottom: 8px; padding: 8px 12px; border-radius: 999px; background: #ffffff; border: 1px solid #dbe5f0; color: #334155; font-size: 12px;"><strong style="color: #0f172a;">Contact us:</strong> ${escapeHtml(contactNumbersInline)}</div>
    </div>

    <div style="padding: 28px;">
      <p style="margin: 0 0 16px; font-size: 18px; font-weight: 700; color: #0f172a;">${escapeHtml(greetingLine)}</p>
      ${narrativeHtml}

      <div style="margin-top: 18px; padding: 16px; border-radius: 14px; border: 1px solid ${design.accentSoft}; background: ${design.panel};">
        <p style="margin: 0 0 10px; color: ${design.accent}; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em;">Capability focus</p>
        <div>${technologyChips}</div>
      </div>

      <div style="margin-top: 18px; padding: 16px; border-radius: 14px; border: 1px solid #dbe5f0; background: #f8fafc;">
        <p style="margin: 0 0 10px; color: #0f172a; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em;">Website and documents</p>
        <ul style="margin: 0; padding-left: 20px; color: #334155; font-size: 14px; line-height: 1.65;">
          ${resourceItems.join("")}
        </ul>
      </div>

      <div style="margin-top: 18px; padding: 16px; border-radius: 14px; border: 1px solid #dbe5f0; background: #ffffff;">
        <p style="margin: 0 0 8px; color: #0f172a; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em;">Next step</p>
        <p style="margin: 0; color: #334155; font-size: 14px; line-height: 1.7;">${escapeHtml(senderModeLine)} Please contact us at ${escapeHtml(contactNumbersInline)}.</p>
      </div>

      <p style="margin: 20px 0 0; color: #334155; font-size: 14px; line-height: 1.7;">${escapeHtml(closingLine)}</p>

      <div style="margin-top: 24px; padding-top: 18px; border-top: 1px solid #e2e8f0;">
        <p style="margin: 0; color: #0f172a; font-size: 14px; line-height: 1.7;">Regards,<br /><strong>${escapeHtml(config.companyName)}</strong><br />Contact: ${escapeHtml(contactNumbersInline)}<br />Website: <a href="${escapeHtml(config.companyWebsite)}" target="_blank" rel="noreferrer" style="color: ${design.accent}; text-decoration: none;">${escapeHtml(config.companyWebsite)}</a></p>
      </div>
    </div>
  </div>
</div>`;
  const textBody = [
    `${design.badge} - ${design.headline}`,
    design.supporting,
    "",
    `Subject: ${subjectLine}`,
    `Welcome: ${greetingLine}`,
    "Message: Professional outreach introduction",
    `Contact us: ${contactNumbersInline}`,
    "",
    ...paragraphs,
    "",
    "Capability Focus:",
    technologies.length
      ? `- ${technologies.join("\n- ")}`
      : "- Custom scope based on your priorities.",
    "",
    "Website and Documents:",
    `- Website: ${config.companyWebsite}`,
    ...uniqueDocumentNames.map((filename) => `- Document: ${filename}`),
    "",
    "Next Step:",
    `- ${senderModeLine} Please contact us at ${contactNumbersInline}.`,
    "Regards,",
    `${config.companyName}\nContact: ${contactNumbersInline}\nWebsite: ${config.companyWebsite}`,
  ].join("\n\n");

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
      const delivery = await deliverEmail(preview);
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
  getClientLeadHistorySections,
  getClientLeadTemplates,
  previewClientLeadEmails,
  recoverDeletedClientLeadCampaign,
  rescheduleClientLeadCampaign,
  resendClientLeadCampaign,
  sendClientLeadCampaign,
};
