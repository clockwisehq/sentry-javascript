/*! @sentry/browser 7.119.2 (f84275832) | https://github.com/getsentry/sentry-javascript */
(function (__window) {
var exports = {};

// eslint-disable-next-line @typescript-eslint/unbound-method
const objectToString = Object.prototype.toString;
/**
 * Checks whether given value is an instance of the given built-in class.
 *
 * @param wat The value to be checked
 * @param className
 * @returns A boolean representing the result.
 */
function isBuiltin(wat, className) {
  return objectToString.call(wat) === `[object ${className}]`;
}

/**
 * Checks whether given value's type is an object literal, or a class instance.
 * {@link isPlainObject}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
function isPlainObject(wat) {
  return isBuiltin(wat, 'Object');
}

/**
 * Checks whether given value has a then function.
 * @param wat A value to be checked.
 */
function isThenable(wat) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return Boolean(wat && wat.then && typeof wat.then === 'function');
}

/** Internal global with common properties and Sentry extensions  */

// The code below for 'isGlobalObj' and 'GLOBAL_OBJ' was copied from core-js before modification
// https://github.com/zloirock/core-js/blob/1b944df55282cdc99c90db5f49eb0b6eda2cc0a3/packages/core-js/internals/global.js
// core-js has the following licence:
//
// Copyright (c) 2014-2022 Denis Pushkarev
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

/** Returns 'obj' if it's the global object, otherwise returns undefined */
function isGlobalObj(obj) {
  return obj && obj.Math == Math ? obj : undefined;
}

/** Get's the global object for the current JavaScript runtime */
const GLOBAL_OBJ =
  (typeof globalThis == 'object' && isGlobalObj(globalThis)) ||
  // eslint-disable-next-line no-restricted-globals
  (typeof window == 'object' && isGlobalObj(window)) ||
  (typeof self == 'object' && isGlobalObj(self)) ||
  (typeof global == 'object' && isGlobalObj(global)) ||
  (function () {
    return this;
  })() ||
  {};

/**
 * Returns a global singleton contained in the global `__SENTRY__` object.
 *
 * If the singleton doesn't already exist in `__SENTRY__`, it will be created using the given factory
 * function and added to the `__SENTRY__` object.
 *
 * @param name name of the global singleton on __SENTRY__
 * @param creator creator Factory function to create the singleton if it doesn't already exist on `__SENTRY__`
 * @param obj (Optional) The global object on which to look for `__SENTRY__`, if not `GLOBAL_OBJ`'s return value
 * @returns the singleton
 */
function getGlobalSingleton(name, creator, obj) {
  const gbl = (obj || GLOBAL_OBJ) ;
  const __SENTRY__ = (gbl.__SENTRY__ = gbl.__SENTRY__ || {});
  const singleton = __SENTRY__[name] || (__SENTRY__[name] = creator());
  return singleton;
}

/**
 * This serves as a build time flag that will be true by default, but false in non-debug builds or if users replace `true` in their generated code.
 *
 * ATTENTION: This constant must never cross package boundaries (i.e. be exported) to guarantee that it can be used for tree shaking.
 */
const DEBUG_BUILD$2 = (true);

/** Prefix for logging strings */
const PREFIX = 'Sentry Logger ';

const CONSOLE_LEVELS = [
  'debug',
  'info',
  'warn',
  'error',
  'log',
  'assert',
  'trace',
] ;

/** This may be mutated by the console instrumentation. */
const originalConsoleMethods

 = {};

/** JSDoc */

/**
 * Temporarily disable sentry console instrumentations.
 *
 * @param callback The function to run against the original `console` messages
 * @returns The results of the callback
 */
function consoleSandbox(callback) {
  if (!('console' in GLOBAL_OBJ)) {
    return callback();
  }

  const console = GLOBAL_OBJ.console ;
  const wrappedFuncs = {};

  const wrappedLevels = Object.keys(originalConsoleMethods) ;

  // Restore all wrapped console methods
  wrappedLevels.forEach(level => {
    const originalConsoleMethod = originalConsoleMethods[level] ;
    wrappedFuncs[level] = console[level] ;
    console[level] = originalConsoleMethod;
  });

  try {
    return callback();
  } finally {
    // Revert restoration to wrapped state
    wrappedLevels.forEach(level => {
      console[level] = wrappedFuncs[level] ;
    });
  }
}

function makeLogger() {
  let enabled = false;
  const logger = {
    enable: () => {
      enabled = true;
    },
    disable: () => {
      enabled = false;
    },
    isEnabled: () => enabled,
  };

  if (DEBUG_BUILD$2) {
    CONSOLE_LEVELS.forEach(name => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      logger[name] = (...args) => {
        if (enabled) {
          consoleSandbox(() => {
            GLOBAL_OBJ.console[name](`${PREFIX}[${name}]:`, ...args);
          });
        }
      };
    });
  } else {
    CONSOLE_LEVELS.forEach(name => {
      logger[name] = () => undefined;
    });
  }

  return logger ;
}

const logger = makeLogger();

/**
 * Given any object, return a new object having removed all fields whose value was `undefined`.
 * Works recursively on objects and arrays.
 *
 * Attention: This function keeps circular references in the returned object.
 */
function dropUndefinedKeys(inputValue) {
  // This map keeps track of what already visited nodes map to.
  // Our Set - based memoBuilder doesn't work here because we want to the output object to have the same circular
  // references as the input object.
  const memoizationMap = new Map();

  // This function just proxies `_dropUndefinedKeys` to keep the `memoBuilder` out of this function's API
  return _dropUndefinedKeys(inputValue, memoizationMap);
}

function _dropUndefinedKeys(inputValue, memoizationMap) {
  if (isPojo(inputValue)) {
    // If this node has already been visited due to a circular reference, return the object it was mapped to in the new object
    const memoVal = memoizationMap.get(inputValue);
    if (memoVal !== undefined) {
      return memoVal ;
    }

    const returnValue = {};
    // Store the mapping of this value in case we visit it again, in case of circular data
    memoizationMap.set(inputValue, returnValue);

    for (const key of Object.keys(inputValue)) {
      if (typeof inputValue[key] !== 'undefined') {
        returnValue[key] = _dropUndefinedKeys(inputValue[key], memoizationMap);
      }
    }

    return returnValue ;
  }

  if (Array.isArray(inputValue)) {
    // If this node has already been visited due to a circular reference, return the array it was mapped to in the new object
    const memoVal = memoizationMap.get(inputValue);
    if (memoVal !== undefined) {
      return memoVal ;
    }

    const returnValue = [];
    // Store the mapping of this value in case we visit it again, in case of circular data
    memoizationMap.set(inputValue, returnValue);

    inputValue.forEach((item) => {
      returnValue.push(_dropUndefinedKeys(item, memoizationMap));
    });

    return returnValue ;
  }

  return inputValue;
}

function isPojo(input) {
  if (!isPlainObject(input)) {
    return false;
  }

  try {
    const name = (Object.getPrototypeOf(input) ).constructor.name;
    return !name || name === 'Object';
  } catch (e) {
    return true;
  }
}

/**
 * UUID4 generator
 *
 * @returns string Generated UUID4.
 */
function uuid4() {
  const gbl = GLOBAL_OBJ ;
  const crypto = gbl.crypto || gbl.msCrypto;

  let getRandomByte = () => Math.random() * 16;
  try {
    if (crypto && crypto.randomUUID) {
      return crypto.randomUUID().replace(/-/g, '');
    }
    if (crypto && crypto.getRandomValues) {
      getRandomByte = () => {
        // crypto.getRandomValues might return undefined instead of the typed array
        // in old Chromium versions (e.g. 23.0.1235.0 (151422))
        // However, `typedArray` is still filled in-place.
        // @see https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues#typedarray
        const typedArray = new Uint8Array(1);
        crypto.getRandomValues(typedArray);
        return typedArray[0];
      };
    }
  } catch (_) {
    // some runtimes can crash invoking crypto
    // https://github.com/getsentry/sentry-javascript/issues/8935
  }

  // http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript/2117523#2117523
  // Concatenating the following numbers as strings results in '10000000100040008000100000000000'
  return (([1e7] ) + 1e3 + 4e3 + 8e3 + 1e11).replace(/[018]/g, c =>
    // eslint-disable-next-line no-bitwise
    ((c ) ^ ((getRandomByte() & 15) >> ((c ) / 4))).toString(16),
  );
}

/**
 * Checks whether the given input is already an array, and if it isn't, wraps it in one.
 *
 * @param maybeArray Input to turn into an array, if necessary
 * @returns The input, if already an array, or an array with the input as the only element, if not
 */
function arrayify(maybeArray) {
  return Array.isArray(maybeArray) ? maybeArray : [maybeArray];
}

/* eslint-disable @typescript-eslint/explicit-function-return-type */

/** SyncPromise internal states */
var States; (function (States) {
  /** Pending */
  const PENDING = 0; States[States["PENDING"] = PENDING] = "PENDING";
  /** Resolved / OK */
  const RESOLVED = 1; States[States["RESOLVED"] = RESOLVED] = "RESOLVED";
  /** Rejected / Error */
  const REJECTED = 2; States[States["REJECTED"] = REJECTED] = "REJECTED";
})(States || (States = {}));

/**
 * Thenable class that behaves like a Promise and follows it's interface
 * but is not async internally
 */
class SyncPromise {

   constructor(
    executor,
  ) {SyncPromise.prototype.__init.call(this);SyncPromise.prototype.__init2.call(this);SyncPromise.prototype.__init3.call(this);SyncPromise.prototype.__init4.call(this);
    this._state = States.PENDING;
    this._handlers = [];

    try {
      executor(this._resolve, this._reject);
    } catch (e) {
      this._reject(e);
    }
  }

  /** JSDoc */
   then(
    onfulfilled,
    onrejected,
  ) {
    return new SyncPromise((resolve, reject) => {
      this._handlers.push([
        false,
        result => {
          if (!onfulfilled) {
            // TODO: ¯\_(ツ)_/¯
            // TODO: FIXME
            resolve(result );
          } else {
            try {
              resolve(onfulfilled(result));
            } catch (e) {
              reject(e);
            }
          }
        },
        reason => {
          if (!onrejected) {
            reject(reason);
          } else {
            try {
              resolve(onrejected(reason));
            } catch (e) {
              reject(e);
            }
          }
        },
      ]);
      this._executeHandlers();
    });
  }

  /** JSDoc */
   catch(
    onrejected,
  ) {
    return this.then(val => val, onrejected);
  }

  /** JSDoc */
   finally(onfinally) {
    return new SyncPromise((resolve, reject) => {
      let val;
      let isRejected;

      return this.then(
        value => {
          isRejected = false;
          val = value;
          if (onfinally) {
            onfinally();
          }
        },
        reason => {
          isRejected = true;
          val = reason;
          if (onfinally) {
            onfinally();
          }
        },
      ).then(() => {
        if (isRejected) {
          reject(val);
          return;
        }

        resolve(val );
      });
    });
  }

  /** JSDoc */
    __init() {this._resolve = (value) => {
    this._setResult(States.RESOLVED, value);
  };}

  /** JSDoc */
    __init2() {this._reject = (reason) => {
    this._setResult(States.REJECTED, reason);
  };}

  /** JSDoc */
    __init3() {this._setResult = (state, value) => {
    if (this._state !== States.PENDING) {
      return;
    }

    if (isThenable(value)) {
      void (value ).then(this._resolve, this._reject);
      return;
    }

    this._state = state;
    this._value = value;

    this._executeHandlers();
  };}

