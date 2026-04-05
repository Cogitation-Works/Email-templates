const { ObjectId } = require("mongodb");

const { config } = require("../config");
const { logAction, LOGS_COLLECTION } = require("./audit");
const {
  buildPasswordResetEmail,
  buildUserOnboardingEmail,
  deliverEmail,
} = require("./emailer");
const {
  generatePassword,
  hashPassword,
  verifyPassword,
} = require("./security");
const {
  createHttpError,
  isValidEmail,
  normalizeOptionalText,
  serializeId,
} = require("../utils");

const USERS_COLLECTION = "users";

function serializeUser(document) {
  return {
    id: serializeId(document._id),
    full_name: document.full_name,
    email: document.email,
    phone: document.phone ?? null,
    role: document.role,
    can_view_team_history:
      document.can_view_team_history ?? document.role === "super_admin",
    can_use_sales_sender:
      document.can_use_sales_sender ?? document.role === "super_admin",
    can_use_admin_sender:
      document.can_use_admin_sender ?? document.role === "super_admin",
    created_at: document.created_at,
    updated_at: document.updated_at,
    last_login: document.last_login ?? null,
    must_change_password: Boolean(document.must_change_password),
  };
}

async function ensureUserIndexes(db) {
  await db
    .collection(USERS_COLLECTION)
    .createIndex({ email: 1 }, { unique: true });
  await db.collection(LOGS_COLLECTION).createIndex({ created_at: -1 });
}

async function ensureSuperAdmin(db) {
  const now = new Date();
  const existingCandidates = await db
    .collection(USERS_COLLECTION)
    .find({
      $or: [{ role: "super_admin" }, { email: config.superAdminEmail }],
    })
    .sort({ created_at: 1 })
    .toArray();

  const canonical = existingCandidates[0] ?? null;

  if (!canonical) {
    const superAdmin = {
      full_name: config.superAdminName,
      email: config.superAdminEmail,
      phone: config.companyPhone,
      role: "super_admin",
      hashed_password: await hashPassword(config.superAdminPassword),
      can_view_team_history: true,
      can_use_sales_sender: true,
      can_use_admin_sender: true,
      created_at: now,
      updated_at: now,
      last_login: null,
      must_change_password: false,
    };
    await db.collection(USERS_COLLECTION).insertOne(superAdmin);
    return;
  }

  await db.collection(USERS_COLLECTION).updateOne(
    { _id: canonical._id },
    {
      $set: {
        full_name: config.superAdminName,
        email: config.superAdminEmail,
        phone: config.companyPhone,
        role: "super_admin",
        can_view_team_history: true,
        can_use_sales_sender: true,
        can_use_admin_sender: true,
        updated_at: now,
        must_change_password: false,
      },
    },
  );

  const duplicateIds = existingCandidates
    .slice(1)
    .map((candidate) => candidate._id)
    .filter(Boolean);
  if (duplicateIds.length) {
    await db.collection(USERS_COLLECTION).deleteMany({
      _id: { $in: duplicateIds },
    });
  }
}

async function getUserById(db, userId) {
  if (!ObjectId.isValid(userId)) {
    return null;
  }
  return db.collection(USERS_COLLECTION).findOne({ _id: new ObjectId(userId) });
}

async function getUserByEmail(db, email) {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  const users = await db
    .collection(USERS_COLLECTION)
    .find({ email: normalizedEmail })
    .sort({ updated_at: -1, created_at: -1 })
    .toArray();

  if (!users.length) {
    return null;
  }

  const superAdmin = users.find((user) => user.role === "super_admin");
  return superAdmin || users[0];
}

async function validateCredentials(db, email, password) {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  const user = await getUserByEmail(db, normalizedEmail);
  const valid =
    user &&
    (await verifyPassword(String(password || ""), user.hashed_password));

  if (!valid) {
    throw createHttpError(401, "Invalid email or password.");
  }

  return user;
}

async function markUserLoggedIn(db, userId) {
  const now = new Date();
  await db
    .collection(USERS_COLLECTION)
    .updateOne({ _id: new ObjectId(userId) }, { $set: { last_login: now } });
  const user = await getUserById(db, userId);
  return serializeUser(user);
}

