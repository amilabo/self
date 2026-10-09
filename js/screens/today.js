// Экран «Сегодня» (макет Main, DESIGN.md «Карточки на «Сегодня»»).

import { h, card, button, icon, dock, linkCard } from '../ui.js';
import { T, TODAY_HABIT_ORDER, GAD7, ELLIS } from '../content.js';
import { S, markKey, setUi } from '../store.js';
import { logicalDate, dayNumber, weekdayLong, dayMonth, timeOfIso } from '../dates.js';
import { phaseOf, isCounted, exportDue, weekView, countedInExperiment } from '../rules.js';
import { isStandalone, canPromptInstall, promptInstall } from '../install.js';
import { checkPersist } from '../actions.js';
import { go, refresh, eveningHash, testHash } from '../nav.js';
import { renderPrep } from './prep.js';
import { stateOf, ellisFile, draftAnswered } from './testcommon.js';

const actionLine = (label) => h('div', { class: 'action-line' }, label, icon('chevronRight', 16));
const doneStatus = (iso) => h('div', { class: 'done-status' }, icon('check', 16), T.today.doneAt(timeOfIso(iso)));

function morningCard(today) {
  const m = S.mornings.get(today);
  const done = m && (m.intention || m.resource != null);
  if (!done) {
    return h('a', { href: '#/morning', class: 'card card-link gap-8' },
      h('div', { class: 'overline' }, T.today.morningOverline),
      h('div', { class: 'stack-4' },
        h('div', { class: 'title' }, T.today.morningTodoTitle),
        h('div', { class: 'body-sm' }, T.today.morningTodoText)),
      actionLine(T.today.morningStart));
  }
  return h('a', { href: '#/morning', class: 'card card-link gap-8' },
    h('div', { class: 'row-center' }, h('div', { class: 'overline' }, T.today.morningOverline), doneStatus(m.created_at)),
    m.intention ? h('div', { class: 'quote' }, `«${m.intention}»`) : null,
    actionLine(T.today.morningEdit));
}

// «Тест ещё не пройден»: пока открыто окно (дни 0–3 и с дня 21) и результата нет (EXPERIMENT.md).
// Тест Эллиса — только исходный замер: он обязателен, повторный — по желанию, о нём не напоминаем.
function testCards() {
  const cards = [];
  const gad = stateOf(GAD7.test_id);
  if (gad.open) {
    cards.push(linkCard(testHash(GAD7.test_id, 'today'), T.today.gadTodoTitle,
      gad.open === 'baseline' ? T.today.gadTodoBaseline : T.today.gadTodoFinal));
  }
  const ellis = stateOf(ELLIS.test_id);
  if (ellis.open === 'baseline') {
    const answered = draftAnswered(ELLIS.test_id, ellis.open);
    // Без загруженного файла — на «Тесты», где его загружают.
    const href = ellisFile() ? testHash(ELLIS.test_id, 'today') : '#/tests';
    cards.push(linkCard(href, T.today.ellisTodoTitle,
      answered ? T.today.ellisTodoResume(answered, ELLIS.items) : T.today.ellisTodoBaseline));
  }
  return cards;
}

function eveningCard(today, after) {
  const ev = S.evenings.get(today);
  const step = S.ui.evening_step && S.ui.evening_step.date === today ? S.ui.evening_step.step : 1;
  const open = () => go(eveningHash(today, ev ? step : 1));
  if (ev && ev.completed_at) {
    // Завершённый круг можно изменить, пока идёт его логический день (до 04:00), — как утро.
    // Статус — время первого завершения (completed_at не меняется при правке).
    return h('a', { href: eveningHash(today, 1), class: 'card card-link gap-8', 'data-fk': 'evening-edit' },
      h('div', { class: 'row-center' }, h('div', { class: 'overline' }, T.today.eveningOverline), doneStatus(ev.completed_at)),
      h('div', { class: 'h3' }, T.today.eveningTitle),
      actionLine(T.today.eveningEdit));
  }
  if (ev && ev.crisis) {
    // Вечер с «Кризисом» засчитан, круг можно не заканчивать, но можно и вернуться к записи.
    return h('a', { href: eveningHash(today, step), class: 'card card-link gap-8' },
      h('div', { class: 'row-center' }, h('div', { class: 'overline' }, T.today.eveningOverline),
        h('div', { class: 'done-status' }, icon('check', 16), T.today.eveningCounted)),
      h('div', { class: 'h3' }, T.today.eveningTitle),
      actionLine(T.today.eveningBackToRecord));
  }
  const label = ev ? T.today.eveningContinue : T.today.eveningStart;
  if (after) {
    return card('',
      h('div', { class: 'stack-4' },
        h('div', { class: 'overline' }, T.today.eveningOverline),
        h('div', { class: 'h3' }, T.today.eveningTitle),
        h('div', { class: 'body-sm' }, T.today.eveningAfterText)),
      button(label, open, { kind: 'secondary', fk: 'evening-start' }));
  }
  return card('accent',
    h('div', { class: 'stack-4' },
      h('div', { class: 'overline' }, T.today.eveningOverline),
      h('div', { class: 'h3' }, T.today.eveningTitle),
      h('div', { class: 'body-sm' }, T.today.eveningText)),
    button(label, open, { kind: 'on-accent', fk: 'evening-start' }));
}

