const { MongoClient } = require('mongodb');

const { config } = require('./config');

let client;
let database;

function isSrvResolutionError(error) {
  return (
    error?.code === 'ECONNREFUSED' &&
    typeof error?.syscall === 'string' &&
    error.syscall.toLowerCase().includes('querysrv')
  );
}

async function connectWithUri(uri) {
  const isAtlasSrv = uri.startsWith('mongodb+srv://');
  const nextClient = new MongoClient(uri, {
    retryWrites: true,
    serverSelectionTimeoutMS: config.mongodbServerSelectionTimeoutMs,
    tls: isAtlasSrv ? true : undefined,
    tlsAllowInvalidCertificates: config.mongodbTlsAllowInvalidCertificates,
    tlsAllowInvalidHostnames: config.mongodbTlsAllowInvalidHostnames,
  });
  await nextClient.connect();
  return nextClient;
}

async function connectDatabase() {
  if (database) {
    return database;
  }

  try {
    client = await connectWithUri(config.mongodbUri);
  } catch (error) {
    if (
      config.mongodbUri.startsWith('mongodb+srv://') &&
      isSrvResolutionError(error) &&
      config.mongodbStandardUri
    ) {
      console.warn(
        'SRV DNS lookup failed for MONGODB_URI. Falling back to MONGODB_STANDARD_URI.',
      );
      client = await connectWithUri(config.mongodbStandardUri);
    } else if (
      config.mongodbUri.startsWith('mongodb+srv://') &&
      isSrvResolutionError(error)
    ) {
      throw new Error(
        'MongoDB SRV lookup failed. Set MONGODB_STANDARD_URI in backend/.env or replace MONGODB_URI with a standard mongodb:// host list URI.',
      );
    } else {
      throw error;
    }
  }

  database = client.db(config.mongodbDbName);
  return database;
}

async function disconnectDatabase() {
  if (client) {
    await client.close();
  }
  client = null;
  database = null;
}

module.exports = {
  connectDatabase,
  disconnectDatabase,
};
