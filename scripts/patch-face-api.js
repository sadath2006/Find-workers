import fs from 'fs';
import path from 'path';

// Clean out stale Vite dependency cache
const viteCacheDir = path.resolve(process.cwd(), 'node_modules/.vite');
if (fs.existsSync(viteCacheDir)) {
  try {
    fs.rmSync(viteCacheDir, { recursive: true, force: true });
    console.log('Cleared stale Vite cache at node_modules/.vite');
  } catch (_) {}
}



