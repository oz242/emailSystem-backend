import bcrypt from 'bcryptjs';
import { findUserByEmail } from '../utils/db.js';
import { INACTIVE_ACCOUNT_MESSAGE, signAuthToken } from '../middleware/auth.js';

const publicUser = (user) => ({
  id: user._id.toString(),
  email: user.email,
  name: user.name || '',
  is_active: user.is_active,
  is_admin: user.is_admin === true
});

export async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await findUserByEmail(email);
    if (!user || !user.password_hash) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (user.is_active !== true) {
      return res.status(403).json({ success: false, message: INACTIVE_ACCOUNT_MESSAGE });
    }

    const token = signAuthToken(user);
    return res.json({ success: true, token, user: publicUser(user) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export function me(req, res) {
  return res.json({ success: true, user: req.user });
}
