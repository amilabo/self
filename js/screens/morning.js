// Утренняя настройка (CONTENT.md, «Утренний блок»; макет Morning).

import { h, card, button, scale10, textField, backLink, optional, quote } from '../ui.js';
import { T, QUESTION_SET_VERSION } from '../content.js';
import { S, saveMorning, putMark, markKey, flushPending } from '../store.js';
import { logicalDate, dayNumber, isoLocal } from '../dates.js';
import { prevAction } from '../rules.js';
import { decideStepSignals } from '../safety.js';
import { applyStepSignals, signalContext } from '../actions.js';
import { showSafety } from '../sheets.js';
import { go, refresh } from '../nav.js';
import { textOrNull } from '../util.js';

export function renderMorning() {
  const exp = S.experiment;
  const date = logicalDate();
  if (!exp || dayNumber(date, exp.start_date) <= 0) { go('#/today', { replace: true }); return null; }

  const getOrCreate = () => {
    let m = S.mornings.get(date);
    if (!m) {
      const now = isoLocal();
      m = { date, question_set_version: QUESTION_SET_VERSION, intention: null, resource: null, created_at: now, updated_at: now };
    }
    return m;
  };
  const existing = S.mornings.get(date);

  const setIntention = (v) => {
    const m = getOrCreate();
    m.intention = textOrNull(v);
    saveMorning(m, { debounce: true });
    // Привычка «Утренняя настройка» — автоматически по непустому намерению.
    if (m.intention) putMark(date, 'morning_setup', true, 'auto');
    else if (S.marks.has(markKey(date, 'morning_setup'))) putMark(date, 'morning_setup', false, 'auto');
  };
  const setResource = (v) => {
    const m = getOrCreate();
    m.resource = v;
    saveMorning(m);
    refresh();
  };

  // Проверка текста при сохранении («Готово» или «назад»).
  let checked = false;
  const runCheck = () => {
    const m = S.mornings.get(date);
    const text = m && m.intention;
    if (!text) return null;
    const ev = S.evenings.get(date);
    const res = decideStepSignals(S, {
      date, fields: [{ field: 'morning.intention', text }], checkMood: false,
      crisisEvening: !!(ev && ev.crisis), deleted: false, ...signalContext(date)
    });
    // Утром вечерней записи ещё нет: флаг «Кризис» на вечер не ставим, событие пишется в журнал.
    applyStepSignals({ ...res, setCrisis: false }, date, null);
    return res.show && res.show.kind === 'crisis' ? { ...res.show, morning: true } : res.show;
  };
  const leave = () => {
    flushPending();
    const show = runCheck();
    checked = true;
    if (show) {
      showSafety(show, { onBack: () => { checked = false; }, onHelp: () => go('#/help', { skipLeaveCheck: true }) });
      return;
    }
    go('#/today', { skipLeaveCheck: true });
  };

  const yesterday = prevAction(S, date, { forEvening: false });
  const intentionBlock = h('div', { class: yesterday ? 'stack-8 divider' : 'stack-8' },
    h('label', { for: 'intent', class: 'title' }, T.morning.intentionQ),
    textField({ id: 'intent', value: existing && existing.intention, placeholder: T.morning.intentionPh, rows: 3, describedby: 'intent-hint', onInput: setIntention }),
    h('div', { id: 'intent-hint', class: 'caption' }, T.morning.intentionHint));

  const el = h('main', { class: 'screen inner' },
    backLink(T.common.today, leave),
    h('div', { class: 'stack-4' },
      h('div', { class: 'meta' }, T.morning.meta),
      h('h1', { class: 'h1' }, T.morning.title)),
    card('gap-16', yesterday ? quote(T.morning.yesterday, yesterday) : null, intentionBlock),
    card('',
      h('div', { class: 'stack-4' },
        h('div', { class: 'row-between' }, h('div', { id: 'resource', class: 'title' }, T.morning.resourceTitle), optional()),
        h('div', { id: 'resource-hint', class: 'body-sm' }, T.morning.resourceHint)),
      scale10({
        value: existing ? existing.resource : null, onPick: setResource, labelledby: 'resource', describedby: 'resource-hint',
        allowClear: true, fk: 'resource', poles: [T.morning.resourceLow, T.morning.resourceHigh]
      })),
    h('div', { class: 'footer' }, button(T.common.done, leave, { large: true, fk: 'morning-done' })));

  // Уход системной кнопкой «назад»: проверяем текст и показываем окно поверх следующего экрана.
  return { el, leave: () => (checked ? null : { show: runCheck(), backHash: '#/morning' }) };
}
