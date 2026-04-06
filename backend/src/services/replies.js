const fs = require("fs/promises");
const path = require("path");
const zlib = require("zlib");
const { ObjectId } = require("mongodb");

let ImapFlow = null;
let simpleParser = null;
try {
  ({ ImapFlow } = require("imapflow"));
  ({ simpleParser } = require("mailparser"));
} catch (_error) {
  ImapFlow = null;
  simpleParser = null;
}

const {
  config,
  resolveAdminSenderEmail,
  resolveSalesSenderEmail,
} = require("../config");
const { USERS_COLLECTION } = require("./users");
const {
  createHttpError,
  ensureObjectId,
  sanitizeFilename,
  serializeId,
} = require("../utils");

const LEAD_HISTORY_COLLECTION = "email_templates";
const LEAD_REPLY_COLLECTION = "lead_client_replies";
const LEAD_REPLY_SYNC_STATE_COLLECTION = "lead_reply_sync_state";
const REPLY_ASSET_ROOT = (() => {
  const explicitRoot = String(process.env.LEAD_REPLY_ASSET_ROOT || "").trim();
  if (explicitRoot) {
    return explicitRoot;
  }

  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join("/tmp", "lead-reply-assets");
  }

  return path.join(config.backendRoot, "storage", "lead-reply-assets");
})();

const runtimeSyncState = {
  inFlight: null,
  lastRunAtMs: 0,
};

function activeCampaignClause() {
  return {
    $or: [{ deleted_at: { $exists: false } }, { deleted_at: null }],
  };
}

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeMessageId(value) {
  return String(value || "")
    .trim()
    .replace(/^<+/, "")
    .replace(/>+$/, "")
    .toLowerCase();
}

function normalizeSubject(value) {
  return String(value || "")
    .trim()
    .replace(/^(re|fw|fwd)\s*:\s*/gi, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildExactNameRegex(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return null;
  }
  return new RegExp(`^\\s*${escapeRegex(normalized)}\\s*$`, "i");
}

function buildSuperAdminNameMatchers(actor = null) {
  const candidates = [
    String(config.superAdminName || "").trim(),
    String(actor?.full_name || "").trim(),
    "superadmin",
  ];

  return [...new Set(candidates.filter(Boolean))]
    .map((value) => buildExactNameRegex(value))
    .filter(Boolean);
}

function collectReferenceMessageIds({ inReplyTo, references }) {
  const values = [];

  if (Array.isArray(inReplyTo)) {
    values.push(...inReplyTo);
  } else if (inReplyTo) {
    values.push(inReplyTo);
  }

  if (Array.isArray(references)) {
    values.push(...references);
  } else if (references) {
    values.push(references);
  }

  return [...new Set(values.map(normalizeMessageId).filter(Boolean))];
}

function stripReplyQuotedText(text) {
  const lines = String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n");
  const cleaned = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      /^on .+wrote:$/i.test(trimmed) ||
      /^from:\s+/i.test(trimmed) ||
      /^sent:\s+/i.test(trimmed) ||
      /^subject:\s+/i.test(trimmed) ||
      /^>\s*/.test(trimmed)
    ) {
      break;
    }
    cleaned.push(line);
  }

  return cleaned.join("\n").trim();
}