  /** JSDoc */
    __init4() {this._executeHandlers = () => {
    if (this._state === States.PENDING) {
      return;
    }

    const cachedHandlers = this._handlers.slice();
    this._handlers = [];

    cachedHandlers.forEach(handler => {
      if (handler[0]) {
        return;
      }

      if (this._state === States.RESOLVED) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        handler[1](this._value );
      }

      if (this._state === States.REJECTED) {
        handler[2](this._value);
      }

      handler[0] = true;
    });
  };}
}

const ONE_SECOND_IN_MS = 1000;

/**
 * A partial definition of the [Performance Web API]{@link https://developer.mozilla.org/en-US/docs/Web/API/Performance}
 * for accessing a high-resolution monotonic clock.
 */

/**
 * Returns a timestamp in seconds since the UNIX epoch using the Date API.
 *
 * TODO(v8): Return type should be rounded.
 */
function dateTimestampInSeconds() {
  return Date.now() / ONE_SECOND_IN_MS;
}

/**
 * Returns a wrapper around the native Performance API browser implementation, or undefined for browsers that do not
 * support the API.
 *
 * Wrapping the native API works around differences in behavior from different browsers.
 */
function createUnixTimestampInSecondsFunc() {
  const { performance } = GLOBAL_OBJ ;
  if (!performance || !performance.now) {
    return dateTimestampInSeconds;
  }

  // Some browser and environments don't have a timeOrigin, so we fallback to
  // using Date.now() to compute the starting time.
  const approxStartingTimeOrigin = Date.now() - performance.now();
  const timeOrigin = performance.timeOrigin == undefined ? approxStartingTimeOrigin : performance.timeOrigin;

  // performance.now() is a monotonic clock, which means it starts at 0 when the process begins. To get the current
  // wall clock time (actual UNIX timestamp), we need to add the starting time origin and the current time elapsed.
  //
  // TODO: This does not account for the case where the monotonic clock that powers performance.now() drifts from the
  // wall clock time, which causes the returned timestamp to be inaccurate. We should investigate how to detect and
  // correct for this.
  // See: https://github.com/getsentry/sentry-javascript/issues/2590
  // See: https://github.com/mdn/content/issues/4713
  // See: https://dev.to/noamr/when-a-millisecond-is-not-a-millisecond-3h6
  return () => {
    return (timeOrigin + performance.now()) / ONE_SECOND_IN_MS;
  };
}

/**
 * Returns a timestamp in seconds since the UNIX epoch using either the Performance or Date APIs, depending on the
 * availability of the Performance API.
 *
 * BUG: Note that because of how browsers implement the Performance API, the clock might stop when the computer is
 * asleep. This creates a skew between `dateTimestampInSeconds` and `timestampInSeconds`. The
 * skew can grow to arbitrary amounts like days, weeks or months.
 * See https://github.com/getsentry/sentry-javascript/issues/2590.
 */
const timestampInSeconds = createUnixTimestampInSecondsFunc();

/**
 * The number of milliseconds since the UNIX epoch. This value is only usable in a browser, and only when the
 * performance API is available.
 */
const browserPerformanceTimeOrigin = (() => {
  // Unfortunately browsers may report an inaccurate time origin data, through either performance.timeOrigin or
  // performance.timing.navigationStart, which results in poor results in performance data. We only treat time origin
  // data as reliable if they are within a reasonable threshold of the current time.

  const { performance } = GLOBAL_OBJ ;
  if (!performance || !performance.now) {
    return undefined;
  }

  const threshold = 3600 * 1000;
  const performanceNow = performance.now();
  const dateNow = Date.now();

  // if timeOrigin isn't available set delta to threshold so it isn't used
  const timeOriginDelta = performance.timeOrigin
    ? Math.abs(performance.timeOrigin + performanceNow - dateNow)
    : threshold;
  const timeOriginIsReliable = timeOriginDelta < threshold;

  // While performance.timing.navigationStart is deprecated in favor of performance.timeOrigin, performance.timeOrigin
  // is not as widely supported. Namely, performance.timeOrigin is undefined in Safari as of writing.
  // Also as of writing, performance.timing is not available in Web Workers in mainstream browsers, so it is not always
  // a valid fallback. In the absence of an initial time provided by the browser, fallback to the current time from the
  // Date API.
  // eslint-disable-next-line deprecation/deprecation
  const navigationStart = performance.timing && performance.timing.navigationStart;
  const hasNavigationStart = typeof navigationStart === 'number';
  // if navigationStart isn't available set delta to threshold so it isn't used
  const navigationStartDelta = hasNavigationStart ? Math.abs(navigationStart + performanceNow - dateNow) : threshold;
  const navigationStartIsReliable = navigationStartDelta < threshold;

  if (timeOriginIsReliable || navigationStartIsReliable) {
    // Use the more reliable time origin
    if (timeOriginDelta <= navigationStartDelta) {
      return performance.timeOrigin;
    } else {
      return navigationStart;
    }
  }
  return dateNow;
})();

/**
 * Convenience function to loop through the items and item types of an envelope.
 * (This function was mostly created because working with envelope types is painful at the moment)
 *
 * If the callback returns true, the rest of the items will be skipped.
 */
function forEachEnvelopeItem(
  envelope,
  callback,
) {
  const envelopeItems = envelope[1];

  for (const envelopeItem of envelopeItems) {
    const envelopeItemType = envelopeItem[0].type;
    const result = callback(envelopeItem, envelopeItemType);

    if (result) {
      return true;
    }
  }

  return false;
}

/**
 * This serves as a build time flag that will be true by default, but false in non-debug builds or if users replace `true` in their generated code.
 *
 * ATTENTION: This constant must never cross package boundaries (i.e. be exported) to guarantee that it can be used for tree shaking.
 */
const DEBUG_BUILD$1 = (true);

const DEFAULT_ENVIRONMENT = 'production';

/**
 * Returns the global event processors.
 * @deprecated Global event processors will be removed in v8.
 */
function getGlobalEventProcessors() {
  return getGlobalSingleton('globalEventProcessors', () => []);
}

/**
 * Process an array of event processors, returning the processed event (or `null` if the event was dropped).
 */
function notifyEventProcessors(
  processors,
  event,
  hint,
  index = 0,
) {
  return new SyncPromise((resolve, reject) => {
    const processor = processors[index];
    if (event === null || typeof processor !== 'function') {
      resolve(event);
    } else {
      const result = processor({ ...event }, hint) ;

      processor.id && result === null && logger.log(`Event processor "${processor.id}" dropped event`);

      if (isThenable(result)) {
        void result
          .then(final => notifyEventProcessors(processors, final, hint, index + 1).then(resolve))
          .then(null, reject);
      } else {
        void notifyEventProcessors(processors, result, hint, index + 1)
          .then(resolve)
          .then(null, reject);
      }
    }
  });
}

/**
 * Creates a new `Session` object by setting certain default parameters. If optional @param context
 * is passed, the passed properties are applied to the session object.
 *
 * @param context (optional) additional properties to be applied to the returned session object
 *
 * @returns a new `Session` object
 */
function makeSession(context) {
  // Both timestamp and started are in seconds since the UNIX epoch.
  const startingTime = timestampInSeconds();

  const session = {
    sid: uuid4(),
    init: true,
    timestamp: startingTime,
    started: startingTime,
    duration: 0,
    status: 'ok',
    errors: 0,
    ignoreDuration: false,
    toJSON: () => sessionToJSON(session),
  };

  if (context) {
    updateSession(session, context);
  }

  return session;
}

/**
 * Updates a session object with the properties passed in the context.
 *
 * Note that this function mutates the passed object and returns void.
 * (Had to do this instead of returning a new and updated session because closing and sending a session
 * makes an update to the session after it was passed to the sending logic.
 * @see BaseClient.captureSession )
 *
 * @param session the `Session` to update
 * @param context the `SessionContext` holding the properties that should be updated in @param session
 */
// eslint-disable-next-line complexity
function updateSession(session, context = {}) {
  if (context.user) {
    if (!session.ipAddress && context.user.ip_address) {
      session.ipAddress = context.user.ip_address;
    }

    if (!session.did && !context.did) {
      session.did = context.user.id || context.user.email || context.user.username;
    }
  }

  session.timestamp = context.timestamp || timestampInSeconds();

  if (context.abnormal_mechanism) {
    session.abnormal_mechanism = context.abnormal_mechanism;
  }

  if (context.ignoreDuration) {
    session.ignoreDuration = context.ignoreDuration;
  }
  if (context.sid) {
    // Good enough uuid validation. — Kamil
    session.sid = context.sid.length === 32 ? context.sid : uuid4();
  }
  if (context.init !== undefined) {
    session.init = context.init;
  }
  if (!session.did && context.did) {
    session.did = `${context.did}`;
  }
  if (typeof context.started === 'number') {
    session.started = context.started;
  }
  if (session.ignoreDuration) {
    session.duration = undefined;
  } else if (typeof context.duration === 'number') {
    session.duration = context.duration;
  } else {
    const duration = session.timestamp - session.started;
    session.duration = duration >= 0 ? duration : 0;
  }
  if (context.release) {
    session.release = context.release;
  }
  if (context.environment) {
    session.environment = context.environment;
  }
  if (!session.ipAddress && context.ipAddress) {
    session.ipAddress = context.ipAddress;
  }
  if (!session.userAgent && context.userAgent) {
    session.userAgent = context.userAgent;
  }
  if (typeof context.errors === 'number') {
    session.errors = context.errors;
  }
  if (context.status) {
    session.status = context.status;
  }
}

/**
 * Closes a session by setting its status and updating the session object with it.
 * Internally calls `updateSession` to update the passed session object.
 *
 * Note that this function mutates the passed session (@see updateSession for explanation).
 *
 * @param session the `Session` object to be closed
 * @param status the `SessionStatus` with which the session was closed. If you don't pass a status,
 *               this function will keep the previously set status, unless it was `'ok'` in which case
 *               it is changed to `'exited'`.
 */
function closeSession(session, status) {
  let context = {};
  if (status) {
    context = { status };
  } else if (session.status === 'ok') {
    context = { status: 'exited' };
  }

  updateSession(session, context);
}

/**
 * Serializes a passed session object to a JSON object with a slightly different structure.
 * This is necessary because the Sentry backend requires a slightly different schema of a session
 * than the one the JS SDKs use internally.
 *
 * @param session the session to be converted
 *
 * @returns a JSON object of the passed session
 */
function sessionToJSON(session) {
  return dropUndefinedKeys({
    sid: `${session.sid}`,
    init: session.init,
    // Make sure that sec is converted to ms for date constructor
    started: new Date(session.started * 1000).toISOString(),
    timestamp: new Date(session.timestamp * 1000).toISOString(),
    status: session.status,
    errors: session.errors,
    did: typeof session.did === 'number' || typeof session.did === 'string' ? `${session.did}` : undefined,
    duration: session.duration,
    abnormal_mechanism: session.abnormal_mechanism,
    attrs: {
      release: session.release,
      environment: session.environment,
      ip_address: session.ipAddress,
      user_agent: session.userAgent,
    },
  });
}

const TRACE_FLAG_SAMPLED = 0x1;

/**
 * Convert a span to a trace context, which can be sent as the `trace` context in an event.
 */
function spanToTraceContext(span) {
  const { spanId: span_id, traceId: trace_id } = span.spanContext();
  const { data, op, parent_span_id, status, tags, origin } = spanToJSON(span);

  return dropUndefinedKeys({
    data,
    op,
    parent_span_id,
    span_id,
    status,
    tags,
    trace_id,
    origin,
  });
}

/**
 * Convert a span to a JSON representation.
 * Note that all fields returned here are optional and need to be guarded against.
 *
 * Note: Because of this, we currently have a circular type dependency (which we opted out of in package.json).
 * This is not avoidable as we need `spanToJSON` in `spanUtils.ts`, which in turn is needed by `span.ts` for backwards compatibility.
 * And `spanToJSON` needs the Span class from `span.ts` to check here.
 * TODO v8: When we remove the deprecated stuff from `span.ts`, we can remove the circular dependency again.
 */
