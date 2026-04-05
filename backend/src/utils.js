const { ObjectId } = require('mongodb');

class HttpError extends Error {
  constructor(status, detail, extra = {}) {
    super(detail);
    this.status = status;
    this.detail = detail;
    Object.assign(this, extra);
  }
}

function createHttpError(status, detail, extra) {
  return new HttpError(status, detail, extra);
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function toApiErrorResponse(error) {
  if (error instanceof HttpError) {
    return {
      status: error.status,
      body: { detail: error.detail },
    };
  }

  if (error?.name === 'MongoServerError' && error?.code === 11000) {
    return {
      status: 409,
      body: { detail: 'A record with this value already exists.' },
    };
  }

  if (error?.message === 'Origin not allowed by CORS.') {
    return {
      status: 403,
      body: { detail: error.message },
    };
  }

  console.error(error);
  return {
    status: 500,
    body: { detail: 'Internal server error.' },
  };
}

function parseJsonField(value, errorMessage) {
  try {
    return JSON.parse(value);
  } catch (_error) {
    throw createHttpError(422, errorMessage);
  }
}

function assert(condition, status, detail) {
  if (!condition) {
    throw createHttpError(status, detail);
  }
}

function normalizeOptionalText(value) {
  if (value == null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function sanitizeFilename(filename, fallback) {
  const safeName = String(filename || fallback)
    .split(/[\\/]/)
    .pop()
    .trim();

  if (!safeName) {
    return fallback;
  }

  return safeName.replace(/[^a-zA-Z0-9._ -]/g, '_');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function serializeId(value) {
  if (value instanceof ObjectId) {
    return value.toHexString();
  }

  return String(value);
}

function ensureObjectId(value, detail = 'Invalid identifier.') {
  if (!ObjectId.isValid(value)) {
    throw createHttpError(404, detail);
  }

  return new ObjectId(value);
}

module.exports = {
  HttpError,
  assert,
  asyncHandler,
  createHttpError,
  ensureObjectId,
  escapeHtml,
  isValidEmail,
  normalizeOptionalText,
  parseJsonField,
  sanitizeFilename,
  serializeId,
  toApiErrorResponse,
};