function installCard(today) {
  if (isStandalone() || S.ui.install_later === today) return null;
  const later = () => { setUi('install_later', today); refresh(); };
  return h('section', { class: 'card', 'aria-labelledby': 'install-title' },
    h('div', { class: 'stack-4' },
      h('h2', { id: 'install-title', class: 'title' }, T.today.installTitle),
      h('div', { class: 'body-sm' }, T.today.installText)),
    canPromptInstall()
      ? h('div', { class: 'pair' },
        button(T.common.later, later, { kind: 'secondary' }),
        button(T.today.installBtn, async () => { await promptInstall(); checkPersist(); refresh(); }))
      : [h('div', { class: 'body-sm' }, T.today.installFallback), button(T.common.later, later, { kind: 'secondary' })]);
}

function exportCard(today, day) {
  if (!exportDue(S, day) || S.ui.export_later === today) return null;
  return h('section', { class: 'card', 'aria-labelledby': 'export-title' },
    h('div', { class: 'stack-4' },
      h('h2', { id: 'export-title', class: 'title' }, T.today.exportTitle),
      h('div', { class: 'body-sm' }, T.today.exportText)),
    h('div', { class: 'pair' },
      button(T.common.later, () => { setUi('export_later', today); refresh(); }, { kind: 'secondary' }),
      button(T.today.exportBtn, () => go('#/data'))));
}

function weekCard(today) {
  const w = weekView(S, today);
  return card('',
    h('div', { class: 'row-between' },
      h('div', { class: 'title' }, T.today.weekTitle(w.weekNo, w.fromDay, w.toDay)),
      h('div', { class: 'body-sm' }, T.today.weekCount(w.count))),
    h('div', { class: 'week' }, w.dots.map((d) => h('div', { class: 'week-day' },
      h('div', { class: `dot ${d.state}` }, d.state === 'done' ? icon('check', 16, 3) : null),
      h('div', { class: d.isToday ? 'day-label today-label' : 'day-label' }, d.label)))));
}

function habitsBlock(today) {
  const ev = S.evenings.get(today);
  const byId = Object.fromEntries(S.habits.map((x) => [x.id, x]));
  const chipsEls = TODAY_HABIT_ORDER.filter((id) => byId[id]).map((id) => {
    const mark = S.marks.get(markKey(today, id));
    const done = !!(mark && mark.done);
    return h('div', { class: done ? 'status-chip done' : 'status-chip' }, done ? icon('check', 16) : null, byId[id].name);
  });
  return h('div', { class: 'stack-8' },
    h('div', { class: 'row-between' },
      h('div', { class: 'title' }, T.today.habitsTitle),
      h('div', { class: 'opt' }, isCounted(ev) ? T.today.habitsAfter : T.today.habitsDay)),
    h('div', { class: 'chips' }, chipsEls));
}

export function renderToday() {
  const exp = S.experiment;
  const today = logicalDate();
  if (!exp || dayNumber(today, exp.start_date) <= 0) return renderPrep();
  const day = dayNumber(today, exp.start_date);
  const phase = phaseOf(day);
  const memoryWarn = S.memoryOnly ? card('warm', h('div', { class: 'body-sm' }, T.data.memoryOnly)) : null;

  let body;
  if (phase === 'after') {
    body = [
      card('accent',
        h('div', { class: 'stack-4' },
          h('div', { class: 'overline' }, T.today.finalOverline),
          h('h2', { class: 'h3' }, T.today.finalExportTitle),
          h('div', { class: 'body-sm' }, T.today.finalExportText(countedInExperiment(S)))),
        button(T.today.exportBtn, () => go('#/data'), { kind: 'on-accent' })),
      testCards(),
      eveningCard(today, true)
    ];
  } else {
    body = [morningCard(today), testCards(), eveningCard(today, false), installCard(today), exportCard(today, day), weekCard(today), habitsBlock(today)];
  }

  const meta = phase === 'after'
    ? T.today.metaFinal(weekdayLong(today), dayMonth(today))
    : T.today.meta(weekdayLong(today), dayMonth(today), day);

  const content = h('main', { class: 'screen tab' },
    memoryWarn,
    h('div', { class: 'stack-4' },
      h('div', { class: 'meta' }, meta),
      h('h1', { class: 'h1' }, phase === 'after' ? T.today.finalTitle : T.today.title)),
    body);
  return { el: h('div', { class: 'page' }, content, dock('today')) };
}
