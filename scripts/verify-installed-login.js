#!/usr/bin/env node
'use strict';
// Read-only: never launch, register, unregister or remove recovery links.
const registry = require('../test/support/registry');
registry.items().then((items) => {
  const records = registry.verifyInstalled(items);
  console.log(JSON.stringify({ verified: true, records }, null, 2));
}, (e) => { throw e; }).catch((e) => { console.error(e.message); process.exitCode = 1; });
