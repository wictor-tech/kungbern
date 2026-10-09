/* VERAPEP v20 — "server is running" marker for maintenance scripts.

   The server keeps its documents in memory and writes whole documents back. A script that changes
   the same documents while the server runs (knowledge-base migration, retention, restore) would
   have its change silently overwritten by the server's next save. The server writes
   DATA_DIR/.server.pid while listening; those scripts refuse to write while that process is alive. */
import fs from 'node:fs';
import path from 'node:path';

const lockFile = dataDir => path.join(dataDir, '.server.pid');

export function writeServerLock(dataDir) {
  try { fs.writeFileSync(lockFile(dataDir), String(process.pid)); } catch { /* read-only data dir: nothing to protect */ }
}

export function removeServerLock(dataDir) {
  try { if (fs.readFileSync(lockFile(dataDir), 'utf8').trim() === String(process.pid)) fs.rmSync(lockFile(dataDir), { force: true }); } catch { /* already gone */ }
}

/* Returns the PID of a running VERAPEP server using this data directory, or null. */
export function runningServer(dataDir) {
  try {
    const pid = Number(fs.readFileSync(lockFile(dataDir), 'utf8').trim());
    if (!pid || pid === process.pid) return null;
    process.kill(pid, 0);
    return pid;
  } catch (error) {
    return error.code === 'EPERM' ? -1 : null;
  }
}

export function refuseWhileServerRuns(dataDir, what) {
  const pid = runningServer(dataDir);
  if (!pid) return;
  console.error(`The VERAPEP server (pid ${pid}) is running on ${dataDir}. Stop it before ${what}; otherwise the server would overwrite the change with its own copy.`);
  process.exit(3);
}