async function changePassword(db, payload) {
  const email = String(payload.email || "")
    .trim()
    .toLowerCase();
  const userId = normalizeOptionalText(payload.user_id);
  const currentPassword = String(payload.current_password || "");
  const newPassword = String(payload.new_password || "");

  if (newPassword.length < 8) {
    throw createHttpError(
      422,
      "New password must be at least 8 characters long.",
    );
  }

  let user = null;
  if (userId) {
    user = await getUserById(db, userId);
    if (!user) {
      throw createHttpError(404, "User account was not found.");
    }
    const validCurrent = await verifyPassword(
      currentPassword,
      user.hashed_password,
    );
    if (!validCurrent) {
      throw createHttpError(401, "Current password is incorrect.");
    }
  } else {
    if (!isValidEmail(email)) {
      throw createHttpError(422, "Enter a valid email address.");
    }
    user = await validateCredentials(db, email, currentPassword);
  }

  if (await verifyPassword(newPassword, user.hashed_password)) {
    throw createHttpError(
      400,
      "New password must be different from the current password.",
    );
  }

  await db.collection(USERS_COLLECTION).updateOne(
    { _id: user._id },
    {
      $set: {
        hashed_password: await hashPassword(newPassword),
        updated_at: new Date(),
        must_change_password: false,
      },
    },
  );

  const updated = await getUserById(db, serializeId(user._id));
  await logAction(db, {
    actorName: updated.full_name,
    actorRole: updated.role,
    action: "password_changed",
    targetType: "user",
    targetId: serializeId(updated._id),
    metadata: {
      email: updated.email,
    },
  });

  return serializeUser(updated);
}

async function listManagedUsers(db) {
  const users = await db
    .collection(USERS_COLLECTION)
    .find({ role: { $ne: "super_admin" } })
    .sort({ created_at: -1 })
    .toArray();

  return users.map(serializeUser);
}

function validateManagedUserPayload(payload, { allowPassword = false } = {}) {
  const fullName = String(payload.full_name || "").trim();
  const email = String(payload.email || "")
    .trim()
    .toLowerCase();
  const phone = normalizeOptionalText(payload.phone);
  const newPassword = normalizeOptionalText(payload.new_password);

  if (fullName.length < 2) {
    throw createHttpError(422, "Full name must be at least 2 characters long.");
  }
  if (!isValidEmail(email)) {
    throw createHttpError(422, "Enter a valid email address.");
  }
  if (allowPassword && newPassword && newPassword.length < 8) {
    throw createHttpError(
      422,
      "New password must be at least 8 characters long.",
    );
  }

  return {
    full_name: fullName,
    email,
    phone,
    can_view_team_history: Boolean(payload.can_view_team_history),
    can_use_sales_sender: Boolean(payload.can_use_sales_sender),
    can_use_admin_sender: Boolean(payload.can_use_admin_sender),
    new_password: allowPassword ? newPassword : null,
  };
}

async function createManagedUser(db, payload, actor) {
  const validated = validateManagedUserPayload(payload);
  const existing = await getUserByEmail(db, validated.email);
  if (existing) {
    throw createHttpError(409, "A user with this email already exists.");
  }

  const rawPassword = generatePassword();
  const now = new Date();
  const document = {
    full_name: validated.full_name,
    email: validated.email,
    phone: validated.phone,
    role: "user",
    can_view_team_history: validated.can_view_team_history,
    can_use_sales_sender: validated.can_use_sales_sender,
    can_use_admin_sender: validated.can_use_admin_sender,
    hashed_password: await hashPassword(rawPassword),
    created_at: now,
    updated_at: now,
    last_login: null,
    must_change_password: true,
  };

  const result = await db.collection(USERS_COLLECTION).insertOne(document);
  const user = await getUserById(db, serializeId(result.insertedId));
  const onboardingEmail = buildUserOnboardingEmail({
    fullName: validated.full_name,
    email: validated.email,
    phone: validated.phone,
    password: rawPassword,
  });
  const deliveryStatus = await deliverEmail(onboardingEmail);

  await logAction(db, {
    actorName: actor.full_name,
    actorRole: actor.role,
    action: "user_created",
    targetType: "user",
    targetId: serializeId(result.insertedId),
    metadata: {
      email: validated.email,
      delivery_mode: config.emailDeliveryMode,
      delivery_message: deliveryStatus.message,
      can_view_team_history: validated.can_view_team_history,
      can_use_sales_sender: validated.can_use_sales_sender,
      can_use_admin_sender: validated.can_use_admin_sender,
    },
  });

  return {
    user: serializeUser(user),
    generated_password: rawPassword,
    onboarding_email: onboardingEmail,
    delivery_status: {
      mode: config.emailDeliveryMode,
      delivered: deliveryStatus.delivered,
      message: deliveryStatus.message,
    },
  };
}

