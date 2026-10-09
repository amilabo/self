// События дня (CONTENT.md, «События дня»; PRD §6.2, day_events). Чистые функции, без DOM и записи:
// быстрая запись события (A, C с силой, B) и «хорошего» днём, дописывание до 04:00,
// связь разобранного вечером события с evenings.abc.
//
// Запись хранит содержание дважды: текущее (поля верхнего уровня) и `initial` — как было
// при первом сохранении. Так видно, что записано в моменте, а что дописано позже.

import { QUESTION_SET_VERSION, OTHER } from './content.js';
import { emptyAbc } from './rules.js';

const nonEmpty = (s) => typeof s === 'string' && s.trim() !== '';
const clone = (v) => JSON.parse(JSON.stringify(v));

export const KINDS = ['event', 'good'];

// Эмоция события: без `after` — повторная оценка бывает только вечером, после E.
const eventEmotion = (e) => ({ name: e.name, group: e.group ?? null, other_text: e.other_text ?? null, before: e.before ?? null });

// Содержание записи (без служебных полей) — то, что сравнивается при правке и копируется в `initial`.
export function contentOf(rec) {
  if (rec.kind === 'good') return { text: rec.text ?? null };
  return {
    a_event: rec.a_event ?? null,
    c_emotions: (rec.c_emotions || []).map(eventEmotion),
    b_belief: rec.b_belief ?? null
  };
}

// «Сохранить» активна, если заполнено хоть одно поле или выбрана эмоция.
export function hasContent(c) {
  if (!c) return false;
  if ('text' in c && !('a_event' in c)) return nonEmpty(c.text);
  return nonEmpty(c.a_event) || nonEmpty(c.b_belief) || (c.c_emotions || []).length > 0;
}

// Выбрана эмоция «другое» без уточнения — сохранить нельзя (как в круге).
export function otherMissing(c) {
  const o = (c.c_emotions || []).find((e) => e.name === OTHER);
  return !!o && !nonEmpty(o.other_text);
}

// Черновик экрана быстрой записи: id выдаётся сразу, время записи — момент открытия экрана
// (оно же в мета-строке «Событие · 14:32»), дата — логический день этого момента.
export function newDraft({ kind, id, nowIso, date, from }) {
  const base = { kind, id, date, recorded_at: nowIso, from: from === 'evening' ? 'evening' : 'today' };
  return kind === 'good' ? { ...base, text: null } : { ...base, a_event: null, c_emotions: [], b_belief: null };
}

// Черновик для дописывания сохранённой записи.
export function draftFromRecord(rec, from) {
  return { kind: rec.kind, id: rec.id, date: rec.date, recorded_at: rec.recorded_at, from: from === 'evening' ? 'evening' : 'today', ...clone(contentOf(rec)) };
}

// Изменилось ли содержание черновика относительно записи (для новой — есть ли что сохранять).
export function draftChanged(draft, rec) {
  if (!rec) return hasContent(contentOf(draft));
  return JSON.stringify(contentOf(draft)) !== JSON.stringify(contentOf(rec));
}

// Сохранение черновика. Новая запись: `initial` = содержание первого сохранения, `edited_at: null`.
// Дописывание: поля обновляются, `recorded_at` и `initial` не меняются, ставится `edited_at`.
// Без изменений ничего не трогается. Возвращает { rec, changed }.
export function saveDraft(draft, existing, { nowIso, addedFrom } = {}) {
  const content = contentOf(draft);
  if (!existing) {
    const rec = {
      id: draft.id,
      kind: draft.kind,
      date: draft.date,
      question_set_version: QUESTION_SET_VERSION,
      recorded_at: draft.recorded_at,
      added_from: addedFrom || draft.from || 'today',
      updated_at: nowIso,
      edited_at: null,
      ...clone(content),
      initial: clone(content)
    };
    return { rec, changed: true };
  }
  if (JSON.stringify(content) === JSON.stringify(contentOf(existing))) return { rec: existing, changed: false };
  const rec = { ...existing, ...clone(content), updated_at: nowIso, edited_at: nowIso };
  return { rec, changed: true };
}

// Дописать можно до конца логического дня записи (04:00 следующих суток) — то же окно, что у правки круга.
export function canEditDayEvent(rec, today) {
  return !!rec && rec.date === today;
}

// Записи дня по времени записи.
export function dayEventsOf(snap, date, kind) {
  const all = snap.dayEvents ? [...snap.dayEvents.values()] : [];
  return all.filter((r) => r.date === date && r.kind === kind)
    .sort((a, b) => (a.recorded_at < b.recorded_at ? -1 : a.recorded_at > b.recorded_at ? 1 : 0));
}

