// Guards the CVE-fixed versions for this batch of transitive npm packages
// resolved in package-lock.json, plus the Python pins in the backend
// requirements.txt. Reads the lockfile and requirements.txt directly, so it
// exercises existing repository files and does not depend on the installed
// node_modules layout.
const fs = require('fs');
const path = require('path');

const lockPath = path.join(__dirname, '..', 'package-lock.json');
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const packages = lock.packages;

// npm packages resolved in package-lock.json -> fixed version.
const expectedNpmVersions = {
  'node_modules/sucrase/node_modules/minimatch': '10.2.3',
  'node_modules/nanoid': '3.3.12',
  'node_modules/node-forge': '1.4.0',
  'node_modules/svgo/node_modules/nth-check': '2.0.1',
  'node_modules/path-to-regexp': '0.1.13',
  'node_modules/picomatch': '4.0.4',
  'node_modules/resolve-url-loader/node_modules/postcss': '8.5.12',
  'node_modules/rollup': '2.80.0',
  'node_modules/serialize-javascript': '7.0.3',
  'node_modules/shell-quote': '1.9.0',
};

// Python pins expected in ../allerlens-backend/requirements.txt (exact lines).
const expectedPythonPins = [
  'opencv-python-headless==4.8.1.78',
  'requests==2.20.0',
];

test('npm packages are pinned to this batch of CVE-fixed versions', () => {
  for (const [pkgPath, version] of Object.entries(expectedNpmVersions)) {
    expect(packages[pkgPath]).toBeDefined();
    expect(packages[pkgPath].version).toBe(version);
  }
});

test('backend Python packages are pinned to this batch of CVE-fixed versions', () => {
  const requirementsPath = path.join(__dirname, '..', '..', 'allerlens-backend', 'requirements.txt');
  const requirements = fs.readFileSync(requirementsPath, 'utf8');
  const lines = requirements.split('\n').map((line) => line.trim());
  for (const pin of expectedPythonPins) {
    expect(lines).toContain(pin);
  }
});
