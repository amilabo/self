// Правила формы поверх модели данных (EXPERIMENT.md, «Технический контракт»).
// Чистые функции: принимают снимок данных (как S из store.js) и логическую дату,
// ничего не пишут. Поэтому их можно проверять автотестами (tests/rules.test.mjs).

import { addDays, diffDays, dayNumber, logicalDayStart, logicalDateOfIso, weekdayShort } from './dates.js';
import { EXPERIMENT_LENGTH, GOOD_LOW_MOOD_MAX, QUESTION_SET_VERSION } from './content.js';

// H1: вечер засчитан, если круг завершён или в нём было окно «Кризис».
export function isCounted(ev) {
  return !!ev && (ev.completed_at != null || ev.crisis === true);
}

export function phaseOf(day) {
  if (day <= 0) return 'prep';
  if (day > EXPERIMENT_LENGTH) return 'after';
  return 'active';
}

const nonEmpty = (s) => typeof s === 'string' && s.trim() !== '';

// «Вчера наметила»: из вечера D−1, только если он засчитан и действие не пустое.
// forEvening = true — для вопроса «Сделала?»: после вечера с «Кризисом» не показывается.
export function prevAction(snap, date, { forEvening }) {
  const start = snap.experiment && snap.experiment.start_date;
  const prev = addDays(date, -1);
  if (!start || prev < start) return null;
  const ev = snap.evenings.get(prev);
  if (!isCounted(ev) || !nonEmpty(ev.action_tomorrow)) return null;
  if (forEvening && ev.crisis) return null;
  return ev.action_tomorrow.trim();
}

// Вопрос о пропуске в круге за дату D. null — вопроса нет.
export function skipInfo(snap, date) {
  const start = snap.experiment && snap.experiment.start_date;
  if (!start) return null;
  const prev = addDays(date, -1);
  if (prev < start || isCounted(snap.evenings.get(prev))) return null;
  let n = 0;
  let d = prev;
  while (d >= start && !isCounted(snap.evenings.get(d))) { n += 1; d = addDays(d, -1); }
  const first = addDays(date, -n);
  const before = addDays(first, -1);
  const beforeEv = before >= start ? snap.evenings.get(before) : null;
  return { first_missed_date: first, missed_days: n, afterCrisis: !!(beforeEv && beforeEv.crisis) };
}

// Вариант формулировки «хорошего за день».
export function goodVariant(day, mood) {
  if (mood != null && mood <= GOOD_LOW_MOOD_MAX) return 'helped';
  return day % 2 === 1 ? 'good' : 'grateful';
}

export function abcStarted(abc) {
  if (!abc) return false;
  return ['a_event', 'c_behavior', 'b_belief', 'd_evidence', 'd_usefulness', 'd_friend', 'e_belief'].some((k) => nonEmpty(abc[k]))
    || (abc.c_emotions || []).length > 0;
}

// abc_done — заполнено хотя бы одно из: A, эмоции C, «что я сделала», B.
export function abcDone(abc) {
  if (!abc) return false;
  return nonEmpty(abc.a_event) || (abc.c_emotions || []).length > 0 || nonEmpty(abc.c_behavior) || nonEmpty(abc.b_belief);
}

// de_done — заполнено хотя бы одно из трёх полей D или поле E.
export function deDone(abc) {
  if (!abc) return false;
  return ['d_evidence', 'd_usefulness', 'd_friend', 'e_belief'].some((k) => nonEmpty(abc[k]));
}

export function emptyAbc() {
  return { a_event: null, c_emotions: [], c_behavior: null, b_belief: null, d_evidence: null, d_usefulness: null, d_friend: null, e_belief: null };
}

export function newEvening(date, nowIso) {
  return {
    date,
    question_set_version: QUESTION_SET_VERSION,
    started_at: nowIso,
    completed_at: null,
    updated_at: nowIso,
    filled_later: false,
    crisis: false,
    mood: null,
    intention_result: null,
    prev_action: null,
    abc: null,
    abc_done: false,
    de_done: false,
    good: null,
    action_tomorrow: null,
    journal: null,
    friction: null,
    now_vs_start: null,
    timing: { step1_ms: 0, step2_ms: 0, step3_ms: 0, active_ms: 0, journal_ms: 0 }
  };
}

// filled_later: круг завершён позже конца логического дня (date + 1, 04:00).
export function isFilledLater(date, completedIso) {
  return new Date(completedIso).getTime() > logicalDayStart(addDays(date, 1)).getTime();
}

export function lastExport(snap) {
  return snap.exports.length ? snap.exports[snap.exports.length - 1] : null;
}

// Недельное напоминание: due — наибольший из 7, 14, 21, не больше d. Карточка нужна, если
// последний экспорт был раньше начала дня due − 1 (допуск: экспорт накануне засчитывается).
export function exportDue(snap, day) {
  const due = [21, 14, 7].find((n) => n <= day);
  if (!due || !snap.experiment) return false;
  const last = lastExport(snap);
  if (!last) return true;
  const dueMinus1 = addDays(snap.experiment.start_date, due - 2);
  return logicalDateOfIso(last.at) < dueMinus1;
}

// Неделя эксперимента (дни 1–7, 8–14, 15–21) для экрана «Сегодня».
export function weekView(snap, today) {
  const start = snap.experiment.start_date;
  const day = dayNumber(today, start);
  const weekNo = Math.min(3, Math.floor((day - 1) / 7) + 1);
  const fromDay = (weekNo - 1) * 7 + 1;
  const dots = [];
  let count = 0;
  for (let i = 0; i < 7; i++) {
    const date = addDays(start, fromDay - 1 + i);
    const counted = isCounted(snap.evenings.get(date));
    if (counted) count += 1;
    let state;
    if (date < today) state = counted ? 'done' : 'miss';
    else if (date === today) state = counted ? 'done' : 'today';
    else state = 'future';
    dots.push({ date, label: weekdayShort(date), state, isToday: date === today });
  }
  return { weekNo, fromDay, toDay: fromDay + 6, count, dots };
}

// Засчитанные вечера дней 1–21 (для итоговой карточки).
export function countedInExperiment(snap) {
  const start = snap.experiment.start_date;
  let n = 0;
  for (const ev of snap.evenings.values()) {
    const d = dayNumber(ev.date, start);
    if (d >= 1 && d <= EXPERIMENT_LENGTH && isCounted(ev)) n += 1;
  }
  return n;
}

export function daysSince(fromIsoDate, toDate) {
  return diffDays(toDate, fromIsoDate);
}
