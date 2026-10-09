// Вечерний круг: 3 шага (CONTENT.md, «Вечерний круг»; макет Evening1–3).
// Черновик пишется в IndexedDB при каждом изменении и при переходах между шагами.
// Проверка безопасности — при сохранении шага (переход «Дальше», «Назад», «Выйти», «Завершить круг»).

import { h, region, card, button, scale10, segments, chips, textField, otherField, strengthScale, stepHeader, titleRow, optional, icon, reqStar } from '../ui.js';
import { T, SKIP_OPTIONS, FRICTION_OPTIONS, FRICTION_NONE, OTHER, EMOTION_GROUPS, YES_PARTLY_NO, NOW_OPTIONS, GOOD_VARIANTS, QUESTION_SET_VERSION, HABIT_HINTS } from '../content.js';
import { S, saveEvening, putMark, putSkip, putSignal, markKey, setUi, clearUi, flushPending } from '../store.js';
import { logicalDate, dayNumber, isoLocal, isYmd } from '../dates.js';
import { isCounted, prevAction, skipInfo, goodVariant, abcStarted, abcDone, deDone, emptyAbc, newEvening, canEditEvening, finishEvening, editBase, restoreRequired } from '../rules.js';
import { decideStepSignals, decideAttention, eveningFields, abcFields } from '../safety.js';
import { applyStepSignals, signalContext } from '../actions.js';
import { showSafety, showDraftConfirm } from '../sheets.js';
import { go, refresh, eveningHash, parseRoute } from '../nav.js';
import { timer } from '../session.js';
import { textOrNull, isBlank, uuid } from '../util.js';

// Правка завершённого круга: снимок обязательных ответов (S.ui.evening_edit, см. editBase в rules.js).
const EDIT_KEY = 'evening_edit';

// Раскрыта ли группа «Ещё эмоции» — только на время заполнения шага.
const moreOpen = new Map();

const hint = (text) => h('div', { class: 'caption center' }, text);
const byOrder = (list) => (a, b) => list.indexOf(a) - list.indexOf(b);

function badge(letter, kind = '') {
  return h('span', { class: `badge ${kind}`.trim(), 'aria-hidden': 'true' }, letter);
}

