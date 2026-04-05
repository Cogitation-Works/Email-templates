const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const { config } = require('../config');

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function verifyPassword(plainPassword, hashedPassword) {
  return bcrypt.compare(plainPassword, hashedPassword);
}

function generatePassword(length = 14) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let core = '';
  for (let index = 0; index < Math.max(length - 2, 8); index += 1) {
    const next = crypto.randomInt(0, alphabet.length);
    core += alphabet[next];
  }
  return `CW${core}`;
}

function generateOtpCode(length = 6) {
  const max = 10 ** length;
  return String(crypto.randomInt(0, max)).padStart(length, '0');
}

function hashOtpCode(code) {
  return crypto
    .createHash('sha256')
    .update(`${code}:${config.jwtSecretKey}`, 'utf8')
    .digest('hex');
}

function verifyOtpCode(code, otpHash) {
  return hashOtpCode(code) === otpHash;
}

module.exports = {
  generateOtpCode,
  generatePassword,
  hashOtpCode,
  hashPassword,
  verifyOtpCode,
  verifyPassword,
};
