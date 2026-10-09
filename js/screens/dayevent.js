// Быстрая запись днём (CONTENT.md, «События дня»): событие (A, эмоции с силой 0–10, B) и «хорошее» одной строкой.
// Всё по желанию; «Сохранить» активна, если заполнено хоть одно поле или выбрана эмоция. Время записи ставится само
// и не меняется при дописывании. Дописать можно до 04:00 (маршрут #/event/<id>).
// Тексты проверяются на сигналы так же, как поля ABC; окно «Кризис» — вариант «Утро», флаг — на вечер этого дня.

import { h, region, card, button, textField, otherField, strengthScale, emotionGroups } from '../ui.js';
import { T, OTHER, EMOTION_GROUPS } from '../content.js';
import { S, putDayEvent, saveEvening, setUi, clearUi, flushPending } from '../store.js';
import { logicalDate, dayNumber, isoLocal, timeOfIso } from '../dates.js';
import { abcDone } from '../rules.js';
import {
  newDraft, draftFromRecord, draftChanged, saveDraft, contentOf, hasContent, otherMissing,
  canEditDayEvent, dayEventFields, syncAbcFromEvent, dayCrisis
} from '../dayevents.js';
import { decideStepSignals } from '../safety.js';
import { applyStepSignals, signalContext } from '../actions.js';
import { showSafety, showDiscardConfirm } from '../sheets.js';
import { go, refresh, eveningHash, dayEventHash } from '../nav.js';
import { timer } from '../session.js';
import { textOrNull, isBlank, uuid } from '../util.js';

// Черновик хранится в состоянии интерфейса (не экспортируется): если уйти системной кнопкой «назад»
// или Android выгрузит вкладку, введённое не пропадёт и вернётся при следующем открытии записи.
const DRAFT_KEY = 'day_draft';

// Черновик открытого экрана — переживает перерисовки при нажатиях.
let active = null;
// Раскрыты ли «Ещё эмоции» (по id черновика).
const moreOpen = new Map();
// Короткое сообщение после сохранения для экрана «Сегодня».
let flash = null;
const FLASH_MS = 15000;

export function takeFlash() {
  if (!flash) return null;
  if (Date.now() - flash.at > FLASH_MS) { flash = null; return null; }
  return flash.text;
}

const badge = (letter) => h('span', { class: 'badge', 'aria-hidden': 'true' }, letter);
const hint = (text) => h('div', { class: 'caption center' }, text);

