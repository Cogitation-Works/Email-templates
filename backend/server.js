const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const multer = require("multer");

const { config } = require("./src/config");
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

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.frontendOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed by CORS."));
    },
    credentials: true,
  }),
);
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
  await ensureScheduledEmailIndexes(database);
  await ensureSuperAdmin(database);
})();

function getDb() {
  if (!database) {
    throw createHttpError(503, "Database is not connected.");
  }
  return database;
}

app.use(async (req, res, next) => {
  try {
    await ready;
    next();
  } catch (error) {
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
          res.json({ user: null });
          return;
        }
      }

      clearSessionCookie(res);
      res.json({ user: null });
    }
  }),
);

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

    res.json({
      message: "Scheduler processing completed.",
      campaign_dispatch: {
        processed: campaignProcessed,
      },
      email_dispatch: emailResult,
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
