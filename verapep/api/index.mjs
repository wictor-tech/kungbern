/* Vercel entry point. Runs the normal VERAPEP request handler inside a serverless function.
   Vercel has no persistent disk: the SQLite database lives in /tmp and is re-created from the
   shipped data/ files on a cold start, so admin changes are not kept. Use this as a preview;
   production needs a host with a persistent disk (see DEPLOYMENT.md). */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVerapepServer } from '../server.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let handler;

export default function verapep(req, res) {
  if (!handler) {
    const server = createVerapepServer({ rootDir, dataDir: process.env.DATA_DIR || '/tmp/verapep-data' });
    handler = server.listeners('request')[0];
  }
  return handler(req, res);
}
