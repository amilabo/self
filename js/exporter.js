// Экспорт и импорт JSON строго по PRD §6.3 и EXPERIMENT.md («Экспорт», «Импорт»).
// Один полный файл — он же бэкап. Импорт — замена с подтверждением, без объединения.

import { EXPORT_FORMAT, SCHEMA_VERSION, QUESTION_SET_VERSION, APP_VERSION, HABITS } from './content.js';
import { fileDate, fileStamp, isYmd, dayMonth } from './dates.js';
import { plural } from './util.js';
import { lastExport } from './rules.js';

const byKey = (k) => (a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0);
const ARRAYS = ['habits', 'habit_marks', 'mornings', 'evenings', 'skip_reports', 'safety_signals', 'test_results', 'exports'];

export function buildExport(snap, nowIso) {
  const last = lastExport(snap);
  return {
    format: EXPORT_FORMAT,
    schema_version: SCHEMA_VERSION,
    question_set_version: QUESTION_SET_VERSION,
    app_version: APP_VERSION,
    exported_at: nowIso,
    previous_export_at: last ? last.at : null,
    experiment: snap.experiment,
    habits: [...snap.habits].sort(byKey('order')),
    habit_marks: [...snap.marks.values()].sort((a, b) => (a.date === b.date ? (a.habit_id < b.habit_id ? -1 : 1) : a.date < b.date ? -1 : 1)),
    mornings: [...snap.mornings.values()].sort(byKey('date')),
    evenings: [...snap.evenings.values()].sort(byKey('date')),
    skip_reports: [...snap.skips.values()].sort(byKey('first_missed_date')),
    safety_signals: [...snap.signals].sort(byKey('at')),
    test_results: [...snap.tests].sort(byKey('taken_at')),
    exports: [...snap.exports].sort(byKey('at'))
  };
}

// Сериализация с самопроверкой: файл читается обратно и сверяется число записей.
// При ошибке экспорт не засчитывается (бросаем исключение).
export function serializeChecked(obj) {
  const text = JSON.stringify(obj, null, 2);
  const back = JSON.parse(text);
  if (back.format !== EXPORT_FORMAT || back.schema_version !== SCHEMA_VERSION) throw new Error('self-check: header');
  for (const k of ARRAYS) {
    if (!Array.isArray(back[k]) || back[k].length !== obj[k].length) throw new Error(`self-check: ${k}`);
  }
  if (!back.experiment || back.experiment.start_date !== obj.experiment.start_date) throw new Error('self-check: experiment');
  return text;
}

export const exportFileName = (d = new Date()) => `self-export-${fileDate(d)}.json`;
// Chrome на Android не даёт делиться файлами .json (нет в списке разрешённых расширений Web Share),
// поэтому для «Поделиться» тот же JSON уходит файлом .txt. Импорт принимает оба.
export const shareFileName = (d = new Date()) => `self-export-${fileDate(d)}.txt`;
export const backupFileName = (d = new Date()) => `self-backup-${fileStamp(d)}.json`;

export function downloadFile(name, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function shareSupported() {
  try {
    const f = new File(['{}'], 'check.txt', { type: 'text/plain' });
    return !!(navigator.canShare && navigator.canShare({ files: [f] }));
  } catch (e) {
    return false;
  }
}

// 'shared' — отправлено; 'cancelled' — пользователь закрыл диалог (экспорт не засчитывается).
export async function shareFile(name, text) {
  const file = new File([text], name, { type: 'text/plain' });
  try {
    await navigator.share({ files: [file], title: name });
    return 'shared';
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled';
    throw e;
  }
}

// --- Импорт ---

// Цепочка миграций v1 → v2 → … Пока версия одна.
function migrate(obj) {
  return obj;
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const VALIDATORS = {
  habits: (x) => typeof x.id === 'string',
  habit_marks: (x) => isYmd(x.date) && typeof x.habit_id === 'string',
  mornings: (x) => isYmd(x.date),
  evenings: (x) => isYmd(x.date),
  skip_reports: (x) => isYmd(x.first_missed_date),
  safety_signals: (x) => typeof x.id === 'string' && isYmd(x.date),
  test_results: (x) => typeof x.id === 'string',
  exports: (x) => typeof x.id === 'string' && typeof x.at === 'string'
};

// Возвращает { data } или { error: 'read' | 'format' | 'newer' | 'broken' }.
export function parseImport(text) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) { return { error: 'read' }; }
  if (!isObj(obj) || obj.format !== EXPORT_FORMAT) return { error: 'format' };
  if (!Number.isInteger(obj.schema_version) || obj.schema_version < 1) return { error: 'broken' };
  if (obj.schema_version > SCHEMA_VERSION) return { error: 'newer' };
  obj = migrate(obj);
  const exp = obj.experiment;
  if (!isObj(exp) || !isYmd(exp.start_date)) return { error: 'broken' };
  if (!Array.isArray(obj.evenings) || !Array.isArray(obj.mornings)) return { error: 'broken' };
  const data = { experiment: exp };
  for (const k of ARRAYS) {
    const arr = obj[k] == null ? [] : obj[k];
    if (!Array.isArray(arr) || !arr.every((x) => isObj(x) && VALIDATORS[k](x))) return { error: 'broken' };
    data[k] = arr;
  }
  if (!data.habits.length) data.habits = HABITS.map((h) => ({ ...h }));
  return { data };
}

function lastDateOf(evenings, mornings) {
  let last = null;
  for (const r of [...evenings, ...mornings]) if (!last || r.date > last) last = r.date;
  return last;
}

export function eveningsLabel(n) {
  return `${n} ${plural(n, ['вечер', 'вечера', 'вечеров'])}`;
}

export function summarize(evenings, mornings) {
  const last = lastDateOf(evenings, mornings);
  return { count: evenings.length, label: eveningsLabel(evenings.length), last: last ? dayMonth(last) : null };
}

// Даты, которые есть только на телефоне и пропадут после замены.
export function onlyOnPhone(snap, data) {
  const fileEv = new Set(data.evenings.map((e) => e.date));
  const fileMo = new Set(data.mornings.map((m) => m.date));
  const dates = new Set();
  for (const d of snap.evenings.keys()) if (!fileEv.has(d)) dates.add(d);
  for (const d of snap.mornings.keys()) if (!fileMo.has(d)) dates.add(d);
  return [...dates].sort();
}
