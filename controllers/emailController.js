import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { parseSheetFile } from '../utils/parser.js';
import {
  getCampaigns,
  saveCampaign,
  updateCampaign,
  getLogsByCampaign,
  clearLogsByCampaign
} from '../utils/db.js';
import queueService from '../services/queueService.js';

/**
 * POST /api/upload
 * Accepts an Excel/CSV file, parses it, returns headers + preview rows
 */
export async function uploadSheet(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    console.log("enter in ",req.file.path);
    
    const { headers, rows } = parseSheetFile(req.file.path);
    return res.json({
      success: true,
      headers,
      preview: rows.slice(0, 10),
      totalRows: rows.length,
      filePath: req.file.path,
      originalName: req.file.originalname
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/campaigns
 * Create a new campaign
 */
export async function createCampaign(req, res) {
  try {
    let {
      name,
      subject,
      body,
      recipients,        // array of objects with email, name, ...etc
      delaySeconds,
      scheduledAt,
      sheetFilePath
    } = req.body;

    if (!name || !subject || !body || !recipients || !recipients.length) {
      return res.status(400).json({ success: false, message: 'Missing required campaign fields' });
    }
    console.log(recipients,"recipients");
    recipients = JSON.parse(recipients);

    // Validate that every recipient has an email field
    const hasEmailField = recipients?.every(r => r.email);
    if (!hasEmailField) {
      return res.status(400).json({ success: false, message: 'Every recipient row must have an "email" field' });
    }

    // Collect attachment files if any
    const attachments = (req.files || []).map(f => ({
      originalname: f.originalname,
      path: f.path,
      mimetype: f.mimetype
    }));

    const campaign = {
      id: uuidv4(),
      name,
      subject,
      body,
      recipients: recipients.map(r => ({ ...r, status: 'pending', error: null, sentAt: null })),
      attachments,
      delaySeconds: delaySeconds || 2,
      scheduledAt: scheduledAt || null,
      status: 'draft', // draft, sending, paused, stopped, completed, failed
      stats: {
        total: recipients.length,
        sent: 0,
        failed: 0,
        pending: recipients.length
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    saveCampaign(campaign);
    return res.json({ success: true, campaign });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/campaigns
 * Get all campaigns
 */
export async function listCampaigns(req, res) {
  try {
    const campaigns = getCampaigns();
    // Return lean campaigns without full recipients array for performance
    const lean = campaigns.map(c => ({
      id: c.id,
      name: c.name,
      subject: c.subject,
      status: c.status,
      stats: c.stats,
      delaySeconds: c.delaySeconds,
      scheduledAt: c.scheduledAt,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    }));
    return res.json({ success: true, campaigns: lean });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/campaigns/:id
 * Get single campaign
 */
export async function getCampaign(req, res) {
  try {
    const campaigns = getCampaigns();
    const campaign = campaigns.find(c => c.id === req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    return res.json({ success: true, campaign });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/campaigns/:id/status
 * Get real-time campaign status (used for polling)
 */
export async function getCampaignStatus(req, res) {
  try {
    const { id } = req.params;
    const campaigns = getCampaigns();
    const campaign = campaigns.find(c => c.id === id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });

    // If this is the active campaign, merge live queue state
    const liveStatus = queueService.getStatus();
    if (liveStatus.campaignId === id) {
      return res.json({
        success: true,
        status: liveStatus.currentState,
        stats: {
          total: liveStatus.total,
          sent: liveStatus.sent,
          failed: liveStatus.failed,
          pending: liveStatus.pending
        },
        progress: liveStatus.progress,
        liveLogs: liveStatus.liveLogs
      });
    }

    return res.json({
      success: true,
      status: campaign.status,
      stats: campaign.stats,
      progress: campaign.stats.total > 0
        ? Math.round(((campaign.stats.sent + campaign.stats.failed) / campaign.stats.total) * 100)
        : 0,
      liveLogs: []
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/campaigns/:id/send
 */
export async function sendCampaign(req, res) {
  try {
    const { id } = req.params;
    const { delaySeconds } = req.body;
    const campaigns = getCampaigns();
    const campaign = campaigns.find(c => c.id === id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });

    const status = await queueService.startCampaign(campaign, delaySeconds || campaign.delaySeconds || 2);
    return res.json({ success: true, message: 'Campaign started', status });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/campaigns/:id/pause
 */
export async function pauseCampaign(req, res) {
  try {
    const status = queueService.pauseCampaign();
    return res.json({ success: true, message: 'Campaign paused', status });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/campaigns/:id/resume
 */
export async function resumeCampaign(req, res) {
  try {
    const status = queueService.resumeCampaign();
    return res.json({ success: true, message: 'Campaign resumed', status });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/campaigns/:id/stop
 */
export async function stopCampaign(req, res) {
  try {
    const status = queueService.stopCampaign();
    return res.json({ success: true, message: 'Campaign stopped', status });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/campaigns/:id/retry
 * Retry failed emails
 */
export async function retryFailed(req, res) {
  try {
    const { id } = req.params;
    const { delaySeconds } = req.body;
    const campaigns = getCampaigns();
    const campaign = campaigns.find(c => c.id === id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });

    const status = await queueService.retryFailed(campaign, delaySeconds || campaign.delaySeconds || 2);
    return res.json({ success: true, message: 'Retrying failed emails', status });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/campaigns/:id/logs
 * Get all logs for a campaign
 */
export async function getCampaignLogs(req, res) {
  try {
    const { id } = req.params;
    const logs = getLogsByCampaign(id);
    return res.json({ success: true, logs });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/campaigns/:id/export
 * Export failed emails as CSV
 */
export async function exportFailedCSV(req, res) {
  try {
    const { id } = req.params;
    const campaigns = getCampaigns();
    const campaign = campaigns.find(c => c.id === id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });

    const failedRecipients = campaign.recipients.filter(r => r.status === 'failed');
    if (!failedRecipients.length) {
      return res.status(400).json({ success: false, message: 'No failed emails to export' });
    }

    // Build CSV
    const headers = Object.keys(failedRecipients[0]).filter(k => k !== 'sentAt').join(',');
    const rows = failedRecipients.map(r =>
      Object.entries(r)
        .filter(([k]) => k !== 'sentAt')
        .map(([, v]) => `"${String(v || '').replace(/"/g, '""')}"`)
        .join(',')
    );
    const csv = [headers, ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="failed-emails-${id}.csv"`);
    return res.send(csv);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/status
 * Overall queue status
 */
export async function getQueueStatus(req, res) {
  try {
    return res.json({ success: true, queue: queueService.getStatus() });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}
