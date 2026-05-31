import express from 'express';
import {
  getSmtps,
  addOrUpdateSmtp,
  removeSmtp,
  testSmtpConnection,
  getAiSettings,
  saveAiSettings
} from '../controllers/smtpController.js';

const router = express.Router();

router.get('/', getSmtps);
router.post('/', addOrUpdateSmtp);
router.delete('/:id', removeSmtp);
router.post('/test', testSmtpConnection);
router.get('/ai-settings', getAiSettings);
router.post('/ai-settings', saveAiSettings);

export default router;
