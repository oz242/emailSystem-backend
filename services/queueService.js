import nodemailer from 'nodemailer';
import { updateCampaign, addLogs, getSMTPs } from '../utils/db.js';
import path from 'path';

class QueueService {
  constructor() {
    this.activeCampaignId = null;
    this.currentState = 'idle'; // idle, sending, paused, stopped, completed
    this.recipients = [];
    this.currentIndex = 0;
    this.delayMs = 2000;
    this.subjectTemplate = '';
    this.bodyTemplate = '';
    this.attachments = [];
    
    // Stats tracking
    this.total = 0;
    this.sent = 0;
    this.failed = 0;
    this.pending = 0;
    this.liveLogs = [];
  }

  /**
   * Helper sleep promise
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Safe string compiler for {{template}} keys
   */
  compileTemplate(template, recipient) {
    if (!template) return '';
    return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const cleanKey = key.trim();
      // Case insensitive lookups
      const foundKey = Object.keys(recipient).find(k => k.toLowerCase() === cleanKey.toLowerCase());
      if (foundKey && recipient[foundKey] !== undefined) {
        return recipient[foundKey];
      }
      return match;
    });
  }

  /**
   * Logs a message in memory and schedules it for persistence
   */
  logMessage(campaignId, recipientEmail, status, message) {
    const logEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      campaignId,
      recipientEmail,
      status, // success, error, info
      message,
      timestamp: new Date().toISOString()
    };
    
    this.liveLogs.unshift(logEntry);
    
    // Keep live logs to a reasonable visual size (e.g. 100)
    if (this.liveLogs.length > 100) {
      this.liveLogs.pop();
    }
    
    // Write directly to logs database
    addLogs([logEntry]);
  }

  /**
   * Standard Email Validator
   */
  isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
  }

  /**
   * Get Current Status for APIs
   */
  getStatus() {
    return {
      campaignId: this.activeCampaignId,
      currentState: this.currentState,
      currentIndex: this.currentIndex,
      total: this.total,
      sent: this.sent,
      failed: this.failed,
      pending: this.pending,
      delayMs: this.delayMs,
      progress: this.total > 0 ? Math.round(((this.sent + this.failed) / this.total) * 100) : 0,
      liveLogs: this.liveLogs
    };
  }

  /**
   * Start executing a campaign
   */
  async startCampaign(campaign, delaySeconds = 2) {
    if (this.currentState === 'sending') {
      throw new Error('Another campaign is already sending. Please pause or stop it first.');
    }

    this.activeCampaignId = campaign.id;
    this.recipients = campaign.recipients;
    this.total = this.recipients.length;
    this.delayMs = delaySeconds * 1000;
    this.subjectTemplate = campaign.subject;
    this.bodyTemplate = campaign.body;
    this.attachments = campaign.attachments || [];
    
    // Scan recipients to find index to start from (e.g., skip already completed ones if resuming or retrying)
    this.currentIndex = this.recipients.findIndex(r => r.status === 'pending');
    if (this.currentIndex === -1) {
      this.currentIndex = 0;
    }

    // Refresh stats based on current state of recipients
    this.sent = this.recipients.filter(r => r.status === 'sent').length;
    this.failed = this.recipients.filter(r => r.status === 'failed').length;
    this.pending = this.recipients.filter(r => r.status === 'pending').length;
    
    this.currentState = 'sending';
    this.logMessage(this.activeCampaignId, 'SYSTEM', 'info', `Starting campaign campaign: "${campaign.name}" with ${this.pending} pending emails.`);
    
    updateCampaign(this.activeCampaignId, {
      status: 'sending',
      stats: { total: this.total, sent: this.sent, failed: this.failed, pending: this.pending }
    });

    // Start background processor
    this.runQueue();
    return this.getStatus();
  }

  /**
   * Pause execution
   */
  pauseCampaign() {
    if (this.currentState !== 'sending') {
      throw new Error('No campaign is actively sending to pause.');
    }
    this.currentState = 'paused';
    this.logMessage(this.activeCampaignId, 'SYSTEM', 'info', 'Campaign paused by user.');
    updateCampaign(this.activeCampaignId, { status: 'paused' });
    return this.getStatus();
  }

  /**
   * Resume execution
   */
  resumeCampaign() {
    if (this.currentState !== 'paused') {
      throw new Error('Campaign is not in a paused state.');
    }
    this.currentState = 'sending';
    this.logMessage(this.activeCampaignId, 'SYSTEM', 'info', 'Campaign resumed by user.');
    updateCampaign(this.activeCampaignId, { status: 'sending' });
    
    this.runQueue();
    return this.getStatus();
  }

  /**
   * Stop execution
   */
  stopCampaign() {
    if (this.currentState !== 'sending' && this.currentState !== 'paused') {
      throw new Error('No campaign is actively sending or paused to stop.');
    }
    this.currentState = 'stopped';
    this.logMessage(this.activeCampaignId, 'SYSTEM', 'info', 'Campaign stopped by user.');
    updateCampaign(this.activeCampaignId, { status: 'stopped' });
    return this.getStatus();
  }

  /**
   * Retry failed emails in an active campaign
   */
  async retryFailed(campaign, delaySeconds = 2) {
    if (this.currentState === 'sending') {
      throw new Error('Another campaign is actively sending. Cannot trigger retry.');
    }

    // Set all failed recipients to pending
    const updatedRecipients = campaign.recipients.map(r => {
      if (r.status === 'failed') {
        return { ...r, status: 'pending', error: null };
      }
      return r;
    });

    const updatedCampaign = {
      ...campaign,
      recipients: updatedRecipients,
      status: 'pending'
    };

    updateCampaign(campaign.id, updatedCampaign);
    return this.startCampaign(updatedCampaign, delaySeconds);
  }

  /**
   * The actual background execution loop
   */
  async runQueue() {
    const activeSmtps = getSMTPs().filter(s => s.active !== false);

    if (activeSmtps.length === 0) {
      this.currentState = 'failed';
      this.logMessage(this.activeCampaignId, 'SYSTEM', 'error', 'Failed to start queue: No active SMTP configurations found.');
      updateCampaign(this.activeCampaignId, { status: 'failed' });
      return;
    }

    let smtpIndex = 0;

    while (this.currentState === 'sending' && this.currentIndex < this.recipients.length) {
      const recipient = this.recipients[this.currentIndex];

      if (recipient.status === 'sent') {
        this.currentIndex++;
        continue;
      }

      // 1. Email validation
      if (!this.isValidEmail(recipient.email)) {
        recipient.status = 'failed';
        recipient.error = 'Invalid email format';
        this.failed++;
        this.pending--;
        this.logMessage(this.activeCampaignId, recipient.email, 'error', `Skipped: ${recipient.error}`);
        this.currentIndex++;
        
        updateCampaign(this.activeCampaignId, {
          recipients: this.recipients,
          stats: { total: this.total, sent: this.sent, failed: this.failed, pending: this.pending }
        });
        continue;
      }

      // 2. Select SMTP with rotation
      const smtpConfig = activeSmtps[smtpIndex];
      smtpIndex = (smtpIndex + 1) % activeSmtps.length; // cycle to next SMTP

      // 3. Compile personalized templates
      const compiledSubject = this.compileTemplate(this.subjectTemplate, recipient);
      const compiledBody = this.compileTemplate(this.bodyTemplate, recipient);

      try {
        // 4. Send email
        await this.sendMail(smtpConfig, recipient.email, compiledSubject, compiledBody);
        
        // 5. Successful sending
        recipient.status = 'sent';
        recipient.sentAt = new Date().toISOString();
        this.sent++;
        this.pending--;
        this.logMessage(
          this.activeCampaignId, 
          recipient.email, 
          'success', 
          `Email sent successfully via ${smtpConfig.user || smtpConfig.senderEmail}`
        );
      } catch (err) {
        // 6. Failed sending
        recipient.status = 'failed';
        recipient.error = err.message || 'Unknown SMTP error';
        this.failed++;
        this.pending--;
        this.logMessage(
          this.activeCampaignId, 
          recipient.email, 
          'error', 
          `Failed sending via ${smtpConfig.user || smtpConfig.senderEmail}: ${recipient.error}`
        );
      }

      this.currentIndex++;
      
      // Update database counts
      updateCampaign(this.activeCampaignId, {
        recipients: this.recipients,
        stats: { total: this.total, sent: this.sent, failed: this.failed, pending: this.pending }
      });

      // 7. Configurable delay between sends (if not stopped/paused and not the last email)
      if (this.currentState === 'sending' && this.currentIndex < this.recipients.length) {
        await this.sleep(this.delayMs);
      }
    }

    // Wrap up execution
    if (this.currentState === 'sending' && this.currentIndex >= this.recipients.length) {
      this.currentState = 'completed';
      this.logMessage(this.activeCampaignId, 'SYSTEM', 'success', 'Campaign finished! All recipients processed.');
      updateCampaign(this.activeCampaignId, { status: 'completed' });
    }
  }

  /**
   * Wrapper for NodeMailer send
   */
  sendMail(smtpConfig, to, subject, html) {
    return new Promise((resolve, reject) => {
      // Create transporter
      const transporter = nodemailer.createTransport({
        host: smtpConfig.host,
        port: parseInt(smtpConfig.port),
        secure: smtpConfig.secure, // true for 465, false for 587/other
        auth: {
          user: smtpConfig.user,
          pass: smtpConfig.pass
        },
        tls: {
          rejectUnauthorized: false // bypass SSL verification issues
        }
      });

      const mailOptions = {
        from: `"${smtpConfig.senderName || 'Sender'}" <${smtpConfig.user}>`,
        to,
        subject,
        html: html.replace(/\n/g, '<br>'), // convert line breaks to HTML
        attachments: this.attachments.map(att => ({
          filename: att.originalname,
          path: att.path
        }))
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          reject(error);
        } else {
          resolve(info);
        }
      });
    });
  }
}

// Export singleton instance
const queueService = new QueueService();
export default queueService;
