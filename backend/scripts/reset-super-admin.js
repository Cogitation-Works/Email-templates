const { MongoClient } = require('mongodb');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { config } = require('../src/config');
const { hashPassword } = require('../src/services/security');

async function run() {
  const client = new MongoClient(config.mongodbUri, {
    retryWrites: true,
    serverSelectionTimeoutMS: config.mongodbServerSelectionTimeoutMs,
    tls: config.mongodbUri.startsWith('mongodb+srv://') ? true : undefined,
    tlsAllowInvalidCertificates: config.mongodbTlsAllowInvalidCertificates,
    tlsAllowInvalidHostnames: config.mongodbTlsAllowInvalidHostnames,
  });

  await client.connect();
  const db = client.db(config.mongodbDbName);
  const users = db.collection('users');

  const now = new Date();
  await users.deleteMany({
    $or: [{ role: 'super_admin' }, { email: config.superAdminEmail }],
  });

  await users.insertOne({
    full_name: config.superAdminName,
    email: config.superAdminEmail,
    phone: config.companyPhone,
    role: 'super_admin',
    hashed_password: await hashPassword(config.superAdminPassword),
    can_view_team_history: true,
    can_use_sales_sender: true,
    can_use_admin_sender: true,
    created_at: now,
    updated_at: now,
    last_login: null,
  });

  await client.close();
  console.log(
    `Super admin reset complete: ${config.superAdminEmail} / ${config.superAdminPassword}`,
  );
}

run().catch((error) => {
  console.error('Failed to reset super admin:', error);
  process.exit(1);
});
