'use strict';
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
module.exports = {
  root,
  testApp: path.join(root, 'build', 'test', 'NotchIsland.app'),
  testBinary: path.join(root, 'build', 'test', 'NotchIsland.app', 'Contents', 'MacOS', 'NotchIsland'),
  releaseApp: path.join(root, 'build', 'release', 'NotchIsland.app'),
  releaseBinary: path.join(root, 'build', 'release', 'NotchIsland.app', 'Contents', 'MacOS', 'NotchIsland'),
  harness: path.join(root, 'build', 'island-harness'),
  menuStandInApp: path.join(root, 'build', 'MenuStandIn.app'),
  testBundleID: 'local.notch-island.test',
  testAudio: path.join(root, 'build', 'test-audio'),
};
