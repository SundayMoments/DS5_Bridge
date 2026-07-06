import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { rcedit } from 'rcedit';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const companionDir = path.resolve(scriptDir, '..');
const repoDir = path.resolve(companionDir, '..');
const electronDist = path.join(companionDir, 'node_modules', 'electron', 'dist');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(companionDir, 'artifacts', `DS5 Bridge-win32-x64-${stamp}`);
const appDir = path.join(outDir, 'resources', 'app');
const assetDir = path.join('assets', 'controllers');
const appIcon = path.join(repoDir, assetDir, 'ds5-bridge_app-icon-tile.ico');
const audioHelperDir = path.join(companionDir, 'native', 'AudioHelper', 'bin', 'publish', 'win-x64');
const windowsCleanupScript = path.join(repoDir, 'tools', 'windows', 'clean-ds5bridge-devices.ps1');
const picoUniversalFlashNukeUf2 = path.join(companionDir, 'firmware', 'pico-universal-flash-nuke.uf2');
const picoUniversalFlashNukeSha256 = `${picoUniversalFlashNukeUf2}.sha256`;
const appPackage = JSON.parse(fs.readFileSync(path.join(companionDir, 'package.json'), 'utf8'));
const appAssets = [
  'ds5-bridge_app-icon-tile.ico',
  'ds5-bridge_app-icon-tile.png',
  'ds5-bridge_mark.ico',
  'ds5-bridge_mark.png'
];

const runtimePackages = [
  'node-hid'
];

function gitValue(args, fallback = 'unknown') {
  try {
    return execSync(`git ${args}`, {
      cwd: repoDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim() || fallback;
  } catch {
    return fallback;
  }
}

function sourceNotice() {
  const commit = gitValue('rev-parse HEAD');
  const dirty = gitValue('status --porcelain', '') ? 'yes' : 'no';
  return [
    'DS5 Bridge source code:',
    'https://github.com/SundayMoments/DS5_Bridge',
    '',
    `This binary release corresponds to commit: ${commit}`,
    `Working tree dirty at build time: ${dirty}`,
    '',
    'License:',
    'GNU Affero General Public License v3.0 only',
    'See LICENSE and NOTICE.'
  ].join('\n') + '\n';
}

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
if (!fs.existsSync(path.join(audioHelperDir, 'AudioHelper.exe'))) {
  throw new Error('Audio helper is missing. Run npm run build:audio-helper first.');
}
if (!fs.existsSync(picoUniversalFlashNukeUf2)) {
  throw new Error('Pico flash nuke UF2 is missing. Run npm run build:firmware-tools first.');
}
if (!fs.existsSync(picoUniversalFlashNukeSha256)) {
  throw new Error('Pico flash nuke SHA-256 manifest is missing. Run npm run build:firmware-tools first.');
}

copyRecursive(electronDist, outDir);
copyRecursive(path.join(repoDir, 'NOTICE'), path.join(outDir, 'NOTICE'));
fs.writeFileSync(path.join(outDir, 'SOURCE.txt'), sourceNotice(), 'utf8');

const electronExe = path.join(outDir, 'electron.exe');
const bridgeExe = path.join(outDir, 'DS5 Bridge.exe');
if (fs.existsSync(electronExe)) {
  fs.renameSync(electronExe, bridgeExe);
}
if (fs.existsSync(bridgeExe)) {
  await rcedit(bridgeExe, {
    icon: appIcon,
    'file-version': appPackage.version,
    'product-version': appPackage.version,
    'version-string': {
      FileDescription: 'DS5 Bridge Companion',
      InternalName: 'DS5 Bridge',
      OriginalFilename: 'DS5 Bridge.exe',
      ProductName: 'DS5 Bridge'
    }
  });
}

copyRecursive(path.join(companionDir, 'dist'), path.join(appDir, 'dist'));
copyRecursive(path.join(companionDir, 'package.json'), path.join(appDir, 'package.json'));
for (const asset of appAssets) {
  copyRecursive(path.join(repoDir, assetDir, asset), path.join(appDir, assetDir, asset));
}
copyRecursive(audioHelperDir, path.join(outDir, 'resources', 'native', 'AudioHelper'));
copyRecursive(windowsCleanupScript, path.join(outDir, 'resources', 'tools', 'windows', 'clean-ds5bridge-devices.ps1'));
copyRecursive(picoUniversalFlashNukeUf2, path.join(outDir, 'resources', 'firmware', 'pico-universal-flash-nuke.uf2'));
copyRecursive(picoUniversalFlashNukeSha256, path.join(outDir, 'resources', 'firmware', 'pico-universal-flash-nuke.uf2.sha256'));
for (const packageName of runtimePackages) {
  copyPackage(packageName);
}

console.log(`Packaged companion at ${outDir}`);
