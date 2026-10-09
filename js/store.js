// Слой данных: снимок всех записей в памяти (их мало — 21 день) и запись изменений в IndexedDB.
// Экраны читают S и меняют записи только через функции этого модуля.

import { openDb } from './db.js';
import { HABITS } from './content.js';
import { isoLocal } from './dates.js';

export const S = {
  memoryOnly: false,
  writeError: false,
  experiment: null,
  habits: [],
  marks: new Map(),      // `${date}|${habit_id}` → habit_mark
  mornings: new Map(),   // date → morning
  evenings: new Map(),   // date → evening
  skips: new Map(),      // first_missed_date → skip_report
  signals: [],
  tests: [],
  exports: [],
  ui: {},                // состояние интерфейса, в экспорт не попадает
  privateTests: {}       // test_id → загруженный текст теста (Эллис); не экспортируется, импорт не трогает
};

let db = null;
const pending = new Map();
const DEBOUNCE_MS = 400;

export const markKey = (date, habitId) => `${date}|${habitId}`;

function write(store, value, key) {
  return db.put(store, value, key).catch((e) => {
    S.writeError = true;
    console.error('Ошибка записи', store, e);
  });
}

function schedule(id, store, value, key, debounce) {
  const prev = pending.get(id);
  if (prev) clearTimeout(prev.timer);
  if (!debounce) {
    pending.delete(id);
    return write(store, value, key);
  }
  const timer = setTimeout(() => { pending.delete(id); write(store, value, key); }, DEBOUNCE_MS);
  pending.set(id, { timer, store, value, key });
  return Promise.resolve();
}

export function flushPending() {
  const jobs = [];
  for (const [id, p] of pending) {
    clearTimeout(p.timer);
    pending.delete(id);
    jobs.push(write(p.store, p.value, p.key));
  }
  return Promise.all(jobs);
}

async function readAll() {
  const [exp, habits, marks, mornings, evenings, skips, signals, tests, exports, ui, priv] = await Promise.all([
    db.getAll('experiment'), db.getAll('habits'), db.getAll('habit_marks'), db.getAll('mornings'),
    db.getAll('evenings'), db.getAll('skip_reports'), db.getAll('safety_signals'), db.getAll('test_results'),
    db.getAll('exports'), db.getEntries('ui'), db.getEntries('private_tests')
  ]);
  S.experiment = exp[0] || null;
  S.habits = habits.sort((a, b) => a.order - b.order);
  S.marks = new Map(marks.map((m) => [markKey(m.date, m.habit_id), m]));
  S.mornings = new Map(mornings.map((m) => [m.date, m]));
  S.evenings = new Map(evenings.map((e) => [e.date, e]));
  S.skips = new Map(skips.map((r) => [r.first_missed_date, r]));
  S.signals = signals;
  S.tests = tests;
  S.exports = exports.sort((a, b) => (a.at < b.at ? -1 : 1));
  S.ui = Object.fromEntries(ui);
  S.privateTests = Object.fromEntries(priv);
}

export async function loadAll({ onBlocked } = {}) {
  db = await openDb({ onBlocked });
  S.memoryOnly = db.memory;
  await readAll();
}

// Есть ли утренние или вечерние записи (от них зависит, можно ли менять дату старта).
export function hasUserData() {
  return S.mornings.size > 0 || S.evenings.size > 0;
}

// Есть ли что терять при замене или удалении: записи дня или результаты тестов (нужен бэкап).
export function hasAnyRecords() {
  return hasUserData() || S.tests.length > 0;
}

export function saveExperiment(exp) {
  S.experiment = exp;
  return write('experiment', exp, 'main');
}

// Справочник привычек сверяется с content.js при каждом запуске: новые добавляются,
// изменённые (название, планка, порядок, архив) обновляются. Отметки не трогаются.
const HABIT_KEYS = ['name', 'threshold', 'mark_mode', 'order', 'archived'];
export function ensureHabits() {
  const byId = new Map(S.habits.map((h) => [h.id, h]));
  for (const h of HABITS) {
    const old = byId.get(h.id);
    if (old && HABIT_KEYS.every((k) => old[k] === h[k])) continue;
    const rec = { ...(old || {}), ...h };
    byId.set(h.id, rec);
    write('habits', rec);
  }
  S.habits = [...byId.values()].sort((a, b) => a.order - b.order);
}

export function saveMorning(m, { debounce = false } = {}) {
  m.updated_at = isoLocal();
  S.mornings.set(m.date, m);
  return schedule(`m|${m.date}`, 'mornings', m, undefined, debounce);
}

export function saveEvening(ev, { debounce = false, touch = true } = {}) {
  if (touch) ev.updated_at = isoLocal();
  S.evenings.set(ev.date, ev);
  return schedule(`e|${ev.date}`, 'evenings', ev, undefined, debounce);
}

export function putMark(date, habitId, done, source) {
  const k = markKey(date, habitId);
  const old = S.marks.get(k);
  if (old && old.done === done && old.source === source) return Promise.resolve();
  const rec = { date, habit_id: habitId, done, source, updated_at: isoLocal() };
  S.marks.set(k, rec);
  return write('habit_marks', rec);
}

export function putSkip(rec, { debounce = false } = {}) {
  rec.updated_at = isoLocal();
  S.skips.set(rec.first_missed_date, rec);
  return schedule(`s|${rec.first_missed_date}`, 'skip_reports', rec, undefined, debounce);
}

export function putSignal(rec) {
  const i = S.signals.findIndex((s) => s.id === rec.id);
  if (i >= 0) S.signals[i] = rec; else S.signals.push(rec);
  return write('safety_signals', rec);
}

export function addExport(rec) {
  S.exports.push(rec);
  return write('exports', rec);
}

export function setUi(key, value) {
  S.ui[key] = value;
  return write('ui', value, key);
}

export function clearUi(key) {
  delete S.ui[key];
  return db.delete('ui', key).catch((e) => { S.writeError = true; console.error('Ошибка записи', 'ui', e); });
}

export function putTestResult(rec) {
  const i = S.tests.findIndex((t) => t.id === rec.id);
  if (i >= 0) S.tests[i] = rec; else S.tests.push(rec);
  return write('test_results', rec);
}

// Текст приватного теста хранится отдельно от данных: не входит в экспорт, импорт его не трогает.
// Ошибку записи пробрасываем: экран покажет, что файл не сохранился.
export async function savePrivateTest(test) {
  await db.put('private_tests', test, test.test_id);
  S.privateTests[test.test_id] = test;
}

// Импорт: замена всех данных одной транзакцией, затем перечитываем снимок.
export async function replaceAllData(data) {
  await flushPending();
  await db.replaceData(data);
  await readAll();
  ensureHabits();
}

// «Удалить все данные»: очищает все хранилища данных, состояние интерфейса
// (кроме отметки о защищённом хранилище) и загруженный текст теста Эллиса, затем перечитывает пустой снимок.
export async function wipeAllData() {
  await flushPending();
  await db.replaceData({ experiment: null });
  for (const key of Object.keys(S.ui)) {
    if (key !== 'persisted') await db.delete('ui', key);
  }
  for (const key of Object.keys(S.privateTests)) await db.delete('private_tests', key);
  await readAll();
}
