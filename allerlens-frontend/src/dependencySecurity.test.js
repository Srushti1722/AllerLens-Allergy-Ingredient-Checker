// Guards the security-pinned dependency versions (CVE fixes).
// The npm pins are read from package-lock.json and the Python pins from the
// backend requirements.txt, so this test exercises existing repository files
// and does not depend on the installed node_modules layout.
const fs = require('fs');
const path = require('path');

const lockPath = path.join(__dirname, '..', 'package-lock.json');
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const packages = lock.packages;

// npm packages resolved in package-lock.json -> fixed version.
const expectedNpmVersions = {
  'node_modules/jsonpath': '1.3.0',
  'node_modules/proxy-addr': '2.0.8',
  'node_modules/websocket-driver': '0.7.5',
  'node_modules/@babel/plugin-transform-modules-systemjs': '7.29.4',
  'node_modules/axios': '1.16.0',
  'node_modules/body-parser': '2.4.0',
  'node_modules/filelist/node_modules/brace-expansion': '1.1.18',
  'node_modules/sucrase/node_modules/brace-expansion': '1.1.18',
  'node_modules/browserslist': '4.28.7',
  'node_modules/compression': '1.8.2',
  'node_modules/fast-uri': '2.4.5',
  'node_modules/flatted': '3.4.2',
  'node_modules/jsdom/node_modules/form-data': '2.5.6',
  'node_modules/sucrase/node_modules/glob': '11.1.0',
  'node_modules/js-yaml': '4.3.1',
};

// Python pins expected in ../allerlens-backend/requirements.txt (exact lines).
const expectedPythonPins = [
  'Flask==2.3.2',
  'flask-cors==3.0.9',
  'gunicorn==22.0.0',
  'paddlepaddle==2.6.0',
  'Pillow==13.0.0',
  'numpy==1.16.3',
];

test('npm packages are pinned to CVE-fixed versions in the lockfile', () => {
  for (const [pkgPath, version] of Object.entries(expectedNpmVersions)) {
    expect(packages[pkgPath]).toBeDefined();
    expect(packages[pkgPath].version).toBe(version);
  }
});

test('backend Python packages are pinned to CVE-fixed versions', () => {
  const requirementsPath = path.join(__dirname, '..', '..', 'allerlens-backend', 'requirements.txt');
  const requirements = fs.readFileSync(requirementsPath, 'utf8');
  const lines = requirements.split('\n').map((line) => line.trim());
  for (const pin of expectedPythonPins) {
    expect(lines).toContain(pin);
  }
});
