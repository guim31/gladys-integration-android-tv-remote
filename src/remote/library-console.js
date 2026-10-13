import { format } from 'node:util';
import { logger } from '@gladysassistant/integration-sdk';

// androidtv-remote writes straight to the global console, whatever LOG_LEVEL
// says: every message received from the TV and every message sent to it (as
// JSON), the start and the close of every connection attempt, and the full
// stack of every socket error. A TV changing its volume, or a powered-off TV
// probed all night, filled the container logs with them.
//
// The library offers no logger option, so the console methods it uses are
// wrapped: a call made directly from a file of the library goes to the debug
// level of the integration logger; any other call goes through untouched (the
// SDK logger itself writes with console.log / console.error).

const METHODS = ['debug', 'info', 'log', 'warn', 'error'];
const LIBRARY_FILE = /[\\/]node_modules[\\/]androidtv-remote[\\/]/;

let installed = false;

/**
 * The file that called the wrapped console method.
 *
 * @param {Function} wrapper The wrapper, cut from the captured stack.
 * @returns {string} The first line of the stack below the wrapper.
 */
function callerFrame(wrapper) {
  const holder = {};
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 1;
  Error.captureStackTrace(holder, wrapper);
  Error.stackTraceLimit = limit;
  return String(holder.stack || '')
    .split('\n')
    .slice(1)
    .join('\n');
}

/**
 * One debug line out of the arguments of a library console call. An error
 * object is reduced to its code and message: its stack says nothing useful
 * about a TV that is switched off.
 *
 * @param {Array<unknown>} args The console arguments.
 * @returns {string} The line.
 */
export function formatLibraryLine(args) {
  const parts = args.map((arg) => {
    if (arg instanceof Error) {
      return [arg.code, arg.message].filter(Boolean).join(' ');
    }
    return arg;
  });
  return format(...parts)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Route the console output of androidtv-remote to the debug level.
 *
 * Idempotent: the module importing the library calls it once at load time.
 */
export function installLibraryConsoleFilter() {
  if (installed) {
    return;
  }
  installed = true;
  METHODS.forEach((method) => {
    const original = console[method];
    const wrapper = function libraryConsoleFilter(...args) {
      if (LIBRARY_FILE.test(callerFrame(wrapper))) {
        logger.debug(`[AndroidTV] [androidtv-remote] ${formatLibraryLine(args)}`);
        return;
      }
      original.apply(console, args);
    };
    console[method] = wrapper;
  });
}