function htmlToText(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildPreviewText({ text, html, limit = 260 }) {
  const source = stripReplyQuotedText(text) || htmlToText(html);
  if (!source) {
    return "";
  }
  return source.length > limit ? `${source.slice(0, limit - 1)}...` : source;
}

function buildImapAccounts() {
  if (!config.zohoImapEnabled) {
    return [];
  }

  return (config.zohoImapAccounts || []).map((account) => ({
    key: account.key,
    user: account.username,
    pass: account.password,
    senderEmail: account.senderEmail,
    host: config.zohoImapHost,
    port: config.zohoImapPort,
    secure: config.zohoImapSecure,
    mailbox: config.zohoImapMailbox,
  }));
}

function buildWorkspaceMailboxSet(accounts) {
  const mailboxSet = new Set();

  for (const account of accounts) {
    mailboxSet.add(normalizeEmail(account.user));
    mailboxSet.add(normalizeEmail(account.senderEmail));
  }

  for (const smtpAccount of config.smtpAccounts || []) {
    mailboxSet.add(normalizeEmail(smtpAccount.username));
    mailboxSet.add(normalizeEmail(smtpAccount.senderEmail));
  }

  return mailboxSet;
}

function extractSyncErrorMessage(error) {
  if (!error || typeof error !== "object") {
    return "IMAP sync account failed.";
  }

  const maybeError = error;
  const responseText =
    typeof maybeError.responseText === "string"
      ? maybeError.responseText.trim()
      : "";
  if (responseText) {
    return responseText;
  }

  if (typeof maybeError.message === "string" && maybeError.message.trim()) {
    return maybeError.message.trim();
  }

  return "IMAP sync account failed.";
}

function internalReplyAttachmentRecord(attachment) {
  return {
    label: attachment.label,
    filename: attachment.filename,
    content_type: attachment.content_type,
    size_bytes: attachment.size_bytes ?? null,
    compressed_size_bytes: attachment.compressed_size_bytes ?? null,
    source_path: attachment.source_path ?? null,
  };
}

function publicReplyAttachmentRecord(attachment) {
  return {
    label: attachment.label,
    filename: attachment.filename,
    content_type: attachment.content_type,
    size_bytes: attachment.size_bytes ?? null,
  };
}

function publicLeadAttachmentRecord(attachment) {
  return {
    label: attachment.label,
    filename: attachment.filename,
    content_type: attachment.content_type,
    size_bytes: attachment.size_bytes ?? null,
  };
}

function publicLeadPreview(preview) {
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
    attachments: (preview.attachments || [])
      .filter((attachment) => !attachment?.hidden_in_ui)
      .map(publicLeadAttachmentRecord),
  };
}

