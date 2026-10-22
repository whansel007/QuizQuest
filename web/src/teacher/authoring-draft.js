// Large extracted text belongs in IndexedDB, not size-limited localStorage.
function open() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('quizquest-authoring', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('drafts');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function draftStore(key, value) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', value === undefined ? 'readonly' : 'readwrite');
      const r = value === undefined ? tx.objectStore('drafts').get(key) : tx.objectStore('drafts').put(value, key);
      tx.oncomplete = () => resolve(r.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
