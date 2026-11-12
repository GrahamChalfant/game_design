// Keeps the slow part of laying out the world (placing the forest's trees) in the browser, so
// after the first start it's read back instead of worked out again. The map comes from a fixed
// seed, so it's the same every time; what's kept says what it was made from (a key: see
// world.js), and if any of that has changed (the land, the settings, the placing code) it's
// worked out afresh and kept again. Uses IndexedDB; anywhere that has none (or it fails), the
// world is simply laid out each time.
const DB = 'northern-survival';
const STORE = 'world';
const KEY = 'trees';

function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// What was kept last time ({ key, ... }), or null.
export async function loadTreeCache() {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const request = db.transaction(STORE).objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

// Keeps `cache` for next time (quietly does nothing if it can't).
export async function saveTreeCache(cache) {
  try {
    const db = await open();
    db.transaction(STORE, 'readwrite').objectStore(STORE).put(cache, KEY);
  } catch {
    // (No storage: it'll be worked out again next time.)
  }
}

// A short hash of a list of numbers and strings (FNV-1a over their bytes).
export function hashOf(values) {
  let h = 2166136261;
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  for (const v of values) {
    if (typeof v === 'number') {
      view.setFloat64(0, v);
      for (const b of bytes) h = Math.imul(h ^ b, 16777619) >>> 0;
    } else {
      const text = String(v);
      for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
    }
  }
  return h.toString(16);
}
