'use strict';
// The MacBook-speakers rows use the real system's output. If something else
// is connected (headphones), that real-system binding cannot run: the run
// fails with the reason, unless injecting the built-in speakers is asked for
// with ISLAND_ALLOW_INJECTED_SPEAKERS=1, and then the injection is reported.

/** What the MacBook-speakers rows do given the Mac's real output. */
function planMacBookSpeakers(out, env) {
  if (out.builtIn) return { inject: false };
  const note = `the Mac's output is "${out.name}"; the MacBook speakers would be injected`;
  if (env.ISLAND_ALLOW_INJECTED_SPEAKERS !== '1') {
    throw new Error(`${note}, so no row uses the real system's output. Disconnect "${out.name}" and run again, ` +
      'or set ISLAND_ALLOW_INJECTED_SPEAKERS=1 to run with the injection (a gate run must not).');
  }
  return { inject: true, note };
}

module.exports = { planMacBookSpeakers };