async function updateManagedUser(db, userId, payload, actor) {
  if (!ObjectId.isValid(userId)) {
    throw createHttpError(404, "User not found.");
  }

  const current = await getUserById(db, userId);
  if (!current) {
    throw createHttpError(404, "User not found.");
  }
  if (current.role === "super_admin") {
    throw createHttpError(403, "Super admin cannot be edited here.");
  }

  const validated = validateManagedUserPayload(payload, {
    allowPassword: true,
  });
  const existing = await getUserByEmail(db, validated.email);
  if (existing && serializeId(existing._id) !== userId) {
    throw createHttpError(409, "A user with this email already exists.");
  }

  const update = {
    full_name: validated.full_name,
    email: validated.email,
    phone: validated.phone,
    can_view_team_history: validated.can_view_team_history,
    can_use_sales_sender: validated.can_use_sales_sender,
    can_use_admin_sender: validated.can_use_admin_sender,
    updated_at: new Date(),
  };

  if (validated.new_password) {
    update.hashed_password = await hashPassword(validated.new_password);
    update.must_change_password = true;
  }

  await db
    .collection(USERS_COLLECTION)
    .updateOne({ _id: new ObjectId(userId) }, { $set: update });

  const updated = await getUserById(db, userId);
  await logAction(db, {
    actorName: actor.full_name,
    actorRole: actor.role,
    action: "user_updated",
    targetType: "user",
    targetId: userId,
    metadata: {
      email: validated.email,
      can_view_team_history: validated.can_view_team_history,
      can_use_sales_sender: validated.can_use_sales_sender,
      can_use_admin_sender: validated.can_use_admin_sender,
      password_updated: Boolean(validated.new_password),
    },
  });

  return { user: serializeUser(updated) };
}

async function resetManagedUserPassword(db, userId, actor) {
  if (!ObjectId.isValid(userId)) {
    throw createHttpError(404, "User not found.");
  }

  const current = await getUserById(db, userId);
  if (!current) {
    throw createHttpError(404, "User not found.");
  }
  if (current.role === "super_admin") {
    throw createHttpError(
      403,
      "Super admin password reset is not available from this action.",
    );
  }

  const rawPassword = generatePassword();
  await db.collection(USERS_COLLECTION).updateOne(
    { _id: current._id },
    {
      $set: {
        hashed_password: await hashPassword(rawPassword),
        updated_at: new Date(),
        must_change_password: true,
      },
    },
  );

  const updated = await getUserById(db, userId);
  const credentialEmail = buildPasswordResetEmail({
    fullName: updated.full_name,
    email: updated.email,
    password: rawPassword,
  });
  const deliveryStatus = await deliverEmail(credentialEmail);

  await logAction(db, {
    actorName: actor.full_name,
    actorRole: actor.role,
    action: "user_password_reset_sent",
    targetType: "user",
    targetId: userId,
    metadata: {
      email: updated.email,
      delivery_mode: config.emailDeliveryMode,
      delivery_message: deliveryStatus.message,
    },
  });

  return {
    user: serializeUser(updated),
    generated_password: rawPassword,
    credential_email: credentialEmail,
    delivery_status: {
      mode: config.emailDeliveryMode,
      delivered: deliveryStatus.delivered,
      message: deliveryStatus.message,
    },
  };
}

async function deleteManagedUser(db, userId, actor) {
  if (!ObjectId.isValid(userId)) {
    throw createHttpError(404, "User not found.");
  }

  const current = await getUserById(db, userId);
  if (!current) {
    throw createHttpError(404, "User not found.");
  }
  if (current.role === "super_admin") {
    throw createHttpError(403, "Super admin cannot be deleted.");
  }

  await db
    .collection(USERS_COLLECTION)
    .deleteOne({ _id: new ObjectId(userId) });
  await logAction(db, {
    actorName: actor.full_name,
    actorRole: actor.role,
    action: "user_deleted",
    targetType: "user",
    targetId: userId,
    metadata: { email: current.email },
  });
}

async function updateOwnProfile(db, actorUserId, payload) {
  const phone = normalizeOptionalText(payload.phone);
  const fullName = normalizeOptionalText(payload.full_name);

  if (!ObjectId.isValid(actorUserId)) {
    throw createHttpError(404, "User not found.");
  }

  const current = await getUserById(db, actorUserId);
  if (!current) {
    throw createHttpError(404, "User not found.");
  }

  const nextName = fullName || current.full_name;
  if (nextName.length < 2) {
    throw createHttpError(422, "Full name must be at least 2 characters long.");
  }

  await db.collection(USERS_COLLECTION).updateOne(
    { _id: current._id },
    {
      $set: {
        full_name: nextName,
        phone,
        updated_at: new Date(),
      },
    },
  );

  const updated = await getUserById(db, actorUserId);
  await logAction(db, {
    actorName: updated.full_name,
    actorRole: updated.role,
    action: "profile_updated",
    targetType: "user",
    targetId: serializeId(updated._id),
    metadata: {
      phone: updated.phone ?? null,
    },
  });

  return serializeUser(updated);
}

module.exports = {
  USERS_COLLECTION,
  changePassword,
  createManagedUser,
  deleteManagedUser,
  ensureSuperAdmin,
  ensureUserIndexes,
  getUserByEmail,
  getUserById,
  listManagedUsers,
  markUserLoggedIn,
  resetManagedUserPassword,
  serializeUser,
  updateManagedUser,
  updateOwnProfile,
  validateCredentials,
};
