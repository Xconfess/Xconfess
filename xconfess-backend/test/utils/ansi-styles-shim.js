/**
 * CJS-compatible shim for ansi-styles v6+ (which is ESM-only).
 *
 * Jest cannot parse ESM `export` syntax in node_modules.  This shim provides
 * just enough surface so that modules which deep-require `ansi-styles` at
 * runtime (e.g. chalk, log-symbols) resolve without crashing the test runner.
 *
 * Only the colour properties that packages commonly access are forwarded; any
 * missing property simply returns the empty string (ANSI reset passthrough).
 */

function identity(str) {
  return String(str);
}

function passthrough(str) {
  return String(str);
}

const styles = {};

// Basic ANSI escape helpers
const codes = {
  close: [0, 0],
  reset: [0, 0],
  bold: [1, 22],
  dim: [2, 22],
  italic: [3, 23],
  underline: [4, 24],
  inverse: [7, 27],
  hidden: [8, 28],
  strikethrough: [9, 29],
  black: [30, 39],
  red: [31, 39],
  green: [32, 39],
  yellow: [33, 39],
  blue: [34, 39],
  magenta: [35, 39],
  cyan: [36, 39],
  white: [37, 39],
  gray: [90, 39],
  grey: [90, 39],
  bgBlack: [40, 49],
  bgRed: [41, 49],
  bgGreen: [42, 49],
  bgYellow: [43, 49],
  bgBlue: [44, 49],
  bgMagenta: [45, 49],
  bgCyan: [46, 49],
  bgWhite: [47, 49],
};

for (const [name, [open, close]] of Object.entries(codes)) {
  const openCode = `\u001B[${open}m`;
  const closeCode = `\u001B[${close}m`;
  styles[name] = { open: openCode, close: closeCode };
  styles[name].close = closeCode;
  // Make it callable: styles.red('text')
  const fn = (str) => `${openCode}${str}${closeCode}`;
  Object.assign(fn, styles[name]);
  styles[name] = fn;
  styles[name].open = openCode;
  styles[name].close = closeCode;
}

module.exports = styles;
module.exports.default = styles;
module.exports.modifierNames = Object.keys(codes);
module.exports.colorNames = Object.keys(codes).filter(
  (k) => !k.startsWith('bg') && !['bold', 'dim', 'italic', 'underline', 'inverse', 'hidden', 'strikethrough', 'close', 'reset'].includes(k),
);
