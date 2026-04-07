const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const multer = require("multer");

const { config, toBoolean } = require("./src/config");
const { connectDatabase } = require("./src/db");
const {
  asyncHandler,
  createHttpError,
  parseJsonField,
  toApiErrorResponse,
} = require("./src/utils");
const {
  authenticateRequest,
  clearSessionCookie,
  issueSessionCookie,
  requireRole,
} = require("./src/middleware/auth");
const { listLogs } = require("./src/services/audit");
const {
  ensureUserIndexes,
  ensureSuperAdmin,
  listManagedUsers,
  createManagedUser,
  updateManagedUser,
  resetManagedUserPassword,
  updateOwnProfile,
  deleteManagedUser,
  changePassword,
} = require("./src/services/users");
const {
  ensureLeadIndexes,
  getClientLeadTemplates,
  previewClientLeadEmails,
  sendClientLeadCampaign,
  getClientLeadHistorySections,
  getClientLeadAttachmentForDownload,
  resendClientLeadCampaign,
  dispatchDueScheduledCampaigns,
  cancelScheduledClientLeadCampaign,
  rescheduleClientLeadCampaign,
  deleteClientLeadCampaign,
  recoverDeletedClientLeadCampaign,
} = require("./src/services/leads");
const {
  createScheduledEmail,
  ensureScheduledEmailIndexes,
  processDueScheduledEmails,
} = require("./src/services/scheduledEmails");
const {
  ensureLeadReplyIndexes,
  getClientReplyAttachmentForDownload,
  listClientReplyHistorySections,
  listClientReplyNotifications,
  markClientReplyNotificationsAsRead,
  syncClientRepliesFromImap,
} = require("./src/services/replies");
const {
  buildExportFile,
  getExportManifest,
} = require("./src/services/exports");
const {
  confirmEmailChange,
  ensureAuthIndexes,
  resetPasswordWithChallenge,
  startEmailChangeChallenge,
  startForgotPasswordChallenge,
  startLoginChallenge,
  verifyEmailChangeChallenge,
  verifyForgotPasswordChallenge,
  verifyLoginChallenge,
} = require("./src/services/authentication");

const upload = multer({ storage: multer.memoryStorage() });
const app = express();

function normalizeHeaderValue(value) {
  if (Array.isArray(value)) {
    return normalizeHeaderValue(value[0]);
  }

  return String(value || "")
    .split(",")[0]
    .trim();
}

function defaultPortForProtocol(protocol) {
  return protocol === "https:" ? "443" : protocol === "http:" ? "80" : "";
}

function originMatchesAllowedEntry(origin, allowedOrigin) {
  if (!allowedOrigin) {
    return false;
  }

  if (origin === allowedOrigin) {
    return true;
  }

  try {
    const originUrl = new URL(origin);
    const allowedUrl = new URL(allowedOrigin);
    const allowedHostname = allowedUrl.hostname.toLowerCase();

    if (!allowedHostname.startsWith("*.")) {
      return false;
    }

    const originHostname = originUrl.hostname.toLowerCase();
    const hostnameSuffix = allowedHostname.slice(1);
    const originPort = originUrl.port || defaultPortForProtocol(originUrl.protocol);
    const allowedPort =
      allowedUrl.port || defaultPortForProtocol(allowedUrl.protocol);

    return (
      originUrl.protocol === allowedUrl.protocol &&
      originPort === allowedPort &&
      originHostname.endsWith(hostnameSuffix)
    );
  } catch (_error) {
    return false;
  }
}

function resolveRequestOrigin(req) {
  const forwardedProto =
    normalizeHeaderValue(req.headers["x-forwarded-proto"]) ||
    normalizeHeaderValue(req.protocol) ||
    "http";
  const forwardedHost =
    normalizeHeaderValue(req.headers["x-forwarded-host"]) ||
    normalizeHeaderValue(req.headers.host);

  if (!forwardedHost) {
    return "";
  }

  const protocol = forwardedProto.replace(/:$/, "");
  return `${protocol}://${forwardedHost}`;
}

function isAllowedCorsOrigin(origin, req) {
  if (!origin) {
    return true;
  }

  const requestOrigin = resolveRequestOrigin(req);
  if (requestOrigin && origin === requestOrigin) {
    return true;
  }

  return config.frontendOrigins.some(
    (allowedOrigin) =>
      origin === allowedOrigin || originMatchesAllowedEntry(origin, allowedOrigin),
  );
}