function serializeLinkedCampaign(document) {
  return {
    id: serializeId(document._id),
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
    email_attachments: (document.email_attachments || [])
      .filter((attachment) => !attachment?.hidden_in_ui)
      .map(publicLeadAttachmentRecord),
    personal_attachments: (document.personal_attachments || [])
      .filter((attachment) => !attachment?.hidden_in_ui)
      .map(publicLeadAttachmentRecord),
    emails: (document.emails || []).map(publicLeadPreview),
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

function inferReplyMessageKind(document) {
  if (document?.message_kind === "reply" || document?.message_kind === "inbox") {
    return document.message_kind;
  }

  const hasReferences =
    Boolean(document?.in_reply_to) ||
    (Array.isArray(document?.references) && document.references.length > 0);

  return hasReferences ? "reply" : "inbox";
}

function normalizeSenderMode(value) {
  return ["gmail", "sales", "admin"].includes(String(value || "").trim())
    ? String(value || "").trim()
    : "";
}

function collectMailboxAliasesForSender(senderEmail) {
  const normalizedSender = normalizeEmail(senderEmail);
  const values = new Set();

  if (normalizedSender) {
    values.add(normalizedSender);
  }

  for (const account of config.zohoImapAccounts || []) {
    const username = normalizeEmail(account.username);
    const accountSender = normalizeEmail(account.senderEmail);
    if (
      normalizedSender &&
      normalizedSender !== username &&
      normalizedSender !== accountSender
    ) {
      continue;
    }
    if (username) {
      values.add(username);
    }
    if (accountSender) {
      values.add(accountSender);
    }
  }

  return [...values].filter(Boolean);
}

function inferReplySenderModeFromDocument(document) {
  const explicit = normalizeSenderMode(document?.campaign_sender_mode);
  if (explicit) {
    return explicit;
  }

  const salesAliases = collectMailboxAliasesForSender(resolveSalesSenderEmail());
  const adminAliases = collectMailboxAliasesForSender(resolveAdminSenderEmail());
  const mailboxUser = normalizeEmail(document?.mailbox_user);
  const campaignFromEmail = normalizeEmail(document?.campaign_from_email);

  if (
    salesAliases.includes(mailboxUser) ||
    salesAliases.includes(campaignFromEmail)
  ) {
    return "sales";
  }
  if (
    adminAliases.includes(mailboxUser) ||
    adminAliases.includes(campaignFromEmail)
  ) {
    return "admin";
  }

  return "";
}

function buildQueryAnd(clauses) {
  const filtered = (clauses || []).filter(
    (clause) => clause && Object.keys(clause).length > 0,
  );
  if (!filtered.length) {
    return {};
  }
  if (filtered.length === 1) {
    return filtered[0];
  }
  return { $and: filtered };
}

function missingReplyOwnerClause() {
  return {
    $or: [
      { owner_user_id: { $exists: false } },
      { owner_user_id: null },
      { owner_user_id: "" },
    ],
  };
}

function buildReplyOwnerIdMatchClause(actorId) {
  const values = [actorId];
  if (ObjectId.isValid(actorId)) {
    values.push(new ObjectId(actorId));
  }

  return {
    owner_user_id: {
      $in: values,
    },
  };
}

function buildReplySelfScope(actor) {
  const clauses = [buildReplyOwnerIdMatchClause(actor.id)];
  const createdBy = String(actor?.full_name || "").trim();
  const createdByRole = String(actor?.role || "").trim();
  const creatorNameRegex = buildExactNameRegex(createdBy);

  if (createdBy) {
    clauses.push({
      $and: [
        missingReplyOwnerClause(),
        creatorNameRegex
          ? { campaign_created_by: creatorNameRegex }
          : { campaign_created_by: createdBy },
        ...(createdByRole
          ? [
              {
                $or: [
                  { campaign_created_by_role: createdByRole },
                  { campaign_created_by_role: { $exists: false } },
                  { campaign_created_by_role: null },
                  { campaign_created_by_role: "" },
                ],
              },
            ]
          : []),
      ],
    });
  }

  if (createdByRole === "super_admin") {
    const superAdminNames = buildSuperAdminNameMatchers(actor);
    clauses.push({
      $or: [
        { campaign_created_by_role: "super_admin" },
        ...(superAdminNames.length
          ? [{ campaign_created_by: { $in: superAdminNames } }]
          : []),
      ],
    });
  }

  return clauses.length === 1 ? clauses[0] : { $or: clauses };
}

function buildReplyOtherScope(actor) {
  return {
    $nor: [buildReplySelfScope(actor)],
  };
}

function buildReplySenderAccessQuery(actor) {
  if (actor.role === "super_admin") {
    return {};
  }

  const senderClauses = [];
  const salesAliases = collectMailboxAliasesForSender(resolveSalesSenderEmail());
  const adminAliases = collectMailboxAliasesForSender(resolveAdminSenderEmail());

  if (actor.can_use_sales_sender) {
    senderClauses.push({ campaign_sender_mode: "sales" });
    if (salesAliases.length) {
      senderClauses.push({ campaign_from_email: { $in: salesAliases } });
      senderClauses.push({ mailbox_user: { $in: salesAliases } });
    }
  }

  if (actor.can_use_admin_sender) {
    senderClauses.push({ campaign_sender_mode: "admin" });
    if (adminAliases.length) {
      senderClauses.push({ campaign_from_email: { $in: adminAliases } });
      senderClauses.push({ mailbox_user: { $in: adminAliases } });
    }
  }

  if (!senderClauses.length) {
    return { _id: { $exists: false } };
  }

  return { $or: senderClauses };
}

function buildReplyAssetKey(account, uid, messageId) {
  const accountKey = normalizeEmail(account?.user || "mailbox").replace(
    /[^a-z0-9._-]/g,
    "_",
  );
  const messageKey = normalizeMessageId(messageId || "").replace(
    /[^a-z0-9._-]/g,
    "_",
  );
  const fallbackKey = Number.isFinite(uid) && uid > 0 ? `uid-${uid}` : "reply";

  return `${accountKey}-${messageKey || fallbackKey}`;
}

async function persistReplyAttachments(attachments, { assetKey }) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return [];
  }

  const targetRoot = path.join(REPLY_ASSET_ROOT, assetKey);
  await fs.mkdir(targetRoot, { recursive: true });

  const records = [];
  for (let index = 0; index < attachments.length; index += 1) {
    const item = attachments[index];
    const contentBuffer = Buffer.isBuffer(item?.content)
      ? item.content
      : Buffer.from(item?.content || "");
    if (!contentBuffer.length) {
      continue;
    }

    const safeName = sanitizeFilename(
      item?.filename,
      `client-reply-${index + 1}.bin`,
    );
    const compressed = zlib.gzipSync(contentBuffer);
    const storedPath = path.join(
      targetRoot,
      `${String(index + 1).padStart(2, "0")}-${safeName}.gz`,
    );
    await fs.writeFile(storedPath, compressed);

    records.push(
      internalReplyAttachmentRecord({
        label: safeName,
        filename: safeName,
        content_type: item?.contentType || "application/octet-stream",
        size_bytes: contentBuffer.length,
        compressed_size_bytes: compressed.length,
        source_path: storedPath,
      }),
    );
  }

  return records;
}

