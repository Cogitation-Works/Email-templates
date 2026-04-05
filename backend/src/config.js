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
  const explicitOrigins = normalizeString(process.env.FRONTEND_ORIGINS);
  if (explicitOrigins) {
    return explicitOrigins
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  return [
    normalizeString(process.env.FRONTEND_ORIGIN, "http://localhost:5173"),
  ];
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

const config = {
  port: toNumber(process.env.PORT, 8000),
  nodeEnv: normalizeString(process.env.NODE_ENV, "development"),
  apiPrefix: normalizeString(process.env.API_PREFIX, "/api"),
  frontendOrigins,
  mongodbUri: normalizeString(
    process.env.MONGODB_URI,
    "mongodb://localhost:27017",
  ),
  mongodbStandardUri: normalizeString(process.env.MONGODB_STANDARD_URI),
  mongodbDbName: normalizeString(
    process.env.MONGODB_DB_NAME,
    "cogitationworks",
  ),
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
  jwtSecretKey: normalizeString(
    process.env.JWT_SECRET_KEY,
    "change-this-secret-before-production",
  ),
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
  secureCookies: toBoolean(process.env.SECURE_COOKIES, false),
  emailDeliveryMode: normalizeString(process.env.EMAIL_DELIVERY_MODE, "log"),
  smtpAccounts,
  companyName: normalizeString(process.env.COMPANY_NAME, "Cogitation Works"),
  companyPhone: normalizeString(process.env.COMPANY_PHONE, "8778905646"),
  companyWebsite: normalizeString(
    process.env.COMPANY_WEBSITE,
    "https://cogitationworks.com/",
  ),
  superAdminName: normalizeString(process.env.SUPER_ADMIN_NAME, "superadmin"),
  superAdminEmail: normalizeString(
    process.env.SUPER_ADMIN_EMAIL,
    "info@cogitationworks.com",
  ),
  superAdminPassword: normalizeString(
    process.env.SUPER_ADMIN_PASSWORD,
    "CW@dec032025",
  ),
  zohoSenderEmail: normalizeString(
    process.env.ZOHO_SENDER_EMAIL,
    normalizeString(process.env.SMTP_SECONDARY_SENDER_EMAIL),
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

  if (!normalizeString(process.env.JWT_SECRET_KEY)) {
    errors.push("JWT_SECRET_KEY is required.");
  }

  if (config.jwtSecretKey === "change-this-secret-before-production") {
    warnings.push("JWT_SECRET_KEY is using the default fallback value.");
  }

  if (config.superAdminPassword === "CW@dec032025") {
    warnings.push("SUPER_ADMIN_PASSWORD is using the default fallback value.");
  }

  if (config.emailDeliveryMode === "smtp" && !config.smtpAccounts.length) {
    errors.push(
      "EMAIL_DELIVERY_MODE=smtp requires at least one valid SMTP account.",
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
  return resolveSystemSenderEmail();
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
