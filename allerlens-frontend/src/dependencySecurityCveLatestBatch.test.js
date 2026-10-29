// Guards the CVE-fixed versions for this latest batch of transitive npm
// packages resolved in package-lock.json. Reads the lockfile directly, so it
// exercises existing repository files and does not depend on the installed
// node_modules layout.
const fs = require('fs');
const path = require('path');

const lockPath = path.join(__dirname, '..', 'package-lock.json');
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const packages = lock.packages;

// npm packages resolved in package-lock.json -> fixed version.
const expectedNpmVersions = {
  'node_modules/source-map-js': '1.2.2',
  'node_modules/svgo': '2.8.4',
  'node_modules/uuid': '11.1.1',
  'node_modules/ws': '5.2.5',
};

test('npm packages are pinned to this latest batch of CVE-fixed versions', () => {
  for (const [pkgPath, version] of Object.entries(expectedNpmVersions)) {
    expect(packages[pkgPath]).toBeDefined();
    expect(packages[pkgPath].version).toBe(version);
  }
});
