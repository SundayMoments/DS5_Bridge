import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const companionDir = path.resolve(scriptDir, '..');
const repoDir = path.resolve(companionDir, '..');
const electronDist = path.join(companionDir, 'node_modules', 'electron', 'dist');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(companionDir, 'artifacts', `DS5 Bridge-linux-x64-${stamp}`);
const appDir = path.join(outDir, 'resources', 'app');
const assetDir = path.join('assets', 'controllers');
const appIcon = path.join(repoDir, assetDir, 'ds5-bridge_app-icon-tile.ico');
const appPackage = JSON.parse(fs.readFileSync(path.join(companionDir, 'package.json'), 'utf8'));
const appAssets = [
  'ds5-bridge_app-icon-tile.ico',
  'ds5-bridge_app-icon-tile.png',
  'ds5-bridge_mark.png'
];

const runtimePackages = [
  'node-hid'
];

function copyRecursive(src, dest, filter = () => true) {
  if (!filter(src)) {
    return;
  }
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry), filter);
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyPackage(packageName) {
  const packagePath = path.join(companionDir, 'node_modules', packageName);
  const packageJsonPath = path.join(packagePath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`Missing runtime package ${packageName}`);
  }

  const targetPath = path.join(appDir, 'node_modules', packageName);
  copyRecursive(packagePath, targetPath, (source) => {
    const base = path.basename(source);
    return base !== '.cache' && base !== '.bin';
  });

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  for (const dependency of Object.keys(packageJson.dependencies ?? {})) {
    copyPackage(dependency);
  }
}

if (!fs.existsSync(electronDist)) {
  throw new Error('Electron runtime is missing. Run npm install in companion/ first.');
}
if (!fs.existsSync(path.join(companionDir, 'dist'))) {
  throw new Error('Companion dist is missing. Run npm run build first.');
}

copyRecursive(electronDist, outDir);

const electronExe = path.join(outDir, 'electron');
const bridgeExe = path.join(outDir, 'DS5 Bridge');
if (fs.existsSync(electronExe)) {
  fs.renameSync(electronExe, bridgeExe);
}

copyRecursive(path.join(companionDir, 'dist'), path.join(appDir, 'dist'));
copyRecursive(path.join(companionDir, 'package.json'), path.join(appDir, 'package.json'));
for (const asset of appAssets) {
  copyRecursive(path.join(repoDir, assetDir, asset), path.join(appDir, assetDir, asset));
}
for (const packageName of runtimePackages) {
  copyPackage(packageName);
}

console.log(`Packaged companion at ${outDir}`);