app.use((req, res, next) => {
  cors({
    origin(origin, callback) {
      if (isAllowedCorsOrigin(origin, req)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed by CORS."));
    },
    credentials: true,
  })(req, res, next);
});
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use((req, _res, next) => {
  const prefix = config.apiPrefix;
  if (prefix && prefix !== "/" && !req.path.startsWith(prefix)) {
    req.url = `${prefix}${req.url}`;
  }
  next();
});

let database = null;
const ready = (async () => {
  database = await connectDatabase();
  await ensureUserIndexes(database);
  await ensureAuthIndexes(database);
  await ensureLeadIndexes(database);
  await ensureLeadReplyIndexes(database);
  await ensureScheduledEmailIndexes(database);
  await ensureSuperAdmin(database);
})();

const schedulerRuntime = {
  enabled: false,
  started: false,
  inFlight: false,
  timer: null,
  intervalSeconds: null,
  lastStartedAt: null,
  lastCompletedAt: null,
  lastSuccessAt: null,
  lastDurationMs: null,
  lastResult: null,
  lastError: null,
};

function getDb() {
  if (!database) {
    throw createHttpError(503, "Database is not connected.");
  }
  return database;
}

async function runInternalSchedulerTick() {
  if (schedulerRuntime.inFlight) {
    return;
  }

  schedulerRuntime.inFlight = true;
  schedulerRuntime.lastStartedAt = new Date();
  try {
    await ready;
    const batchSize = 25;
    const campaignProcessed = await dispatchDueScheduledCampaigns(getDb(), {
      batchSize,
    });
    const emailResult = await processDueScheduledEmails(getDb(), { batchSize });
    schedulerRuntime.lastCompletedAt = new Date();
    schedulerRuntime.lastSuccessAt = schedulerRuntime.lastCompletedAt;
    schedulerRuntime.lastDurationMs =
      schedulerRuntime.lastCompletedAt.getTime() -
      schedulerRuntime.lastStartedAt.getTime();
    schedulerRuntime.lastResult = {
      campaignProcessed,
      emailProcessed: emailResult?.processed ?? 0,
      emailSent: emailResult?.sent ?? 0,
      emailFailed: emailResult?.failed ?? 0,
    };
    schedulerRuntime.lastError = null;
  } catch (error) {
    schedulerRuntime.lastCompletedAt = new Date();
    schedulerRuntime.lastDurationMs =
      schedulerRuntime.lastStartedAt &&
      schedulerRuntime.lastCompletedAt
        ? schedulerRuntime.lastCompletedAt.getTime() -
          schedulerRuntime.lastStartedAt.getTime()
        : null;
    schedulerRuntime.lastError =
      error instanceof Error ? error.message : "Scheduler tick failed.";
    console.error("[scheduler] Internal scheduler tick failed:", error);
  } finally {
    schedulerRuntime.inFlight = false;
  }
}

function startInternalSchedulerLoop() {
  if (schedulerRuntime.started) {
    return;
  }

  const enabled = toBoolean(process.env.INTERNAL_SCHEDULER_ENABLED, true);
  schedulerRuntime.enabled = enabled;
  if (!enabled) {
    return;
  }

  const configuredIntervalSeconds = Number.parseInt(
    String(process.env.INTERNAL_SCHEDULER_INTERVAL_SECONDS || "30"),
    10,
  );
  const intervalSeconds = Number.isFinite(configuredIntervalSeconds)
    ? Math.max(15, Math.min(configuredIntervalSeconds, 300))
    : 30;
  schedulerRuntime.intervalSeconds = intervalSeconds;

  schedulerRuntime.started = true;
  schedulerRuntime.timer = setInterval(() => {
    void runInternalSchedulerTick();
  }, intervalSeconds * 1000);

  if (typeof schedulerRuntime.timer?.unref === "function") {
    schedulerRuntime.timer.unref();
  }

  setTimeout(() => {
    void runInternalSchedulerTick();
  }, 5000);
}

startInternalSchedulerLoop();

function serializeSchedulerStatus() {
  return {
    enabled: schedulerRuntime.enabled,
    started: schedulerRuntime.started,
    in_flight: schedulerRuntime.inFlight,
    interval_seconds: schedulerRuntime.intervalSeconds,
    last_started_at: schedulerRuntime.lastStartedAt,
    last_completed_at: schedulerRuntime.lastCompletedAt,
    last_success_at: schedulerRuntime.lastSuccessAt,
    last_duration_ms: schedulerRuntime.lastDurationMs,
    last_result: schedulerRuntime.lastResult,
    last_error: schedulerRuntime.lastError,
  };
}

function isPasswordChangeAllowedPath(pathname) {
  return (
    pathname === "/health" ||
    pathname === `${config.apiPrefix}/auth/me` ||
    pathname === `${config.apiPrefix}/auth/logout` ||
    pathname === `${config.apiPrefix}/auth/change-password` ||
    pathname.startsWith(`${config.apiPrefix}/auth/forgot-password/`)
  );
}

app.use(async (req, res, next) => {
  try {
    await ready;
    next();
  } catch (error) {
    if (req.path === `${config.apiPrefix}/auth/me` || req.path === "/auth/me") {
      res.json({ user: null });
      return;
    }
    next(error);
  }
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post(
  `${config.apiPrefix}/auth/login`,
  asyncHandler(async (req, res) => {
    const result = await startLoginChallenge(getDb(), req.body || {});
    res.json(result);
  }),
);

app.post(
  `${config.apiPrefix}/auth/verify-otp`,
  asyncHandler(async (req, res) => {
    const result = await verifyLoginChallenge(getDb(), req.body || {});
    issueSessionCookie(res, result.user, result.rememberMe);
    res.json({ user: result.user });
  }),
);

app.post(
  `${config.apiPrefix}/auth/change-password`,
  asyncHandler(async (req, res) => {
    const currentUser = await requireRole(getDb(), req, [
      "super_admin",
      "user",
    ]);
    await changePassword(getDb(), {
      ...(req.body || {}),
      user_id: currentUser.id,
    });
    res.json({
      message:
        "Password updated successfully. You can now sign in with the new password.",
    });
  }),
);

app.patch(
  `${config.apiPrefix}/auth/profile`,
  asyncHandler(async (req, res) => {
    const currentUser = await requireRole(getDb(), req, [
      "super_admin",
      "user",
    ]);
    const user = await updateOwnProfile(
      getDb(),
      currentUser.id,
      req.body || {},
    );
    res.json({ user });
  }),
);

app.post(
  `${config.apiPrefix}/auth/forgot-password/start`,
  asyncHandler(async (req, res) => {
    const result = await startForgotPasswordChallenge(getDb(), req.body || {});
    res.json(result);
  }),
);

app.post(
  `${config.apiPrefix}/auth/forgot-password/verify`,
  asyncHandler(async (req, res) => {
    const result = await verifyForgotPasswordChallenge(getDb(), req.body || {});
    res.json(result);
  }),
);

app.post(
  `${config.apiPrefix}/auth/forgot-password/reset`,
  asyncHandler(async (req, res) => {
    const result = await resetPasswordWithChallenge(getDb(), req.body || {});
    res.json(result);
  }),
);

app.post(
  `${config.apiPrefix}/auth/email-change/start`,
  asyncHandler(async (req, res) => {
    const currentUser = await requireRole(getDb(), req, [
      "super_admin",
      "user",
    ]);
    const result = await startEmailChangeChallenge(getDb(), {
      ...(req.body || {}),
      user_id: currentUser.id,
    });
    res.json(result);
  }),
);

app.post(
  `${config.apiPrefix}/auth/email-change/verify`,
  asyncHandler(async (req, res) => {
    const currentUser = await requireRole(getDb(), req, [
      "super_admin",
      "user",
    ]);
    const result = await verifyEmailChangeChallenge(getDb(), {
      ...(req.body || {}),
      user_id: currentUser.id,
    });
    res.json(result);
  }),
);

app.post(
  `${config.apiPrefix}/auth/email-change/confirm`,
  asyncHandler(async (req, res) => {
    const currentUser = await requireRole(getDb(), req, [
      "super_admin",
      "user",
    ]);
    const result = await confirmEmailChange(getDb(), {
      ...(req.body || {}),
      user_id: currentUser.id,
    });
    res.json(result);
  }),
);

app.post(`${config.apiPrefix}/auth/logout`, (_req, res) => {
  clearSessionCookie(res);
  res.json({ message: "Signed out successfully." });
});

app.get(
  `${config.apiPrefix}/auth/me`,
  asyncHandler(async (req, res) => {
    try {
      const user = await authenticateRequest(getDb(), req);
      res.json({ user });
    } catch (error) {
      if (error && typeof error === "object") {
        const maybeError = error;
        if (maybeError.status === 401) {
          clearSessionCookie(res);
          res.json({ user: null });
          return;
        }
      }

      res.json({ user: null });
    }
  }),
);

app.use(async (req, _res, next) => {
  try {
    if (!req.path.startsWith(config.apiPrefix)) {
      next();
      return;
    }

    if (isPasswordChangeAllowedPath(req.path)) {
      next();
      return;
    }

    let currentUser;
    try {
      currentUser = await authenticateRequest(getDb(), req);
    } catch (_error) {
      next();
      return;
    }

    if (currentUser.must_change_password) {
      next(
        createHttpError(
          403,
          "Password update required before accessing this feature.",
        ),
      );
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
});

app.get(
  `${config.apiPrefix}/admin/users`,
  asyncHandler(async (req, res) => {
    await requireRole(getDb(), req, ["super_admin"]);
    res.json(await listManagedUsers(getDb()));
  }),
);

app.post(
  `${config.apiPrefix}/admin/users`,
  asyncHandler(async (req, res) => {
    const currentUser = await requireRole(getDb(), req, ["super_admin"]);
    const result = await createManagedUser(
      getDb(),
      req.body || {},
      currentUser,
    );
    res.json(result);
  }),
);

app.put(
  `${config.apiPrefix}/admin/users/:userId`,
  asyncHandler(async (req, res) => {
    const currentUser = await requireRole(getDb(), req, ["super_admin"]);
    const result = await updateManagedUser(
      getDb(),
      req.params.userId,
      req.body || {},
      currentUser,
    );
    res.json(result);
  }),
);

app.post(
  `${config.apiPrefix}/admin/users/:userId/resend-password`,
  asyncHandler(async (req, res) => {
    const currentUser = await requireRole(getDb(), req, ["super_admin"]);
    const result = await resetManagedUserPassword(
      getDb(),
      req.params.userId,
      currentUser,
    );
    res.json(result);
  }),
);

app.delete(
  `${config.apiPrefix}/admin/users/:userId`,
  asyncHandler(async (req, res) => {
    const currentUser = await requireRole(getDb(), req, ["super_admin"]);
    await deleteManagedUser(getDb(), req.params.userId, currentUser);
    res.json({ message: "User deleted successfully." });
  }),
);

app.get(
  `${config.apiPrefix}/admin/logs`,
  asyncHandler(async (req, res) => {
    await requireRole(getDb(), req, ["super_admin"]);
    res.json(await listLogs(getDb()));
  }),
);

app.get(
  `${config.apiPrefix}/admin/exports/manifest`,
  asyncHandler(async (req, res) => {
    await requireRole(getDb(), req, ["super_admin"]);
    res.json({ datasets: getExportManifest() });
  }),
);

app.get(
  `${config.apiPrefix}/admin/exports/download`,
  asyncHandler(async (req, res) => {
    await requireRole(getDb(), req, ["super_admin"]);

    const file = await buildExportFile(getDb(), {
      dataset: req.query.dataset,
      format: req.query.format,
      record_id: req.query.record_id,
    });

    res.setHeader("Content-Type", file.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${String(file.filename || "export.dat").replace(/\"/g, "'")}"`,
    );
    res.send(file.body);
  }),
);

app.get(
  `${config.apiPrefix}/leads/client-lead/templates`,
  asyncHandler(async (req, res) => {
    await requireRole(getDb(), req, ["super_admin", "user"]);
    res.json({
      content_type: "client_lead",
      variants: getClientLeadTemplates(),
    });
  }),
);

app.post(
  `${config.apiPrefix}/leads/client-lead/preview`,
  asyncHandler(async (req, res) => {
    const currentUser = await requireRole(getDb(), req, [
      "super_admin",
      "user",
    ]);
    const response = await previewClientLeadEmails(
      getDb(),
      req.body || {},
      currentUser,
    );
    res.json(response);
  }),
);

app.post(
  `${config.apiPrefix}/leads/client-lead/send`,
  upload.fields([
    { name: "email_attachments", maxCount: 20 },
    { name: "personal_attachments", maxCount: 20 },
  ]),
  asyncHandler(async (req, res) => {
    const currentUser = await requireRole(getDb(), req, [
      "super_admin",
      "user",
    ]);
    const payload = parseJsonField(
      req.body?.payload,
      "Invalid lead campaign payload.",
    );
    const response = await sendClientLeadCampaign(
      getDb(),
      payload,
      currentUser,
      req.files?.email_attachments || [],
      req.files?.personal_attachments || [],
    );
    res.json(response);
  }),
);

app.get(
  `${config.apiPrefix}/leads/client-lead/history`,
  asyncHandler(async (req, res) => {
    const currentUser = await requireRole(getDb(), req, [
      "super_admin",
      "user",
    ]);
    const response = await getClientLeadHistorySections(getDb(), currentUser);
    res.json(response);
  }),
);

app.get(
  `${config.apiPrefix}/leads/client-lead/replies/notifications`,
  asyncHandler(async (req, res) => {
    const currentUser = await requireRole(getDb(), req, [
      "super_admin",
      "user",
    ]);

    const response = await listClientReplyNotifications(getDb(), currentUser, {
      limit: 20,
    });
    res.json(response);
  }),
);

app.get(
  `${config.apiPrefix}/leads/client-lead/replies/history`,
  asyncHandler(async (req, res) => {
    const currentUser = await requireRole(getDb(), req, [
      "super_admin",
      "user",
    ]);

    const response = await listClientReplyHistorySections(getDb(), currentUser);
    res.json(response);
  }),
);

app.post(
  `${config.apiPrefix}/leads/client-lead/replies/notifications/read`,
  asyncHandler(async (req, res) => {
    const currentUser = await requireRole(getDb(), req, [
      "super_admin",
      "user",
    ]);

    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.filter((value) => typeof value === "string")
      : [];
    const response = await markClientReplyNotificationsAsRead(
      getDb(),
      currentUser,
      ids,
    );
    res.json(response);
  }),
);

app.post(
  `${config.apiPrefix}/leads/client-lead/replies/sync`,
  asyncHandler(async (req, res) => {
    await requireRole(getDb(), req, ["super_admin", "user"]);
    const result = await syncClientRepliesFromImap(getDb(), { force: true });
    res.json({
      message: "Client reply sync completed.",
      result,
    });
  }),
);

app.get(
  `${config.apiPrefix}/leads/client-lead/replies/:replyId/attachments/:filename`,
  asyncHandler(async (req, res) => {
    const currentUser = await requireRole(getDb(), req, [
      "super_admin",
      "user",
    ]);

    const attachment = await getClientReplyAttachmentForDownload(
      getDb(),
      req.params.replyId,
      currentUser,
      decodeURIComponent(req.params.filename || ""),
    );

    const sourcePath = path.resolve(attachment.source_path);
    if (!fs.existsSync(sourcePath)) {
      throw createHttpError(404, "Reply attachment file not found.");
    }

    const fileBuffer = sourcePath.endsWith(".gz")
      ? zlib.gunzipSync(fs.readFileSync(sourcePath))
      : fs.readFileSync(sourcePath);

    const safeFileName = String(attachment.filename || "attachment")
      .replace(/\"/g, "'")
      .trim();
    res.setHeader("Content-Type", attachment.content_type);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeFileName || "attachment"}"`,
    );
    res.send(fileBuffer);
  }),
);

app.get(
  `${config.apiPrefix}/leads/client-lead/sent/:recordId/attachments/:category/:filename`,
  asyncHandler(async (req, res) => {
    const currentUser = await requireRole(getDb(), req, [
      "super_admin",
      "user",
    ]);

    const attachment = await getClientLeadAttachmentForDownload(
      getDb(),
      req.params.recordId,
      currentUser,
      req.params.category,
      decodeURIComponent(req.params.filename || ""),
    );

    const sourcePath = path.resolve(attachment.source_path);
    if (!fs.existsSync(sourcePath)) {
      throw createHttpError(404, "Attachment file not found.");
    }

    const fileBuffer = sourcePath.endsWith(".gz")
      ? zlib.gunzipSync(fs.readFileSync(sourcePath))
      : fs.readFileSync(sourcePath);

    const safeFileName = String(attachment.filename || "attachment")
      .replace(/\"/g, "'")
      .trim();
    res.setHeader("Content-Type", attachment.content_type);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeFileName || "attachment"}"`,
    );
    res.send(fileBuffer);
  }),
);

app.post(
  `${config.apiPrefix}/leads/client-lead/sent/:recordId/resend`,
  asyncHandler(async (req, res) => {
    const currentUser = await requireRole(getDb(), req, [
      "super_admin",
      "user",
    ]);
    const response = await resendClientLeadCampaign(
      getDb(),
      req.params.recordId,
      currentUser,
      req.body || {},
    );
    res.json(response);
  }),
);

app.post(
  `${config.apiPrefix}/leads/client-lead/sent/:recordId/cancel-schedule`,
  asyncHandler(async (req, res) => {
    const currentUser = await requireRole(getDb(), req, [
      "super_admin",
      "user",
    ]);
    const response = await cancelScheduledClientLeadCampaign(
      getDb(),
      req.params.recordId,
      currentUser,
    );
    res.json(response);
  }),
);

app.patch(
  `${config.apiPrefix}/leads/client-lead/sent/:recordId/schedule`,
  asyncHandler(async (req, res) => {
    const currentUser = await requireRole(getDb(), req, [
      "super_admin",
      "user",
    ]);
    const response = await rescheduleClientLeadCampaign(
      getDb(),
      req.params.recordId,
      currentUser,
      req.body || {},
    );
    res.json(response);
  }),
);

app.delete(
  `${config.apiPrefix}/leads/client-lead/sent/:recordId`,
  asyncHandler(async (req, res) => {
    const currentUser = await requireRole(getDb(), req, ["super_admin"]);
    const response = await deleteClientLeadCampaign(
      getDb(),
      req.params.recordId,
      currentUser,
    );
    res.json(response);
  }),
);

app.post(
  `${config.apiPrefix}/leads/client-lead/sent/:recordId/recover`,
  asyncHandler(async (req, res) => {
    const currentUser = await requireRole(getDb(), req, ["super_admin"]);
    const response = await recoverDeletedClientLeadCampaign(
      getDb(),
      req.params.recordId,
      currentUser,
    );
    res.json(response);
  }),
);

app.post(
  `${config.apiPrefix}/scheduler/schedule`,
  asyncHandler(async (req, res) => {
    const currentUser = await requireRole(getDb(), req, [
      "super_admin",
      "user",
    ]);
    const result = await createScheduledEmail(
      getDb(),
      req.body || {},
      currentUser,
    );
    res.status(201).json({
      message: `Email scheduled for ${new Date(result.sendAt).toLocaleString()}.`,
      item: result,
    });
  }),
);

app.get(
  `${config.apiPrefix}/scheduler/status`,
  asyncHandler(async (req, res) => {
    await requireRole(getDb(), req, ["super_admin", "user"]);
    res.json({
      status: serializeSchedulerStatus(),
    });
  }),
);

app.post(
  `${config.apiPrefix}/scheduler/process`,
  asyncHandler(async (req, res) => {
    const suppliedSecret =
      String(req.headers["x-scheduler-secret"] || "").trim() ||
      String(req.query.secret || "").trim();

    if (!config.schedulerSecret) {
      throw createHttpError(503, "SCHEDULER_SECRET is not configured.");
    }
    if (!suppliedSecret || suppliedSecret !== config.schedulerSecret) {
      throw createHttpError(401, "Invalid scheduler secret.");
    }

    const batchSize = Number.parseInt(String(req.query.batch || "25"), 10);
    const safeBatchSize = Number.isFinite(batchSize)
      ? Math.max(1, Math.min(batchSize, 100))
      : 25;

    const campaignProcessed = await dispatchDueScheduledCampaigns(getDb(), {
      batchSize: safeBatchSize,
    });
    const emailResult = await processDueScheduledEmails(getDb(), {
      batchSize: safeBatchSize,
    });
    const replySyncResult = await syncClientRepliesFromImap(getDb(), {
      force: true,
    });

    res.json({
      message: "Scheduler processing completed.",
      campaign_dispatch: {
        processed: campaignProcessed,
      },
      email_dispatch: emailResult,
      reply_sync: replySyncResult,
    });
  }),
);

app.use((req, _res, next) => {
  next(
    createHttpError(404, `Route not found: ${req.method} ${req.originalUrl}`),
  );
});

app.use((error, _req, res, _next) => {
  const { status, body } = toApiErrorResponse(error);
  res.status(status).json(body);
});

module.exports = app;
module.exports.ready = ready;
