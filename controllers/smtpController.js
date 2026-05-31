import { getSMTPs, saveSMTP, deleteSMTP, getAiKey, saveAiKey } from '../utils/db.js';
import nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';

/**
 * Get all saved SMTP profiles
 */
export async function getSmtps(req, res) {
  try {
    const smtps = getSMTPs();
    // Return SMTP details, obfuscating password for safety
    const safeSmtps = smtps.map(s => ({
      id: s.id,
      senderName: s.senderName,
      host: s.host,
      port: s.port,
      secure: s.secure,
      user: s.user,
      active: s.active !== false
    }));
    return res.json({ success: true, smtps: safeSmtps });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Save or update SMTP profile
 */
export async function addOrUpdateSmtp(req, res) {
  try {
    const { id, senderName, host, port, secure, user, pass, active } = req.body;

    if (!host || !port || !user || (!id && !pass)) {
      return res.status(400).json({ success: false, message: 'Missing required SMTP parameters' });
    }

    const smtps = getSMTPs();
    const existing = smtps.find(s => s.id === id);

    const smtpConfig = {
      id: id || uuidv4(),
      senderName: senderName || 'Bulk Sender',
      host,
      port: parseInt(port),
      secure: !!secure,
      user,
      pass: pass || (existing ? existing.pass : ''), // preserve password if editing and not provided
      active: active !== false
    };

    saveSMTP(smtpConfig);
    return res.json({ 
      success: true, 
      message: 'SMTP configuration saved successfully',
      smtp: {
        id: smtpConfig.id,
        senderName: smtpConfig.senderName,
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.secure,
        user: smtpConfig.user,
        active: smtpConfig.active
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Delete SMTP profile
 */
export async function removeSmtp(req, res) {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, message: 'SMTP ID required' });
    }
    deleteSMTP(id);
    return res.json({ success: true, message: 'SMTP profile deleted successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Verify SMTP connection diagnostic
 */
export async function testSmtpConnection(req, res) {
  try {
    const { host, port, secure, user, pass, id } = req.body;

    let testPass = pass;
    let testUser = user;
    let testHost = host;
    let testPort = port;
    let testSecure = secure;

    // If ID is provided, load existing SMTP details from storage
    if (id && !pass) {
      const smtps = getSMTPs();
      const match = smtps.find(s => s.id === id);
      if (match) {
        testPass = match.pass;
        testUser = match.user;
        testHost = match.host;
        testPort = match.port;
        testSecure = match.secure;
      }
    }

    if (!testHost || !testPort || !testUser || !testPass) {
      return res.status(400).json({ success: false, message: 'Missing parameters for verification' });
    }

    const transporter = nodemailer.createTransport({
      host: testHost,
      port: parseInt(testPort),
      secure: !!testSecure,
      auth: {
        user: testUser,
        pass: testPass
      },
      connectTimeout: 8000,
      tls: {
        rejectUnauthorized: false // bypass SSL verification issues
      }
    });

    await transporter.verify();
    return res.json({ success: true, message: 'SMTP connection established successfully!' });
  } catch (error) {
    console.error('SMTP Diagnostic Error:', error);
    return res.status(400).json({ 
      success: false, 
      message: `SMTP verification failed: ${error.message}` 
    });
  }
}

/**
 * Get AI credentials settings
 */
export async function getAiSettings(req, res) {
  try {
    const key = getAiKey();
    const obfuscatedKey = key ? `${key.substring(0, 8)}...${key.substring(key.length - 4)}` : '';
    return res.json({ success: true, hasKey: !!key, key: obfuscatedKey });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Save AI credentials settings
 */
export async function saveAiSettings(req, res) {
  try {
    const { key } = req.body;
    saveAiKey(key || '');
    return res.json({ success: true, message: 'AI settings updated successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}