function serializeReply(document, actorId = null) {
  const seenBy = Array.isArray(document.seen_by_user_ids)
    ? document.seen_by_user_ids
    : [];
  const campaignId =
    document?.campaign_id !== null && document?.campaign_id !== undefined
      ? serializeId(document.campaign_id)
      : null;

  return {
    id: serializeId(document._id),
    campaign_id: campaignId,
    campaign_template_title: document.campaign_template_title || "",
    campaign_created_by: document.campaign_created_by || "",
    campaign_created_by_role: document.campaign_created_by_role || "",
    campaign_sender_mode: inferReplySenderModeFromDocument(document),
    client_name: document.client_name || "",
    client_email: document.client_email || "",
    from_name: document.from_name || "",
    from_email: document.from_email || "",
    to_name: document.to_name || "",
    to_email: document.to_email || "",
    campaign_from_email: document.campaign_from_email || "",
    campaign_to_email: document.campaign_to_email || "",
    mailbox_user: document.mailbox_user || "",
    message_kind: inferReplyMessageKind(document),
    subject: document.subject || "",
    preview_text: document.preview_text || "",
    body_text: document.body_text || "",
    body_html: document.body_html || null,
    attachments: Array.isArray(document.reply_attachments)
      ? document.reply_attachments.map(publicReplyAttachmentRecord)
      : [],
    received_at: document.received_at || document.created_at,
    unread: actorId ? !seenBy.includes(actorId) : false,
  };
}

function buildReplyVisibilityQuery(actor) {
  const baseClauses = [buildReplySenderAccessQuery(actor)];

  if (actor.role !== "super_admin") {
    baseClauses.push({ campaign_created_by_role: { $ne: "super_admin" } });
    for (const matcher of buildSuperAdminNameMatchers()) {
      baseClauses.push({
        campaign_created_by: { $not: matcher },
      });
    }
  }

  if (actor.role !== "super_admin" && !actor.can_view_other_client_replies) {
    baseClauses.push(buildReplySelfScope(actor));
  }

  return buildQueryAnd(baseClauses);
}

async function resolveCampaignOwnerUserId(db, campaign) {
  if (
    campaign?.owner_user_id !== null &&
    campaign?.owner_user_id !== undefined &&
    campaign?.owner_user_id !== ""
  ) {
    return serializeId(campaign.owner_user_id);
  }

  const createdBy = String(campaign?.created_by || "").trim();
  const createdByRole = String(campaign?.created_by_role || "").trim();
  if (!createdBy) {
    return null;
  }

  const user = await db.collection(USERS_COLLECTION).findOne(
    {
      full_name: createdBy,
      ...(createdByRole ? { role: createdByRole } : {}),
    },
    {
      sort: { created_at: 1 },
      projection: { _id: 1 },
    },
  );

  return user ? serializeId(user._id) : null;
}

async function findCampaignByReferences(db, references) {
  if (!references.length) {
    return null;
  }

  return db.collection(LEAD_HISTORY_COLLECTION).findOne(
    {
      ...activeCampaignClause(),
      "delivery_results.provider_message_id": { $in: references },
    },
    {
      sort: { last_sent_at: -1 },
    },
  );
}

function findBestSubjectMatch(candidate, fromEmail, normalizedReplySubject) {
  if (!normalizedReplySubject) {
    return false;
  }

  return (candidate.delivery_results || []).some((result) => {
    const resultEmail = normalizeEmail(result?.recipient_email);
    if (resultEmail !== fromEmail) {
      return false;
    }
    const resultSubject = normalizeSubject(result?.subject);
    return Boolean(resultSubject && resultSubject === normalizedReplySubject);
  });
}

async function findCampaignBySender(db, fromEmail, normalizedReplySubject) {
  if (!fromEmail) {
    return null;
  }

  const candidates = await db
    .collection(LEAD_HISTORY_COLLECTION)
    .find({
      ...activeCampaignClause(),
      "clients.email": fromEmail,
    })
    .sort({ last_sent_at: -1 })
    .limit(30)
    .toArray();

  if (!candidates.length) {
    return null;
  }

  const subjectMatch = candidates.find((candidate) =>
    findBestSubjectMatch(candidate, fromEmail, normalizedReplySubject),
  );

  return subjectMatch || candidates[0];
}

function findClientName(campaign, fromEmail) {
  const match = (campaign.clients || []).find(
    (client) => normalizeEmail(client.email) === fromEmail,
  );
  return match?.name || "";
}

