const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
// Load .env first if it exists for development fallback
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

const configPath = path.join(app.getPath('userData'), 'config.json');

function loadConfig() {
  try {
    if (!fs.existsSync(configPath)) {
      const defaultVars = {
        RESEND_API_KEY: process.env.RESEND_API_KEY || '',
        SENDER_EMAIL: process.env.SENDER_EMAIL || '',
        SENDER_NAME: process.env.SENDER_NAME || '',
        REPLY_TO: process.env.REPLY_TO || '',
        NOTIFY_EMAIL: process.env.NOTIFY_EMAIL || '',
      };
      fs.writeFileSync(configPath, JSON.stringify(defaultVars, null, 2), 'utf-8');
      return defaultVars;
    }
    const raw = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to load config:', err);
    return {};
  }
}

// Initial config loading
const userConfig = loadConfig();
process.env.RESEND_API_KEY = userConfig.RESEND_API_KEY || '';
process.env.SENDER_EMAIL = userConfig.SENDER_EMAIL || '';
process.env.SENDER_NAME = userConfig.SENDER_NAME || '';
process.env.REPLY_TO = userConfig.REPLY_TO || '';
process.env.NOTIFY_EMAIL = userConfig.NOTIFY_EMAIL || '';

const { Resend } = require('resend');
let resend;

function initResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey && apiKey !== 're_YOUR_API_KEY_HERE') {
    resend = new Resend(apiKey);
  } else {
    resend = null;
  }
}

// Initialize Resend client
initResend();

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 600,
    minHeight: 500,
    frame: false,
    backgroundColor: '#E3E2DE',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

// ── IPC: Send Email ──────────────────────────────────────
ipcMain.handle('send-email', async (event, payload) => {
  const { to, cc, bcc, subject, html, text, attachments } = payload;

  const senderName = process.env.SENDER_NAME || 'Resend Mailer';
  const senderEmail = process.env.SENDER_EMAIL || 'onboarding@resend.dev';
  const replyTo = process.env.REPLY_TO || undefined;

  const emailPayload = {
    from: `${senderName} <${senderEmail}>`,
    to: Array.isArray(to) ? to : [to],
    subject,
    reply_to: replyTo,
  };

  if (html) emailPayload.html = html;
  else emailPayload.text = text || '';

  if (cc && cc.length > 0) emailPayload.cc = cc;
  if (bcc && bcc.length > 0) emailPayload.bcc = bcc;

  // Attachments: read files and convert to Buffer
  if (attachments && attachments.length > 0) {
    emailPayload.attachments = attachments.map(a => ({
      filename: a.filename,
      content: Buffer.from(a.content, 'base64'),
    }));
  }

  if (!resend) {
    return { success: false, error: 'Resend API Key is not set or invalid.' };
  }
  try {
    const { data, error } = await resend.emails.send(emailPayload);
    if (error) {
      return { success: false, error: error.message || JSON.stringify(error) };
    }
    return { success: true, id: data.id };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── IPC: Pick files dialog ───────────────────────────────
ipcMain.handle('pick-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'All Files', extensions: ['*'] }],
  });
  if (result.canceled) return [];

  return result.filePaths.map(fp => {
    const content = fs.readFileSync(fp);
    return {
      filename: path.basename(fp),
      content: content.toString('base64'),
      size: content.length,
    };
  });
});

// ── IPC: Retrieve a single sent email by ID ──────────────
ipcMain.handle('get-sent-email', async (event, emailId) => {
  if (!resend) {
    return { success: false, error: 'Resend API Key is not set or invalid.' };
  }
  try {
    const { data, error } = await resend.emails.get(emailId);
    if (error) {
      return { success: false, error: error.message || JSON.stringify(error) };
    }
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── IPC: Get received email by ID (REST API) ────────────
ipcMain.handle('get-received-email', async (event, emailId) => {
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.message || `HTTP ${res.status}` };
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── IPC: List all received emails (REST API) ────────────
ipcMain.handle('list-received-emails', async () => {
  try {
    const res = await fetch('https://api.resend.com/emails/receiving', {
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.message || `HTTP ${res.status}` };
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── IPC: Get sender config ───────────────────────────────
ipcMain.handle('get-config', () => {
  return {
    senderEmail: process.env.SENDER_EMAIL || 'onboarding@resend.dev',
    senderName: process.env.SENDER_NAME || 'Resend Mailer',
    replyTo: process.env.REPLY_TO || '',
    notifyEmail: process.env.NOTIFY_EMAIL || '',
    apiKeySet: !!process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== 're_YOUR_API_KEY_HERE',
  };
});

// ── IPC: Send notification for new received email ───────
ipcMain.handle('notify-new-email', async (event, { from, subject, preview }) => {
  const notifyTo = process.env.NOTIFY_EMAIL;
  if (!notifyTo) return { success: false, error: 'NOTIFY_EMAIL not set' };

  const senderEmail = process.env.SENDER_EMAIL || 'onboarding@resend.dev';
  const senderName = process.env.SENDER_NAME || 'Resend Mailer';

  if (!resend) {
    return { success: false, error: 'Resend API Key is not set or invalid.' };
  }
  try {
    await resend.emails.send({
      from: `${senderName} <${senderEmail}>`,
      to: [notifyTo],
      subject: `📨 ${subject || '(no subject)'} — from ${from || 'unknown'}`,
      text: `You received a new email:\n\nFrom: ${from}\nSubject: ${subject}\n\n${preview || ''}\n\n— Resend Mailer Notification`,
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── IPC: Read configuration settings ──────────────────────
ipcMain.handle('read-env', async () => {
  try {
    const config = loadConfig();
    return { success: true, data: config };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('save-env', async (event, vars) => {
  try {
    const updatedVars = {
      RESEND_API_KEY: vars.RESEND_API_KEY || '',
      SENDER_EMAIL: vars.SENDER_EMAIL || '',
      SENDER_NAME: vars.SENDER_NAME || '',
      REPLY_TO: vars.REPLY_TO || '',
      NOTIFY_EMAIL: vars.NOTIFY_EMAIL || '',
    };
    fs.writeFileSync(configPath, JSON.stringify(updatedVars, null, 2), 'utf-8');

    // Update process.env runtime variables
    process.env.RESEND_API_KEY = updatedVars.RESEND_API_KEY;
    process.env.SENDER_EMAIL = updatedVars.SENDER_EMAIL;
    process.env.SENDER_NAME = updatedVars.SENDER_NAME;
    process.env.REPLY_TO = updatedVars.REPLY_TO;
    process.env.NOTIFY_EMAIL = updatedVars.NOTIFY_EMAIL;

    // Re-initialize Resend client
    initResend();

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── IPC: Window controls ─────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());

// ── App lifecycle ────────────────────────────────────────
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
