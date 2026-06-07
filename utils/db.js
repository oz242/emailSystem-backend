import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { MongoClient, ObjectId } from 'mongodb';

dotenv.config();

const DATA_DIR = path.join(process.cwd(), 'data');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://surajaheer2002:suraj12345@cluster0.hcq5sxu.mongodb.net/emailSystem?retryWrites=true&w=majority';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'emailSystem';

let mongoClient;
let mongoDb;

// Ensure database and upload directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const getFilePath = (fileName) => path.join(DATA_DIR, fileName);

/**
 * Safely reads a JSON file, returning a default value if file does not exist or is invalid.
 */
export function readData(fileName, defaultValue = []) {
  const filePath = getFilePath(fileName);
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), 'utf8');
      return defaultValue;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error reading database file ${fileName}:`, error);
    return defaultValue;
  }
}

/**
 * Atomic write to JSON file to prevent file corruption.
 */
export function writeData(fileName, data) {
  const filePath = getFilePath(fileName);
  const tempPath = `${filePath}.tmp`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
    return true;
  } catch (error) {
    console.error(`Error writing database file ${fileName}:`, error);
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (_) {}
    }
    return false;
  }
}

// SMTP configurations operations
export const getSMTPs = () => readData('settings.json', { smtps: [], aiKey: '' }).smtps || [];
export const saveSMTP = (smtp) => {
  const settings = readData('settings.json', { smtps: [], aiKey: '' });
  const index = settings.smtps.findIndex(s => s.id === smtp.id);
  if (index !== -1) {
    settings.smtps[index] = { ...settings.smtps[index], ...smtp };
  } else {
    settings.smtps.push(smtp);
  }
  writeData('settings.json', settings);
  return smtp;
};
export const deleteSMTP = (id) => {
  const settings = readData('settings.json', { smtps: [], aiKey: '' });
  settings.smtps = settings.smtps.filter(s => s.id !== id);
  writeData('settings.json', settings);
  return true;
};

// AI Key operations
export const getAiKey = () => readData('settings.json', { smtps: [], aiKey: '' }).aiKey || '';
export const saveAiKey = (key) => {
  const settings = readData('settings.json', { smtps: [], aiKey: '' });
  settings.aiKey = key;
  writeData('settings.json', settings);
  return true;
};

// Campaigns operations
export const getCampaigns = () => readData('campaigns.json', []);
export const saveCampaign = (campaign) => {
  const campaigns = getCampaigns();
  campaigns.unshift(campaign); // add new campaign to start
  writeData('campaigns.json', campaigns);
  return campaign;
};
export const updateCampaign = (id, updates) => {
  const campaigns = getCampaigns();
  const index = campaigns.findIndex(c => c.id === id);
  if (index !== -1) {
    campaigns[index] = { ...campaigns[index], ...updates, updatedAt: new Date().toISOString() };
    writeData('campaigns.json', campaigns);
    return campaigns[index];
  }
  return null;
};

// Logs operations
export const getLogs = () => readData('logs.json', []);
export const getLogsByCampaign = (campaignId) => {
  const logs = getLogs();
  return logs.filter(log => log.campaignId === campaignId);
};
export const addLogs = (newLogs) => {
  const logs = getLogs();
  // Append new logs and keep last 20,000 logs to prevent file bloat
  const updatedLogs = [...newLogs, ...logs].slice(0, 20000);
  writeData('logs.json', updatedLogs);
};
export const clearLogsByCampaign = (campaignId) => {
  const logs = getLogs();
  const filtered = logs.filter(log => log.campaignId !== campaignId);
  writeData('logs.json', filtered);
};

export async function connectMongo() {
  if (mongoDb) return mongoDb;

  console.log(MONGODB_URI,"MONGODB_URI");
  

  mongoClient = new MongoClient(MONGODB_URI);
  await mongoClient.connect();
  mongoDb = mongoClient.db(MONGODB_DB_NAME);

  await mongoDb.collection('users').createIndex({ email: 1 }, { unique: true });
  return mongoDb;
}

export function getMongoDb() {
  if (!mongoDb) {
    throw new Error('MongoDB is not connected');
  }
  return mongoDb;
}

export function getUsersCollection() {
  return getMongoDb().collection('users');
}

export async function findUserByEmail(email) {
  return getUsersCollection().findOne({ email: String(email).toLowerCase().trim() });
}

export async function findUserById(id) {
  if (!ObjectId.isValid(id)) return null;
  return getUsersCollection().findOne({ _id: new ObjectId(id) });
}
