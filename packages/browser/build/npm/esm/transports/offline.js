import { makeOfflineTransport } from '@sentry/core';
import { serializeEnvelope, parseEnvelope } from '@sentry/utils';

// 'Store', 'promisifyRequest' and 'createStore' were originally copied from the 'idb-keyval' package before being
// modified and simplified: https://github.com/jakearchibald/idb-keyval
//
// At commit: 0420a704fd6cbb4225429c536b1f61112d012fca
// Original licence:

// Copyright 2016, Jake Archibald
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    // @ts-expect-error - file size hacks
    request.oncomplete = request.onsuccess = () => resolve(request.result);
    // @ts-expect-error - file size hacks
    request.onabort = request.onerror = () => reject(request.error);
  });
}

/** Create or open an IndexedDb store */
function createStore(dbName, storeName) {
  const request = indexedDB.open(dbName);
  request.onupgradeneeded = () => request.result.createObjectStore(storeName);
  const dbp = promisifyRequest(request);

  return callback => dbp.then(db => callback(db.transaction(storeName, 'readwrite').objectStore(storeName)));
}

function keys(store) {
  return promisifyRequest(store.getAllKeys() );
}

/** Insert into the store */
function insert(store, value, maxQueueSize) {
  return store(store => {
    return keys(store).then(keys => {
      if (keys.length >= maxQueueSize) {
        return;
      }

      // We insert with an incremented key so that the entries are popped in order
      store.put(value, Math.max(...keys, 0) + 1);
      return promisifyRequest(store.transaction);
    });
  });
}

/** Pop the oldest value from the store */
function pop(store) {
  return store(store => {
    return keys(store).then(keys => {
      if (keys.length === 0) {
        return undefined;
      }

      return promisifyRequest(store.get(keys[0])).then(value => {
        store.delete(keys[0]);
        return promisifyRequest(store.transaction).then(() => value);
      });
    });
  });
}

function createIndexedDbStore(options) {
  let store;

  // Lazily create the store only when it's needed
  function getStore() {
    if (store == undefined) {
      store = createStore(options.dbName || 'sentry-offline', options.storeName || 'queue');
    }

    return store;
  }

  return {
    insert: async (env) => {
      try {
        const serialized = await serializeEnvelope(env, options.textEncoder);
        await insert(getStore(), serialized, options.maxQueueSize || 30);
      } catch (_) {
        //
      }
    },
    pop: async () => {
      try {
        const deserialized = await pop(getStore());
        if (deserialized) {
          return parseEnvelope(
            deserialized,
            options.textEncoder || new TextEncoder(),
            options.textDecoder || new TextDecoder(),
          );
        }
      } catch (_) {
        //
      }

      return undefined;
    },
  };
}

function makeIndexedDbOfflineTransport(
  createTransport,
) {
  return options => createTransport({ ...options, createStore: createIndexedDbStore });
}

/**
 * Creates a transport that uses IndexedDb to store events when offline.
 */
function makeBrowserOfflineTransport(
  createTransport,
) {
  return makeIndexedDbOfflineTransport(makeOfflineTransport(createTransport));
}

export { createStore, insert, makeBrowserOfflineTransport, pop };
//# sourceMappingURL=offline.js.map