async function syncSingleImapAccount(
  db,
  account,
  ownMailboxSet,
  { force = false } = {},
) {
  const syncStateCollection = db.collection(LEAD_REPLY_SYNC_STATE_COLLECTION);
  const repliesCollection = db.collection(LEAD_REPLY_COLLECTION);

  const state = await syncStateCollection.findOne({
    account_user: normalizeEmail(account.user),
  });
  const lastUid =
    Number.isFinite(state?.last_uid) && state.last_uid > 0 ? state.last_uid : 0;

  let inserted = 0;
  let checked = 0;
  let maxUid = lastUid;

  const client = new ImapFlow({
    host: account.host,
    port: account.port,
    secure: account.secure,
    auth: {
      user: account.user,
      pass: account.pass,
    },
  });

  await client.connect();
  const lock = await client.getMailboxLock(account.mailbox);

  try {
    const searchQuery =
      !force && lastUid > 0
        ? { uid: `${lastUid + 1}:*` }
        : {
            since: new Date(
              Date.now() -
                Math.max(1, config.zohoImapLookbackDays) * 24 * 60 * 60 * 1000,
            ),
          };

    let uids = await client.search(searchQuery);
    uids = (uids || [])
      .map((uid) => Number.parseInt(String(uid), 10))
      .filter((uid) => Number.isFinite(uid) && uid > 0)
      .sort((a, b) => a - b);

    if (!uids.length) {
      await syncStateCollection.updateOne(
        { account_user: normalizeEmail(account.user) },
        {
          $set: {
            account_user: normalizeEmail(account.user),
            last_uid: lastUid,
            last_sync_at: new Date(),
            mailbox: account.mailbox,
            sync_error: null,
          },
        },
        { upsert: true },
      );
      return { account: account.user, inserted, checked, last_uid: lastUid };
    }

    const safeBatchSize = Math.max(1, config.zohoImapSyncBatchSize);
    const fetchUids = force ? uids : uids.slice(-safeBatchSize);

    for await (const message of client.fetch(fetchUids, {
      uid: true,
      envelope: true,
      source: true,
      internalDate: true,
    })) {
      const uid = Number.parseInt(String(message.uid || 0), 10);
      if (Number.isFinite(uid) && uid > maxUid) {
        maxUid = uid;
      }
      checked += 1;

      let parsed;
      try {
        parsed = await simpleParser(message.source);
      } catch (_error) {
        continue;
      }

      const fromAddress = normalizeEmail(
        parsed?.from?.value?.[0]?.address ||
          message?.envelope?.from?.[0]?.address ||
          "",
      );
      if (!fromAddress || ownMailboxSet.has(fromAddress)) {
        continue;
      }

      const subject = String(
        parsed?.subject || message?.envelope?.subject || "",
      ).trim();
      const references = collectReferenceMessageIds({
        inReplyTo: parsed?.inReplyTo,
        references: parsed?.references,
      });

      const normalizedReplySubject = normalizeSubject(subject);
      const campaignByRefs = await findCampaignByReferences(db, references);
      const campaign =
        campaignByRefs ||
        (await findCampaignBySender(db, fromAddress, normalizedReplySubject));

      if (!campaign) {
        continue;
      }

      const bodyText = stripReplyQuotedText(String(parsed?.text || ""));
      const messageId = normalizeMessageId(
        parsed?.messageId || message?.envelope?.messageId || "",
      );
      const toAddress = normalizeEmail(
        parsed?.to?.value?.[0]?.address || account.senderEmail || account.user,
      );
      const replyAttachments = await persistReplyAttachments(
        parsed?.attachments || [],
        {
          assetKey: buildReplyAssetKey(account, uid, messageId || `${uid}`),
        },
      );
      const ownerUserId = await resolveCampaignOwnerUserId(db, campaign);
      const replyDocument = {
        campaign_id: campaign._id,
        owner_user_id: ownerUserId,
        campaign_template_title: campaign.template_title || "",
        campaign_created_by: campaign.created_by || "",
        campaign_created_by_role: campaign.created_by_role || "",
        campaign_sender_mode: normalizeSenderMode(campaign.sender_mode),
        campaign_from_email: campaign.from_email || "",
        campaign_to_email: fromAddress,
        client_name: findClientName(campaign, fromAddress),
        client_email: fromAddress,
        from_name: parsed?.from?.value?.[0]?.name || fromAddress,
        from_email: fromAddress,
        to_name: parsed?.to?.value?.[0]?.name || "",
        to_email: toAddress,
        subject: subject || "(No subject)",
        preview_text: buildPreviewText({
          text: bodyText,
          html: parsed?.html,
        }),
        body_text: bodyText,
        body_html:
          typeof parsed?.html === "string"
            ? parsed.html.slice(0, 250000)
            : null,
        received_at:
          parsed?.date instanceof Date
            ? parsed.date
            : message.internalDate || new Date(),
        mailbox_user: normalizeEmail(account.user),
        mailbox_uid: uid,
        message_kind: campaignByRefs ? "reply" : "inbox",
        message_id: messageId || null,
        in_reply_to: references[0] || null,
        references,
        reply_attachments: replyAttachments,
        seen_by_user_ids: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      const result = await repliesCollection.updateOne(
        {
          mailbox_user: replyDocument.mailbox_user,
          mailbox_uid: replyDocument.mailbox_uid,
        },
        {
          $setOnInsert: replyDocument,
        },
        {
          upsert: true,
        },
      );

      if (result.upsertedCount > 0) {
        inserted += 1;
      }
    }

    await syncStateCollection.updateOne(
      { account_user: normalizeEmail(account.user) },
      {
        $set: {
          account_user: normalizeEmail(account.user),
          last_uid: maxUid,
          last_sync_at: new Date(),
          mailbox: account.mailbox,
          sync_error: null,
        },
      },
      { upsert: true },
    );

    return { account: account.user, inserted, checked, last_uid: maxUid };
  } finally {
    lock.release();
    await client.logout();
  }
}

async function syncClientRepliesFromImap(db, { force = false } = {}) {
  if (!ImapFlow || !simpleParser) {
    return {
      enabled: false,
      skipped: true,
      reason:
        "IMAP dependencies are missing. Install imapflow and mailparser to enable reply sync.",
      inserted: 0,
      checked: 0,
      accounts: [],
    };
  }

  if (!config.zohoImapEnabled) {
    return {
      enabled: false,
      skipped: true,
      reason: "ZOHO_IMAP_ENABLED is false.",
      inserted: 0,
      checked: 0,
      accounts: [],
    };
  }

  const now = Date.now();
  const cooldownMs = Math.max(5, config.zohoImapSyncCooldownSeconds) * 1000;

  if (!force && runtimeSyncState.inFlight) {
    return runtimeSyncState.inFlight;
  }
  if (!force && now - runtimeSyncState.lastRunAtMs < cooldownMs) {
    return {
      enabled: true,
      skipped: true,
      reason: "Sync cooldown is active.",
      inserted: 0,
      checked: 0,
      accounts: [],
    };
  }

  const task = (async () => {
    const accounts = buildImapAccounts();
    if (!accounts.length) {
      return {
        enabled: true,
        skipped: true,
        reason: "No IMAP accounts are configured.",
        inserted: 0,
        checked: 0,
        accounts: [],
      };
    }

    const ownMailboxSet = buildWorkspaceMailboxSet(accounts);
    const accountResults = [];
    let inserted = 0;
    let checked = 0;

    for (const account of accounts) {
      try {
        const result = await syncSingleImapAccount(
          db,
          account,
          ownMailboxSet,
          { force },
        );
        accountResults.push({
          account: result.account,
          inserted: result.inserted,
          checked: result.checked,
        });
        inserted += result.inserted;
        checked += result.checked;
      } catch (error) {
        accountResults.push({
          account: account.user,
          inserted: 0,
          checked: 0,
          error: extractSyncErrorMessage(error),
        });
      }
    }

    return {
      enabled: true,
      skipped: false,
      inserted,
      checked,
      accounts: accountResults,
    };
  })();

  runtimeSyncState.inFlight = task;
  try {
    return await task;
  } finally {
    runtimeSyncState.lastRunAtMs = Date.now();
    runtimeSyncState.inFlight = null;
  }
}

async function ensureLeadReplyIndexes(db) {
  await db
    .collection(LEAD_REPLY_COLLECTION)
    .createIndex({ campaign_id: 1, received_at: -1 });
  await db
    .collection(LEAD_REPLY_COLLECTION)
    .createIndex({ owner_user_id: 1, received_at: -1 });
  await db
    .collection(LEAD_REPLY_COLLECTION)
    .createIndex({ mailbox_user: 1, mailbox_uid: 1 }, { unique: true });
  await db.collection(LEAD_REPLY_COLLECTION).createIndex(
    { message_id: 1 },
    {
      unique: true,
      partialFilterExpression: { message_id: { $type: "string" } },
    },
  );
  await db.collection(LEAD_REPLY_COLLECTION).createIndex({
    seen_by_user_ids: 1,
    received_at: -1,
  });

  await db
    .collection(LEAD_REPLY_SYNC_STATE_COLLECTION)
    .createIndex({ account_user: 1 }, { unique: true });
}

async function summarizeClientRepliesForCampaigns(
  db,
  campaignIds,
  { limitPerCampaign = 5 } = {},
) {
  const normalizedIds = (campaignIds || []).filter(Boolean);
  if (!normalizedIds.length) {
    return new Map();
  }

  const safeLimit = Math.max(1, limitPerCampaign);
  const grouped = await db
    .collection(LEAD_REPLY_COLLECTION)
    .aggregate([
      {
        $match: {
          campaign_id: { $in: normalizedIds },
        },
      },
      { $sort: { received_at: -1 } },
      {
        $group: {
          _id: "$campaign_id",
          reply_count: { $sum: 1 },
          latest_reply_at: { $first: "$received_at" },
          client_replies: {
            $push: {
              _id: "$_id",
              campaign_id: "$campaign_id",
              campaign_template_title: "$campaign_template_title",
              campaign_created_by: "$campaign_created_by",
              campaign_from_email: "$campaign_from_email",
              campaign_to_email: "$campaign_to_email",
              client_name: "$client_name",
              client_email: "$client_email",
              from_name: "$from_name",
              from_email: "$from_email",
              to_name: "$to_name",
              to_email: "$to_email",
              subject: "$subject",
              preview_text: "$preview_text",
              body_text: "$body_text",
              body_html: "$body_html",
              reply_attachments: "$reply_attachments",
              received_at: "$received_at",
              seen_by_user_ids: "$seen_by_user_ids",
            },
          },
        },
      },
      {
        $project: {
          reply_count: 1,
          latest_reply_at: 1,
          client_replies: {
            $slice: ["$client_replies", safeLimit],
          },
        },
      },
    ])
    .toArray();

  const map = new Map();
  for (const item of grouped) {
    map.set(serializeId(item._id), {
      reply_count: item.reply_count || 0,
      latest_reply_at: item.latest_reply_at || null,
      client_replies: (item.client_replies || []).map((reply) =>
        serializeReply(reply),
      ),
    });
  }

  return map;
}

async function hydrateReplyHistoryRecords(db, documents, actorId = null) {
  const serializedReplies = (documents || []).map((document) =>
    serializeReply(document, actorId),
  );

  const replyCampaignIds = [...new Set(
    serializedReplies
      .filter((reply) => reply.message_kind === "reply" && reply.campaign_id)
      .map((reply) => reply.campaign_id),
  )];

  if (!replyCampaignIds.length) {
    return serializedReplies.map((reply) => ({
      ...reply,
      linked_campaign: null,
    }));
  }

  const campaignDocuments = await db
    .collection(LEAD_HISTORY_COLLECTION)
    .find({
      ...activeCampaignClause(),
      _id: {
        $in: replyCampaignIds.map((id) =>
          ensureObjectId(id, "Linked campaign not found."),
        ),
      },
    })
    .toArray();

  const campaignMap = new Map(
    campaignDocuments.map((document) => [
      serializeId(document._id),
      serializeLinkedCampaign(document),
    ]),
  );

  return serializedReplies.map((reply) => ({
    ...reply,
    linked_campaign:
      reply.message_kind === "reply" && reply.campaign_id
        ? campaignMap.get(reply.campaign_id) || null
        : null,
  }));
}

async function listReplyHistoryRecords(
  db,
  actor,
  { scope = "self", limit = 60 } = {},
) {
  const scopeQuery =
    scope === "others" ? buildReplyOtherScope(actor) : buildReplySelfScope(actor);
  const visibilityQuery = buildQueryAnd([
    buildReplySenderAccessQuery(actor),
    scopeQuery,
    ...(actor.role === "super_admin" || actor.can_view_other_client_replies
      ? []
      : [buildReplySelfScope(actor)]),
  ]);

  const excludeCreatorRoles =
    actor.role === "super_admin" || scope !== "others"
      ? []
      : ["super_admin"];
  const excludeCreatorNames =
    actor.role === "super_admin" || scope !== "others"
      ? []
      : buildSuperAdminNameMatchers();

  const documents = await db
    .collection(LEAD_REPLY_COLLECTION)
    .find(
      buildQueryAnd([
        visibilityQuery,
        ...(excludeCreatorRoles.length
          ? [{ campaign_created_by_role: { $nin: excludeCreatorRoles } }]
          : []),
        ...(excludeCreatorNames.length
          ? [{ campaign_created_by: { $nin: excludeCreatorNames } }]
          : []),
      ]),
    )
    .sort({ received_at: -1 })
    .limit(limit)
    .toArray();

  return hydrateReplyHistoryRecords(db, documents, actor.id);
}

async function listClientReplyHistorySections(db, actor) {
  const sections = [
    {
      id: "self",
      title: "My Client Messages",
      description:
        "Replies and inbox messages linked to the outreach you sent.",
      records: await listReplyHistoryRecords(db, actor, {
        scope: "self",
        limit: 80,
      }),
    },
  ];

  if (actor.role === "super_admin" || actor.can_view_other_client_replies) {
    const isSuperAdmin = actor.role === "super_admin";
    sections.push({
      id: "others",
      title: "Others' Client Messages",
      description: isSuperAdmin
        ? "Inbound client activity captured for other users."
        : "Inbound client activity captured for other users, excluding super admin campaigns.",
      records: await listReplyHistoryRecords(db, actor, {
        scope: "others",
        limit: 80,
      }),
    });
  }

  return { sections };
}

async function listClientReplyNotifications(db, actor, { limit = 20 } = {}) {
  const visibilityQuery = buildReplyVisibilityQuery(actor);
  const unreadQuery = {
    ...visibilityQuery,
    seen_by_user_ids: { $ne: actor.id },
  };

  const [unreadCount, notifications] = await Promise.all([
    db.collection(LEAD_REPLY_COLLECTION).countDocuments(unreadQuery),
    db
      .collection(LEAD_REPLY_COLLECTION)
      .find(visibilityQuery)
      .sort({ received_at: -1 })
      .limit(Math.max(1, limit))
      .toArray(),
  ]);

  return {
    unread_count: unreadCount,
    notifications: notifications.map((document) =>
      serializeReply(document, actor.id),
    ),
  };
}

async function markClientReplyNotificationsAsRead(db, actor, ids = []) {
  const visibilityQuery = buildReplyVisibilityQuery(actor);
  const query = {
    ...visibilityQuery,
    seen_by_user_ids: { $ne: actor.id },
  };

  if (Array.isArray(ids) && ids.length > 0) {
    query._id = {
      $in: ids.map((id) =>
        ensureObjectId(id, "Invalid reply notification identifier."),
      ),
    };
  }

  const result = await db.collection(LEAD_REPLY_COLLECTION).updateMany(
    query,
    {
      $addToSet: {
        seen_by_user_ids: actor.id,
      },
      $set: {
        updated_at: new Date(),
      },
    },
  );

  return {
    updated: result.modifiedCount || 0,
  };
}

async function getClientReplyAttachmentForDownload(db, replyId, actor, filename) {
  const requestedName = String(filename || "").trim().toLowerCase();
  if (!requestedName) {
    throw createHttpError(404, "Reply attachment not found.");
  }

  const visibilityQuery = buildReplyVisibilityQuery(actor);
  const replyObjectId = ensureObjectId(
    replyId,
    "Client reply record not found.",
  );
  const reply = await db.collection(LEAD_REPLY_COLLECTION).findOne({
    _id: replyObjectId,
    ...visibilityQuery,
  });
  if (!reply) {
    throw createHttpError(404, "Client reply record not found.");
  }

  const attachments = Array.isArray(reply.reply_attachments)
    ? reply.reply_attachments
    : [];
  const matched = attachments.find(
    (item) =>
      String(item?.filename || "")
        .trim()
        .toLowerCase() === requestedName && item?.source_path,
  );
  if (!matched) {
    throw createHttpError(404, "Reply attachment not found.");
  }

  return {
    filename: matched.filename,
    content_type: matched.content_type || "application/octet-stream",
    source_path: matched.source_path,
  };
}

module.exports = {
  ensureLeadReplyIndexes,
  getClientReplyAttachmentForDownload,
  listClientReplyHistorySections,
  listClientReplyNotifications,
  markClientReplyNotificationsAsRead,
  summarizeClientRepliesForCampaigns,
  syncClientRepliesFromImap,
};
