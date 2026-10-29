// Guards the CVE-fixed versions for the remaining transitive npm packages
// resolved in package-lock.json (launch-editor, lodash, and the optional
// canvas peer of jsdom). Reads the lockfile directly, so it exercises
// existing repository files and does not depend on the installed node_modules.
const fs = require('fs');
const path = require('path');

const lockPath = path.join(__dirname, '..', 'package-lock.json');
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const packages = lock.packages;

test('launch-editor is pinned to the CVE-fixed 2.14.2', () => {
  expect(packages['node_modules/launch-editor']).toBeDefined();
  expect(packages['node_modules/launch-editor'].version).toBe('2.14.2');
});

test('lodash is pinned to the CVE-fixed 4.18.0', () => {
  expect(packages['node_modules/lodash']).toBeDefined();
  expect(packages['node_modules/lodash'].version).toBe('4.18.0');
});

test('jsdom declares the CVE-fixed canvas optional peer 1.6.11', () => {
  expect(packages['node_modules/jsdom']).toBeDefined();
  expect(packages['node_modules/jsdom'].peerDependencies.canvas).toBe('1.6.11');
});
