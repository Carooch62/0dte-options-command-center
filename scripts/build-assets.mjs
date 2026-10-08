import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';

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
  "signal-checklist.js",
  "refresh-progress.js",
  "trade-review.js",
  "brokerage.html",
  "dashboard-broker.js",
  "dashboard-broker-logic.js",
  "brokerage-history.js",
  "execution-evidence.js",
  "robinhood-review.js",
  "robinhood-panel.js",
  "robinhood-connect.js"
];
for (const file of assets) {
  if (!statSync(join(root, file)).isFile()) throw new Error('Missing browser asset: ' + file);
}
// A missing imported module prevents the whole page from initializing.
for (const file of assets.filter(file => file.endsWith('.js'))) {
  const source = readFileSync(join(root, file), 'utf8');
  for (const match of source.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)) {
    const dependency = normalize(join(dirname(file), match[1].split(/[?#]/)[0]));
    if (!assets.includes(dependency)) throw new Error(`Unpublished browser dependency: ${file} -> ${dependency}`);
  }
}
const output = join(root, 'public');
rmSync(output, { recursive: true, force: true });
mkdirSync(output);
for (const file of assets) copyFileSync(join(root, file), join(output, file));
console.log('Prepared ' + assets.length + ' browser assets in public/');
