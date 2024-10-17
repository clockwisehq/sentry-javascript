Object.defineProperty(exports, '__esModule', { value: true });

const core = require('@sentry/core');
const utils = require('@sentry/utils');
const debugBuild = require('../debug-build.js');
const eventbuilder = require('../eventbuilder.js');
const helpers = require('../helpers.js');

/* eslint-disable @typescript-eslint/no-unsafe-member-access */

const INTEGRATION_NAME = 'GlobalHandlers';

const _globalHandlersIntegration = ((options = {}) => {
  const _options = {
    onerror: true,
    onunhandledrejection: true,
    ...options,
  };

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      Error.stackTraceLimit = 50;
    },
    setup(client) {
      if (_options.onerror) {
        _installGlobalOnErrorHandler(client);
        globalHandlerLog('onerror');
      }
      if (_options.onunhandledrejection) {
        _installGlobalOnUnhandledRejectionHandler(client);
        globalHandlerLog('onunhandledrejection');
      }
    },
  };
}) ;

const globalHandlersIntegration = core.defineIntegration(_globalHandlersIntegration);

/**
 * Global handlers.
 * @deprecated Use `globalHandlersIntegration()` instead.
 */
// eslint-disable-next-line deprecation/deprecation
const GlobalHandlers = core.convertIntegrationFnToClass(
  INTEGRATION_NAME,
  globalHandlersIntegration,
)

;

function _installGlobalOnErrorHandler(client) {
  utils.addGlobalErrorInstrumentationHandler(data => {
    const { stackParser, attachStacktrace } = getOptions();

    if (core.getClient() !== client || helpers.shouldIgnoreOnError()) {
      return;
    }

    const { msg, url, line, column, error } = data;

    const event =
      error === undefined && utils.isString(msg)
        ? _eventFromIncompleteOnError(msg, url, line, column)
        : _enhanceEventWithInitialFrame(
            eventbuilder.eventFromUnknownInput(stackParser, error || msg, undefined, attachStacktrace, false),
            url,
            line,
            column,
          );

    event.level = 'error';

    core.captureEvent(event, {
      originalException: error,
      mechanism: {
        handled: false,
        type: 'onerror',
      },
    });
  });
}

function _installGlobalOnUnhandledRejectionHandler(client) {
  utils.addGlobalUnhandledRejectionInstrumentationHandler(e => {
    const { stackParser, attachStacktrace } = getOptions();

    if (core.getClient() !== client || helpers.shouldIgnoreOnError()) {
      return;
    }

    const error = _getUnhandledRejectionError(e );

    const event = utils.isPrimitive(error)
      ? _eventFromRejectionWithPrimitive(error)
      : eventbuilder.eventFromUnknownInput(stackParser, error, undefined, attachStacktrace, true);

    event.level = 'error';

    core.captureEvent(event, {
      originalException: error,
      mechanism: {
        handled: false,
        type: 'onunhandledrejection',
      },
    });
  });
}

function _getUnhandledRejectionError(error) {
  if (utils.isPrimitive(error)) {
    return error;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = error ;

  // dig the object of the rejection out of known event types
  try {
    // PromiseRejectionEvents store the object of the rejection under 'reason'
    // see https://developer.mozilla.org/en-US/docs/Web/API/PromiseRejectionEvent
    if ('reason' in e) {
      return e.reason;
    }

    // something, somewhere, (likely a browser extension) effectively casts PromiseRejectionEvents
    // to CustomEvents, moving the `promise` and `reason` attributes of the PRE into
    // the CustomEvent's `detail` attribute, since they're not part of CustomEvent's spec
    // see https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent and
    // https://github.com/getsentry/sentry-javascript/issues/2380
    else if ('detail' in e && 'reason' in e.detail) {
      return e.detail.reason;
    }
  } catch (e2) {} // eslint-disable-line no-empty

  return error;
}

/**
 * Create an event from a promise rejection where the `reason` is a primitive.
 *
 * @param reason: The `reason` property of the promise rejection
 * @returns An Event object with an appropriate `exception` value
 */
function _eventFromRejectionWithPrimitive(reason) {
  return {
    exception: {
      values: [
        {
          type: 'UnhandledRejection',
          // String() is needed because the Primitive type includes symbols (which can't be automatically stringified)
          value: `Non-Error promise rejection captured with value: ${String(reason)}`,
        },
      ],
    },
  };
}

/**
 * This function creates a stack from an old, error-less onerror handler.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _eventFromIncompleteOnError(msg, url, line, column) {
  const ERROR_TYPES_RE =
    /^(?:[Uu]ncaught (?:exception: )?)?(?:((?:Eval|Internal|Range|Reference|Syntax|Type|URI|)Error): )?(.*)$/i;

  // If 'message' is ErrorEvent, get real message from inside
  let message = utils.isErrorEvent(msg) ? msg.message : msg;
  let name = 'Error';

  const groups = message.match(ERROR_TYPES_RE);
  if (groups) {
    name = groups[1];
    message = groups[2];
  }

  const event = {
    exception: {
      values: [
        {
          type: name,
          value: message,
        },
      ],
    },
  };

  return _enhanceEventWithInitialFrame(event, url, line, column);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _enhanceEventWithInitialFrame(event, url, line, column) {
  // event.exception
  const e = (event.exception = event.exception || {});
  // event.exception.values
  const ev = (e.values = e.values || []);
  // event.exception.values[0]
  const ev0 = (ev[0] = ev[0] || {});
  // event.exception.values[0].stacktrace
  const ev0s = (ev0.stacktrace = ev0.stacktrace || {});
  // event.exception.values[0].stacktrace.frames
  const ev0sf = (ev0s.frames = ev0s.frames || []);

  const colno = isNaN(parseInt(column, 10)) ? undefined : column;
  const lineno = isNaN(parseInt(line, 10)) ? undefined : line;
  const filename = utils.isString(url) && url.length > 0 ? url : utils.getLocationHref();

  // event.exception.values[0].stacktrace.frames
  if (ev0sf.length === 0) {
    ev0sf.push({
      colno,
      filename,
      function: '?',
      in_app: true,
      lineno,
    });
  }

  return event;
}

function globalHandlerLog(type) {
  debugBuild.DEBUG_BUILD && utils.logger.log(`Global Handler attached: ${type}`);
}

function getOptions() {
  const client = core.getClient();
  const options = (client && client.getOptions()) || {
    stackParser: () => [],
    attachStacktrace: false,
  };
  return options;
}

exports.GlobalHandlers = GlobalHandlers;
exports.globalHandlersIntegration = globalHandlersIntegration;
//# sourceMappingURL=globalhandlers.js.map
