const { ObjectId } = require("mongodb");

const { config } = require("../config");
const {
  buildEmailChangeOtpEmail,
  buildLoginOtpEmail,
  buildForgotPasswordOtpEmail,
  deliverEmail,
} = require("./emailer");
const {
  generateOtpCode,
  hashOtpCode,
  hashPassword,
  verifyOtpCode,
} = require("./security");
const {
  getUserByEmail,
  getUserById,
  markUserLoggedIn,
  serializeUser,
  validateCredentials,
} = require("./users");
const { logAction } = require("./audit");
const { createHttpError, isValidEmail, serializeId } = require("../utils");

const LOGIN_CHALLENGES_COLLECTION = "login_challenges";
const PASSWORD_RESET_CHALLENGES_COLLECTION = "password_reset_challenges";
const EMAIL_CHANGE_CHALLENGES_COLLECTION = "email_change_challenges";

function maskEmailAddress(email) {
  const [local, domain] = String(email || "").split("@");
  if (!local || !domain) {
    return email;
  }
  if (local.length <= 2) {
    return `${local[0]}*@${domain}`;
  }
  return `${local[0]}${"*".repeat(local.length - 2)}${local.at(-1)}@${domain}`;
}

async function ensureAuthIndexes(db) {
  await db
    .collection(LOGIN_CHALLENGES_COLLECTION)
    .createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
  await db.collection(LOGIN_CHALLENGES_COLLECTION).createIndex({ user_id: 1 });
  await db
    .collection(PASSWORD_RESET_CHALLENGES_COLLECTION)
    .createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
  await db
    .collection(PASSWORD_RESET_CHALLENGES_COLLECTION)
    .createIndex({ user_id: 1 });
  await db
    .collection(EMAIL_CHANGE_CHALLENGES_COLLECTION)
    .createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
  await db
    .collection(EMAIL_CHANGE_CHALLENGES_COLLECTION)
    .createIndex({ user_id: 1 });
}

async function startLoginChallenge(db, payload) {
  const email = String(payload.email || "")
    .trim()
    .toLowerCase();
  const password = String(payload.password || "");
  const rememberMe = Boolean(payload.remember_me);

  const user = await validateCredentials(db, email, password);
  const otpCode = generateOtpCode();
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + config.otpExpireMinutes * 60 * 1000,
  );

  await db
    .collection(LOGIN_CHALLENGES_COLLECTION)
    .deleteMany({ user_id: serializeId(user._id) });

  const challenge = {
    user_id: serializeId(user._id),
    email: user.email,
    otp_hash: hashOtpCode(otpCode),
    remember_me: rememberMe,
    created_at: now,
    expires_at: expiresAt,
  };
  const result = await db
    .collection(LOGIN_CHALLENGES_COLLECTION)
    .insertOne(challenge);

  const otpEmail = buildLoginOtpEmail({
    fullName: user.full_name,
    email: user.email,
    otpCode,
  });
  const deliveryStatus = await deliverEmail(otpEmail);
  const shouldFallbackToDebugOtp =
    config.emailDeliveryMode === "smtp" && config.nodeEnv !== "production";
  if (!deliveryStatus.delivered && !shouldFallbackToDebugOtp) {
    await db
      .collection(LOGIN_CHALLENGES_COLLECTION)
      .deleteOne({ _id: result.insertedId });
    throw createHttpError(503, deliveryStatus.message);
  }

  return {
    challenge_id: serializeId(result.insertedId),
    masked_email: maskEmailAddress(user.email),
    expires_in_seconds: config.otpExpireMinutes * 60,
    remember_me: rememberMe,
    delivery_status: {
      mode: config.emailDeliveryMode,
      delivered: shouldFallbackToDebugOtp ? true : deliveryStatus.delivered,
      message: shouldFallbackToDebugOtp
        ? `${deliveryStatus.message} Using development OTP fallback.`
        : deliveryStatus.message,
    },
    debug_otp:
      config.emailDeliveryMode === "log" || shouldFallbackToDebugOtp
        ? otpCode
        : null,
  };
}

