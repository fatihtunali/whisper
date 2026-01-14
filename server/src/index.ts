// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import crypto from 'crypto';
import { WebSocketServer } from './websocket/WebSocketServer';
import { reportService } from './services/ReportService';
import { adminService } from './services/AdminService';
import { connectionManager } from './websocket/ConnectionManager';

// TURN server configuration
const TURN_SECRET = process.env.TURN_SECRET || 'WhisperTurnSecretKey2024SarjMobile!';
const TURN_TTL = 24 * 60 * 60; // 24 hours in seconds

// Generate time-limited TURN credentials
function generateTurnCredentials(userId: string): { username: string; credential: string; ttl: number; urls: string[] } {
  const timestamp = Math.floor(Date.now() / 1000) + TURN_TTL;
  const username = `${timestamp}:${userId}`;
  const credential = crypto
    .createHmac('sha1', TURN_SECRET)
    .update(username)
    .digest('base64');

  return {
    username,
    credential,
    ttl: TURN_TTL,
    urls: [
      'stun:turn.sarjmobile.com:3479',
      'turn:turn.sarjmobile.com:3479',
      'turns:turn.sarjmobile.com:5350',
    ],
  };
}

// Export for use in WebSocket server
export { generateTurnCredentials };

// Admin authentication middleware
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'whisper-admin-key-change-in-production';

const adminAuth = (req: Request, res: Response, next: NextFunction): void => {
  const apiKey = req.headers['x-admin-api-key'];
  if (apiKey !== ADMIN_API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
};

const PORT = parseInt(process.env.PORT || '3031', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Create Express app
const app = express();
app.use(express.json());

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Stats endpoint
app.get('/stats', async (_req, res) => {
  const stats = wsServer ? await wsServer.getStats() : { connections: 0, pendingMessages: { users: 0, messages: 0 } };
  res.json({
    ...stats,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// TURN credentials endpoint (for WebRTC calls)
app.get('/turn-credentials', (req, res) => {
  const userId = (req.query.userId as string) || 'anonymous';
  const credentials = generateTurnCredentials(userId);
  res.json(credentials);
});

// CORS headers for API
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Admin-API-Key');
  next();
});

// ============ ADMIN API ENDPOINTS ============

// Get all pending reports
app.get('/admin/reports', adminAuth, (_req, res) => {
  const pending = reportService.getPendingReports();
  const stats = reportService.getStats();
  res.json({ pending, stats });
});

// Get reports for a specific user
app.get('/admin/reports/user/:whisperId', adminAuth, (req, res) => {
  const { whisperId } = req.params;
  const reports = reportService.getReportsForUser(whisperId);
  res.json({ reports });
});

// Review a report
app.post('/admin/reports/:reportId/review', adminAuth, (req, res) => {
  const { reportId } = req.params;
  const { status, notes } = req.body;

  if (!['reviewed', 'action_taken', 'dismissed'].includes(status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }

  const success = reportService.reviewReport(reportId, status, notes);
  if (!success) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }

  res.json({ success: true, reportId, status });
});

// Ban a user
app.post('/admin/ban', adminAuth, (req, res) => {
  const { whisperId, reason, relatedReportIds, notes } = req.body;

  if (!whisperId || !reason) {
    res.status(400).json({ error: 'whisperId and reason are required' });
    return;
  }

  const adminId = 'admin'; // In production, identify the admin from auth
  const ban = adminService.banUser(whisperId, reason, adminId, relatedReportIds || [], notes);
  res.json({ success: true, ban });
});

// Unban a user
app.post('/admin/unban', adminAuth, (req, res) => {
  const { whisperId } = req.body;

  if (!whisperId) {
    res.status(400).json({ error: 'whisperId is required' });
    return;
  }

  const adminId = 'admin';
  const success = adminService.unbanUser(whisperId, adminId);
  if (!success) {
    res.status(404).json({ error: 'User not banned' });
    return;
  }

  res.json({ success: true, whisperId });
});

// Get all banned users
app.get('/admin/bans', adminAuth, (_req, res) => {
  const banned = adminService.getAllBannedUsers();
  const stats = adminService.getStats();
  res.json({ banned, stats });
});

// Check if a user is banned
app.get('/admin/bans/:whisperId', adminAuth, (req, res) => {
  const { whisperId } = req.params;
  const isBanned = adminService.isBanned(whisperId);
  const details = adminService.getBanDetails(whisperId);
  res.json({ whisperId, isBanned, details });
});

// Export data for law enforcement
app.post('/admin/export/law-enforcement', adminAuth, (req, res) => {
  const { reportIds, whisperIds } = req.body;

  const reportData = reportIds ? reportService.exportForLawEnforcement(reportIds) : [];
  const banData = whisperIds ? adminService.exportForLawEnforcement(whisperIds) : [];

  res.json({
    exportedAt: new Date().toISOString(),
    reports: reportData,
    bans: banData,
    note: 'Message content is E2E encrypted and not accessible by server',
  });
});

// Get super admin info
app.get('/admin/super-admin', adminAuth, (_req, res) => {
  const superAdmin = adminService.getSuperAdmin();
  res.json({ superAdmin });
});

// ============ END ADMIN API ============

// Create HTTP server
const server = createServer(app);

// Create WebSocket server
let wsServer: WebSocketServer | null = null;

// Start the server
server.listen(PORT, HOST, async () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                    WHISPER SERVER                          ║');
  console.log('║              Private. Secure. Anonymous.                   ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  HTTP Server:      http://${HOST}:${PORT}                     ║`);
  console.log(`║  WebSocket Server: ws://${HOST}:${PORT}                       ║`);
  console.log('║                                                            ║');
  console.log('║  Public Endpoints:                                         ║');
  console.log('║    GET /health - Health check                              ║');
  console.log('║    GET /stats  - Server statistics                         ║');
  console.log('║                                                            ║');
  console.log('║  Admin Endpoints (requires X-Admin-API-Key header):        ║');
  console.log('║    GET  /admin/reports      - Get pending reports          ║');
  console.log('║    POST /admin/ban          - Ban a user                   ║');
  console.log('║    GET  /admin/bans         - Get banned users             ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  // Initialize ConnectionManager (loads push tokens from database)
  await connectionManager.initialize();

  // Initialize WebSocket server after HTTP server is listening
  wsServer = new WebSocketServer(server);
});

// Graceful shutdown
const shutdown = () => {
  console.log('\n[Server] Shutting down gracefully...');

  wsServer?.close();

  server.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    console.log('[Server] Forced shutdown');
    process.exit(1);
  }, 10000);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[Server] Uncaught exception:', error);
  shutdown();
});

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled rejection:', reason);
});
