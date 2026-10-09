// Правила формы поверх модели данных (EXPERIMENT.md, «Технический контракт»).
// Чистые функции: принимают снимок данных (как S из store.js) и логическую дату,
// ничего не пишут. Поэтому их можно проверять автотестами (tests/rules.test.mjs).

import { addDays, diffDays, dayNumber, logicalDayStart, logicalDateOfIso, weekdayShort } from './dates.js';
import { EXPERIMENT_LENGTH, GOOD_LOW_MOOD_MAX, QUESTION_SET_VERSION, OTHER } from './content.js';

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
    edited_at: null,
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

// --- Завершение и правка круга ---

// Завершённый круг можно изменить, пока идёт его логический день (до 04:00 следующих суток).
export function canEditEvening(ev, today) {
  return !!ev && ev.completed_at != null && ev.date === today;
}

// «Завершить круг»: первое завершение ставит completed_at и filled_later, повторное (после правки)
// их не трогает — H1, filled_later и замер H3 считаются от первого завершения.
// Производные флаги пересчитываются каждый раз. morning — утренняя запись того же дня или null.
export function finishEvening(ev, { nowIso, morning }) {
  const first = ev.completed_at == null;
  if (first) {
    ev.completed_at = nowIso;
    ev.filled_later = isFilledLater(ev.date, nowIso);
  }
  if (!(morning && morning.intention)) ev.intention_result = null;
  if (ev.abc) {
    if (!nonEmpty(ev.abc.e_belief)) ev.abc.c_emotions.forEach((e) => { e.after = null; });
    ev.abc_done = abcDone(ev.abc);
    ev.de_done = deDone(ev.abc);
  } else {
    ev.abc_done = false;
    ev.de_done = false;
  }
  if (ev.crisis) { ev.friction = null; ev.now_vs_start = null; }
  return { first };
}

// Отпечаток содержания вечера без служебных отметок времени и замера: по нему видно,
// изменилось ли что-то в завершённом круге.
export function eveningPrint(ev) {
  const { updated_at, edited_at, timing, ...rest } = ev;
  return JSON.stringify(rest);
}

// Отметки времени при сохранении вечера. prevPrint — отпечаток при прошлом сохранении
// завершённого вечера (undefined — вечер ещё не сохранялся завершённым). Возвращает новый отпечаток.
// Черновик: updated_at при каждом сохранении. Первое завершение: только updated_at.
// Правка после завершения: updated_at и edited_at, но только если содержание изменилось.
export function stampEvening(ev, prevPrint, nowIso) {
  if (ev.completed_at == null) { ev.updated_at = nowIso; return undefined; }
  const p = eveningPrint(ev);
  if (prevPrint === undefined) { ev.updated_at = nowIso; return p; }
  if (p !== prevPrint) { ev.updated_at = nowIso; ev.edited_at = nowIso; }
  return p;
}

// Снимок обязательных ответов завершённого круга перед правкой.
export function editBase(ev) {
  const other = ev.abc && (ev.abc.c_emotions || []).find((e) => e.name === OTHER);
  return {
    date: ev.date,
    friction: ev.friction ? { reasons: [...ev.friction.reasons], other_text: ev.friction.other_text } : null,
    emotion_other_text: other ? other.other_text : null
  };
}

// Из правки вышли, не нажав «Завершить круг» (правки уже записаны): обязательные ответы
// завершённого круга не должны пропасть. «Что мешало» без ответа — возвращается прежний ответ;
// «другое» в эмоциях без уточнения — прежнее уточнение, а если его не было, «другое» снимается.
// В вечер с «Кризисом» обязательных полей нет. Возвращает true, если что-то восстановлено.
export function restoreRequired(ev, base) {
  if (!ev || ev.completed_at == null || ev.crisis) return false;
  let fixed = false;
  const f = ev.friction;
  const frictionBad = !f || !f.reasons.length || (f.reasons.includes(OTHER) && !nonEmpty(f.other_text));
  if (frictionBad && base && base.friction) {
    ev.friction = { reasons: [...base.friction.reasons], other_text: base.friction.other_text };
    fixed = true;
  }
  const emo = ev.abc && ev.abc.c_emotions;
  const other = emo && emo.find((e) => e.name === OTHER);
  if (other && !nonEmpty(other.other_text)) {
    if (base && nonEmpty(base.emotion_other_text)) other.other_text = base.emotion_other_text;
    else ev.abc.c_emotions = emo.filter((e) => e !== other);
    ev.abc_done = abcDone(ev.abc);
    fixed = true;
  }
  return fixed;
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