export function renderEvening(route) {
  const exp = S.experiment;
  const today = logicalDate();
  const { date, step } = route;
  if (!exp || !isYmd(date) || date > today || dayNumber(date, exp.start_date) < 1) { go('#/today', { replace: true }); return null; }

  let ev = S.evenings.get(date);
  // Завершённый круг открывается на правку только в свой логический день (до 04:00 следующих суток).
  if (ev && ev.completed_at && !canEditEvening(ev, today)) { go('#/today', { replace: true }); return null; }
  const editing = !!(ev && ev.completed_at);
  if (editing && !(S.ui[EDIT_KEY] && S.ui[EDIT_KEY].date === date)) setUi(EDIT_KEY, editBase(ev));
  if (!ev) {
    // Новый круг начинается только с шага 1 и только за сегодня (задним числом — в v0.2 из «Истории»).
    if (date !== today) { go('#/today', { replace: true }); return null; }
    if (step !== 1) { go(eveningHash(date, 1), { replace: true }); return null; }
    ev = newEvening(date, isoLocal());
    const pa = prevAction(S, date, { forEvening: true });
    ev.prev_action = pa ? { text: pa, status: null } : null;
    saveEvening(ev);
  }
  setUi('evening_step', { date, step });
  timer.attach(ev, step);

  const crisis = ev.crisis;
  const save = (debounce = false) => saveEvening(ev, { debounce });

  // --- Вопрос о пропущенном дне (шаг 1) ---
  function skipRecordForDate() {
    const info = skipInfo(S, date);
    if (!info) return null;
    let rec = S.skips.get(info.first_missed_date);
    if (!rec) {
      const now = isoLocal();
      rec = {
        first_missed_date: info.first_missed_date,
        missed_days: info.missed_days,
        asked_on: date,
        shown: !info.afterCrisis,
        auto_reason: info.afterCrisis ? 'after_crisis' : null,
        reasons: [],
        other_text: null,
        question_set_version: QUESTION_SET_VERSION,
        created_at: now,
        updated_at: now
      };
      putSkip(rec);
    }
    return rec.shown && rec.asked_on === date ? rec : null;
  }
  const skipRec = step === 1 ? skipRecordForDate() : null;

  // --- Проверка при сохранении шага ---
  let checked = false;
  function runCheck() {
    timer.update();
    if (ev.abc) { ev.abc_done = abcDone(ev.abc); ev.de_done = deDone(ev.abc); }
    const res = decideStepSignals(S, {
      date, fields: eveningFields(ev, step, skipRec), checkMood: step === 1 && ev.mood != null,
      crisisEvening: ev.crisis, deleted: false, ...signalContext(date)
    });
    applyStepSignals(res, date, ev);
    save();
    flushPending();
    return res.show;
  }

  function leaveStep(target) {
    const show = runCheck();
    checked = true;
    if (show) {
      showSafety(show, {
        onBack: () => { checked = false; refresh(); },
        onHelp: () => go('#/help', { skipLeaveCheck: true })
      });
      return;
    }
    if (target === 'finish') complete();
    else if (target === 'exit') { endEdit(); go('#/today', { skipLeaveCheck: true }); }
    else go(eveningHash(date, target), { skipLeaveCheck: true });
  }

  // Вышли из правки завершённого круга без «Завершить круг»: правки уже записаны,
  // обязательные ответы возвращаются, если их убрали (restoreRequired).
  function endEdit() {
    if (!editing) return;
    if (restoreRequired(ev, S.ui[EDIT_KEY])) save();
    clearUi(EDIT_KEY);
    setUi('evening_step', null);
    moreOpen.delete(date);
  }

  function complete() {
    timer.update();
    const now = isoLocal();
    // Повторное завершение (правка) не меняет completed_at и filled_later; edited_at ставит saveEvening.
    finishEvening(ev, { nowIso: now, morning: S.mornings.get(date) });
    // Неотмеченная ручная привычка в завершённом круге = «не сделано».
    for (const hb of S.habits) {
      if (hb.mark_mode === 'manual' && !hb.archived && !S.marks.has(markKey(date, hb.id))) putMark(date, hb.id, false, 'manual');
    }
    putMark(date, 'evening_reflection', true, 'auto');
    save();
    timer.detach();
    setUi('evening_step', null);
    if (editing) clearUi(EDIT_KEY);
    moreOpen.delete(date);
    const att = decideAttention(S, { date, ev, nowIso: now, makeId: uuid });
    for (const r of att.upserts) putSignal(r);
    flushPending();
    go('#/today', {
      skipLeaveCheck: true,
      after: att.show ? () => showSafety(att.show, { onOk: () => {}, onHelp: () => go('#/help') }) : null
    });
  }

  // --- Шаг 1: пропуск, настроение, привычки, намерение и вчерашнее действие ---
  function step1() {
    const m = S.mornings.get(date);
    const intention = m && m.intention;
    const otherOn = !!skipRec && skipRec.reasons.includes(OTHER);
    const footer = region(() => {
      const moodMissing = !crisis && ev.mood == null;
      const otherMissing = !crisis && otherOn && isBlank(skipRec.other_text);
      return [
        moodMissing ? hint(T.step1.needMood) : null,
        otherMissing ? hint(T.step1.needOther) : null,
        button(T.common.next, () => leaveStep(2), { large: true, disabled: moodMissing || otherMissing, fk: 'next' })
      ];
    }, 'div', 'footer');

    const toggleSkip = (name) => {
      const has = skipRec.reasons.includes(name);
      skipRec.reasons = has ? skipRec.reasons.filter((x) => x !== name) : [...skipRec.reasons, name].sort(byOrder(SKIP_OPTIONS));
      if (!skipRec.reasons.includes(OTHER)) skipRec.other_text = null;
      putSkip(skipRec);
      refresh();
    };
    // В заголовке — сколько дней прошло с последнего круга (пропущенные дни + 1).
    // Если перерыв начался с дня 1 и длится 2+ дня, прошлого круга не было — отдельная формулировка.
    const fromStart = !!skipRec && skipRec.first_missed_date === exp.start_date && skipRec.missed_days >= 2;
    const skipTitle = skipRec && (fromStart ? T.step1.skipTitleFromStart
      : skipRec.missed_days > 1 ? T.step1.skipTitleN(skipRec.missed_days + 1) : T.step1.skipTitle1);
    const skipCard = skipRec ? h('div', { class: 'card', role: 'group', 'aria-labelledby': 'skip-title', 'aria-describedby': 'skip-hint' },
      h('div', { class: 'stack-4' },
        titleRow('skip-title', skipTitle, { opt: true }),
        h('div', { id: 'skip-hint', class: 'caption' }, T.step1.skipHint)),
      chips(SKIP_OPTIONS, (n) => skipRec.reasons.includes(n), toggleSkip, 'skip'),
      otherOn ? otherField({
        id: 'skip-other', value: skipRec.other_text, placeholder: T.common.otherPlaceholder, required: !crisis,
        onInput: (v) => { skipRec.other_text = textOrNull(v); putSkip(skipRec, { debounce: true }); footer.update(); }
      }) : null) : null;

    const habitRows = S.habits.filter((x) => !x.archived).map((hb) => {
      const mark = S.marks.get(markKey(date, hb.id));
      if (hb.mark_mode === 'manual') {
        const done = !!(mark && mark.done);
        return h('button', {
          type: 'button', role: 'checkbox', class: 'habit-row', 'aria-checked': done ? 'true' : 'false', 'data-fk': `habit-${hb.id}`,
          onclick: () => { putMark(date, hb.id, !done, 'manual'); refresh(); }
        },
        h('span', { class: 'stack-2' }, h('span', { class: 'habit-name' }, hb.name), h('span', { class: 'caption' }, hb.threshold)),
        h('span', { class: done ? 'box on' : 'box' }, done ? icon('check', 18, 3) : null));
      }
      const isMorning = hb.mark_mode === 'auto_morning';
      const done = isMorning ? !!(mark && mark.done) : isCounted(ev);
      // Правка завершённого круга: вечер уже засчитан — «отмечено автоматически».
      const hintText = isMorning ? (intention ? HABIT_HINTS.morningDone : HABIT_HINTS.morningMissing)
        : editing ? HABIT_HINTS.morningDone : HABIT_HINTS.eveningPending;
      return h('div', { role: 'checkbox', class: 'habit-row auto', 'aria-checked': done ? 'true' : 'false', 'aria-disabled': 'true' },
        h('span', { class: 'stack-2' }, h('span', { class: 'habit-name' }, hb.name), h('span', { class: 'caption' }, hintText)),
        h('span', { class: done ? 'box auto-on' : 'box auto-off' }, done ? icon('check', 18, 3) : null));
    });

    const planParts = [];
    if (intention) {
      planParts.push(h('div', { class: 'stack-16' },
        h('div', { class: 'stack-4' }, h('div', { class: 'caption' }, T.step1.intention), h('div', { class: 'quote' }, `«${intention}»`)),
        h('div', { class: 'stack-8' },
          titleRow('intent-result', T.step1.intentionResult, { opt: true }),
          segments(YES_PARTLY_NO, ev.intention_result, (v) => { ev.intention_result = v; save(); refresh(); }, { labelledby: 'intent-result', fk: 'ir' }))));
    }
    if (ev.prev_action) {
      planParts.push(h('div', { class: intention ? 'stack-16 divider' : 'stack-16' },
        h('div', { class: 'stack-4' }, h('div', { class: 'caption' }, T.step1.yesterday), h('div', { id: 'yday-action', class: 'quote' }, `«${ev.prev_action.text}»`)),
        h('div', { class: 'stack-8' },
          titleRow('yday-done', T.step1.prevAction, { opt: true }),
          segments(YES_PARTLY_NO, ev.prev_action.status, (v) => { ev.prev_action.status = v; save(); refresh(); }, { labelledby: 'yday-action yday-done', fk: 'pa' }),
          ev.prev_action.status === 'no' ? h('div', { class: 'caption' }, T.step1.prevNo) : null)));
    }

    return [
      stepHeader(1, T.common.exit, () => leaveStep('exit')),
      skipCard,
      h('h1', { id: 'mood', class: 'h2' }, T.step1.moodQ, crisis ? null : reqStar()),
      card('gap-8', scale10({
        value: ev.mood, onPick: (n) => { ev.mood = n; save(); refresh(); }, labelledby: 'mood', required: !crisis,
        allowClear: false, fk: 'mood', poles: [T.step1.moodLow, T.step1.moodHigh]
      })),
      card('habits gap-8', h('div', { class: 'title' }, T.step1.habitsTitle), h('div', { class: 'habit-list' }, habitRows)),
      planParts.length ? card('gap-16', planParts) : null,
      footer
    ];
  }

  // --- Шаг 2: развилка и ABC-запись ---
  function step2() {
    const abc = ev.abc;
    const pickYes = () => { if (!ev.abc) { ev.abc = emptyAbc(); save(); refresh(); } };
    const dropDraft = () => {
      const res = decideStepSignals(S, {
        date, fields: abcFields(ev.abc), checkMood: false, crisisEvening: ev.crisis, deleted: true, ...signalContext(date)
      });
      applyStepSignals(res, date, ev);
      ev.abc = null;
      ev.abc_done = false;
      ev.de_done = false;
      save();
      checked = true;
      go(eveningHash(date, 3), {
        skipLeaveCheck: true,
        after: res.show ? () => showSafety(res.show, { onBack: () => refresh(), onHelp: () => go('#/help', { skipLeaveCheck: true }) }) : null
      });
    };
    const pickNo = () => {
      if (abcStarted(ev.abc)) { showDraftConfirm({ onDrop: dropDraft }); return; }
      ev.abc = null;
      ev.abc_done = false;
      ev.de_done = false;
      save();
      leaveStep(3);
    };

    const fork = [
      h('div', { class: 'stack-4' },
        h('h1', { id: 'fork', class: 'h2' }, T.step2.forkQ),
        h('div', { id: 'fork-hint', class: 'body-sm' }, T.step2.forkHint)),
      h('div', { class: 'card pair', role: 'group', 'aria-labelledby': 'fork', 'aria-describedby': 'fork-hint' },
        h('button', {
          type: 'button', class: 'cell seg', 'aria-pressed': abc ? 'true' : 'false', 'aria-expanded': abc ? 'true' : 'false',
          'aria-controls': 'abc', 'data-fk': 'fork-yes', onclick: pickYes
        }, T.step2.yes),
        button(T.step2.no, pickNo, { kind: 'secondary', fk: 'fork-no', attrs: { 'aria-haspopup': abcStarted(abc) ? 'dialog' : null } }))
    ];
    if (!abc) return [stepHeader(2, T.common.back, () => leaveStep(1)), fork];

    const emotions = abc.c_emotions;
    const isSel = (n) => emotions.some((e) => e.name === n);
    const otherEmotion = emotions.find((e) => e.name === OTHER);
    const footer = region(() => {
      const otherMissing = !crisis && !!otherEmotion && isBlank(otherEmotion.other_text);
      return [
        otherMissing ? hint(T.step2.needOther) : null,
        button(T.common.next, () => leaveStep(3), { large: true, disabled: otherMissing, fk: 'next' })
      ];
    }, 'div', 'footer');

    const toggleEmotion = (name) => {
      const i = emotions.findIndex((e) => e.name === name);
      if (i >= 0) emotions.splice(i, 1);
      else {
        const group = EMOTION_GROUPS.find((g) => g.items.includes(name));
        emotions.push({ name, group: group ? group.name : null, other_text: null, before: null, after: null });
      }
      save();
      refresh();
    };

    const groupBlock = (g) => h('div', { class: 'stack-8' },
      h('div', { class: 'overline' }, g.name),
      chips(g.items, isSel, toggleEmotion, 'emo'));
    const open = !!moreOpen.get(date);
    const main = EMOTION_GROUPS.filter((g) => !g.collapsed);
    const extraVisible = [];
    const hidden = [];
    // Выбранное никогда не прячется: группа с выбранной эмоцией видна и в свёрнутом виде.
    for (const g of EMOTION_GROUPS.filter((x) => x.collapsed)) {
      if (open || g.items.some(isSel)) extraVisible.push(g); else hidden.push(g.hint);
    }
    let moreHint = open ? T.step2.collapse : hidden.join(', ');
    if (!open && moreHint) moreHint = moreHint.charAt(0).toUpperCase() + moreHint.slice(1);
    const moreBtn = (open || hidden.length) ? h('button', {
      type: 'button', class: 'more-btn', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': 'more-emotions', 'data-fk': 'more',
      onclick: () => { moreOpen.set(date, !open); refresh(); }
    },
    h('span', { class: 'stack-4' }, h('span', { class: 'more-title' }, T.step2.more), h('span', { class: 'caption' }, moreHint)),
    icon(open ? 'chevronUp' : 'chevronDown')) : null;

    const otherLabel = () => (otherEmotion && !isBlank(otherEmotion.other_text) ? otherEmotion.other_text.trim() : OTHER);
    const sliderLabel = (e) => (e.name === OTHER ? otherLabel() : e.name);

    const before = emotions.length ? h('div', { class: 'stack-12 divider' },
      h('div', { class: 'label' }, T.step2.strengthTitle),
      emotions.map((e) => strengthScale({
        label: sliderLabel(e), value: e.before, ariaLabel: T.step2.strengthAria(sliderLabel(e)), fk: `before-${e.name}`, emo: e.name,
        onSet: (v) => { e.before = v; save(); }
      }))) : null;

    let hadE = !isBlank(abc.e_belief);
    const after = region(() => {
      if (isBlank(abc.e_belief) || !emotions.length) return null;
      // Прежнее значение («было 7») не показываем — ни в подписи, ни в aria.
      return h('div', { class: 'stack-12 divider' },
        h('div', { class: 'label' }, T.step2.afterTitle),
        emotions.map((e) => strengthScale({
          label: sliderLabel(e), value: e.after, ariaLabel: T.step2.afterAria(sliderLabel(e)), fk: `after-${e.name}`, emo: e.name,
          onSet: (v) => { e.after = v; save(); }
        })),
        h('div', { class: 'caption' }, T.step2.afterNote));
    });

    const setText = (key) => (v) => { abc[key] = textOrNull(v); save(true); };

    return [
      stepHeader(2, T.common.back, () => leaveStep(1)),
      fork,
      h('div', { id: 'abc', class: 'stack-16' },
        card('gap-8',
          h('label', { for: 'a', class: 'q-label' }, badge('A'), T.step2.aQ),
          textField({ id: 'a', value: abc.a_event, placeholder: T.step2.aPh, rows: 2, onInput: setText('a_event') })),

        card('gap-16',
          h('div', { class: 'stack-4' },
            h('div', { class: 'q-label', id: 'c-title' }, badge('C'), T.step2.cQ),
            h('div', { class: 'caption indent' }, T.step2.cCount(emotions.length))),
          main.map(groupBlock),
          moreBtn,
          extraVisible.length ? h('div', { id: 'more-emotions', class: 'stack-16' }, extraVisible.map(groupBlock)) : null,
          otherEmotion ? otherField({
            id: 'emo-other', value: otherEmotion.other_text, placeholder: T.step2.otherPh, required: !crisis,
            onInput: (v) => {
              otherEmotion.other_text = textOrNull(v);
              save(true);
              footer.update();
              // Подпись слайдеров «другое» — словами пользователя, сразу при наборе.
              document.querySelectorAll(`[data-emo="${OTHER}"]`).forEach((n) => { n.textContent = otherLabel(); });
            }
          }) : null,
          before,
          h('div', { class: 'stack-8 divider' },
            h('label', { for: 'did', class: 'label' }, T.step2.behaviorQ),
            textField({ id: 'did', value: abc.c_behavior, single: true, onInput: setText('c_behavior') }))),

        card('gap-8',
          h('div', { class: 'stack-4' },
            h('label', { for: 'b', class: 'q-label' }, badge('B'), T.step2.bQ),
            h('div', { id: 'b-hint', class: 'caption indent' }, T.step2.bHint)),
          textField({ id: 'b', value: abc.b_belief, rows: 2, describedby: 'b-hint', onInput: setText('b_belief') })),

        card('dashed gap-16',
          h('div', { class: 'stack-8' },
            h('div', { class: 'row-center' }, h('div', { id: 'd-title', class: 'q-label' }, badge('D', 'warm'), T.step2.dTitle), optional()),
            h('ul', { class: 'd-list', 'aria-labelledby': 'd-title' }, T.step2.dQuestions.map((q) => h('li', null, q)))),
          h('div', { class: 'stack-8' },
            h('label', { for: 'e', class: 'q-label' }, badge('E', 'warm'), T.step2.eQ),
            textField({
              id: 'e', value: abc.e_belief, placeholder: T.step2.ePh, rows: 2,
              onInput: (v) => {
                abc.e_belief = textOrNull(v);
                const hasE = !isBlank(abc.e_belief);
                if (!hasE) emotions.forEach((x) => { x.after = null; });
                save(true);
                if (hasE !== hadE) { hadE = hasE; after.update(); }
              }
            })),
          after)),
      footer
    ];
  }

  // --- Шаг 3: хорошее, действие, дневник, «что мешало», «Сейчас мне» ---
  function step3() {
    // Вариант «хорошего» фиксируется при показе шага; пока поле пустое, он следует за настроением.
    const variant = goodVariant(dayNumber(date, exp.start_date), ev.mood);
    if (!ev.good) { ev.good = { variant, text: null }; save(); }
    else if (isBlank(ev.good.text) && ev.good.variant !== variant) { ev.good.variant = variant; save(); }
    const gv = GOOD_VARIANTS[ev.good.variant];

    const fr = ev.friction || { reasons: [], other_text: null };
    const otherOn = fr.reasons.includes(OTHER);
    const footer = region(() => {
      const f = ev.friction;
      const frictionMissing = !crisis && !(f && f.reasons.length);
      const otherMissing = !crisis && !!f && f.reasons.includes(OTHER) && isBlank(f.other_text);
      return [
        editing ? null : hint(T.step3.autoNote),
        frictionMissing ? hint(T.step3.needFriction) : null,
        otherMissing ? hint(T.step3.needOther) : null,
        button(T.step3.finish, () => leaveStep('finish'), { large: true, disabled: frictionMissing || otherMissing, fk: 'finish' })
      ];
    }, 'div', 'footer');

    const toggleFriction = (name) => {
      let reasons = fr.reasons;
      if (name === FRICTION_NONE) reasons = reasons.includes(FRICTION_NONE) ? [] : [FRICTION_NONE];
      else {
        reasons = reasons.filter((x) => x !== FRICTION_NONE);
        reasons = reasons.includes(name) ? reasons.filter((x) => x !== name) : [...reasons, name].sort(byOrder(FRICTION_OPTIONS));
      }
      const otherText = reasons.includes(OTHER) ? fr.other_text : null;
      ev.friction = reasons.length ? { reasons, other_text: otherText } : null;
      save();
      refresh();
    };

    const service = crisis ? null : [
      h('div', { class: 'card', role: 'group', 'aria-labelledby': 'friction-title', 'aria-describedby': 'friction-hint', 'aria-required': 'true' },
        h('div', { class: 'stack-4' },
          h('div', { id: 'friction-title', class: 'title' }, T.step3.frictionQ, reqStar()),
          h('div', { id: 'friction-hint', class: 'caption' }, T.step3.frictionHint)),
        chips(FRICTION_OPTIONS, (n) => fr.reasons.includes(n), toggleFriction, 'fr'),
        otherOn ? otherField({
          id: 'fr-other', value: fr.other_text, placeholder: T.common.otherPlaceholder,
          onInput: (v) => { ev.friction.other_text = textOrNull(v); save(true); footer.update(); }
        }) : null),
      card('gap-8',
        titleRow('now-title', T.step3.nowQ, { opt: true }),
        segments(NOW_OPTIONS, ev.now_vs_start, (v) => { ev.now_vs_start = v; save(); refresh(); }, { labelledby: 'now-title', fk: 'now' }),
        ev.now_vs_start === 'worse' ? h('div', { class: 'caption' }, T.step3.nowWorse) : null)
    ];

    return [
      stepHeader(3, T.common.back, () => leaveStep(2)),
      h('div', { class: 'stack-4' },
        h('h1', { class: 'h2 q-head' },
          h('span', { class: 'badge rose', 'aria-hidden': 'true' }, icon('heart', 16)),
          h('label', { for: 'good' }, gv.question)),
        h('div', { class: 'body-sm indent' }, T.common.optional)),
      card('', textField({
        id: 'good', value: ev.good.text, placeholder: gv.placeholder, rows: gv.rows,
        onInput: (v) => { ev.good.text = textOrNull(v); save(true); }
      })),
      h('div', { class: 'stack-4' },
        h('h2', { class: 'h2' }, h('label', { for: 'act' }, T.step3.actionQ)),
        h('div', { id: 'act-hint', class: 'body-sm' }, T.step3.actionHint)),
      card('', textField({
        id: 'act', value: ev.action_tomorrow, placeholder: T.step3.actionPh, rows: 2, describedby: 'act-hint',
        onInput: (v) => { ev.action_tomorrow = textOrNull(v); save(true); }
      })),
      card('gap-8',
        h('div', { class: 'row-between' }, h('label', { for: 'diary', class: 'title' }, T.step3.journal), optional()),
        textField({
          id: 'diary', value: ev.journal, placeholder: T.step3.journalPh, rows: 4,
          onInput: (v) => { ev.journal = textOrNull(v); save(true); },
          // Время в поле дневника не входит в H3 (копится в journal_ms).
          onFocus: () => timer.setJournal(true),
          onBlur: () => timer.setJournal(false)
        })),
      service,
      footer
    ];
  }

  const parts = step === 1 ? step1() : step === 2 ? step2() : step3();
  const el = h('main', { class: 'screen inner' }, parts);

  // Уход без кнопок формы (системная кнопка «назад»): шаг тоже сохраняется и проверяется.
  // Если при этом ушли из круга совсем (а не на соседний шаг), правка завершённого круга заканчивается.
  return {
    el,
    leave: () => {
      if (checked) return null;
      const show = runCheck();
      if (parseRoute().name !== 'evening') endEdit();
      return { show, backHash: eveningHash(date, step) };
    }
  };
}
