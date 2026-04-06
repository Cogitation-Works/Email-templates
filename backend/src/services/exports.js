const { ObjectId } = require("mongodb");

const { createHttpError, serializeId } = require("../utils");

const EXPORT_DATASETS = [
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

const WHOLE_DB_COLLECTIONS = [
  { key: "users", collection: "users", sort: { created_at: -1 } },
  { key: "audit_logs", collection: "audit_logs", sort: { created_at: -1 } },
  { key: "email_templates", collection: "email_templates", sort: { last_sent_at: -1 } },
  {
    key: "lead_client_replies",
    collection: "lead_client_replies",
    sort: { received_at: -1 },
  },
  {
    key: "lead_reply_sync_state",
    collection: "lead_reply_sync_state",
    sort: { last_sync_at: -1 },
  },
  {
    key: "scheduled_emails",
    collection: "scheduled_emails",
    sort: { send_at: -1, created_at: -1 },
  },
  {
    key: "login_challenges",
    collection: "login_challenges",
    sort: { created_at: -1 },
  },
  {
    key: "password_reset_challenges",
    collection: "password_reset_challenges",
    sort: { created_at: -1 },
  },
  {
    key: "email_change_challenges",
    collection: "email_change_challenges",
    sort: { created_at: -1 },
  },
];

function getExportManifest() {
  return EXPORT_DATASETS;
}

function normalizeFormat(format) {
  const normalized = String(format || "json")
    .trim()
    .toLowerCase();
  if (!["json", "csv"].includes(normalized)) {
    throw createHttpError(422, "Export format must be json or csv.");
  }
  return normalized;
}

function normalizeDataset(dataset) {
  const normalized = String(dataset || "")
    .trim()
    .toLowerCase();
  const item = EXPORT_DATASETS.find((entry) => entry.id === normalized);
  if (!item) {
    throw createHttpError(404, "Export dataset was not found.");
  }
  return item;
}

function normalizeForExport(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof ObjectId) {
    return serializeId(value);
  }
  if (Array.isArray(value)) {
    return value.map(normalizeForExport);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        normalizeForExport(entry),
      ]),
    );
  }
  return value;
}

function stringifyCsvValue(value) {
  if (value == null) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function buildCsvFromRecords(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return Buffer.from("", "utf8");
  }

  const columns = [...new Set(records.flatMap((record) => Object.keys(record)))];
  const lines = [
    columns.join(","),
    ...records.map((record) =>
      columns
        .map((column) =>
          `"${stringifyCsvValue(record[column]).replaceAll('"', '""')}"`,
        )
        .join(","),
    ),
  ];

  return Buffer.from(lines.join("\n"), "utf8");
}

function buildCsvFromWholeDatabase(document) {
  const rows = [];
  for (const [collectionName, items] of Object.entries(document)) {
    for (const item of items) {
      rows.push({
        collection: collectionName,
        record_id: item._id || item.id || "",
        data: item,
      });
    }
  }

  return buildCsvFromRecords(rows);
}

async function queryCollection(db, collectionName, sort, recordId) {
  const query = {};
  if (recordId) {
    if (!ObjectId.isValid(recordId)) {
      throw createHttpError(404, "Export record id is invalid.");
    }
    query._id = new ObjectId(recordId);
  }

  return db.collection(collectionName).find(query).sort(sort).toArray();
}

async function buildDatasetData(db, dataset, recordId) {
  switch (dataset.id) {
    case "users":
      return normalizeForExport(
        await queryCollection(db, "users", { created_at: -1 }, recordId),
      );
    case "audit_logs":
      return normalizeForExport(
        await queryCollection(db, "audit_logs", { created_at: -1 }, recordId),
      );
    case "sent_history":
      return normalizeForExport(
        await queryCollection(db, "email_templates", { last_sent_at: -1 }, recordId),
      );
    case "client_replies":
      return normalizeForExport(
        await queryCollection(
          db,
          "lead_client_replies",
          { received_at: -1 },
          recordId,
        ),
      );
    case "scheduled_emails":
      return normalizeForExport(
        await queryCollection(
          db,
          "scheduled_emails",
          { send_at: -1, created_at: -1 },
          recordId,
        ),
      );
    case "whole_database": {
      const payload = {};
      for (const item of WHOLE_DB_COLLECTIONS) {
        payload[item.key] = normalizeForExport(
          await db.collection(item.collection).find({}).sort(item.sort).toArray(),
        );
      }
      return payload;
    }
    default:
      throw createHttpError(404, "Export dataset was not found.");
  }
}

async function buildExportFile(db, payload) {
  const dataset = normalizeDataset(payload?.dataset);
  const format = normalizeFormat(payload?.format);
  const recordId = String(payload?.record_id || "").trim();

  if (recordId && !dataset.supportsRecordId) {
    throw createHttpError(
      422,
      "This export dataset does not support exporting a single record by id.",
    );
  }

  const data = await buildDatasetData(db, dataset, recordId || null);
  const safeSuffix = recordId ? `-${recordId}` : "";

  if (format === "json") {
    return {
      filename: `${dataset.id}${safeSuffix}.json`,
      contentType: "application/json; charset=utf-8",
      body: Buffer.from(JSON.stringify(data, null, 2), "utf8"),
    };
  }

  const csvBody =
    dataset.id === "whole_database"
      ? buildCsvFromWholeDatabase(data)
      : buildCsvFromRecords(Array.isArray(data) ? data : [data]);

  return {
    filename: `${dataset.id}${safeSuffix}.csv`,
    contentType: "text/csv; charset=utf-8",
    body: csvBody,
  };
}

module.exports = {
  buildExportFile,
  getExportManifest,
};
