// IndexedDB: одно хранилище на сущность PRD §6.2, `ui` для состояния интерфейса и `private_tests`
// для загруженного текста теста Эллиса (оба не экспортируются, импорт их не трогает). Если IndexedDB недоступна (например, страница открыта в песочнице),
// работает запасной вариант в памяти — форма об этом предупреждает.

const DB_NAME = 'self-form';
const DB_VERSION = 2; // v2: + private_tests

// keyPath хранилищ. null — ключ передаётся отдельно (experiment — 'main', ui — имя настройки).
const STORE_KEYS = {
  experiment: null,
  habits: 'id',
  habit_marks: ['date', 'habit_id'],
  mornings: 'date',
  evenings: 'date',
  skip_reports: 'first_missed_date',
  safety_signals: 'id',
  test_results: 'id',
  exports: 'id',
  ui: null,
  private_tests: null // ключ — test_id ('ellis')
};

export const DATA_STORES = ['experiment', 'habits', 'habit_marks', 'mornings', 'evenings', 'skip_reports', 'safety_signals', 'test_results', 'exports'];

function reqP(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
  });
}

// onBlocked — форма открыта в другой вкладке со старой версией базы: ждём, пока её закроют,
// и показываем об этом сообщение (иначе пришлось бы работать в памяти и терять записи).
function openIdb(onBlocked) {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in self)) { reject(new Error('no indexedDB')); return; }
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, keyPath] of Object.entries(STORE_KEYS)) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, keyPath ? { keyPath } : undefined);
        }
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Новая версия формы в другой вкладке просит обновить базу — закрываем соединение, чтобы не мешать.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => { if (onBlocked) onBlocked(); };
  });
}

function idbAdapter(db) {
  return {
    memory: false,
    async getAll(store) {
      return reqP(db.transaction(store, 'readonly').objectStore(store).getAll());
    },
    async getEntries(store) {
      const tx = db.transaction(store, 'readonly');
      const os = tx.objectStore(store);
      const [keys, values] = await Promise.all([reqP(os.getAllKeys()), reqP(os.getAll())]);
      return keys.map((k, i) => [k, values[i]]);
    },
    async put(store, value, key) {
      const tx = db.transaction(store, 'readwrite');
      const os = tx.objectStore(store);
      if (STORE_KEYS[store]) os.put(value); else os.put(value, key);
      return txDone(tx);
    },
    async delete(store, key) {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      return txDone(tx);
    },
    // Замена всех данных одной транзакцией: либо всё, либо ничего (EXPERIMENT.md, «Импорт»).
    async replaceData(data) {
      const tx = db.transaction(DATA_STORES, 'readwrite');
      for (const name of DATA_STORES) {
        const os = tx.objectStore(name);
        os.clear();
        if (name === 'experiment') {
          if (data.experiment) os.put(data.experiment, 'main');
        } else {
          for (const item of data[name] || []) os.put(item);
        }
      }
      return txDone(tx);
    }
  };
}

function keyOf(store, value, key) {
  const kp = STORE_KEYS[store];
  if (!kp) return String(key);
  if (Array.isArray(kp)) return kp.map((k) => value[k]).join('|');
  return String(value[kp]);
}

function memoryAdapter() {
  const mem = Object.fromEntries(Object.keys(STORE_KEYS).map((n) => [n, new Map()]));
  const clone = (v) => JSON.parse(JSON.stringify(v));
  return {
    memory: true,
    async getAll(store) { return [...mem[store].values()].map(clone); },
    async getEntries(store) { return [...mem[store].entries()].map(([k, v]) => [k, clone(v)]); },
    async put(store, value, key) { mem[store].set(keyOf(store, value, key), clone(value)); },
    async delete(store, key) { mem[store].delete(Array.isArray(key) ? key.join('|') : String(key)); },
    async replaceData(data) {
      for (const name of DATA_STORES) mem[name].clear();
      if (data.experiment) mem.experiment.set('main', clone(data.experiment));
      for (const name of DATA_STORES) {
        if (name === 'experiment') continue;
        for (const item of data[name] || []) mem[name].set(keyOf(name, item), clone(item));
      }
    }
  };
}

export async function openDb({ onBlocked } = {}) {
  try {
    const db = await openIdb(onBlocked);
    return idbAdapter(db);
  } catch (e) {
    console.warn('IndexedDB недоступна, данные только в памяти', e);
    return memoryAdapter();
  }
}
