'use strict';
// The codesign arguments every local build signs with (scripts/signing.sh):
// one identity kept across builds, so macOS remembers Automation consent
// ("NotchIsland wants to control Music") instead of asking after each build.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

let args;
module.exports = () => (args ||= execFileSync('sh', [path.join(__dirname, '..', '..', 'scripts', 'signing.sh')],
  { encoding: 'utf8' }).trim().split('\n'));
