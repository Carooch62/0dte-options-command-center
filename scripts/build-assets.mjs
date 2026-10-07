import { copyFileSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
// Explicit allowlist: never publish server code, credentials, or brokerage data.
const assets = [
  "index.html",
  "dashboard.html",
  "dashboard_v2.html",
  "dashboard_glass.html",
  "dashboard_glass_previous.html",
  "dashboard_mobile_preview.html",
  "dashboard-mobile.css",
  "dashboard-app-previous.js",
  "dashboard-app.js",
  "dashboard-logic.js",
  "refresh-progress.js",
  "trade-review.js",
  "brokerage.html",
  "dashboard-broker.js",
  "dashboard-broker-logic.js"
];
for (const file of assets) {
  if (!statSync(join(root, file)).isFile()) throw new Error('Missing browser asset: ' + file);
}
const output = join(root, 'public');
rmSync(output, { recursive: true, force: true });
mkdirSync(output);
for (const file of assets) copyFileSync(join(root, file), join(output, file));
console.log('Prepared ' + assets.length + ' browser assets in public/');