async function verifyLoginChallenge(db, payload) {
  const challengeId = String(payload.challenge_id || "").trim();
  const otpCode = String(payload.otp_code || "").trim();

  if (!ObjectId.isValid(challengeId)) {
    throw createHttpError(401, "Invalid OTP challenge.");
  }
  if (!/^\d{6}$/.test(otpCode)) {
    throw createHttpError(401, "Invalid OTP code.");
  }

  const challenge = await db
    .collection(LOGIN_CHALLENGES_COLLECTION)
    .findOne({ _id: new ObjectId(challengeId) });

  if (!challenge) {
    throw createHttpError(401, "OTP challenge was not found or has expired.");
  }
  if (challenge.expires_at <= new Date()) {
    await db
      .collection(LOGIN_CHALLENGES_COLLECTION)
      .deleteOne({ _id: challenge._id });
    throw createHttpError(401, "OTP has expired. Please sign in again.");
  }
  if (!verifyOtpCode(otpCode, challenge.otp_hash)) {
    throw createHttpError(401, "Invalid OTP code.");
  }

  const user = await getUserById(db, challenge.user_id);
  if (!user) {
    await db
      .collection(LOGIN_CHALLENGES_COLLECTION)
      .deleteOne({ _id: challenge._id });
    throw createHttpError(401, "User account was not found.");
  }

  await db
    .collection(LOGIN_CHALLENGES_COLLECTION)
    .deleteOne({ _id: challenge._id });

  return {
    user: await markUserLoggedIn(db, serializeId(user._id)),
    rememberMe: Boolean(challenge.remember_me),
  };
}

async function startForgotPasswordChallenge(db, payload) {
  const email = String(payload.email || "")
    .trim()
    .toLowerCase();
  if (!email) {
    throw createHttpError(422, "Email is required.");
  }

  const user = await getUserByEmail(db, email);
  if (!user) {
    throw createHttpError(404, "User account was not found.");
  }

  const otpCode = generateOtpCode();
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + config.otpExpireMinutes * 60 * 1000,
  );

  await db
    .collection(PASSWORD_RESET_CHALLENGES_COLLECTION)
    .deleteMany({ user_id: serializeId(user._id) });

  const challenge = {
    user_id: serializeId(user._id),
    email: user.email,
    otp_hash: hashOtpCode(otpCode),
    created_at: now,
    expires_at: expiresAt,
    verified_at: null,
  };
  const result = await db
    .collection(PASSWORD_RESET_CHALLENGES_COLLECTION)
    .insertOne(challenge);

  const otpEmail = buildForgotPasswordOtpEmail({
    fullName: user.full_name,
    email: user.email,
    otpCode,
  });
  const deliveryStatus = await deliverEmail(otpEmail);
  const shouldFallbackToDebugOtp =
    config.emailDeliveryMode === "smtp" && config.nodeEnv !== "production";
  if (!deliveryStatus.delivered && !shouldFallbackToDebugOtp) {
    await db
      .collection(PASSWORD_RESET_CHALLENGES_COLLECTION)
      .deleteOne({ _id: result.insertedId });
    throw createHttpError(503, deliveryStatus.message);
  }

  return {
    challenge_id: serializeId(result.insertedId),
    masked_email: maskEmailAddress(user.email),
    expires_in_seconds: config.otpExpireMinutes * 60,
    delivery_status: {
      mode: config.emailDeliveryMode,
      delivered: shouldFallbackToDebugOtp ? true : deliveryStatus.delivered,
      message: shouldFallbackToDebugOtp
        ? `${deliveryStatus.message} Using development OTP fallback.`
        : deliveryStatus.message,
    },
    debug_otp:
      config.emailDeliveryMode === "log" || shouldFallbackToDebugOtp
        ? otpCode
        : null,
  };
}

