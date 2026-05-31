import express from 'express';
import { createUser, listUsers, updateUser } from '../controllers/adminUserController.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get('/users', listUsers);
router.post('/users', createUser);
router.patch('/users/:id', updateUser);

export default router;
