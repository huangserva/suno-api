import pino from 'pino';

// MCP stdio servers must keep stdout clean for JSON-RPC, so SUNO_LOG_STDERR routes logs to stderr.
export const logger = process.env.SUNO_LOG_STDERR
  ? pino(pino.destination(2))
  : pino();
