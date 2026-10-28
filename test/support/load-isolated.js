'use strict';
// Screen-free fixture tests: every system-facing dependency is supplied here.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function load(file, stubs = {}, globals = {}) {
  const filename = path.resolve(__dirname, file);
  const module = { exports: {} };
  const localRequire = (name) => Object.hasOwn(stubs, name) ? stubs[name]
    : name.startsWith('node:') ? require(name)
      : (() => { throw new Error(`unstubbed dependency: ${name}`); })();
  localRequire.main = null;
  vm.runInNewContext(`(function(require,module,exports,__filename,__dirname){${fs.readFileSync(filename, 'utf8')}\n})`,
    { process, console, setTimeout, clearTimeout, ...globals }, { filename })(localRequire, module, module.exports, filename, path.dirname(filename));
  return module.exports;
}
module.exports = { load };