const clip = (s, n) => {
  const t = String(s).trim().replace(/\s+/g, ' ');
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

// Строка события в списке вечером: «14:32 · Совещание, Н. перебил при всех · тревога, обида».
// Силу не показываем (якорит повторную оценку). Если нет ни A, ни эмоций — начало B, чтобы строку можно было узнать.
export function eventLine(rec, time) {
  const parts = [time];
  if (nonEmpty(rec.a_event)) parts.push(clip(rec.a_event, 60));
  const emo = (rec.c_emotions || []).map((e) => (e.name === OTHER && nonEmpty(e.other_text) ? e.other_text.trim() : e.name));
  if (emo.length) parts.push(emo.join(', '));
  if (parts.length === 1 && nonEmpty(rec.b_belief)) parts.push(`«${clip(rec.b_belief, 60)}»`);
  return parts.join(' · ');
}

// --- Связь с вечерней ABC ---

// «Разобрать выбранное»: A, C (с дневной силой), B подставляются из записи; «Что я сделала?», D, E — пустые,
// повторная оценка — с нуля. abc.event_id ссылается на запись.
export function abcFromEvent(rec) {
  return {
    ...emptyAbc(),
    a_event: rec.a_event ?? null,
    c_emotions: (rec.c_emotions || []).map((e) => ({ ...eventEmotion(e), after: null })),
    b_belief: rec.b_belief ?? null,
    event_id: rec.id
  };
}

// Правки A, C, B на шаге ABC — это дописывание события: переносим их в запись.
// Возвращает новую запись или null, если содержание не изменилось.
export function eventFromAbc(rec, abc, nowIso) {
  const draft = { kind: 'event', a_event: abc.a_event, c_emotions: abc.c_emotions || [], b_belief: abc.b_belief };
  const { rec: next, changed } = saveDraft(draft, rec, { nowIso });
  return changed ? next : null;
}

// Запись дописали на экране события — переносим A, C, B в связанную вечернюю ABC.
// Повторная оценка (`after`) сохраняется у тех эмоций, что остались. Возвращает true, если что-то изменилось.
export function syncAbcFromEvent(abc, rec) {
  if (!abc || abc.event_id !== rec.id) return false;
  const before = JSON.stringify(abc);
  const afterByName = new Map((abc.c_emotions || []).map((e) => [e.name, e.after]));
  abc.a_event = rec.a_event ?? null;
  abc.b_belief = rec.b_belief ?? null;
  abc.c_emotions = (rec.c_emotions || []).map((e) => ({ ...eventEmotion(e), after: afterByName.has(e.name) ? afterByName.get(e.name) : null }));
  return JSON.stringify(abc) !== before;
}

// Есть ли в связанной ABC то, что вводится только вечером: «Что я сделала?», D, E, повторная оценка.
// Только это теряется при «Нет, дальше» — A, C, B остаются в записи события.
export function abcEveningStarted(abc) {
  if (!abc) return false;
  return ['c_behavior', 'd_evidence', 'd_usefulness', 'd_friend', 'e_belief'].some((k) => nonEmpty(abc[k]))
    || (abc.c_emotions || []).some((e) => e.after != null);
}

// --- Безопасность ---

// Поля быстрой записи проверяются так же, как поля ABC. key — отпечаток для правила «окно не повторяется
// для того же неизменённого текста» отдельно по каждой записи.
export function dayEventFields(c, id) {
  const txt = (v) => (typeof v === 'string' ? v : '');
  const f = (field, text) => ({ field, key: `${field}|${id}`, text: txt(text) });
  const list = 'a_event' in c
    ? [
      f('day_events.a_event', c.a_event),
      f('day_events.c_emotions.other_text', (c.c_emotions || []).map((e) => txt(e.other_text)).join(' ')),
      f('day_events.b_belief', c.b_belief)
    ]
    : [f('day_events.text', c.text)];
  return list.filter((x) => x.text.trim() !== '');
}

// Было ли днём окно «Кризис» по быстрой записи этого дня. Если вечера ещё нет, флаг ставится при его создании —
// «как если бы текст был написан в круге» (CONTENT.md). Утро флаг на вечер не ставит (решение 0.1.1).
export function dayCrisis(snap, date) {
  return snap.signals.some((s) => s.date === date && s.level === 'crisis' && s.shown && String(s.field || '').startsWith('day_events.'));
}
