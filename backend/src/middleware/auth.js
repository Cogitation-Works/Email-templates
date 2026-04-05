const jwt = require("jsonwebtoken");

const { config } = require("../config");
const { getUserById, serializeUser } = require("../services/users");
const { createHttpError } = require("../utils");

function createAccessToken(user, rememberMe) {
  const maxAgeSeconds = rememberMe
    ? config.rememberMeExpireDays * 24 * 60 * 60
    : config.accessTokenExpireMinutes * 60;

  const token = jwt.sign(
    {
      sub: user.id,
      role: user.role,
    },
    config.jwtSecretKey,
    {
      algorithm: config.jwtAlgorithm,
      expiresIn: maxAgeSeconds,
    },
  );

  return { token, maxAgeSeconds };
}

async function authenticateRequest(db, req) {
  let token = req.cookies?.[config.sessionCookieName];

  if (!token && req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.slice("Bearer ".length).trim();
  }

  if (!token) {
    throw createHttpError(401, "Authentication required.");
  }

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecretKey, {
      algorithms: [config.jwtAlgorithm],
    });
  } catch (_error) {
    throw createHttpError(401, "Invalid session.");
  }

  const user = await getUserById(db, payload.sub);
  if (!user) {
    throw createHttpError(401, "User not found.");
  }

  return serializeUser(user);
}

async function requireRole(db, req, roles) {
  const user = await authenticateRequest(db, req);
  if (!roles.includes(user.role)) {
    throw createHttpError(
      403,
      "You do not have permission to access this resource.",
    );
  }
  return user;
}

function issueSessionCookie(res, user, rememberMe) {
  const { token, maxAgeSeconds } = createAccessToken(user, rememberMe);
  const maxAgeMs = maxAgeSeconds * 1000;
  const expiresDate = new Date(Date.now() + maxAgeMs);

  res.cookie(config.sessionCookieName, token, {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeMs,
    expires: expiresDate,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(config.sessionCookieName, {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: "lax",
  });
}

module.exports = {
  authenticateRequest,
  clearSessionCookie,
  issueSessionCookie,
  requireRole,
};