async function verifyForgotPasswordChallenge(db, payload) {
  const challengeId = String(payload.challenge_id || "").trim();
  const otpCode = String(payload.otp_code || "").trim();

  if (!ObjectId.isValid(challengeId)) {
    throw createHttpError(401, "Invalid OTP challenge.");
  }
  if (!/^\d{6}$/.test(otpCode)) {
    throw createHttpError(401, "Invalid OTP code.");
  }

  const challenge = await db
    .collection(PASSWORD_RESET_CHALLENGES_COLLECTION)
    .findOne({ _id: new ObjectId(challengeId) });

  if (!challenge) {
    throw createHttpError(401, "OTP challenge was not found or has expired.");
  }
  if (challenge.expires_at <= new Date()) {
    await db
      .collection(PASSWORD_RESET_CHALLENGES_COLLECTION)
      .deleteOne({ _id: challenge._id });
    throw createHttpError(401, "OTP has expired. Please request a new code.");
  }
  if (!verifyOtpCode(otpCode, challenge.otp_hash)) {
    throw createHttpError(401, "Invalid OTP code.");
  }

  await db.collection(PASSWORD_RESET_CHALLENGES_COLLECTION).updateOne(
    { _id: challenge._id },
    {
      $set: {
        verified_at: new Date(),
      },
    },
  );

  return {
    message: "OTP verified. You can now set a new password.",
  };
}

async function resetPasswordWithChallenge(db, payload) {
  const challengeId = String(payload.challenge_id || "").trim();
  const newPassword = String(payload.new_password || "");

  if (!ObjectId.isValid(challengeId)) {
    throw createHttpError(401, "Invalid reset challenge.");
  }
  if (newPassword.length < 8) {
    throw createHttpError(
      422,
      "New password must be at least 8 characters long.",
    );
  }

  const challenge = await db
    .collection(PASSWORD_RESET_CHALLENGES_COLLECTION)
    .findOne({ _id: new ObjectId(challengeId) });
  if (!challenge) {
    throw createHttpError(401, "Reset challenge was not found or expired.");
  }
  if (challenge.expires_at <= new Date()) {
    await db
      .collection(PASSWORD_RESET_CHALLENGES_COLLECTION)
      .deleteOne({ _id: challenge._id });
    throw createHttpError(
      401,
      "Reset challenge expired. Please request a new code.",
    );
  }
  if (!challenge.verified_at) {
    throw createHttpError(401, "Verify OTP before setting a new password.");
  }

  const user = await getUserById(db, challenge.user_id);
  if (!user) {
    await db
      .collection(PASSWORD_RESET_CHALLENGES_COLLECTION)
      .deleteOne({ _id: challenge._id });
    throw createHttpError(404, "User account was not found.");
  }

  await db.collection("users").updateOne(
    { _id: user._id },
    {
      $set: {
        hashed_password: await hashPassword(newPassword),
        updated_at: new Date(),
        must_change_password: false,
      },
    },
  );

  await db
    .collection(PASSWORD_RESET_CHALLENGES_COLLECTION)
    .deleteOne({ _id: challenge._id });

  await logAction(db, {
    actorName: user.full_name,
    actorRole: user.role,
    action: "password_reset_via_forgot",
    targetType: "user",
    targetId: serializeId(user._id),
    metadata: {
      email: user.email,
    },
  });

  return {
    message:
      "Password changed successfully. Please sign in with your new password.",
  };
}

