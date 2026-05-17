const path = require('node:path');
const { rcedit } = require('rcedit');
const appPackage = require('../package.json');

exports.default = async function afterPack(context) {
  if (context.packager.platform !== 'win32') return;
  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const appIcon = path.resolve(__dirname, '..', '..', 'assets', 'controllers', 'ds5-bridge_app-icon-tile.ico');

  await rcedit(exePath, {
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
};
