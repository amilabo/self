// Даты. Логический день начинается в 04:00 по местному времени (PRD §6.1):
// date = локальная_дата(момент − 4 ч). Даты дней — строки YYYY-MM-DD,
// арифметика по ним идёт в UTC, чтобы не зависеть от смены часового пояса.

const pad = (n) => String(n).padStart(2, '0');
const BOUNDARY_MS = 4 * 3600 * 1000;
const DAY_MS = 86400000;

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEKDAYS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const WEEKDAYS_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export function localYmd(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function logicalDate(now = new Date()) {
  return localYmd(new Date(now.getTime() - BOUNDARY_MS));
}

export function logicalDateOfIso(iso) {
  return logicalDate(new Date(iso));
}

// Момент в ISO 8601 с местным смещением: 2026-10-12T21:14:05+03:00
export function isoLocal(d = new Date()) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  return `${localYmd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

function utcOf(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(ymd, n) {
  const t = new Date(utcOf(ymd) + n * DAY_MS);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

// a − b в днях
export function diffDays(a, b) {
  return Math.round((utcOf(a) - utcOf(b)) / DAY_MS);
}

export function dayNumber(date, startDate) {
  return diffDays(date, startDate) + 1;
}

// Начало логического дня (04:00 местного времени) как Date
export function logicalDayStart(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, 4, 0, 0, 0);
}

export function isYmd(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function weekdayLong(ymd) {
  return WEEKDAYS[new Date(utcOf(ymd)).getUTCDay()];
}

export function weekdayShort(ymd) {
  return WEEKDAYS_SHORT[new Date(utcOf(ymd)).getUTCDay()];
}

export function dayMonth(ymd) {
  const [, m, d] = ymd.split('-').map(Number);
  return `${d} ${MONTHS_GEN[m - 1]}`;
}

// «вторник, 29 сентября»
export function weekdayDayMonth(ymd) {
  return `${weekdayLong(ymd).toLowerCase()}, ${dayMonth(ymd)}`;
}

export function timeOfIso(iso) {
  const d = new Date(iso);
  return `${d.getHours()}:${pad(d.getMinutes())}`;
}

export function fileDate(d = new Date()) {
  return localYmd(d);
}

export function fileStamp(d = new Date()) {
  return `${localYmd(d)}T${pad(d.getHours())}${pad(d.getMinutes())}`;
}