async function startEmailChangeChallenge(db, payload) {
  const userId = String(payload.user_id || "").trim();
  const newEmail = String(payload.new_email || "")
    .trim()
    .toLowerCase();

  if (!ObjectId.isValid(userId)) {
    throw createHttpError(404, "User account was not found.");
  }
  if (!isValidEmail(newEmail)) {
    throw createHttpError(422, "Enter a valid new email address.");
  }

  const user = await getUserById(db, userId);
  if (!user) {
    throw createHttpError(404, "User account was not found.");
  }
  if (newEmail === user.email) {
    throw createHttpError(
      422,
      "New email must be different from current email.",
    );
  }

  const existing = await getUserByEmail(db, newEmail);
  if (existing && serializeId(existing._id) !== serializeId(user._id)) {
    throw createHttpError(409, "A user with this email already exists.");
  }

  const currentEmailOtp = generateOtpCode();
  const newEmailOtp = generateOtpCode();
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + config.otpExpireMinutes * 60 * 1000,
  );

  await db
    .collection(EMAIL_CHANGE_CHALLENGES_COLLECTION)
    .deleteMany({ user_id: serializeId(user._id) });

  const challenge = {
    user_id: serializeId(user._id),
    current_email: user.email,
    new_email: newEmail,
    current_email_otp_hash: hashOtpCode(currentEmailOtp),
    new_email_otp_hash: hashOtpCode(newEmailOtp),
    current_email_verified_at: null,
    new_email_verified_at: null,
    created_at: now,
    expires_at: expiresAt,
  };

  const result = await db
    .collection(EMAIL_CHANGE_CHALLENGES_COLLECTION)
    .insertOne(challenge);

  const currentOtpEmail = buildEmailChangeOtpEmail({
    fullName: user.full_name,
    email: user.email,
    otpCode: currentEmailOtp,
    target: "current",
  });
  const currentDelivery = await deliverEmail(currentOtpEmail);

  const newOtpEmail = buildEmailChangeOtpEmail({
    fullName: user.full_name,
    email: newEmail,
    otpCode: newEmailOtp,
    target: "new",
  });
  const newDelivery = await deliverEmail(newOtpEmail);

  const shouldFallbackToDebugOtp =
    config.emailDeliveryMode === "smtp" && config.nodeEnv !== "production";

  if (
    (!currentDelivery.delivered || !newDelivery.delivered) &&
    !shouldFallbackToDebugOtp
  ) {
    await db
      .collection(EMAIL_CHANGE_CHALLENGES_COLLECTION)
      .deleteOne({ _id: result.insertedId });
    throw createHttpError(
      503,
      !currentDelivery.delivered
        ? currentDelivery.message
        : newDelivery.message,
    );
  }

  return {
    challenge_id: serializeId(result.insertedId),
    masked_current_email: maskEmailAddress(user.email),
    masked_new_email: maskEmailAddress(newEmail),
    expires_in_seconds: config.otpExpireMinutes * 60,
    delivery_status: {
      mode: config.emailDeliveryMode,
      delivered: shouldFallbackToDebugOtp
        ? true
        : currentDelivery.delivered && newDelivery.delivered,
      message: shouldFallbackToDebugOtp
        ? "OTP delivery used development fallback mode."
        : "OTPs sent to current and new email addresses.",
    },
    debug_otp:
      config.emailDeliveryMode === "log" || shouldFallbackToDebugOtp
        ? {
            current_email_otp: currentEmailOtp,
            new_email_otp: newEmailOtp,
          }
        : null,
  };
}

async function verifyEmailChangeChallenge(db, payload) {
  const challengeId = String(payload.challenge_id || "").trim();
  const otpCode = String(payload.otp_code || "").trim();
  const target = String(payload.target || "")
    .trim()
    .toLowerCase();
  const userId = String(payload.user_id || "").trim();

  if (!ObjectId.isValid(challengeId)) {
    throw createHttpError(401, "Invalid email-change challenge.");
  }
  if (!/^[0-9]{6}$/.test(otpCode)) {
    throw createHttpError(401, "Invalid OTP code.");
  }
  if (target !== "current" && target !== "new") {
    throw createHttpError(422, "OTP target must be either current or new.");
  }
  if (!ObjectId.isValid(userId)) {
    throw createHttpError(401, "Invalid user context.");
  }

  const challenge = await db
    .collection(EMAIL_CHANGE_CHALLENGES_COLLECTION)
    .findOne({ _id: new ObjectId(challengeId) });

  if (!challenge) {
    throw createHttpError(
      401,
      "Email-change challenge was not found or has expired.",
    );
  }
  if (challenge.user_id !== userId) {
    throw createHttpError(403, "You are not allowed to verify this challenge.");
  }
  if (challenge.expires_at <= new Date()) {
    await db
      .collection(EMAIL_CHANGE_CHALLENGES_COLLECTION)
      .deleteOne({ _id: challenge._id });
    throw createHttpError(401, "OTP has expired. Please start again.");
  }

  const otpHash =
    target === "current"
      ? challenge.current_email_otp_hash
      : challenge.new_email_otp_hash;
  if (!verifyOtpCode(otpCode, otpHash)) {
    throw createHttpError(401, "Invalid OTP code.");
  }

  const verifiedField =
    target === "current"
      ? "current_email_verified_at"
      : "new_email_verified_at";
  const now = new Date();
  await db.collection(EMAIL_CHANGE_CHALLENGES_COLLECTION).updateOne(
    { _id: challenge._id },
    {
      $set: {
        [verifiedField]: now,
      },
    },
  );

  const refreshed = await db
    .collection(EMAIL_CHANGE_CHALLENGES_COLLECTION)
    .findOne({ _id: challenge._id });

  return {
    message:
      target === "current"
        ? "Current email OTP verified."
        : "New email OTP verified.",
    current_email_verified: Boolean(refreshed?.current_email_verified_at),
    new_email_verified: Boolean(refreshed?.new_email_verified_at),
  };
}

