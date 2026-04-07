const path = require("path");

require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

function toNumber(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value, fallback = false) {
  if (value == null || value === "") {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(
    String(value).trim().toLowerCase(),
  );
}

function normalizeString(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeSameSite(value, fallback = "lax") {
  const normalized = normalizeString(value, fallback).toLowerCase();
  if (["lax", "strict", "none"].includes(normalized)) {
    return normalized;
  }
  return fallback;
}

function isGmailAddress(value) {
  return normalizeString(value).toLowerCase().endsWith("@gmail.com");
}

function buildSmtpAccount(key, options) {
  if (
    !options.host ||
    !options.username ||
    !options.password ||
    !options.senderEmail
  ) {
    return null;
  }

  return {
    key,
    host: options.host,
    port: options.port,
    username: options.username,
    password: options.password,
    senderEmail: options.senderEmail,
    senderName: options.senderName,
    starttls: options.starttls,
  };
}

const frontendOrigins = (() => {
  const explicitOrigins = normalizeString(process.env.FRONTEND_ORIGINS)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const configuredOrigin = normalizeString(process.env.FRONTEND_ORIGIN);
  const vercelUrl = normalizeString(process.env.VERCEL_URL);
  const vercelOrigin = vercelUrl
    ? vercelUrl.startsWith("http")
      ? vercelUrl
      : `https://${vercelUrl}`
    : "";

  const origins = [
    ...explicitOrigins,
    configuredOrigin,
    vercelOrigin,
    "http://localhost:5173",
  ]
    .map((origin) => origin.trim())
    .filter(Boolean);

  return [...new Set(origins)];
})();

const smtpAccounts = [
  buildSmtpAccount("primary", {
    host: normalizeString(process.env.SMTP_HOST),
    port: toNumber(process.env.SMTP_PORT, 587),
    username: normalizeString(process.env.SMTP_USERNAME),
    password: normalizeString(process.env.SMTP_PASSWORD),
    senderEmail: normalizeString(process.env.SMTP_SENDER_EMAIL),
    senderName: normalizeString(
      process.env.SMTP_SENDER_NAME,
      "Cogitation Works",
    ),
    starttls: toBoolean(process.env.SMTP_STARTTLS, true),
  }),
  buildSmtpAccount("secondary", {
    host: normalizeString(process.env.SMTP_SECONDARY_HOST),
    port: toNumber(process.env.SMTP_SECONDARY_PORT, 587),
    username: normalizeString(process.env.SMTP_SECONDARY_USERNAME),
    password: normalizeString(process.env.SMTP_SECONDARY_PASSWORD),
    senderEmail: normalizeString(process.env.SMTP_SECONDARY_SENDER_EMAIL),
    senderName: normalizeString(
      process.env.SMTP_SECONDARY_SENDER_NAME,
      "Cogitation Works",
    ),
    starttls: toBoolean(process.env.SMTP_SECONDARY_STARTTLS, true),
  }),
  buildSmtpAccount("tertiary", {
    host: normalizeString(process.env.SMTP_TERTIARY_HOST),
    port: toNumber(process.env.SMTP_TERTIARY_PORT, 587),
    username: normalizeString(process.env.SMTP_TERTIARY_USERNAME),
    password: normalizeString(process.env.SMTP_TERTIARY_PASSWORD),
    senderEmail: normalizeString(process.env.SMTP_TERTIARY_SENDER_EMAIL),
    senderName: normalizeString(
      process.env.SMTP_TERTIARY_SENDER_NAME,
      "Cogitation Works",
    ),
    starttls: toBoolean(process.env.SMTP_TERTIARY_STARTTLS, true),
  }),
].filter(Boolean);

const zohoImapAccounts = (() => {
  const seen = new Set();
  const accounts = [];

  for (const account of smtpAccounts) {
    const host = String(account.host || "")
      .trim()
      .toLowerCase();
    const username = String(account.username || "")
      .trim()
      .toLowerCase();

    if (
      !host.includes("zoho") ||
      !username ||
      seen.has(username) ||
      isGmailAddress(username) ||
      isGmailAddress(account.senderEmail)
    ) {
      continue;
    }

    seen.add(username);
    accounts.push({
      key: account.key,
      username: account.username,
      password: account.password,
      senderEmail: account.senderEmail,
    });
  }

  return accounts;
})();

const config = {
  port: toNumber(process.env.PORT, 8000),
  nodeEnv: normalizeString(process.env.NODE_ENV, "development"),
  apiPrefix: normalizeString(process.env.API_PREFIX, "/api"),
  frontendOrigins,
  mongodbUri: normalizeString(process.env.MONGODB_URI),
  mongodbStandardUri: normalizeString(process.env.MONGODB_STANDARD_URI),
  mongodbDbName: normalizeString(process.env.MONGODB_DB_NAME),
  mongodbServerSelectionTimeoutMs: toNumber(
    process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    15000,
  ),
  mongodbTlsAllowInvalidCertificates: toBoolean(
    process.env.MONGODB_TLS_ALLOW_INVALID_CERTIFICATES,
    false,
  ),
  mongodbTlsAllowInvalidHostnames: toBoolean(
    process.env.MONGODB_TLS_ALLOW_INVALID_HOSTNAMES,
    false,
  ),
  jwtSecretKey: normalizeString(process.env.JWT_SECRET_KEY),
  jwtAlgorithm: normalizeString(process.env.JWT_ALGORITHM, "HS256"),
  accessTokenExpireMinutes: toNumber(
    process.env.ACCESS_TOKEN_EXPIRE_MINUTES,
    60 * 12,
  ),
  rememberMeExpireDays: toNumber(process.env.REMEMBER_ME_EXPIRE_DAYS, 7),
  otpExpireMinutes: toNumber(process.env.OTP_EXPIRE_MINUTES, 10),
  sessionCookieName: normalizeString(
    process.env.SESSION_COOKIE_NAME,
    "cw_session",
  ),
  secureCookies: toBoolean(
    process.env.SECURE_COOKIES,
    normalizeString(process.env.NODE_ENV, "development") === "production",
  ),
  sessionCookieSameSite: normalizeSameSite(
    process.env.SESSION_COOKIE_SAMESITE,
    normalizeString(process.env.NODE_ENV, "development") === "production"
      ? "none"
      : "lax",
  ),
  sessionCookieDomain: normalizeString(process.env.SESSION_COOKIE_DOMAIN),
  emailDeliveryMode: normalizeString(process.env.EMAIL_DELIVERY_MODE, "log"),
  smtpAccounts,
  companyName: normalizeString(process.env.COMPANY_NAME, "Cogitation Works"),
  companyPhone: normalizeString(process.env.COMPANY_PHONE),
  companyWebsite: normalizeString(process.env.COMPANY_WEBSITE),
  superAdminName: normalizeString(process.env.SUPER_ADMIN_NAME),
  superAdminEmail: normalizeString(process.env.SUPER_ADMIN_EMAIL),
  superAdminPassword: normalizeString(process.env.SUPER_ADMIN_PASSWORD),
  schedulerSecret: normalizeString(process.env.SCHEDULER_SECRET),
  zohoImapEnabled: toBoolean(process.env.ZOHO_IMAP_ENABLED, true),
  zohoImapHost: normalizeString(process.env.ZOHO_IMAP_HOST, "imappro.zoho.in"),
  zohoImapPort: toNumber(process.env.ZOHO_IMAP_PORT, 993),
  zohoImapSecure: toBoolean(process.env.ZOHO_IMAP_SECURE, true),
  zohoImapMailbox: normalizeString(process.env.ZOHO_IMAP_MAILBOX, "INBOX"),
  zohoImapLookbackDays: toNumber(process.env.ZOHO_IMAP_LOOKBACK_DAYS, 21),
  zohoImapSyncBatchSize: toNumber(process.env.ZOHO_IMAP_SYNC_BATCH_SIZE, 80),
  zohoImapSyncCooldownSeconds: toNumber(
    process.env.ZOHO_IMAP_SYNC_COOLDOWN_SECONDS,
    45,
  ),
  zohoImapAccounts,
  zohoSenderEmail: normalizeString(
    process.env.ZOHO_SENDER_EMAIL,
    normalizeString(process.env.SMTP_SECONDARY_SENDER_EMAIL),
  ),
  adminSenderEmail: normalizeString(
    process.env.ADMIN_SENDER_EMAIL,
    normalizeString(process.env.SMTP_TERTIARY_SENDER_EMAIL),
  ),
  systemSenderEmail: normalizeString(
    process.env.SYSTEM_SENDER_EMAIL,
    normalizeString(process.env.SMTP_TERTIARY_SENDER_EMAIL),
  ),
  systemSenderName: normalizeString(
    process.env.SYSTEM_SENDER_NAME,
    "Cogitation Works",
  ),
  workspaceRoot: path.resolve(__dirname, "..", ".."),
  backendRoot: path.resolve(__dirname, ".."),
};

function validateCriticalEnvironment() {
  const errors = [];
  const warnings = [];

  if (!normalizeString(process.env.MONGODB_URI)) {
    errors.push("MONGODB_URI is required.");
  }
  if (!normalizeString(process.env.MONGODB_DB_NAME)) {
    errors.push("MONGODB_DB_NAME is required.");
  }

  if (!normalizeString(process.env.JWT_SECRET_KEY)) {
    errors.push("JWT_SECRET_KEY is required.");
  }

  if (!normalizeString(process.env.SUPER_ADMIN_NAME)) {
    errors.push("SUPER_ADMIN_NAME is required.");
  }
  if (!normalizeString(process.env.SUPER_ADMIN_EMAIL)) {
    errors.push("SUPER_ADMIN_EMAIL is required.");
  }
  if (!normalizeString(process.env.SUPER_ADMIN_PASSWORD)) {
    errors.push("SUPER_ADMIN_PASSWORD is required.");
  }

  if (config.emailDeliveryMode === "smtp" && !config.smtpAccounts.length) {
    errors.push(
      "EMAIL_DELIVERY_MODE=smtp requires at least one valid SMTP account.",
    );
  }

  if (!config.schedulerSecret) {
    warnings.push("SCHEDULER_SECRET is not configured.");
  }

  if (config.sessionCookieSameSite === "none" && !config.secureCookies) {
    warnings.push(
      "SESSION_COOKIE_SAMESITE=none requires SECURE_COOKIES=true in modern browsers.",
    );
  }

  if (config.zohoImapEnabled && !config.zohoImapAccounts.length) {
    warnings.push(
      "ZOHO_IMAP_ENABLED=true but no Zoho-linked SMTP accounts were found for IMAP sync.",
    );
  }

  const isProduction = config.nodeEnv === "production";

  if (warnings.length) {
    console.warn(`[config] Environment warnings:\n- ${warnings.join("\n- ")}`);
  }

  if (errors.length) {
    const message = `[config] Missing or invalid environment variables:\n- ${errors.join("\n- ")}`;
    if (isProduction) {
      throw new Error(message);
    }
    console.warn(message);
  }
}

validateCriticalEnvironment();

function getSmtpAccount(senderEmail) {
  if (!config.smtpAccounts.length) {
    return null;
  }

  if (senderEmail) {
    const normalized = senderEmail.trim().toLowerCase();
    const exact = config.smtpAccounts.find(
      (account) => account.senderEmail.trim().toLowerCase() === normalized,
    );
    if (exact) {
      return exact;
    }
  }

  return config.smtpAccounts[0];
}

function defaultSenderEmail() {
  return (
    getSmtpAccount()?.senderEmail ||
    normalizeString(process.env.SMTP_SENDER_EMAIL)
  );
}

function defaultSenderName() {
  return (
    getSmtpAccount()?.senderName ||
    normalizeString(process.env.SMTP_SENDER_NAME, "Cogitation Works")
  );
}

function resolveSystemSenderEmail() {
  return config.systemSenderEmail || defaultSenderEmail();
}

function resolveSystemSenderName() {
  const systemAccount = getSmtpAccount(resolveSystemSenderEmail());
  return (
    config.systemSenderName || systemAccount?.senderName || defaultSenderName()
  );
}

function resolveSalesSenderEmail() {
  return config.zohoSenderEmail || defaultSenderEmail();
}

function resolveAdminSenderEmail() {
  return config.adminSenderEmail || resolveSystemSenderEmail();
}

module.exports = {
  config,
  defaultSenderEmail,
  defaultSenderName,
  getSmtpAccount,
  resolveAdminSenderEmail,
  resolveSalesSenderEmail,
  resolveSystemSenderEmail,
  resolveSystemSenderName,
  toBoolean,
};
