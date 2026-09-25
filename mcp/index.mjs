#!/usr/bin/env node
// Entry point for MCP clients: `node /path/to/suno-api/mcp/index.mjs`.
// Works from any cwd: switches to the repo root (where .env, .data and public/mv-assets live),
// keeps stdout reserved for JSON-RPC, then loads the TypeScript server through tsx.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
process.env.SUNO_LOG_STDERR = '1';
console.log = console.error;
console.info = console.error;

// src/ is CommonJS-flavoured TS (no "type": "module"), so hook both loaders.
const tsconfig = path.join(root, 'tsconfig.json');
(await import('tsx/cjs/api')).register({ tsconfig });
(await import('tsx/esm/api')).register({ tsconfig });
await import('./server.mts');
