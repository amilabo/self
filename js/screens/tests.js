// Экран «Тесты» (макет Tests, DESIGN.md «Заблокированный тест», «Состояния GAD-7 на «Тестах»»).
// Окна — EXPERIMENT.md, «Тесты: окна и состояние «не пройден»».

import { h, button, icon, dock, kvRow } from '../ui.js';
import { T, GAD7, ELLIS } from '../content.js';
import { testStatus } from '../actions.js';
import { go, testHash, resultHash } from '../nav.js';
import { stateOf, resultDay, bandShort, ellisFile, draftAnswered, ellisGetBlock } from './testcommon.js';

const lockPlate = (text, iconName = 'lock') => h('div', { class: 'lock-plate' }, icon(iconName, 16), text);
const gadValue = (rec) => T.tests.gadValue(rec.score, bandShort(rec), resultDay(rec));

function statusLine(st) {
  if (!st) return null;
  return st.ok
    ? h('div', { class: 'ok-line small', role: 'status' }, icon('check', 16), st.text)
    : h('div', { class: 'error', role: 'status' }, icon('alert', 16), st.text);
}

function gadCard() {
  const st = stateOf(GAD7.test_id);
  const answered = draftAnswered(GAD7.test_id, st.open);
  const take = () => go(testHash(GAD7.test_id));
  let rows;
  let action;
  if (st.status === 'todo') {
    rows = [kvRow(T.tests.rowBaseline, T.tests.notPassed)];
    action = button(answered ? T.tests.resume : T.tests.take, take, { fk: 'gad-take' });
  } else if (st.status === 'done') {
    rows = [kvRow(T.tests.rowLast, gadValue(st.baseline))];
    action = lockPlate(T.tests.locked21);
  } else if (st.status === 'missed') {
    rows = [kvRow(T.tests.rowBaseline, T.tests.missed)];
    action = lockPlate(T.tests.locked21);
  } else if (st.status === 'final_todo') {
    rows = [st.baseline ? kvRow(T.tests.rowLast, gadValue(st.baseline)) : kvRow(T.tests.rowBaseline, T.tests.missed)];
    action = button(answered ? T.tests.resume : T.tests.take, take, { fk: 'gad-take' });
  } else {
    rows = [
      st.baseline ? kvRow(T.tests.rowBaseline, gadValue(st.baseline)) : kvRow(T.tests.rowBaseline, T.tests.missed),
      kvRow(T.tests.rowFinal, gadValue(st.final))
    ];
    action = lockPlate(T.tests.finalDone, 'check');
  }
  // Посмотреть прошлый результат можно, пока тест закрыт (интерпретация и текст про специалиста).
  const view = !st.open && st.last
    ? button(T.tests.viewResult, () => go(resultHash(st.last.id)), { kind: 'secondary', fk: 'gad-view' }) : null;
  return h('section', { class: 'card', 'aria-labelledby': 'gad-title' },
    h('div', { class: 'stack-4' },
      h('h2', { id: 'gad-title', class: 'h3' }, T.tests.gadTitle),
      h('div', { class: 'body-sm' }, T.tests.gadSub)),
    h('div', { class: 'kv-list divider-12' }, rows),
    action, view);
}

function ellisCard() {
  const file = ellisFile();
  const st = stateOf(ELLIS.test_id);
  const head = h('div', { class: 'stack-4' },
    h('h2', { id: 'ellis-title', class: 'h3' }, T.tests.ellisTitle),
    h('div', { class: 'body-sm' }, T.tests.ellisSub));

  const rows = [];
  if (st.status === 'todo') rows.push(kvRow(T.tests.rowBaseline, T.tests.notPassed));
  else if (st.status === 'missed') rows.push(kvRow(T.tests.rowBaseline, T.tests.missed));
  else if (st.last) rows.push(kvRow(T.tests.rowLast, T.tests.dayValue(resultDay(st.last))));
  else rows.push(kvRow(T.tests.rowBaseline, T.tests.missed));
  if (st.status === 'done') rows.push(kvRow(T.tests.rowNext, T.tests.ellisNext));

  const view = st.last ? button(T.tests.viewResult, () => go(resultHash(st.last.id)), { kind: 'secondary', fk: 'ellis-view' }) : null;

  let action = null;
  let note = null;
  if (st.open && !file) {
    // Без загруженного текста тест не пройти: открытого текста нет в коде формы (пароль или файл).
    action = ellisGetBlock({ idPrefix: 'ellis', kind: st.last ? 'secondary' : 'primary' });
  } else if (st.open) {
    const answered = draftAnswered(ELLIS.test_id, st.open);
    action = button(answered ? T.tests.resume : T.tests.take, () => go(testHash(ELLIS.test_id)), { fk: 'ellis-take' });
    if (answered) note = h('div', { class: 'caption' }, T.tests.answered(answered, ELLIS.items));
  } else if (st.status === 'missed') {
    action = lockPlate(T.tests.locked21);
  }

  return h('section', { class: 'card', 'aria-labelledby': 'ellis-title' },
    head,
    h('div', { class: 'kv-list divider-12' }, rows),
    note, action, statusLine(testStatus.ellis), view);
}

export function renderTests() {
  const content = h('main', { class: 'screen tab' },
    h('h1', { class: 'h1' }, T.tests.title),
    gadCard(),
    ellisCard(),
    h('div', { class: 'caption' }, T.tests.footer));
  return { el: h('div', { class: 'page' }, content, dock('tests')) };
}