async function confirmEmailChange(db, payload) {
  const challengeId = String(payload.challenge_id || "").trim();
  const userId = String(payload.user_id || "").trim();

  if (!ObjectId.isValid(challengeId)) {
    throw createHttpError(401, "Invalid email-change challenge.");
  }
  if (!ObjectId.isValid(userId)) {
    throw createHttpError(401, "Invalid user context.");
  }

  const challenge = await db
    .collection(EMAIL_CHANGE_CHALLENGES_COLLECTION)
    .findOne({ _id: new ObjectId(challengeId) });
  if (!challenge) {
    throw createHttpError(
      401,
      "Email-change challenge was not found or has expired.",
    );
  }
  if (challenge.user_id !== userId) {
    throw createHttpError(
      403,
      "You are not allowed to confirm this challenge.",
    );
  }
  if (challenge.expires_at <= new Date()) {
    await db
      .collection(EMAIL_CHANGE_CHALLENGES_COLLECTION)
      .deleteOne({ _id: challenge._id });
    throw createHttpError(401, "Challenge expired. Please start again.");
  }
  if (
    !challenge.current_email_verified_at ||
    !challenge.new_email_verified_at
  ) {
    throw createHttpError(
      401,
      "Verify OTPs for current and new email before confirming change.",
    );
  }

  const user = await getUserById(db, challenge.user_id);
  if (!user) {
    await db
      .collection(EMAIL_CHANGE_CHALLENGES_COLLECTION)
      .deleteOne({ _id: challenge._id });
    throw createHttpError(404, "User account was not found.");
  }

  const existing = await getUserByEmail(db, challenge.new_email);
  if (existing && serializeId(existing._id) !== serializeId(user._id)) {
    throw createHttpError(409, "A user with this email already exists.");
  }

  await db.collection("users").updateOne(
    { _id: user._id },
    {
      $set: {
        email: challenge.new_email,
        updated_at: new Date(),
      },
    },
  );

  await db
    .collection(EMAIL_CHANGE_CHALLENGES_COLLECTION)
    .deleteOne({ _id: challenge._id });

  const updated = await getUserById(db, serializeId(user._id));
  await logAction(db, {
    actorName: updated.full_name,
    actorRole: updated.role,
    action: "email_changed",
    targetType: "user",
    targetId: serializeId(updated._id),
    metadata: {
      previous_email: challenge.current_email,
      new_email: challenge.new_email,
    },
  });

  return {
    message: "Email updated successfully.",
    user: serializeUser(updated),
  };
}

module.exports = {
  confirmEmailChange,
  ensureAuthIndexes,
  startEmailChangeChallenge,
  resetPasswordWithChallenge,
  verifyEmailChangeChallenge,
  startForgotPasswordChallenge,
  startLoginChallenge,
  verifyForgotPasswordChallenge,
  verifyLoginChallenge,
};