function spanToJSON(span) {
  if (spanIsSpanClass(span)) {
    return span.getSpanJSON();
  }

  // Fallback: We also check for `.toJSON()` here...
  // eslint-disable-next-line deprecation/deprecation
  if (typeof span.toJSON === 'function') {
    // eslint-disable-next-line deprecation/deprecation
    return span.toJSON();
  }

  return {};
}

/**
 * Sadly, due to circular dependency checks we cannot actually import the Span class here and check for instanceof.
 * :( So instead we approximate this by checking if it has the `getSpanJSON` method.
 */
function spanIsSpanClass(span) {
  return typeof (span ).getSpanJSON === 'function';
}

/**
 * Returns true if a span is sampled.
 * In most cases, you should just use `span.isRecording()` instead.
 * However, this has a slightly different semantic, as it also returns false if the span is finished.
 * So in the case where this distinction is important, use this method.
 */
function spanIsSampled(span) {
  // We align our trace flags with the ones OpenTelemetry use
  // So we also check for sampled the same way they do.
  const { traceFlags } = span.spanContext();
  // eslint-disable-next-line no-bitwise
  return Boolean(traceFlags & TRACE_FLAG_SAMPLED);
}

/**
 * Get the currently active client.
 */
function getClient() {
  // eslint-disable-next-line deprecation/deprecation
  return getCurrentHub().getClient();
}

/**
 * Get the currently active scope.
 */
function getCurrentScope() {
  // eslint-disable-next-line deprecation/deprecation
  return getCurrentHub().getScope();
}

/**
 * Returns the root span of a given span.
 *
 * As long as we use `Transaction`s internally, the returned root span
 * will be a `Transaction` but be aware that this might change in the future.
 *
 * If the given span has no root span or transaction, `undefined` is returned.
 */
function getRootSpan(span) {
  // TODO (v8): Remove this check and just return span
  // eslint-disable-next-line deprecation/deprecation
  return span.transaction;
}

/**
 * Creates a dynamic sampling context from a client.
 *
 * Dispatches the `createDsc` lifecycle hook as a side effect.
 */
function getDynamicSamplingContextFromClient(
  trace_id,
  client,
  scope,
) {
  const options = client.getOptions();

  const { publicKey: public_key } = client.getDsn() || {};
  // TODO(v8): Remove segment from User
  // eslint-disable-next-line deprecation/deprecation
  const { segment: user_segment } = (scope && scope.getUser()) || {};

  const dsc = dropUndefinedKeys({
    environment: options.environment || DEFAULT_ENVIRONMENT,
    release: options.release,
    user_segment,
    public_key,
    trace_id,
  }) ;

  client.emit && client.emit('createDsc', dsc);

  return dsc;
}

/**
 * A Span with a frozen dynamic sampling context.
 */

/**
 * Creates a dynamic sampling context from a span (and client and scope)
 *
 * @param span the span from which a few values like the root span name and sample rate are extracted.
 *
 * @returns a dynamic sampling context
 */
function getDynamicSamplingContextFromSpan(span) {
  const client = getClient();
  if (!client) {
    return {};
  }

  // passing emit=false here to only emit later once the DSC is actually populated
  const dsc = getDynamicSamplingContextFromClient(spanToJSON(span).trace_id || '', client, getCurrentScope());

  // TODO (v8): Remove v7FrozenDsc as a Transaction will no longer have _frozenDynamicSamplingContext
  const txn = getRootSpan(span) ;
  if (!txn) {
    return dsc;
  }

  // TODO (v8): Remove v7FrozenDsc as a Transaction will no longer have _frozenDynamicSamplingContext
  // For now we need to avoid breaking users who directly created a txn with a DSC, where this field is still set.
  // @see Transaction class constructor
  const v7FrozenDsc = txn && txn._frozenDynamicSamplingContext;
  if (v7FrozenDsc) {
    return v7FrozenDsc;
  }

  // TODO (v8): Replace txn.metadata with txn.attributes[]
  // We can't do this yet because attributes aren't always set yet.
  // eslint-disable-next-line deprecation/deprecation
  const { sampleRate: maybeSampleRate, source } = txn.metadata;
  if (maybeSampleRate != null) {
    dsc.sample_rate = `${maybeSampleRate}`;
  }

  // We don't want to have a transaction name in the DSC if the source is "url" because URLs might contain PII
  const jsonSpan = spanToJSON(txn);

  // after JSON conversion, txn.name becomes jsonSpan.description
  if (source && source !== 'url') {
    dsc.transaction = jsonSpan.description;
  }

  dsc.sampled = String(spanIsSampled(txn));

  client.emit && client.emit('createDsc', dsc);

  return dsc;
}

/**
 * Applies data from the scope to the event and runs all event processors on it.
 */
function applyScopeDataToEvent(event, data) {
  const { fingerprint, span, breadcrumbs, sdkProcessingMetadata } = data;

  // Apply general data
  applyDataToEvent(event, data);

  // We want to set the trace context for normal events only if there isn't already
  // a trace context on the event. There is a product feature in place where we link
  // errors with transaction and it relies on that.
  if (span) {
    applySpanToEvent(event, span);
  }

  applyFingerprintToEvent(event, fingerprint);
  applyBreadcrumbsToEvent(event, breadcrumbs);
  applySdkMetadataToEvent(event, sdkProcessingMetadata);
}

function applyDataToEvent(event, data) {
  const {
    extra,
    tags,
    user,
    contexts,
    level,
    // eslint-disable-next-line deprecation/deprecation
    transactionName,
  } = data;

  const cleanedExtra = dropUndefinedKeys(extra);
  if (cleanedExtra && Object.keys(cleanedExtra).length) {
    event.extra = { ...cleanedExtra, ...event.extra };
  }

  const cleanedTags = dropUndefinedKeys(tags);
  if (cleanedTags && Object.keys(cleanedTags).length) {
    event.tags = { ...cleanedTags, ...event.tags };
  }

  const cleanedUser = dropUndefinedKeys(user);
  if (cleanedUser && Object.keys(cleanedUser).length) {
    event.user = { ...cleanedUser, ...event.user };
  }

  const cleanedContexts = dropUndefinedKeys(contexts);
  if (cleanedContexts && Object.keys(cleanedContexts).length) {
    event.contexts = { ...cleanedContexts, ...event.contexts };
  }

  if (level) {
    event.level = level;
  }

  if (transactionName) {
    event.transaction = transactionName;
  }
}

function applyBreadcrumbsToEvent(event, breadcrumbs) {
  const mergedBreadcrumbs = [...(event.breadcrumbs || []), ...breadcrumbs];
  event.breadcrumbs = mergedBreadcrumbs.length ? mergedBreadcrumbs : undefined;
}

function applySdkMetadataToEvent(event, sdkProcessingMetadata) {
  event.sdkProcessingMetadata = {
    ...event.sdkProcessingMetadata,
    ...sdkProcessingMetadata,
  };
}

function applySpanToEvent(event, span) {
  event.contexts = { trace: spanToTraceContext(span), ...event.contexts };
  const rootSpan = getRootSpan(span);
  if (rootSpan) {
    event.sdkProcessingMetadata = {
      dynamicSamplingContext: getDynamicSamplingContextFromSpan(span),
      ...event.sdkProcessingMetadata,
    };
    const transactionName = spanToJSON(rootSpan).description;
    if (transactionName) {
      event.tags = { transaction: transactionName, ...event.tags };
    }
  }
}

/**
 * Applies fingerprint from the scope to the event if there's one,
 * uses message if there's one instead or get rid of empty fingerprint
 */
function applyFingerprintToEvent(event, fingerprint) {
  // Make sure it's an array first and we actually have something in place
  event.fingerprint = event.fingerprint ? arrayify(event.fingerprint) : [];

  // If we have something on the scope, then merge it with event
  if (fingerprint) {
    event.fingerprint = event.fingerprint.concat(fingerprint);
  }

  // If we have no data at all, remove empty array default
  if (event.fingerprint && !event.fingerprint.length) {
    delete event.fingerprint;
  }
}

/**
 * Default value for maximum number of breadcrumbs added to an event.
 */
const DEFAULT_MAX_BREADCRUMBS = 100;

/**
 * Holds additional event information. {@link Scope.applyToEvent} will be
 * called by the client before an event will be sent.
 */
class Scope  {
  /** Flag if notifying is happening. */

  /** Callback for client to receive scope changes. */

  /** Callback list that will be called after {@link applyToEvent}. */

  /** Array of breadcrumbs. */

  /** User */

  /** Tags */

  /** Extra */

  /** Contexts */

  /** Attachments */

  /** Propagation Context for distributed tracing */

  /**
   * A place to stash data which is needed at some point in the SDK's event processing pipeline but which shouldn't get
   * sent to Sentry
   */

  /** Fingerprint */

  /** Severity */
  // eslint-disable-next-line deprecation/deprecation

  /**
   * Transaction Name
   */

  /** Span */

  /** Session */

  /** Request Mode Session Status */

  /** The client on this scope */

  // NOTE: Any field which gets added here should get added not only to the constructor but also to the `clone` method.

   constructor() {
    this._notifyingListeners = false;
    this._scopeListeners = [];
    this._eventProcessors = [];
    this._breadcrumbs = [];
    this._attachments = [];
    this._user = {};
    this._tags = {};
    this._extra = {};
    this._contexts = {};
    this._sdkProcessingMetadata = {};
    this._propagationContext = generatePropagationContext();
  }

  /**
   * Inherit values from the parent scope.
   * @deprecated Use `scope.clone()` and `new Scope()` instead.
   */
   static clone(scope) {
    return scope ? scope.clone() : new Scope();
  }

  /**
   * Clone this scope instance.
   */
   clone() {
    const newScope = new Scope();
    newScope._breadcrumbs = [...this._breadcrumbs];
    newScope._tags = { ...this._tags };
    newScope._extra = { ...this._extra };
    newScope._contexts = { ...this._contexts };
    newScope._user = this._user;
    newScope._level = this._level;
    newScope._span = this._span;
    newScope._session = this._session;
    newScope._transactionName = this._transactionName;
    newScope._fingerprint = this._fingerprint;
    newScope._eventProcessors = [...this._eventProcessors];
    newScope._requestSession = this._requestSession;
    newScope._attachments = [...this._attachments];
    newScope._sdkProcessingMetadata = { ...this._sdkProcessingMetadata };
    newScope._propagationContext = { ...this._propagationContext };
    newScope._client = this._client;

    return newScope;
  }

  /** Update the client on the scope. */
   setClient(client) {
    this._client = client;
  }

  /**
   * Get the client assigned to this scope.
   *
   * It is generally recommended to use the global function `Sentry.getClient()` instead, unless you know what you are doing.
   */
   getClient() {
    return this._client;
  }

  /**
   * Add internal on change listener. Used for sub SDKs that need to store the scope.
   * @hidden
   */
   addScopeListener(callback) {
    this._scopeListeners.push(callback);
  }

  /**
   * @inheritDoc
   */
   addEventProcessor(callback) {
    this._eventProcessors.push(callback);
    return this;
  }