export function renderDayEvent(route) {
  const exp = S.experiment;
  const today = logicalDate();
  const kind = route.name === 'good' ? 'good' : 'event';
  // Из круга — только событие и только в круг сегодняшнего дня.
  const from = kind === 'event' && route.from === 'evening' && S.evenings.has(today) ? 'evening' : 'today';
  const backHash = from === 'evening' ? eveningHash(today, 2) : '#/today';
  if (!exp || dayNumber(today, exp.start_date) < 1) { go('#/today', { replace: true }); return null; }

  const existing = route.id ? S.dayEvents.get(route.id) || null : null;
  // Дописать можно только свою запись и только в её логический день (до 04:00).
  if (route.id && (!existing || existing.kind !== kind || !canEditDayEvent(existing, today))) { go(backHash, { replace: true }); return null; }

  // Какой черновик показать: тот же, что на экране (перерисовка); сохранённый в интерфейсе, если в нём есть
  // несохранённый ввод для этой же записи; иначе — новый (время записи = момент открытия) или из записи.
  const fitsRecord = (d) => !!d && d.kind === kind && d.date === today && (existing ? d.id === existing.id : !S.dayEvents.has(d.id));
  let draft;
  if (fitsRecord(active)) draft = active;
  else if (fitsRecord(S.ui[DRAFT_KEY]) && draftChanged(S.ui[DRAFT_KEY], existing)) draft = S.ui[DRAFT_KEY];
  else draft = existing ? draftFromRecord(existing, from) : newDraft({ kind, id: uuid(), nowIso: isoLocal(), date: today, from });
  draft.from = from;
  active = draft;

  // Запись события из круга — часть шага 2: время идёт в замер H3 (если круг не завершён).
  if (from === 'evening') {
    const ev = S.evenings.get(today);
    if (ev && !ev.completed_at) timer.attach(ev, 2);
  }

  const keepDraft = (debounce = true) => setUi(DRAFT_KEY, draft, { debounce });
  const dropDraft = () => {
    if (S.ui[DRAFT_KEY] && S.ui[DRAFT_KEY].id === draft.id) clearUi(DRAFT_KEY);
    moreOpen.delete(draft.id);
    active = null;
  };

  // Проверка текста. deleted — запись удаляется («Отмена» → «Удалить»). При дописывании проверяются
  // только изменённые поля: иначе удаление правки показало бы окно и по уже сохранённому тексту.
  function check(deleted) {
    const old = existing ? new Map(dayEventFields(contentOf(existing), draft.id).map((f) => [f.field, f.text])) : null;
    const fields = dayEventFields(contentOf(draft), draft.id).filter((f) => !old || old.get(f.field) !== f.text);
    if (!fields.length) return null;
    const ev = S.evenings.get(draft.date) || null;
    const res = decideStepSignals(S, {
      date: draft.date, fields, checkMood: false, crisisEvening: !!(ev && ev.crisis) || dayCrisis(S, draft.date), deleted, ...signalContext(draft.date)
    });
    // Флаг «Кризис» — на вечер этого дня. Если вечера ещё нет, он ставится при открытии круга (dayCrisis).
    applyStepSignals(res, draft.date, ev, { silent: true });
    return res.show && res.show.kind === 'crisis' ? { ...res.show, morning: true } : res.show;
  }

  let done = false;
  const safetyAfter = (show) => (show ? () => showSafety(show, { onBack: () => {}, onHelp: () => go('#/help', { skipLeaveCheck: true }) }) : null);

  function save() {
    const content = contentOf(draft);
    if (!hasContent(content) || (kind === 'event' && otherMissing(content))) return;
    const show = check(false);
    const { rec, changed } = saveDraft(draft, existing, { nowIso: isoLocal(), addedFrom: from });
    if (changed) {
      putDayEvent(rec);
      // Событие уже разбирается вечером — A, C, B в вечерней ABC обновляются вместе с записью.
      const ev = S.evenings.get(rec.date);
      if (ev && ev.abc && syncAbcFromEvent(ev.abc, rec)) { ev.abc_done = abcDone(ev.abc); saveEvening(ev); }
    }
    dropDraft();
    done = true;
    flushPending();
    if (show) {
      // «Вернуться к записи» — к сохранённой записи (её можно дописать до 04:00).
      go(dayEventHash(kind, rec.id, from), { skipLeaveCheck: true, after: safetyAfter(show) });
      return;
    }
    if (from === 'today' && !existing) flash = { text: kind === 'good' ? T.day.savedGood : T.day.savedEvent, at: Date.now() };
    go(backHash, { skipLeaveCheck: true });
  }

  function cancel() {
    if (!draftChanged(draft, existing)) { dropDraft(); done = true; go(backHash, { skipLeaveCheck: true }); return; }
    showDiscardConfirm({
      onDrop: () => {
        // Проверка на сигналы — до удаления, как у черновика ABC.
        const show = check(true);
        dropDraft();
        done = true;
        flushPending();
        go(backHash, { skipLeaveCheck: true, after: safetyAfter(show) });
      }
    });
  }

  const footer = region(() => {
    const content = contentOf(draft);
    const needOther = kind === 'event' && otherMissing(content);
    return [
      needOther ? hint(T.day.needOther) : null,
      h('div', { class: 'pair' },
        button(T.day.cancel, cancel, { kind: 'secondary', large: true, fk: 'day-cancel' }),
        button(T.day.save, save, { large: true, disabled: !hasContent(content) || needOther, fk: 'day-save' }))
    ];
  }, 'div', 'footer');

  const time = timeOfIso(draft.recorded_at);
  const onText = (key) => (v) => { draft[key] = textOrNull(v); keepDraft(); footer.update(); };

  let parts;
  if (kind === 'good') {
    parts = [
      h('div', { class: 'stack-4' },
        h('div', { class: 'meta' }, T.day.goodMeta(time)),
        h('h1', { class: 'h1' }, h('label', { for: 'good-now' }, T.day.goodTitle))),
      card('', textField({ id: 'good-now', value: draft.text, placeholder: T.day.goodPh, rows: 2, onInput: onText('text') }))
    ];
  } else {
    const emotions = draft.c_emotions;
    const isSel = (n) => emotions.some((e) => e.name === n);
    const otherEmotion = emotions.find((e) => e.name === OTHER);
    const otherLabel = () => (otherEmotion && !isBlank(otherEmotion.other_text) ? otherEmotion.other_text.trim() : OTHER);
    const scaleLabel = (e) => (e.name === OTHER ? otherLabel() : e.name);
    const toggle = (name) => {
      const i = emotions.findIndex((e) => e.name === name);
      if (i >= 0) emotions.splice(i, 1);
      else {
        const group = EMOTION_GROUPS.find((g) => g.items.includes(name));
        emotions.push({ name, group: group ? group.name : null, other_text: null, before: null });
      }
      keepDraft(false);
      refresh(); // перерисовка: черновик тот же (active)
    };
    parts = [
      h('div', { class: 'stack-4' },
        h('div', { class: 'meta' }, T.day.eventMeta(time)),
        h('h1', { class: 'h1' }, T.day.eventTitle),
        // При дописывании — когда записано и что днём записанное лучше дописывать рядом (CONTENT.md, «Дописать позже»).
        h('div', { class: 'body-sm' }, existing ? T.day.recordedNote(time) : T.day.eventHint)),
      card('gap-8',
        h('label', { for: 'qa', class: 'q-label' }, badge('A'), T.day.aQ),
        textField({ id: 'qa', value: draft.a_event, placeholder: T.day.aPh, rows: 2, onInput: onText('a_event') })),
      card('gap-16',
        h('div', { class: 'q-label', id: 'qc-title' }, badge('C'), T.day.cQ),
        emotionGroups({ isSel, onToggle: toggle, open: !!moreOpen.get(draft.id), onOpen: (v) => { moreOpen.set(draft.id, v); refresh(); }, moreId: 'q-more-emotions' }),
        otherEmotion ? otherField({
          id: 'q-emo-other', value: otherEmotion.other_text, placeholder: T.step2.otherPh,
          onInput: (v) => {
            otherEmotion.other_text = textOrNull(v);
            keepDraft();
            footer.update();
            document.querySelectorAll(`[data-emo="${OTHER}"]`).forEach((n) => { n.textContent = otherLabel(); });
          }
        }) : null,
        emotions.length ? h('div', { class: 'stack-12 divider' },
          h('div', { class: 'label' }, T.day.strengthTitle),
          emotions.map((e) => strengthScale({
            label: scaleLabel(e), value: e.before, ariaLabel: T.step2.strengthAria(scaleLabel(e)), fk: `q-before-${e.name}`, emo: e.name,
            onSet: (v) => { e.before = v; keepDraft(false); }
          }))) : null),
      card('gap-8',
        h('label', { for: 'qb', class: 'q-label' }, badge('B'), T.day.bQ),
        textField({ id: 'qb', value: draft.b_belief, placeholder: T.day.bPh, rows: 2, onInput: onText('b_belief') }))
    ];
  }

  const el = h('main', { class: 'screen inner day-entry' }, parts, footer);

  return {
    el,
    // Ушли системной кнопкой «назад»: введённое остаётся черновиком (вернётся при следующем открытии),
    // текст проверяется, как утром при уходе с экрана.
    leave: () => {
      if (done) return null;
      active = null;
      if (!draftChanged(draft, existing)) { dropDraft(); return null; }
      keepDraft(false);
      const show = check(false);
      // «Вернуться к записи» — на этот же экран, черновик восстановится.
      return show ? { show, backHash: dayEventHash(kind, existing ? existing.id : null, from) } : null;
    }
  };
}
