import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  uploadSheet,
  createCampaign,
  listCampaigns,
  getCampaign,
  getCampaignStatus,
  sendCampaign,
  pauseCampaign,
  resumeCampaign,
  stopCampaign,
  retryFailed,
  getCampaignLogs,
  exportFailedCSV,
  getQueueStatus
} from '../controllers/emailController.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

// Multer config for sheet file upload
const sheetStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => cb(null, `sheet-${Date.now()}-${file.originalname}`)
});
const sheetUpload = multer({
  storage: sheetStorage,
  fileFilter: (req, file, cb) => {
    const allowed = ['.xlsx', '.xls', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only .xlsx, .xls, and .csv files are allowed'));
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Multer config for attachment files
const attachStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => cb(null, `attach-${Date.now()}-${file.originalname}`)
});
const attachUpload = multer({
  storage: attachStorage,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB per attachment
});

// Routes
router.post('/upload', sheetUpload.single('file'), uploadSheet);
router.get('/status', getQueueStatus);
router.post('/campaigns', attachUpload.array('attachments', 10), createCampaign);
router.get('/campaigns', listCampaigns);
router.get('/campaigns/:id', getCampaign);
router.get('/campaigns/:id/status', getCampaignStatus);
router.get('/campaigns/:id/logs', getCampaignLogs);
router.get('/campaigns/:id/export', exportFailedCSV);
router.post('/campaigns/:id/send', sendCampaign);
router.post('/campaigns/:id/pause', pauseCampaign);
router.post('/campaigns/:id/resume', resumeCampaign);
router.post('/campaigns/:id/stop', stopCampaign);
router.post('/campaigns/:id/retry', retryFailed);

export default router;
