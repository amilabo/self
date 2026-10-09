// Протокол безопасности в форме (CONTENT.md, «Безопасность»; PRD §6.2, safety_signals).
// Локальная проверка ключевых слов и правила частоты карточек. Чистые функции:
// возвращают записи журнала для сохранения и то, что показать. Совпавшие слова
// и фрагменты текста не сохраняются — только имя поля и список.

import { KEYWORDS, SIGNAL_RULES as R } from './content.js';
import { addDays, diffDays } from './dates.js';

export function normalize(text) {
  return String(text || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
}

const CRISIS_ROOTS = KEYWORDS.crisis.map(normalize);
const HOPE_ROOTS = KEYWORDS.hopelessness.map(normalize);

export function scanText(text) {
  const n = normalize(text);
  return { crisis: CRISIS_ROOTS.some((k) => n.includes(k)), hopelessness: HOPE_ROOTS.some((k) => n.includes(k)) };
}

// Короткий отпечаток текста: по нему понимаем, изменилось ли поле с прошлого показа окна.
// Сам текст второй раз не храним.
export function hashText(text) {
  let h = 0x811c9dc5;
  const s = normalize(text).trim();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

const txt = (v) => (typeof v === 'string' ? v : '');

// Текстовые поля шага, которые проверяются при его сохранении.
export function eveningFields(ev, step, skipRec) {
  const f = [];
  if (step === 1 && skipRec && skipRec.shown) f.push({ field: 'skip_reports.other_text', text: txt(skipRec.other_text) });
  if (step === 2 && ev.abc) f.push(...abcFields(ev.abc));
  if (step === 3) {
    f.push({ field: 'good.text', text: txt(ev.good && ev.good.text) });
    f.push({ field: 'action_tomorrow', text: txt(ev.action_tomorrow) });
    f.push({ field: 'journal', text: txt(ev.journal) });
    f.push({ field: 'friction.other_text', text: txt(ev.friction && ev.friction.other_text) });
  }
  return f.filter((x) => x.text.trim() !== '');
}

export function abcFields(abc) {
  const other = (abc.c_emotions || []).map((e) => txt(e.other_text)).join(' ');
  return [
    { field: 'abc.a_event', text: txt(abc.a_event) },
    { field: 'abc.c_emotions.other_text', text: other },
    { field: 'abc.c_behavior', text: txt(abc.c_behavior) },
    { field: 'abc.b_belief', text: txt(abc.b_belief) },
    { field: 'abc.e_belief', text: txt(abc.e_belief) }
  ].filter((x) => x.text.trim() !== '');
}

const sameTriggers = (a, b) => a.length === b.length && a.every((t, i) => t === b[i]);

function findRecord(signals, date, level, triggers, field) {
  return signals.find((s) => s.date === date && s.level === level && sameTriggers(s.triggers, triggers) && (s.field || null) === (field || null));
}

function lastShown(signals, before, pred) {
  let best = null;
  for (const s of signals) {
    if (s.shown && s.date < before && pred(s) && (!best || s.date > best.date || (s.date === best.date && s.at > best.at))) best = s;
  }
  return best;
}

function makeRecord(existing, base, nowIso, makeId) {
  return { ...(existing || { id: makeId() }), ...base, at: nowIso };
}

// --- Сигналы по настроению, ресурсу и эмоциям ---

function moodAtMost(snap, date, max) {
  const e = snap.evenings.get(date);
  return !!e && e.mood != null && e.mood <= max;
}

function resourceAtMost(snap, date, max) {
  const m = snap.mornings.get(date);
  return !!m && m.resource != null && m.resource <= max;
}

const last3 = (date) => [date, addDays(date, -1), addDays(date, -2)];

export function highMoodActive(snap, date) {
  return last3(date).every((d) => moodAtMost(snap, d, R.highMoodMax));
}

export function attentionMoodActive(snap, date) {
  if (last3(date).every((d) => moodAtMost(snap, d, R.attentionMoodMax))) return true;
  let n = 0;
  for (let i = 0; i < 7; i++) if (moodAtMost(snap, addDays(date, -i), R.attentionMoodMax)) n += 1;
  return n >= R.attentionMoodOf7;
}

export function attentionResourceActive(snap, date) {
  return last3(date).every((d) => resourceAtMost(snap, d, R.attentionResourceMax));
}

export function emotionTrigger(ev) {
  const found = [];
  for (const name of R.emotionNames) {
    const e = ev.abc && (ev.abc.c_emotions || []).find((x) => x.name === name);
    if (!e) continue;
    const strong = (e.before != null && e.before >= R.attentionEmotionMin) || (e.after != null && e.after >= R.attentionEmotionMin);
    const unrated = e.before == null && R.emotionWithoutRating.includes(name);
    if (strong || unrated) found.push(name);
  }
  return found;
}

// --- Решение при сохранении шага: «Кризис» и «Высокий» ---
// opts: date, fields, checkMood (шаг 1), crisisEvening (в этот вечер уже был «Кризис»),
// deleted (проверка черновика перед «Удалить и дальше»), shownHashes, nowIso, makeId.
export function decideStepSignals(snap, opts) {
  const { date, fields, checkMood, crisisEvening, deleted, nowIso, makeId } = opts;
  const shownHashes = opts.shownHashes || {};
  const upserts = [];
  const newHashes = {};
  let showCrisis = false;
  let showWords = false;
  let showMood = false;

  const hits = fields.map((f) => ({ ...f, ...scanText(f.text), hash: hashText(f.text) }));

  for (const h of hits.filter((x) => x.crisis)) {
    const key = `crisis|${h.field}`;
    const existing = findRecord(snap.signals, date, 'crisis', ['keywords'], h.field);
    // «Кризис» показывается каждый раз, но не повторяется для того же, неизменённого текста:
    // иначе окно не выпускало бы дальше по кругу.
    if (existing && existing.shown && shownHashes[key] === h.hash && !deleted) continue;
    upserts.push(makeRecord(existing, { date, level: 'crisis', triggers: ['keywords'], shown: true, variant: null, field: h.field, list: 'crisis' }, nowIso, makeId));
    newHashes[key] = h.hash;
    showCrisis = true;
  }
  const crisisNow = crisisEvening || showCrisis;

  for (const h of hits.filter((x) => x.hopelessness)) {
    const key = `high|${h.field}`;
    const existing = findRecord(snap.signals, date, 'high', ['keywords'], h.field);
    if (existing && existing.shown && shownHashes[key] === h.hash && !deleted) continue;
    const show = !crisisNow;
    upserts.push(makeRecord(existing, { date, level: 'high', triggers: ['keywords'], shown: show, variant: show ? 'by_words' : null, field: h.field, list: 'hopelessness' }, nowIso, makeId));
    if (show) { newHashes[key] = h.hash; showWords = true; }
  }

  if (checkMood && highMoodActive(snap, date)) {
    const existing = findRecord(snap.signals, date, 'high', ['mood'], null);
    if (!(existing && existing.shown)) {
      const prev = lastShown(snap.signals, date, (s) => s.level === 'high' && s.triggers.includes('mood'));
      const freqOk = !prev || diffDays(date, prev.date) >= R.highMoodEveryDays;
      const show = !crisisNow && !showWords && freqOk;
      upserts.push(makeRecord(existing, { date, level: 'high', triggers: ['mood'], shown: show, variant: show ? 'by_mood' : null, field: null, list: null }, nowIso, makeId));
      showMood = show;
    }
  }

  let show = null;
  if (showCrisis) show = { kind: 'crisis', deleted: !!deleted };
  else if (showWords) show = { kind: 'high', variant: deleted ? 'by_words_deleted' : 'by_words' };
  else if (showMood) show = { kind: 'high', variant: 'by_mood' };
  return { upserts, show, setCrisis: showCrisis, newHashes };
}

// --- Решение после «Завершить круг»: «Внимание» ---
export function decideAttention(snap, { date, ev, nowIso, makeId }) {
  const types = [];
  if (attentionMoodActive(snap, date)) types.push('mood');
  if (attentionResourceActive(snap, date)) types.push('resource');
  const emotions = emotionTrigger(ev);
  if (emotions.length) types.push('emotion');
  if (!types.length) return { upserts: [], show: null };

  const existing = findRecord(snap.signals, date, 'attention', types, null);
  if (existing && existing.shown) return { upserts: [], show: null };

  const prev = lastShown(snap.signals, date, (s) => s.level === 'attention');
  const higherTonight = snap.signals.some((s) => s.date === date && s.shown && (s.level === 'high' || s.level === 'crisis'));
  // Карточка показывается не больше раза за вечер: повторное «Завершить круг» после правки
  // её не повторяет, даже если сигналы сменились (сигнал всё равно пишется в журнал).
  const shownTonight = snap.signals.some((s) => s.date === date && s.shown && s.level === 'attention');
  const isNewType = !prev || types.some((t) => !prev.triggers.includes(t));
  const since = prev ? diffDays(date, prev.date) : null;
  const show = !ev.crisis && !higherTonight && !shownTonight && (isNewType || since >= R.attentionRepeatDays);

  let variant = null;
  if (show) {
    const moodOrResource = types.includes('mood') || types.includes('resource');
    if (moodOrResource && prev && since >= R.attentionRepeatDays && since <= R.attentionOverWeekMaxDays) variant = 'over_week';
    else if (moodOrResource) variant = 'recent_days';
    else variant = 'today';
  }
  const rec = makeRecord(existing, { date, level: 'attention', triggers: types, shown: show, variant, field: null, list: null }, nowIso, makeId);
  return { upserts: [rec], show: show ? { kind: 'attention', variant, emotions } : null };
}
