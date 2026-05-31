import jwt from 'jsonwebtoken';
import { findUserById } from '../utils/db.js';

export const INACTIVE_ACCOUNT_MESSAGE = 'Your account is inactive. Please contact admin.';

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required');
  }
  return secret;
};

export function signAuthToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), email: user.email, is_admin: user.is_admin === true },
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const payload = jwt.verify(token, getJwtSecret());
    const user = await findUserById(payload.sub);

    if (!user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (user.is_active !== true) {
      return res.status(403).json({ success: false, message: INACTIVE_ACCOUNT_MESSAGE });
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      name: user.name || '',
      is_active: user.is_active,
      is_admin: user.is_admin === true
    };

    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Invalid session. Please log in again.' });
    }

    return next(error);
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.is_admin !== true) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }

  return next();
}
