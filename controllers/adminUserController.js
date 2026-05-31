import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import { getUsersCollection } from '../utils/db.js';

const normalizeEmail = (email) => String(email || '').toLowerCase().trim();

const publicUser = (user) => ({
  id: user._id.toString(),
  email: user.email,
  name: user.name || '',
  is_active: user.is_active === true,
  is_admin: user.is_admin === true,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

export async function listUsers(req, res) {
  try {
    const users = await getUsersCollection()
      .find({}, { projection: { password_hash: 0 } })
      .sort({ createdAt: -1, email: 1 })
      .toArray();

    return res.json({ success: true, users: users.map(publicUser) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function createUser(req, res) {
  try {
    const email = normalizeEmail(req.body.email);
    const { password, name } = req.body;
    const isAdmin = req.body.is_admin === true;
    const isActive = req.body.is_active !== false;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }

    const now = new Date();
    const passwordHash = await bcrypt.hash(password, Number(process.env.BCRYPT_ROUNDS || 12));
    const result = await getUsersCollection().insertOne({
      email,
      name: String(name || '').trim(),
      password_hash: passwordHash,
      is_active: isActive,
      is_admin: isAdmin,
      createdAt: now,
      updatedAt: now
    });

    const user = await getUsersCollection().findOne({ _id: result.insertedId });
    return res.status(201).json({ success: true, user: publicUser(user) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'A user with this email already exists' });
    }

    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function updateUser(req, res) {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }

    const updates = { updatedAt: new Date() };
    if (typeof req.body.name === 'string') updates.name = req.body.name.trim();
    if (typeof req.body.is_active === 'boolean') updates.is_active = req.body.is_active;
    if (typeof req.body.is_admin === 'boolean') updates.is_admin = req.body.is_admin;

    if (req.body.password) {
      if (String(req.body.password).length < 8) {
        return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
      }
      updates.password_hash = await bcrypt.hash(String(req.body.password), Number(process.env.BCRYPT_ROUNDS || 12));
    }

    const result = await getUsersCollection().findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: updates },
      { returnDocument: 'after', projection: { password_hash: 0 } }
    );

    if (!result) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({ success: true, user: publicUser(result) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}
