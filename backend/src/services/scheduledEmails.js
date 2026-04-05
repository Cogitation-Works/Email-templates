const { config, resolveSalesSenderEmail } = require("../config");
const {
  createHttpError,
  isValidEmail,
  normalizeOptionalText,
} = require("../utils");
const { deliverEmail, previewEmail } = require("./emailer");

const SCHEDULED_EMAILS_COLLECTION = "scheduled_emails";

async function ensureScheduledEmailIndexes(db) {
  await db
    .collection(SCHEDULED_EMAILS_COLLECTION)
    .createIndex({ status: 1, sendAt: 1 });
  await db
    .collection(SCHEDULED_EMAILS_COLLECTION)
    .createIndex({ createdAt: -1 });
}

function validateSchedulePayload(payload) {
  const email = String(payload?.email || "")
    .trim()
    .toLowerCase();
  const subject = String(payload?.subject || "").trim();
  const message = String(payload?.message || "").trim();
  const sendAtInput = normalizeOptionalText(payload?.sendAt);

  if (!isValidEmail(email)) {
    throw createHttpError(422, "Enter a valid recipient email.");
  }
  if (!subject) {
    throw createHttpError(422, "Subject is required.");
  }
  if (!message) {
    throw createHttpError(422, "Message is required.");
  }
  if (!sendAtInput) {
    throw createHttpError(422, "sendAt is required.");
  }

  const sendAt = new Date(sendAtInput);
  if (Number.isNaN(sendAt.getTime())) {
    throw createHttpError(422, "sendAt must be a valid date-time.");
  }

  return {
    email,
    subject,
    message,
    sendAt,
  };
}

async function createScheduledEmail(db, payload, actor) {
  const validated = validateSchedulePayload(payload);

  const now = new Date();
  const document = {
    email: validated.email,
    subject: validated.subject,
    message: validated.message,
    sendAt: validated.sendAt,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    sentAt: null,
    deliveryMessage: null,
    createdBy: actor?.id || null,
    createdByName: actor?.full_name || null,
  };

  const result = await db
    .collection(SCHEDULED_EMAILS_COLLECTION)
    .insertOne(document);

  return {
    id: String(result.insertedId),
    email: document.email,
    subject: document.subject,
    message: document.message,
    sendAt: document.sendAt,
    status: document.status,
  };
}

async function processDueScheduledEmails(db, { batchSize = 25 } = {}) {
  let processed = 0;
  let sent = 0;
  let failed = 0;
  const now = new Date();

  for (let index = 0; index < batchSize; index += 1) {
    const claimedAt = new Date();
    const claimed = await db
      .collection(SCHEDULED_EMAILS_COLLECTION)
      .findOneAndUpdate(
        {
          status: "pending",
          sendAt: { $lte: now },
        },
        {
          $set: {
            status: "processing",
            updatedAt: claimedAt,
          },
        },
        {
          sort: { sendAt: 1 },
          returnDocument: "after",
        },
      );

    const document = claimed?.value;
    if (!document) {
      break;
    }

    processed += 1;

    const preview = previewEmail({
      templateId: "scheduled-email",
      templateTitle: "Scheduled Email",
      recipientName: document.email,
      recipientEmail: document.email,
      subject: document.subject,
      htmlBody: `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #14213d;"><p>${String(
        document.message,
      )
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br />")}</p></div>`,
      textBody: document.message,
      fromName: config.companyName || "Cogitation Works",
      fromEmail: resolveSalesSenderEmail(),
      attachments: [],
    });

    const delivery = await deliverEmail(preview);

    if (delivery.delivered) {
      sent += 1;
      await db.collection(SCHEDULED_EMAILS_COLLECTION).updateOne(
        { _id: document._id },
        {
          $set: {
            status: "sent",
            sentAt: new Date(),
            updatedAt: new Date(),
            deliveryMessage: delivery.message,
          },
        },
      );
    } else {
      failed += 1;
      await db.collection(SCHEDULED_EMAILS_COLLECTION).updateOne(
        { _id: document._id },
        {
          $set: {
            status: "pending",
            updatedAt: new Date(),
            deliveryMessage: delivery.message,
          },
        },
      );
    }
  }

  return {
    processed,
    sent,
    failed,
  };
}

module.exports = {
  createScheduledEmail,
  ensureScheduledEmailIndexes,
  processDueScheduledEmails,
};
