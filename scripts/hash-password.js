import bcrypt from 'bcryptjs';

const password = process.argv[2];

if (!password) {
  console.error('Usage: node scripts/hash-password.js "your-password"');
  process.exit(1);
}

const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
const hash = await bcrypt.hash(password, rounds);
console.log(hash);
