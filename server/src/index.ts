import express from 'express';
import { createServer } from 'http';
import dotenv from 'dotenv';
import { WebSocketServer } from './websocket/WebSocketServer';

// Load environment variables
dotenv.config();

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
app.get('/stats', (_req, res) => {
  const stats = wsServer?.getStats() || { connections: 0, pendingMessages: { users: 0, messages: 0 } };
  res.json({
    ...stats,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// CORS headers for API
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Create HTTP server
const server = createServer(app);

// Create WebSocket server
let wsServer: WebSocketServer | null = null;

// Start the server
server.listen(PORT, HOST, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                    WHISPER SERVER                          ║');
  console.log('║              Private. Secure. Anonymous.                   ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  HTTP Server:      http://${HOST}:${PORT}                     ║`);
  console.log(`║  WebSocket Server: ws://${HOST}:${PORT}                       ║`);
  console.log('║                                                            ║');
  console.log('║  Endpoints:                                                ║');
  console.log('║    GET /health - Health check                              ║');
  console.log('║    GET /stats  - Server statistics                         ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

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
