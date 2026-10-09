// Экран «Подготовка» (день 0): чеклист на месте «Сегодня» (EXPERIMENT.md, «Первый запуск»).

import { h, card, button, segments, icon, dock } from '../ui.js';
import { T } from '../content.js';
import { S, hasUserData, saveExperiment } from '../store.js';
import { logicalDate, addDays, weekdayDayMonth, weekdayLong, dayMonth } from '../dates.js';
import { isStandalone, canPromptInstall, promptInstall } from '../install.js';
import { createExperiment, checkPersist, startImport, dataStatus } from '../actions.js';
import { go, refresh } from '../nav.js';

// Выбор до нажатия «Готово» (если эксперимент ещё не создан). «Завтра» — настройка по умолчанию.
let pendingStart = 'tomorrow';
let savedNote = false;

export function renderPrep() {
  const today = logicalDate();
  const exp = S.experiment;
  const choice = exp ? (exp.start_date === today ? 'today' : 'tomorrow') : pendingStart;
  const startDate = choice === 'today' ? today : addDays(today, 1);
  const d21 = addDays(startDate, 20);
  const retro = addDays(startDate, 21);
  const hint = choice === 'today'
    ? T.prep.hintToday(dayMonth(startDate), dayMonth(d21), dayMonth(retro))
    : T.prep.hintTomorrow(weekdayDayMonth(startDate), dayMonth(d21), dayMonth(retro));

  const pickStart = (key) => {
    if (!key) return;
    if (!exp) { pendingStart = key; refresh(); return; }
    if (hasUserData()) return; // дату нельзя менять после первой записи
    exp.start_date = key === 'today' ? today : addDays(today, 1);
    saveExperiment(exp);
    go('#/today', { replace: true });
  };

  const installed = isStandalone();
  const installBlock = installed
    ? h('div', { class: 'ok-line' }, icon('check', 24), T.prep.installedText)
    : [
      h('div', { class: 'body-sm text' }, T.prep.installText),
      canPromptInstall() ? button(T.prep.installBtn, async () => { await promptInstall(); checkPersist(); refresh(); }) : null,
      h('div', { class: 'caption' }, T.prep.installFallback)
    ];

  const done = async () => {
    if (!exp) await createExperiment(startDate);
    checkPersist();
    if (startDate === today) { go('#/today', { replace: true }); return; }
    savedNote = true;
    refresh();
  };

  const importStatus = dataStatus.import && !dataStatus.import.ok
    ? h('div', { class: 'error', role: 'status' }, icon('alert', 16), dataStatus.import.text) : null;

  const content = h('main', { class: 'screen tab' },
    S.memoryOnly ? card('warm', h('div', { class: 'body-sm' }, T.data.memoryOnly)) : null,
    h('div', { class: 'stack-4' },
      h('div', { class: 'meta' }, T.today.metaPrep(weekdayLong(today), dayMonth(today))),
      h('h1', { class: 'h1' }, T.prep.title),
      h('div', { class: 'body-sm' }, T.prep.intro)),

    exp ? null : card('',
      h('div', { class: 'stack-4' },
        h('h2', { class: 'title' }, T.prep.restoreTitle),
        h('div', { class: 'body-sm' }, T.prep.restoreText)),
      button(T.prep.restoreBtn, () => startImport((ok) => { if (ok) go('#/today', { replace: true }); else refresh(); }), { kind: 'secondary' }),
      importStatus),

    card('gap-8',
      h('h2', { id: 'start-title', class: 'title' }, T.prep.startTitle),
      segments([{ key: 'tomorrow', label: T.prep.startTomorrow }, { key: 'today', label: T.prep.startToday }], choice, pickStart,
        { labelledby: 'start-title', describedby: 'start-hint', allowClear: false, fk: 'start' }),
      h('div', { id: 'start-hint', class: 'caption' }, hint)),

    card('gap-8', h('h2', { class: 'title' }, T.prep.installTitle), installBlock),

    card('warm gap-4', h('h2', { class: 'title' }, T.prep.storageTitle), h('div', { class: 'body-sm' }, T.storage.warning)),

    card('gap-4', h('h2', { class: 'title' }, T.prep.alarmTitle), h('div', { class: 'body-sm' }, T.prep.alarmText)),

    card('',
      h('div', { class: 'stack-4' }, h('h2', { class: 'title' }, T.prep.testTitle), h('div', { class: 'body-sm' }, T.prep.testText)),
      h('div', { class: 'lock-plate' }, icon('lock', 16), T.prep.testSoon)),

    h('div', { class: 'stack-8' },
      button(T.common.done, done, { large: true, fk: 'prep-done' }),
      savedNote && exp ? h('div', { class: 'ok-line', role: 'status' }, icon('check', 24), T.prep.savedTomorrow) : null)
  );
  return { el: h('div', { class: 'page' }, content, dock('today')) };
}