  /**
   * @inheritDoc
   */
   setUser(user) {
    // If null is passed we want to unset everything, but still define keys,
    // so that later down in the pipeline any existing values are cleared.
    this._user = user || {
      email: undefined,
      id: undefined,
      ip_address: undefined,
      segment: undefined,
      username: undefined,
    };

    if (this._session) {
      updateSession(this._session, { user });
    }

    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
   getUser() {
    return this._user;
  }

  /**
   * @inheritDoc
   */
   getRequestSession() {
    return this._requestSession;
  }

  /**
   * @inheritDoc
   */
   setRequestSession(requestSession) {
    this._requestSession = requestSession;
    return this;
  }

  /**
   * @inheritDoc
   */
   setTags(tags) {
    this._tags = {
      ...this._tags,
      ...tags,
    };
    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
   setTag(key, value) {
    this._tags = { ...this._tags, [key]: value };
    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
   setExtras(extras) {
    this._extra = {
      ...this._extra,
      ...extras,
    };
    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
   setExtra(key, extra) {
    this._extra = { ...this._extra, [key]: extra };
    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
   setFingerprint(fingerprint) {
    this._fingerprint = fingerprint;
    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
   setLevel(
    // eslint-disable-next-line deprecation/deprecation
    level,
  ) {
    this._level = level;
    this._notifyScopeListeners();
    return this;
  }

  /**
   * Sets the transaction name on the scope for future events.
   */
   setTransactionName(name) {
    this._transactionName = name;
    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
   setContext(key, context) {
    if (context === null) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this._contexts[key];
    } else {
      this._contexts[key] = context;
    }

    this._notifyScopeListeners();
    return this;
  }

  /**
   * Sets the Span on the scope.
   * @param span Span
   * @deprecated Instead of setting a span on a scope, use `startSpan()`/`startSpanManual()` instead.
   */
   setSpan(span) {
    this._span = span;
    this._notifyScopeListeners();
    return this;
  }

  /**
   * Returns the `Span` if there is one.
   * @deprecated Use `getActiveSpan()` instead.
   */
   getSpan() {
    return this._span;
  }

  /**
   * Returns the `Transaction` attached to the scope (if there is one).
   * @deprecated You should not rely on the transaction, but just use `startSpan()` APIs instead.
   */
   getTransaction() {
    // Often, this span (if it exists at all) will be a transaction, but it's not guaranteed to be. Regardless, it will
    // have a pointer to the currently-active transaction.
    const span = this._span;
    // Cannot replace with getRootSpan because getRootSpan returns a span, not a transaction
    // Also, this method will be removed anyway.
    // eslint-disable-next-line deprecation/deprecation
    return span && span.transaction;
  }

  /**
   * @inheritDoc
   */
   setSession(session) {
    if (!session) {
      delete this._session;
    } else {
      this._session = session;
    }
    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
   getSession() {
    return this._session;
  }

  /**
   * @inheritDoc
   */
   update(captureContext) {
    if (!captureContext) {
      return this;
    }

    const scopeToMerge = typeof captureContext === 'function' ? captureContext(this) : captureContext;

    if (scopeToMerge instanceof Scope) {
      const scopeData = scopeToMerge.getScopeData();

      this._tags = { ...this._tags, ...scopeData.tags };
      this._extra = { ...this._extra, ...scopeData.extra };
      this._contexts = { ...this._contexts, ...scopeData.contexts };
      if (scopeData.user && Object.keys(scopeData.user).length) {
        this._user = scopeData.user;
      }
      if (scopeData.level) {
        this._level = scopeData.level;
      }
      if (scopeData.fingerprint.length) {
        this._fingerprint = scopeData.fingerprint;
      }
      if (scopeToMerge.getRequestSession()) {
        this._requestSession = scopeToMerge.getRequestSession();
      }
      if (scopeData.propagationContext) {
        this._propagationContext = scopeData.propagationContext;
      }
    } else if (isPlainObject(scopeToMerge)) {
      const scopeContext = captureContext ;
      this._tags = { ...this._tags, ...scopeContext.tags };
      this._extra = { ...this._extra, ...scopeContext.extra };
      this._contexts = { ...this._contexts, ...scopeContext.contexts };
      if (scopeContext.user) {
        this._user = scopeContext.user;
      }
      if (scopeContext.level) {
        this._level = scopeContext.level;
      }
      if (scopeContext.fingerprint) {
        this._fingerprint = scopeContext.fingerprint;
      }
      if (scopeContext.requestSession) {
        this._requestSession = scopeContext.requestSession;
      }
      if (scopeContext.propagationContext) {
        this._propagationContext = scopeContext.propagationContext;
      }
    }

    return this;
  }

  /**
   * @inheritDoc
   */
   clear() {
    this._breadcrumbs = [];
    this._tags = {};
    this._extra = {};
    this._user = {};
    this._contexts = {};
    this._level = undefined;
    this._transactionName = undefined;
    this._fingerprint = undefined;
    this._requestSession = undefined;
    this._span = undefined;
    this._session = undefined;
    this._notifyScopeListeners();
    this._attachments = [];
    this._propagationContext = generatePropagationContext();
    return this;
  }

  /**
   * @inheritDoc
   */
   addBreadcrumb(breadcrumb, maxBreadcrumbs) {
    const maxCrumbs = typeof maxBreadcrumbs === 'number' ? maxBreadcrumbs : DEFAULT_MAX_BREADCRUMBS;

    // No data has been changed, so don't notify scope listeners
    if (maxCrumbs <= 0) {
      return this;
    }

    const mergedBreadcrumb = {
      timestamp: dateTimestampInSeconds(),
      ...breadcrumb,
    };

    const breadcrumbs = this._breadcrumbs;
    breadcrumbs.push(mergedBreadcrumb);
    this._breadcrumbs = breadcrumbs.length > maxCrumbs ? breadcrumbs.slice(-maxCrumbs) : breadcrumbs;

    this._notifyScopeListeners();

    return this;
  }

  /**
   * @inheritDoc
   */
   getLastBreadcrumb() {
    return this._breadcrumbs[this._breadcrumbs.length - 1];
  }

  /**
   * @inheritDoc
   */
   clearBreadcrumbs() {
    this._breadcrumbs = [];
    this._notifyScopeListeners();
    return this;
  }

  /**
   * @inheritDoc
   */
   addAttachment(attachment) {
    this._attachments.push(attachment);
    return this;
  }

  /**
   * @inheritDoc
   * @deprecated Use `getScopeData()` instead.
   */
   getAttachments() {
    const data = this.getScopeData();

    return data.attachments;
  }

  /**
   * @inheritDoc
   */
   clearAttachments() {
    this._attachments = [];
    return this;
  }

  /** @inheritDoc */
   getScopeData() {
    const {
      _breadcrumbs,
      _attachments,
      _contexts,
      _tags,
      _extra,
      _user,
      _level,
      _fingerprint,
      _eventProcessors,
      _propagationContext,
      _sdkProcessingMetadata,
      _transactionName,
      _span,
    } = this;

    return {
      breadcrumbs: _breadcrumbs,
      attachments: _attachments,
      contexts: _contexts,
      tags: _tags,
      extra: _extra,
      user: _user,
      level: _level,
      fingerprint: _fingerprint || [],
      eventProcessors: _eventProcessors,
      propagationContext: _propagationContext,
      sdkProcessingMetadata: _sdkProcessingMetadata,
      transactionName: _transactionName,
      span: _span,
    };
  }

  /**
   * Applies data from the scope to the event and runs all event processors on it.
   *
   * @param event Event
   * @param hint Object containing additional information about the original exception, for use by the event processors.
   * @hidden
   * @deprecated Use `applyScopeDataToEvent()` directly
   */
   applyToEvent(
    event,
    hint = {},
    additionalEventProcessors = [],
  ) {
    applyScopeDataToEvent(event, this.getScopeData());

    // TODO (v8): Update this order to be: Global > Client > Scope
    const eventProcessors = [
      ...additionalEventProcessors,
      // eslint-disable-next-line deprecation/deprecation
      ...getGlobalEventProcessors(),
      ...this._eventProcessors,
    ];

    return notifyEventProcessors(eventProcessors, event, hint);
  }

  /**
   * Add data which will be accessible during event processing but won't get sent to Sentry
   */
   setSDKProcessingMetadata(newData) {
    this._sdkProcessingMetadata = { ...this._sdkProcessingMetadata, ...newData };

    return this;
  }

  /**
   * @inheritDoc
   */
   setPropagationContext(context) {
    this._propagationContext = context;
    return this;
  }

  /**
   * @inheritDoc
   */
   getPropagationContext() {
    return this._propagationContext;
  }

  /**
   * Capture an exception for this scope.
   *
   * @param exception The exception to capture.
   * @param hint Optinal additional data to attach to the Sentry event.
   * @returns the id of the captured Sentry event.
   */
   captureException(exception, hint) {
    const eventId = hint && hint.event_id ? hint.event_id : uuid4();

    if (!this._client) {
      logger.warn('No client configured on scope - will not capture exception!');
      return eventId;
    }

    const syntheticException = new Error('Sentry syntheticException');

    this._client.captureException(
      exception,
      {
        originalException: exception,
        syntheticException,
        ...hint,
        event_id: eventId,
      },
      this,
    );

    return eventId;
  }

  /**
   * Capture a message for this scope.
   *
   * @param message The message to capture.
   * @param level An optional severity level to report the message with.
   * @param hint Optional additional data to attach to the Sentry event.
   * @returns the id of the captured message.
   */
   captureMessage(message, level, hint) {
    const eventId = hint && hint.event_id ? hint.event_id : uuid4();

    if (!this._client) {
      logger.warn('No client configured on scope - will not capture message!');
      return eventId;
    }

    const syntheticException = new Error(message);

    this._client.captureMessage(
      message,
      level,
      {
        originalException: message,
        syntheticException,
        ...hint,
        event_id: eventId,
      },
      this,
    );

    return eventId;
  }

  /**
   * Captures a manually created event for this scope and sends it to Sentry.
   *
   * @param exception The event to capture.
   * @param hint Optional additional data to attach to the Sentry event.
   * @returns the id of the captured event.
   */
   captureEvent(event, hint) {
    const eventId = hint && hint.event_id ? hint.event_id : uuid4();

    if (!this._client) {
      logger.warn('No client configured on scope - will not capture event!');
      return eventId;
    }

    this._client.captureEvent(event, { ...hint, event_id: eventId }, this);

    return eventId;
  }

  /**
   * This will be called on every set call.
   */
   _notifyScopeListeners() {
    // We need this check for this._notifyingListeners to be able to work on scope during updates
    // If this check is not here we'll produce endless recursion when something is done with the scope
    // during the callback.
    if (!this._notifyingListeners) {
      this._notifyingListeners = true;
      this._scopeListeners.forEach(callback => {
        callback(this);
      });
      this._notifyingListeners = false;
    }
  }
}

function generatePropagationContext() {
  return {
    traceId: uuid4(),
    spanId: uuid4().substring(16),
  };
}

const SDK_VERSION = '7.119.2';

/**
 * API compatibility version of this hub.
 *
 * WARNING: This number should only be increased when the global interface
 * changes and new methods are introduced.
 *
 * @hidden
 */
const API_VERSION = parseFloat(SDK_VERSION);

/**
 * Default maximum number of breadcrumbs added to an event. Can be overwritten
 * with {@link Options.maxBreadcrumbs}.
 */
const DEFAULT_BREADCRUMBS = 100;

/**
 * @deprecated The `Hub` class will be removed in version 8 of the SDK in favour of `Scope` and `Client` objects.
 *
 * If you previously used the `Hub` class directly, replace it with `Scope` and `Client` objects. More information:
 * - [Multiple Sentry Instances](https://docs.sentry.io/platforms/javascript/best-practices/multiple-sentry-instances/)
 * - [Browser Extensions](https://docs.sentry.io/platforms/javascript/best-practices/browser-extensions/)
 *
 * Some of our APIs are typed with the Hub class instead of the interface (e.g. `getCurrentHub`). Most of them are deprecated
 * themselves and will also be removed in version 8. More information:
 * - [Migration Guide](https://github.com/getsentry/sentry-javascript/blob/develop/MIGRATION.md#deprecate-hub)
 */
// eslint-disable-next-line deprecation/deprecation
class Hub  {
  /** Is a {@link Layer}[] containing the client and scope */

  /** Contains the last event id of a captured event.  */

  /**
   * Creates a new instance of the hub, will push one {@link Layer} into the
   * internal stack on creation.
   *
   * @param client bound to the hub.
   * @param scope bound to the hub.
   * @param version number, higher number means higher priority.
   *
   * @deprecated Instantiation of Hub objects is deprecated and the constructor will be removed in version 8 of the SDK.
   *
   * If you are currently using the Hub for multi-client use like so:
   *
   * ```
   * // OLD
   * const hub = new Hub();
   * hub.bindClient(client);
   * makeMain(hub)
   * ```
   *
   * instead initialize the client as follows:
   *
   * ```
   * // NEW
   * Sentry.withIsolationScope(() => {
   *    Sentry.setCurrentClient(client);
   *    client.init();
   * });
   * ```
   *
   * If you are using the Hub to capture events like so:
   *
   * ```
   * // OLD
   * const client = new Client();
   * const hub = new Hub(client);
   * hub.captureException()
   * ```
   *
   * instead capture isolated events as follows:
   *
   * ```
   * // NEW
   * const client = new Client();
   * const scope = new Scope();
   * scope.setClient(client);
   * scope.captureException();
   * ```
   */
   constructor(
    client,
    scope,
    isolationScope,
      _version = API_VERSION,
  ) {this._version = _version;
    let assignedScope;
    if (!scope) {
      assignedScope = new Scope();
      assignedScope.setClient(client);
    } else {
      assignedScope = scope;
    }

    let assignedIsolationScope;
    if (!isolationScope) {
      assignedIsolationScope = new Scope();
      assignedIsolationScope.setClient(client);
    } else {
      assignedIsolationScope = isolationScope;
    }

    this._stack = [{ scope: assignedScope }];

    if (client) {
      // eslint-disable-next-line deprecation/deprecation
      this.bindClient(client);
    }

    this._isolationScope = assignedIsolationScope;
  }

  /**
   * Checks if this hub's version is older than the given version.
   *
   * @param version A version number to compare to.
   * @return True if the given version is newer; otherwise false.
   *
   * @deprecated This will be removed in v8.
   */
   isOlderThan(version) {
    return this._version < version;
  }

  /**
   * This binds the given client to the current scope.
   * @param client An SDK client (client) instance.
   *
   * @deprecated Use `initAndBind()` directly, or `setCurrentClient()` and/or `client.init()` instead.
   */
   bindClient(client) {
    // eslint-disable-next-line deprecation/deprecation
    const top = this.getStackTop();
    top.client = client;
    top.scope.setClient(client);
    // eslint-disable-next-line deprecation/deprecation
    if (client && client.setupIntegrations) {
      // eslint-disable-next-line deprecation/deprecation
      client.setupIntegrations();
    }
  }

  /**
   * @inheritDoc
   *
   * @deprecated Use `withScope` instead.
   */
   pushScope() {
    // We want to clone the content of prev scope
    // eslint-disable-next-line deprecation/deprecation
    const scope = this.getScope().clone();
    // eslint-disable-next-line deprecation/deprecation
    this.getStack().push({
      // eslint-disable-next-line deprecation/deprecation
      client: this.getClient(),
      scope,
    });
    return scope;
  }

  /**
   * @inheritDoc
   *
   * @deprecated Use `withScope` instead.
   */
   popScope() {
    // eslint-disable-next-line deprecation/deprecation
    if (this.getStack().length <= 1) return false;
    // eslint-disable-next-line deprecation/deprecation
    return !!this.getStack().pop();
  }

  /**
   * @inheritDoc
   *
   * @deprecated Use `Sentry.withScope()` instead.
   */
   withScope(callback) {
    // eslint-disable-next-line deprecation/deprecation
    const scope = this.pushScope();

    let maybePromiseResult;
    try {
      maybePromiseResult = callback(scope);
    } catch (e) {
      // eslint-disable-next-line deprecation/deprecation
      this.popScope();
      throw e;
    }

    if (isThenable(maybePromiseResult)) {
      // @ts-expect-error - isThenable returns the wrong type
      return maybePromiseResult.then(
        res => {
          // eslint-disable-next-line deprecation/deprecation
          this.popScope();
          return res;
        },
        e => {
          // eslint-disable-next-line deprecation/deprecation
          this.popScope();
          throw e;
        },
      );
    }

    // eslint-disable-next-line deprecation/deprecation
    this.popScope();
    return maybePromiseResult;
  }

  /**
   * @inheritDoc
   *
   * @deprecated Use `Sentry.getClient()` instead.
   */
   getClient() {
    // eslint-disable-next-line deprecation/deprecation
    return this.getStackTop().client ;
  }

  /**
   * Returns the scope of the top stack.
   *
   * @deprecated Use `Sentry.getCurrentScope()` instead.
   */
   getScope() {
    // eslint-disable-next-line deprecation/deprecation
    return this.getStackTop().scope;
  }

  /**
   * @deprecated Use `Sentry.getIsolationScope()` instead.
   */
   getIsolationScope() {
    return this._isolationScope;
  }

  /**
   * Returns the scope stack for domains or the process.
   * @deprecated This will be removed in v8.
   */
   getStack() {
    return this._stack;
  }

  /**
   * Returns the topmost scope layer in the order domain > local > process.
   * @deprecated This will be removed in v8.
   */
   getStackTop() {
    return this._stack[this._stack.length - 1];
  }

  /**
   * @inheritDoc
   *
   * @deprecated Use `Sentry.captureException()` instead.
   */
   captureException(exception, hint) {
    const eventId = (this._lastEventId = hint && hint.event_id ? hint.event_id : uuid4());
    const syntheticException = new Error('Sentry syntheticException');
    // eslint-disable-next-line deprecation/deprecation
    this.getScope().captureException(exception, {
      originalException: exception,
      syntheticException,
      ...hint,
      event_id: eventId,
    });

    return eventId;
  }

  /**
   * @inheritDoc
   *
   * @deprecated Use  `Sentry.captureMessage()` instead.
   */
   captureMessage(
    message,
    // eslint-disable-next-line deprecation/deprecation
    level,
    hint,
  ) {
    const eventId = (this._lastEventId = hint && hint.event_id ? hint.event_id : uuid4());
    const syntheticException = new Error(message);
    // eslint-disable-next-line deprecation/deprecation
    this.getScope().captureMessage(message, level, {
      originalException: message,
      syntheticException,
      ...hint,
      event_id: eventId,
    });

    return eventId;
  }

  /**
   * @inheritDoc
   *
   * @deprecated Use `Sentry.captureEvent()` instead.
   */
   captureEvent(event, hint) {
    const eventId = hint && hint.event_id ? hint.event_id : uuid4();
    if (!event.type) {
      this._lastEventId = eventId;
    }
    // eslint-disable-next-line deprecation/deprecation
    this.getScope().captureEvent(event, { ...hint, event_id: eventId });
    return eventId;
  }

  /**
   * @inheritDoc
   *
   * @deprecated This will be removed in v8.
   */
   lastEventId() {
    return this._lastEventId;
  }

  /**
   * @inheritDoc
   *
   * @deprecated Use `Sentry.addBreadcrumb()` instead.
   */
   addBreadcrumb(breadcrumb, hint) {
    // eslint-disable-next-line deprecation/deprecation
    const { scope, client } = this.getStackTop();

    if (!client) return;

    const { beforeBreadcrumb = null, maxBreadcrumbs = DEFAULT_BREADCRUMBS } =
      (client.getOptions && client.getOptions()) || {};

    if (maxBreadcrumbs <= 0) return;

    const timestamp = dateTimestampInSeconds();
    const mergedBreadcrumb = { timestamp, ...breadcrumb };
    const finalBreadcrumb = beforeBreadcrumb
      ? (consoleSandbox(() => beforeBreadcrumb(mergedBreadcrumb, hint)) )
      : mergedBreadcrumb;

    if (finalBreadcrumb === null) return;

    if (client.emit) {
      client.emit('beforeAddBreadcrumb', finalBreadcrumb, hint);
    }

    // TODO(v8): I know this comment doesn't make much sense because the hub will be deprecated but I still wanted to
    // write it down. In theory, we would have to add the breadcrumbs to the isolation scope here, however, that would
    // duplicate all of the breadcrumbs. There was the possibility of adding breadcrumbs to both, the isolation scope
    // and the normal scope, and deduplicating it down the line in the event processing pipeline. However, that would
    // have been very fragile, because the breadcrumb objects would have needed to keep their identity all throughout
    // the event processing pipeline.
    // In the new implementation, the top level `Sentry.addBreadcrumb()` should ONLY write to the isolation scope.

    scope.addBreadcrumb(finalBreadcrumb, maxBreadcrumbs);
  }

  /**
   * @inheritDoc
   * @deprecated Use `Sentry.setUser()` instead.
   */
   setUser(user) {
    // TODO(v8): The top level `Sentry.setUser()` function should write ONLY to the isolation scope.
    // eslint-disable-next-line deprecation/deprecation
    this.getScope().setUser(user);
    // eslint-disable-next-line deprecation/deprecation
    this.getIsolationScope().setUser(user);
  }

  /**
   * @inheritDoc
   * @deprecated Use `Sentry.setTags()` instead.
   */
   setTags(tags) {
    // TODO(v8): The top level `Sentry.setTags()` function should write ONLY to the isolation scope.
    // eslint-disable-next-line deprecation/deprecation
    this.getScope().setTags(tags);
    // eslint-disable-next-line deprecation/deprecation
    this.getIsolationScope().setTags(tags);
  }

  /**
   * @inheritDoc
   * @deprecated Use `Sentry.setExtras()` instead.
   */
   setExtras(extras) {
    // TODO(v8): The top level `Sentry.setExtras()` function should write ONLY to the isolation scope.
    // eslint-disable-next-line deprecation/deprecation
    this.getScope().setExtras(extras);
    // eslint-disable-next-line deprecation/deprecation
    this.getIsolationScope().setExtras(extras);
  }

  /**
   * @inheritDoc
   * @deprecated Use `Sentry.setTag()` instead.
   */
   setTag(key, value) {
    // TODO(v8): The top level `Sentry.setTag()` function should write ONLY to the isolation scope.
    // eslint-disable-next-line deprecation/deprecation
    this.getScope().setTag(key, value);
    // eslint-disable-next-line deprecation/deprecation
    this.getIsolationScope().setTag(key, value);
  }

  /**
   * @inheritDoc
   * @deprecated Use `Sentry.setExtra()` instead.
   */
   setExtra(key, extra) {
    // TODO(v8): The top level `Sentry.setExtra()` function should write ONLY to the isolation scope.
    // eslint-disable-next-line deprecation/deprecation
    this.getScope().setExtra(key, extra);
    // eslint-disable-next-line deprecation/deprecation
    this.getIsolationScope().setExtra(key, extra);
  }

  /**
   * @inheritDoc
   * @deprecated Use `Sentry.setContext()` instead.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
   setContext(name, context) {
    // TODO(v8): The top level `Sentry.setContext()` function should write ONLY to the isolation scope.
    // eslint-disable-next-line deprecation/deprecation
    this.getScope().setContext(name, context);
    // eslint-disable-next-line deprecation/deprecation
    this.getIsolationScope().setContext(name, context);
  }

  /**
   * @inheritDoc
   *
   * @deprecated Use `getScope()` directly.
   */
   configureScope(callback) {
    // eslint-disable-next-line deprecation/deprecation
    const { scope, client } = this.getStackTop();
    if (client) {
      callback(scope);
    }
  }

  /**
   * @inheritDoc
   */
  // eslint-disable-next-line deprecation/deprecation
   run(callback) {
    // eslint-disable-next-line deprecation/deprecation
    const oldHub = makeMain(this);
    try {
      callback(this);
    } finally {
      // eslint-disable-next-line deprecation/deprecation
      makeMain(oldHub);
    }
  }

  /**
   * @inheritDoc
   * @deprecated Use `Sentry.getClient().getIntegrationByName()` instead.
   */
   getIntegration(integration) {
    // eslint-disable-next-line deprecation/deprecation
    const client = this.getClient();
    if (!client) return null;
    try {
      // eslint-disable-next-line deprecation/deprecation
      return client.getIntegration(integration);
    } catch (_oO) {
      DEBUG_BUILD$1 && logger.warn(`Cannot retrieve integration ${integration.id} from the current Hub`);
      return null;
    }
  }

  /**
   * Starts a new `Transaction` and returns it. This is the entry point to manual tracing instrumentation.
   *
   * A tree structure can be built by adding child spans to the transaction, and child spans to other spans. To start a
   * new child span within the transaction or any span, call the respective `.startChild()` method.
   *
   * Every child span must be finished before the transaction is finished, otherwise the unfinished spans are discarded.
   *
   * The transaction must be finished with a call to its `.end()` method, at which point the transaction with all its
   * finished child spans will be sent to Sentry.
   *
   * @param context Properties of the new `Transaction`.
   * @param customSamplingContext Information given to the transaction sampling function (along with context-dependent
   * default values). See {@link Options.tracesSampler}.
   *
   * @returns The transaction which was just started
   *
   * @deprecated Use `startSpan()`, `startSpanManual()` or `startInactiveSpan()` instead.
   */
   startTransaction(context, customSamplingContext) {
    const result = this._callExtensionMethod('startTransaction', context, customSamplingContext);

    if (DEBUG_BUILD$1 && !result) {
      // eslint-disable-next-line deprecation/deprecation
      const client = this.getClient();
      if (!client) {
        logger.warn(
          "Tracing extension 'startTransaction' is missing. You should 'init' the SDK before calling 'startTransaction'",
        );
      } else {
        logger.warn(`Tracing extension 'startTransaction' has not been added. Call 'addTracingExtensions' before calling 'init':
Sentry.addTracingExtensions();
Sentry.init({...});
`);
      }
    }

    return result;
  }

  /**
   * @inheritDoc
   * @deprecated Use `spanToTraceHeader()` instead.
   */
   traceHeaders() {
    return this._callExtensionMethod('traceHeaders');
  }

  /**
   * @inheritDoc
   *
   * @deprecated Use top level `captureSession` instead.
   */
   captureSession(endSession = false) {
    // both send the update and pull the session from the scope
    if (endSession) {
      // eslint-disable-next-line deprecation/deprecation
      return this.endSession();
    }

    // only send the update
    this._sendSessionUpdate();
  }

  /**
   * @inheritDoc
   * @deprecated Use top level `endSession` instead.
   */
   endSession() {
    // eslint-disable-next-line deprecation/deprecation
    const layer = this.getStackTop();
    const scope = layer.scope;
    const session = scope.getSession();
    if (session) {
      closeSession(session);
    }
    this._sendSessionUpdate();

    // the session is over; take it off of the scope
    scope.setSession();
  }

  /**
   * @inheritDoc
   * @deprecated Use top level `startSession` instead.
   */
   startSession(context) {
    // eslint-disable-next-line deprecation/deprecation
    const { scope, client } = this.getStackTop();
    const { release, environment = DEFAULT_ENVIRONMENT } = (client && client.getOptions()) || {};

    // Will fetch userAgent if called from browser sdk
    const { userAgent } = GLOBAL_OBJ.navigator || {};

    const session = makeSession({
      release,
      environment,
      user: scope.getUser(),
      ...(userAgent && { userAgent }),
      ...context,
    });

    // End existing session if there's one
    const currentSession = scope.getSession && scope.getSession();
    if (currentSession && currentSession.status === 'ok') {
      updateSession(currentSession, { status: 'exited' });
    }
    // eslint-disable-next-line deprecation/deprecation
    this.endSession();

    // Afterwards we set the new session on the scope
    scope.setSession(session);

    return session;
  }

  /**
   * Returns if default PII should be sent to Sentry and propagated in ourgoing requests
   * when Tracing is used.
   *
   * @deprecated Use top-level `getClient().getOptions().sendDefaultPii` instead. This function
   * only unnecessarily increased API surface but only wrapped accessing the option.
   */
   shouldSendDefaultPii() {
    // eslint-disable-next-line deprecation/deprecation
    const client = this.getClient();
    const options = client && client.getOptions();
    return Boolean(options && options.sendDefaultPii);
  }

  /**
   * Sends the current Session on the scope
   */
   _sendSessionUpdate() {
    // eslint-disable-next-line deprecation/deprecation
    const { scope, client } = this.getStackTop();

    const session = scope.getSession();
    if (session && client && client.captureSession) {
      client.captureSession(session);
    }
  }

  /**
   * Calls global extension method and binding current instance to the function call
   */
  // @ts-expect-error Function lacks ending return statement and return type does not include 'undefined'. ts(2366)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
   _callExtensionMethod(method, ...args) {
    const carrier = getMainCarrier();
    const sentry = carrier.__SENTRY__;
    if (sentry && sentry.extensions && typeof sentry.extensions[method] === 'function') {
      return sentry.extensions[method].apply(this, args);
    }
    DEBUG_BUILD$1 && logger.warn(`Extension method ${method} couldn't be found, doing nothing.`);
  }
}

/**
 * Returns the global shim registry.
 *
 * FIXME: This function is problematic, because despite always returning a valid Carrier,
 * it has an optional `__SENTRY__` property, which then in turn requires us to always perform an unnecessary check
 * at the call-site. We always access the carrier through this function, so we can guarantee that `__SENTRY__` is there.
 **/
function getMainCarrier() {
  GLOBAL_OBJ.__SENTRY__ = GLOBAL_OBJ.__SENTRY__ || {
    extensions: {},
    hub: undefined,
  };
  return GLOBAL_OBJ;
}

/**
 * Replaces the current main hub with the passed one on the global object
 *
 * @returns The old replaced hub
 *
 * @deprecated Use `setCurrentClient()` instead.
 */
// eslint-disable-next-line deprecation/deprecation
function makeMain(hub) {
  const registry = getMainCarrier();
  const oldHub = getHubFromCarrier(registry);
  setHubOnCarrier(registry, hub);
  return oldHub;
}

/**
 * Returns the default hub instance.
 *
 * If a hub is already registered in the global carrier but this module
 * contains a more recent version, it replaces the registered version.
 * Otherwise, the currently registered hub will be returned.
 *
 * @deprecated Use the respective replacement method directly instead.
 */
// eslint-disable-next-line deprecation/deprecation
function getCurrentHub() {
  // Get main carrier (global for every environment)
  const registry = getMainCarrier();

  if (registry.__SENTRY__ && registry.__SENTRY__.acs) {
    const hub = registry.__SENTRY__.acs.getCurrentHub();

    if (hub) {
      return hub;
    }
  }

  // Return hub that lives on a global object
  return getGlobalHub(registry);
}

// eslint-disable-next-line deprecation/deprecation
function getGlobalHub(registry = getMainCarrier()) {
  // If there's no hub, or its an old API, assign a new one

  if (
    !hasHubOnCarrier(registry) ||
    // eslint-disable-next-line deprecation/deprecation
    getHubFromCarrier(registry).isOlderThan(API_VERSION)
  ) {
    // eslint-disable-next-line deprecation/deprecation
    setHubOnCarrier(registry, new Hub());
  }

  // Return hub that lives on a global object
  return getHubFromCarrier(registry);
}

/**
 * This will tell whether a carrier has a hub on it or not
 * @param carrier object
 */
function hasHubOnCarrier(carrier) {
  return !!(carrier && carrier.__SENTRY__ && carrier.__SENTRY__.hub);
}

/**
 * This will create a new {@link Hub} and add to the passed object on
 * __SENTRY__.hub.
 * @param carrier object
 * @hidden
 */
// eslint-disable-next-line deprecation/deprecation
function getHubFromCarrier(carrier) {
  // eslint-disable-next-line deprecation/deprecation
  return getGlobalSingleton('hub', () => new Hub(), carrier);
}

/**
 * This will set passed {@link Hub} on the passed object's __SENTRY__.hub attribute
 * @param carrier object
 * @param hub Hub
 * @returns A boolean indicating success or failure
 */
// eslint-disable-next-line deprecation/deprecation
function setHubOnCarrier(carrier, hub) {
  if (!carrier) return false;
  const __SENTRY__ = (carrier.__SENTRY__ = carrier.__SENTRY__ || {});
  __SENTRY__.hub = hub;
  return true;
}

/**
 * Convert a new integration function to the legacy class syntax.
 * In v8, we can remove this and instead export the integration functions directly.
 *
 * @deprecated This will be removed in v8!
 */
function convertIntegrationFnToClass(
  name,
  fn,
) {
  return Object.assign(
    function ConvertedIntegration(...args) {
      return fn(...args);
    },
    { id: name },
  ) ;
}

/**
 * Define an integration function that can be used to create an integration instance.
 * Note that this by design hides the implementation details of the integration, as they are considered internal.
 */
function defineIntegration(fn) {
  return fn;
}

/**
 * This serves as a build time flag that will be true by default, but false in non-debug builds or if users replace `true` in their generated code.
 *
 * ATTENTION: This constant must never cross package boundaries (i.e. be exported) to guarantee that it can be used for tree shaking.
 */
const DEBUG_BUILD = true;

const WINDOW = GLOBAL_OBJ ;

/* eslint-disable max-lines */

const MS_TO_NS = 1e6;
// Use 0 as main thread id which is identical to threadId in node:worker_threads
// where main logs 0 and workers seem to log in increments of 1
const THREAD_ID_STRING = String(0);
const THREAD_NAME = 'main';

// Machine properties (eval only once)
let OS_PLATFORM = '';
let OS_PLATFORM_VERSION = '';
let OS_ARCH = '';
let OS_BROWSER = (WINDOW.navigator && WINDOW.navigator.userAgent) || '';
let OS_MODEL = '';
const OS_LOCALE =
  (WINDOW.navigator && WINDOW.navigator.language) ||
  (WINDOW.navigator && WINDOW.navigator.languages && WINDOW.navigator.languages[0]) ||
  '';

function isUserAgentData(data) {
  return typeof data === 'object' && data !== null && 'getHighEntropyValues' in data;
}

// @ts-expect-error userAgentData is not part of the navigator interface yet
const userAgentData = WINDOW.navigator && WINDOW.navigator.userAgentData;

if (isUserAgentData(userAgentData)) {
  userAgentData
    .getHighEntropyValues(['architecture', 'model', 'platform', 'platformVersion', 'fullVersionList'])
    .then((ua) => {
      OS_PLATFORM = ua.platform || '';
      OS_ARCH = ua.architecture || '';
      OS_MODEL = ua.model || '';
      OS_PLATFORM_VERSION = ua.platformVersion || '';

      if (ua.fullVersionList && ua.fullVersionList.length > 0) {
        const firstUa = ua.fullVersionList[ua.fullVersionList.length - 1];
        OS_BROWSER = `${firstUa.brand} ${firstUa.version}`;
      }
    })
    .catch(e => void e);
}

function isProcessedJSSelfProfile(profile) {
  return !('thread_metadata' in profile);
}

// Enriches the profile with threadId of the current thread.
// This is done in node as we seem to not be able to get the info from C native code.
/**
 *
 */
function enrichWithThreadInformation(profile) {
  if (!isProcessedJSSelfProfile(profile)) {
    return profile;
  }

  return convertJSSelfProfileToSampledFormat(profile);
}

// Profile is marked as optional because it is deleted from the metadata
// by the integration before the event is processed by other integrations.

function getTraceId(event) {
  const traceId = event && event.contexts && event.contexts['trace'] && event.contexts['trace']['trace_id'];
  // Log a warning if the profile has an invalid traceId (should be uuidv4).
  // All profiles and transactions are rejected if this is the case and we want to
  // warn users that this is happening if they enable debug flag
  if (typeof traceId === 'string' && traceId.length !== 32) {
    {
      logger.log(`[Profiling] Invalid traceId: ${traceId} on profiled event`);
    }
  }
  if (typeof traceId !== 'string') {
    return '';
  }

  return traceId;
}
/**
 * Creates a profiling event envelope from a Sentry event. If profile does not pass
 * validation, returns null.
 * @param event
 * @param dsn
 * @param metadata
 * @param tunnel
 * @returns {EventEnvelope | null}
 */

/**
 * Creates a profiling event envelope from a Sentry event.
 */
function createProfilePayload(
  profile_id,
  start_timestamp,
  processed_profile,
  event,
) {
  if (event.type !== 'transaction') {
    // createProfilingEventEnvelope should only be called for transactions,
    // we type guard this behavior with isProfiledTransactionEvent.
    throw new TypeError('Profiling events may only be attached to transactions, this should never occur.');
  }

  if (processed_profile === undefined || processed_profile === null) {
    throw new TypeError(
      `Cannot construct profiling event envelope without a valid profile. Got ${processed_profile} instead.`,
    );
  }

  const traceId = getTraceId(event);
  const enrichedThreadProfile = enrichWithThreadInformation(processed_profile);
  const transactionStartMs = start_timestamp
    ? start_timestamp
    : typeof event.start_timestamp === 'number'
      ? event.start_timestamp * 1000
      : Date.now();
  const transactionEndMs = typeof event.timestamp === 'number' ? event.timestamp * 1000 : Date.now();

  const profile = {
    event_id: profile_id,
    timestamp: new Date(transactionStartMs).toISOString(),
    platform: 'javascript',
    version: '1',
    release: event.release || '',
    environment: event.environment || DEFAULT_ENVIRONMENT,
    runtime: {
      name: 'javascript',
      version: WINDOW.navigator.userAgent,
    },
    os: {
      name: OS_PLATFORM,
      version: OS_PLATFORM_VERSION,
      build_number: OS_BROWSER,
    },
    device: {
      locale: OS_LOCALE,
      model: OS_MODEL,
      manufacturer: OS_BROWSER,
      architecture: OS_ARCH,
      is_emulator: false,
    },
    debug_meta: {
      images: applyDebugMetadata(processed_profile.resources),
    },
    profile: enrichedThreadProfile,
    transactions: [
      {
        name: event.transaction || '',
        id: event.event_id || uuid4(),
        trace_id: traceId,
        active_thread_id: THREAD_ID_STRING,
        relative_start_ns: '0',
        relative_end_ns: ((transactionEndMs - transactionStartMs) * 1e6).toFixed(0),
      },
    ],
  };

  return profile;
}

/*
  See packages/tracing-internal/src/browser/router.ts
*/
/**
 *
 */
function isAutomatedPageLoadTransaction(transaction) {
  return transaction.op === 'pageload';
}

/**
 * Converts a JSSelfProfile to a our sampled format.
 * Does not currently perform stack indexing.
 */
function convertJSSelfProfileToSampledFormat(input) {
  let EMPTY_STACK_ID = undefined;
  let STACK_ID = 0;

  // Initialize the profile that we will fill with data
  const profile = {
    samples: [],
    stacks: [],
    frames: [],
    thread_metadata: {
      [THREAD_ID_STRING]: { name: THREAD_NAME },
    },
  };

  if (!input.samples.length) {
    return profile;
  }

  // We assert samples.length > 0 above and timestamp should always be present
  const start = input.samples[0].timestamp;
  // The JS SDK might change it's time origin based on some heuristic (see See packages/utils/src/time.ts)
  // when that happens, we need to ensure we are correcting the profile timings so the two timelines stay in sync.
  // Since JS self profiling time origin is always initialized to performance.timeOrigin, we need to adjust for
  // the drift between the SDK selected value and our profile time origin.
  const origin =
    typeof performance.timeOrigin === 'number' ? performance.timeOrigin : browserPerformanceTimeOrigin || 0;
  const adjustForOriginChange = origin - (browserPerformanceTimeOrigin || origin);

  for (let i = 0; i < input.samples.length; i++) {
    const jsSample = input.samples[i];

    // If sample has no stack, add an empty sample
    if (jsSample.stackId === undefined) {
      if (EMPTY_STACK_ID === undefined) {
        EMPTY_STACK_ID = STACK_ID;
        profile.stacks[EMPTY_STACK_ID] = [];
        STACK_ID++;
      }

      profile['samples'][i] = {
        // convert ms timestamp to ns
        elapsed_since_start_ns: ((jsSample.timestamp + adjustForOriginChange - start) * MS_TO_NS).toFixed(0),
        stack_id: EMPTY_STACK_ID,
        thread_id: THREAD_ID_STRING,
      };
      continue;
    }

    let stackTop = input.stacks[jsSample.stackId];

    // Functions in top->down order (root is last)
    // We follow the stackTop.parentId trail and collect each visited frameId
    const stack = [];

    while (stackTop) {
      stack.push(stackTop.frameId);

      const frame = input.frames[stackTop.frameId];

      // If our frame has not been indexed yet, index it
      if (profile.frames[stackTop.frameId] === undefined) {
        profile.frames[stackTop.frameId] = {
          function: frame.name,
          abs_path: typeof frame.resourceId === 'number' ? input.resources[frame.resourceId] : undefined,
          lineno: frame.line,
          colno: frame.column,
        };
      }

      stackTop = stackTop.parentId === undefined ? undefined : input.stacks[stackTop.parentId];
    }

    const sample = {
      // convert ms timestamp to ns
      elapsed_since_start_ns: ((jsSample.timestamp + adjustForOriginChange - start) * MS_TO_NS).toFixed(0),
      stack_id: STACK_ID,
      thread_id: THREAD_ID_STRING,
    };

    profile['stacks'][STACK_ID] = stack;
    profile['samples'][i] = sample;
    STACK_ID++;
  }

  return profile;
}

/**
 * Adds items to envelope if they are not already present - mutates the envelope.
 * @param envelope
 */
function addProfilesToEnvelope(envelope, profiles) {
  if (!profiles.length) {
    return envelope;
  }

  for (const profile of profiles) {
    envelope[1].push([{ type: 'profile' }, profile]);
  }
  return envelope;
}

/**
 * Finds transactions with profile_id context in the envelope
 * @param envelope
 * @returns
 */
function findProfiledTransactionsFromEnvelope(envelope) {
  const events = [];

  forEachEnvelopeItem(envelope, (item, type) => {
    if (type !== 'transaction') {
      return;
    }

    for (let j = 1; j < item.length; j++) {
      const event = item[j] ;

      if (event && event.contexts && event.contexts['profile'] && event.contexts['profile']['profile_id']) {
        events.push(item[j] );
      }
    }
  });

  return events;
}

const debugIdStackParserCache = new WeakMap();
/**
 * Applies debug meta data to an event from a list of paths to resources (sourcemaps)
 */
function applyDebugMetadata(resource_paths) {
  const debugIdMap = GLOBAL_OBJ._sentryDebugIds;

  if (!debugIdMap) {
    return [];
  }

  const client = getClient();
  const options = client && client.getOptions();
  const stackParser = options && options.stackParser;

  if (!stackParser) {
    return [];
  }

  let debugIdStackFramesCache;
  const cachedDebugIdStackFrameCache = debugIdStackParserCache.get(stackParser);
  if (cachedDebugIdStackFrameCache) {
    debugIdStackFramesCache = cachedDebugIdStackFrameCache;
  } else {
    debugIdStackFramesCache = new Map();
    debugIdStackParserCache.set(stackParser, debugIdStackFramesCache);
  }

  // Build a map of filename -> debug_id
  const filenameDebugIdMap = Object.keys(debugIdMap).reduce((acc, debugIdStackTrace) => {
    let parsedStack;

    const cachedParsedStack = debugIdStackFramesCache.get(debugIdStackTrace);
    if (cachedParsedStack) {
      parsedStack = cachedParsedStack;
    } else {
      parsedStack = stackParser(debugIdStackTrace);
      debugIdStackFramesCache.set(debugIdStackTrace, parsedStack);
    }

    for (let i = parsedStack.length - 1; i >= 0; i--) {
      const stackFrame = parsedStack[i];
      const file = stackFrame && stackFrame.filename;

      if (stackFrame && file) {
        acc[file] = debugIdMap[debugIdStackTrace] ;
        break;
      }
    }
    return acc;
  }, {});

  const images = [];
  for (const path of resource_paths) {
    if (path && filenameDebugIdMap[path]) {
      images.push({
        type: 'sourcemap',
        code_file: path,
        debug_id: filenameDebugIdMap[path] ,
      });
    }
  }

  return images;
}

/**
 * Checks the given sample rate to make sure it is valid type and value (a boolean, or a number between 0 and 1).
 */
function isValidSampleRate(rate) {
  // we need to check NaN explicitly because it's of type 'number' and therefore wouldn't get caught by this typecheck
  if ((typeof rate !== 'number' && typeof rate !== 'boolean') || (typeof rate === 'number' && isNaN(rate))) {
    logger.warn(
        `[Profiling] Invalid sample rate. Sample rate must be a boolean or a number between 0 and 1. Got ${JSON.stringify(
          rate,
        )} of type ${JSON.stringify(typeof rate)}.`,
      );
    return false;
  }

  // Boolean sample rates are always valid
  if (rate === true || rate === false) {
    return true;
  }

  // in case sampleRate is a boolean, it will get automatically cast to 1 if it's true and 0 if it's false
  if (rate < 0 || rate > 1) {
    logger.warn(`[Profiling] Invalid sample rate. Sample rate must be between 0 and 1. Got ${rate}.`);
    return false;
  }
  return true;
}

function isValidProfile(profile) {
  if (profile.samples.length < 2) {
    if (DEBUG_BUILD) {
      // Log a warning if the profile has less than 2 samples so users can know why
      // they are not seeing any profiling data and we cant avoid the back and forth
      // of asking them to provide us with a dump of the profile data.
      logger.log('[Profiling] Discarding profile because it contains less than 2 samples');
    }
    return false;
  }

  if (!profile.frames.length) {
    {
      logger.log('[Profiling] Discarding profile because it contains no frames');
    }
    return false;
  }

  return true;
}

// Keep a flag value to avoid re-initializing the profiler constructor. If it fails
// once, it will always fail and this allows us to early return.
let PROFILING_CONSTRUCTOR_FAILED = false;
const MAX_PROFILE_DURATION_MS = 30000;

/**
 * Check if profiler constructor is available.
 * @param maybeProfiler
 */
function isJSProfilerSupported(maybeProfiler) {
  return typeof maybeProfiler === 'function';
}

/**
 * Starts the profiler and returns the profiler instance.
 */
function startJSSelfProfile() {
  // Feature support check first
  const JSProfilerConstructor = WINDOW.Profiler;

  if (!isJSProfilerSupported(JSProfilerConstructor)) {
    {
      logger.log(
        '[Profiling] Profiling is not supported by this browser, Profiler interface missing on window object.',
      );
    }
    return;
  }

  // From initial testing, it seems that the minimum value for sampleInterval is 10ms.
  const samplingIntervalMS = 10;
  // Start the profiler
  const maxSamples = Math.floor(MAX_PROFILE_DURATION_MS / samplingIntervalMS);

  // Attempt to initialize the profiler constructor, if it fails, we disable profiling for the current user session.
  // This is likely due to a missing 'Document-Policy': 'js-profiling' header. We do not want to throw an error if this happens
  // as we risk breaking the user's application, so just disable profiling and log an error.
  try {
    return new JSProfilerConstructor({ sampleInterval: samplingIntervalMS, maxBufferSize: maxSamples });
  } catch (e) {
    {
      logger.log(
        "[Profiling] Failed to initialize the Profiling constructor, this is likely due to a missing 'Document-Policy': 'js-profiling' header.",
      );
      logger.log('[Profiling] Disabling profiling for current user session.');
    }
    PROFILING_CONSTRUCTOR_FAILED = true;
  }

  return;
}

/**
 * Determine if a profile should be profiled.
 */
function shouldProfileTransaction(transaction) {
  // If constructor failed once, it will always fail, so we can early return.
  if (PROFILING_CONSTRUCTOR_FAILED) {
    {
      logger.log('[Profiling] Profiling has been disabled for the duration of the current user session.');
    }
    return false;
  }

  if (!transaction.isRecording()) {
    {
      logger.log('[Profiling] Discarding profile because transaction was not sampled.');
    }
    return false;
  }

  const client = getClient();
  const options = client && client.getOptions();
  if (!options) {
    logger.log('[Profiling] Profiling disabled, no options found.');
    return false;
  }

  // @ts-expect-error profilesSampleRate is not part of the browser options yet
  const profilesSampleRate = options.profilesSampleRate;

  // Since this is coming from the user (or from a function provided by the user), who knows what we might get. (The
  // only valid values are booleans or numbers between 0 and 1.)
  if (!isValidSampleRate(profilesSampleRate)) {
    logger.warn('[Profiling] Discarding profile because of invalid sample rate.');
    return false;
  }

  // if the function returned 0 (or false), or if `profileSampleRate` is 0, it's a sign the profile should be dropped
  if (!profilesSampleRate) {
    logger.log(
        '[Profiling] Discarding profile because a negative sampling decision was inherited or profileSampleRate is set to 0',
      );
    return false;
  }

  // Now we roll the dice. Math.random is inclusive of 0, but not of 1, so strict < is safe here. In case sampleRate is
  // a boolean, the < comparison will cause it to be automatically cast to 1 if it's true and 0 if it's false.
  const sampled = profilesSampleRate === true ? true : Math.random() < profilesSampleRate;
  // Check if we should sample this profile
  if (!sampled) {
    logger.log(
        `[Profiling] Discarding profile because it's not included in the random sample (sampling rate = ${Number(
          profilesSampleRate,
        )})`,
      );
    return false;
  }

  return true;
}

/**
 * Creates a profiling envelope item, if the profile does not pass validation, returns null.
 * @param event
 * @returns {Profile | null}
 */
function createProfilingEvent(
  profile_id,
  start_timestamp,
  profile,
  event,
) {
  if (!isValidProfile(profile)) {
    return null;
  }

  return createProfilePayload(profile_id, start_timestamp, profile, event);
}

// TODO (v8): We need to obtain profile ids in @sentry-internal/tracing,
// but we don't have access to this map because importing this map would
// cause a circular dependancy. We need to resolve this in v8.
const PROFILE_MAP = new Map();
/**
 *
 */
function getActiveProfilesCount() {
  return PROFILE_MAP.size;
}

/**
 * Retrieves profile from global cache and removes it.
 */
function takeProfileFromGlobalCache(profile_id) {
  const profile = PROFILE_MAP.get(profile_id);
  if (profile) {
    PROFILE_MAP.delete(profile_id);
  }
  return profile;
}
/**
 * Adds profile to global cache and evicts the oldest profile if the cache is full.
 */
function addProfileToGlobalCache(profile_id, profile) {
  PROFILE_MAP.set(profile_id, profile);

  if (PROFILE_MAP.size > 30) {
    const last = PROFILE_MAP.keys().next().value;
    PROFILE_MAP.delete(last);
  }
}

/* eslint-disable complexity */

/**
 * Wraps startTransaction and stopTransaction with profiling related logic.
 * startProfileForTransaction is called after the call to startTransaction in order to avoid our own code from
 * being profiled. Because of that same reason, stopProfiling is called before the call to stopTransaction.
 */
function startProfileForTransaction(transaction) {
  // Start the profiler and get the profiler instance.
  let startTimestamp;
  if (isAutomatedPageLoadTransaction(transaction)) {
    startTimestamp = timestampInSeconds() * 1000;
  }

  const profiler = startJSSelfProfile();

  // We failed to construct the profiler, fallback to original transaction.
  // No need to log anything as this has already been logged in startProfile.
  if (!profiler) {
    return transaction;
  }

  {
    logger.log(`[Profiling] started profiling transaction: ${spanToJSON(transaction).description}`);
  }

  // We create "unique" transaction names to avoid concurrent transactions with same names
  // from being ignored by the profiler. From here on, only this transaction name should be used when
  // calling the profiler methods. Note: we log the original name to the user to avoid confusion.
  const profileId = uuid4();

  /**
   * Idempotent handler for profile stop
   */
  async function onProfileHandler() {
    // Check if the profile exists and return it the behavior has to be idempotent as users may call transaction.finish multiple times.
    if (!transaction) {
      return null;
    }
    // Satisfy the type checker, but profiler will always be defined here.
    if (!profiler) {
      return null;
    }

    return profiler
      .stop()
      .then((profile) => {
        if (maxDurationTimeoutID) {
          WINDOW.clearTimeout(maxDurationTimeoutID);
          maxDurationTimeoutID = undefined;
        }

        {
          logger.log(`[Profiling] stopped profiling of transaction: ${spanToJSON(transaction).description}`);
        }

        // In case of an overlapping transaction, stopProfiling may return null and silently ignore the overlapping profile.
        if (!profile) {
          {
            logger.log(
              `[Profiling] profiler returned null profile for: ${spanToJSON(transaction).description}`,
              'this may indicate an overlapping transaction or a call to stopProfiling with a profile title that was never started',
            );
          }
          return null;
        }

        addProfileToGlobalCache(profileId, profile);
        return null;
      })
      .catch(error => {
        {
          logger.log('[Profiling] error while stopping profiler:', error);
        }
        return null;
      });
  }

  // Enqueue a timeout to prevent profiles from running over max duration.
  let maxDurationTimeoutID = WINDOW.setTimeout(() => {
    {
      logger.log(
        '[Profiling] max profile duration elapsed, stopping profiling for:',
        spanToJSON(transaction).description,
      );
    }
    // If the timeout exceeds, we want to stop profiling, but not finish the transaction
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    onProfileHandler();
  }, MAX_PROFILE_DURATION_MS);

  // We need to reference the original end call to avoid creating an infinite loop
  const originalEnd = transaction.end.bind(transaction);

  /**
   * Wraps startTransaction and stopTransaction with profiling related logic.
   * startProfiling is called after the call to startTransaction in order to avoid our own code from
   * being profiled. Because of that same reason, stopProfiling is called before the call to stopTransaction.
   */
  function profilingWrappedTransactionEnd() {
    if (!transaction) {
      return originalEnd();
    }
    // onProfileHandler should always return the same profile even if this is called multiple times.
    // Always call onProfileHandler to ensure stopProfiling is called and the timeout is cleared.
    void onProfileHandler().then(
      () => {
        // TODO: Can we rewrite this to use attributes?
        // eslint-disable-next-line deprecation/deprecation
        transaction.setContext('profile', { profile_id: profileId, start_timestamp: startTimestamp });
        originalEnd();
      },
      () => {
        // If onProfileHandler fails, we still want to call the original finish method.
        originalEnd();
      },
    );

    return transaction;
  }

  transaction.end = profilingWrappedTransactionEnd;
  return transaction;
}

const INTEGRATION_NAME = 'BrowserProfiling';

const _browserProfilingIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    // TODO v8: Remove this
    setupOnce() {}, // eslint-disable-line @typescript-eslint/no-empty-function
    setup(client) {
      const scope = getCurrentScope();

      // eslint-disable-next-line deprecation/deprecation
      const transaction = scope.getTransaction();

      if (transaction && isAutomatedPageLoadTransaction(transaction)) {
        if (shouldProfileTransaction(transaction)) {
          startProfileForTransaction(transaction);
        }
      }

      if (typeof client.on !== 'function') {
        logger.warn('[Profiling] Client does not support hooks, profiling will be disabled');
        return;
      }

      client.on('startTransaction', (transaction) => {
        if (shouldProfileTransaction(transaction)) {
          startProfileForTransaction(transaction);
        }
      });

      client.on('beforeEnvelope', (envelope) => {
        // if not profiles are in queue, there is nothing to add to the envelope.
        if (!getActiveProfilesCount()) {
          return;
        }

        const profiledTransactionEvents = findProfiledTransactionsFromEnvelope(envelope);
        if (!profiledTransactionEvents.length) {
          return;
        }

        const profilesToAddToEnvelope = [];

        for (const profiledTransaction of profiledTransactionEvents) {
          const context = profiledTransaction && profiledTransaction.contexts;
          const profile_id = context && context['profile'] && context['profile']['profile_id'];
          const start_timestamp = context && context['profile'] && context['profile']['start_timestamp'];

          if (typeof profile_id !== 'string') {
            DEBUG_BUILD && logger.log('[Profiling] cannot find profile for a transaction without a profile context');
            continue;
          }

          if (!profile_id) {
            DEBUG_BUILD && logger.log('[Profiling] cannot find profile for a transaction without a profile context');
            continue;
          }

          // Remove the profile from the transaction context before sending, relay will take care of the rest.
          if (context && context['profile']) {
            delete context.profile;
          }

          const profile = takeProfileFromGlobalCache(profile_id);
          if (!profile) {
            DEBUG_BUILD && logger.log(`[Profiling] Could not retrieve profile for transaction: ${profile_id}`);
            continue;
          }

          const profileEvent = createProfilingEvent(
            profile_id,
            start_timestamp ,
            profile,
            profiledTransaction ,
          );
          if (profileEvent) {
            profilesToAddToEnvelope.push(profileEvent);
          }
        }

        addProfilesToEnvelope(envelope , profilesToAddToEnvelope);
      });
    },
  };
}) ;

const browserProfilingIntegration = defineIntegration(_browserProfilingIntegration);

/**
 * Browser profiling integration. Stores any event that has contexts["profile"]["profile_id"]
 * This exists because we do not want to await async profiler.stop calls as transaction.finish is called
 * in a synchronous context. Instead, we handle sending the profile async from the promise callback and
 * rely on being able to pull the event from the cache when we need to construct the envelope. This makes the
 * integration less reliable as we might be dropping profiles when the cache is full.
 *
 * @experimental
 * @deprecated Use `browserProfilingIntegration()` instead.
 */
// eslint-disable-next-line deprecation/deprecation
const BrowserProfilingIntegration = convertIntegrationFnToClass(
  INTEGRATION_NAME,
  browserProfilingIntegration,
) ;

// eslint-disable-next-line deprecation/deprecation

exports.BrowserProfilingIntegration = BrowserProfilingIntegration;
exports.browserProfilingIntegration = browserProfilingIntegration;


  // Add this module's exports to the global `Sentry.Integrations`
  __window.Sentry = __window.Sentry || {};
  __window.Sentry.Integrations = __window.Sentry.Integrations || {};
  for (var key in exports) {
    if (Object.prototype.hasOwnProperty.call(exports, key)) {
      __window.Sentry.Integrations[key] = exports[key];
      __window.Sentry[key] = exports[key];
    }
  }
}(window));
//# sourceMappingURL=browserprofiling.js.map
