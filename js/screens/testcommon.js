// Общее для экранов тестов: номер дня, описания тестов, состояние окна, подписи результатов.

import { GAD7, ELLIS, T } from '../content.js';
import { S } from '../store.js';
import { logicalDate, dayNumber } from '../dates.js';
import { testState, gadBand, draftFits, answeredCount } from '../testrules.js';
import { draftKey, startEllisLoad, unlockEllis, ellisEncAvailable, testStatus } from '../actions.js';
import { h, button } from '../ui.js';
import { refresh } from '../nav.js';

// Номер дня сегодня; до создания эксперимента — подготовка (день 0).
export function currentDay() {
  const exp = S.experiment;
  return exp ? dayNumber(logicalDate(), exp.start_date) : 0;
}

// День результата для подписи («день 0» — подготовка и всё, что раньше старта).
export function resultDay(rec) {
  const exp = S.experiment;
  return exp ? Math.max(0, dayNumber(rec.date, exp.start_date)) : 0;
}

export const ellisFile = () => S.privateTests[ELLIS.test_id] || null;

// Описание теста для экрана вопроса. Для Эллиса — из загруженного файла (или null, если файла нет).
export function testDef(testId) {
  if (testId === GAD7.test_id) {
    return {
      testId, testVersion: GAD7.test_version, n: GAD7.items.length,
      items: GAD7.items, options: GAD7.options, instruction: GAD7.instruction, source: GAD7.source
    };
  }
  if (testId === ELLIS.test_id) {
    const f = ellisFile();
    if (!f) return null;
    return {
      testId, testVersion: f.test_version, n: f.items.length,
      items: f.items.map((it) => it.text), options: f.options.map((label, i) => ({ value: i + 1, label })),
      instruction: f.instruction, source: null, file: f
    };
  }
  return null;
}

export function stateOf(testId) {
  return testState(S.tests, testId, currentDay());
}

// Черновик ответов, если он подходит к открытому окну и текущей версии текста.
export function draftOf(testId, window) {
  const def = testDef(testId);
  if (!def || !window) return null;
  const d = S.ui[draftKey(testId)];
  return draftFits(d, { testId, testVersion: def.testVersion, window, n: def.n }) ? d : null;
}

export const draftAnswered = (testId, window) => answeredCount(draftOf(testId, window));

export const bandShort = (rec) => gadBand(rec.score).short;

// «Загрузить файл вместо пароля» нажата — до перезагрузки страницы показываем загрузку файлом.
let ellisByFile = false;

// Как получить текст теста Эллиса, пока он не загружен (экран «Тесты» и пункт «Подготовки»).
// Есть шифр в форме (ellis.enc.js) — поле пароля и «Открыть тест», файл — запасной вариант.
// Шифра нет — только загрузка файлом. Пароль живёт только в поле ввода и нигде не сохраняется.
export function ellisGetBlock({ idPrefix, kind }) {
  const noteId = `${idPrefix}-note`;
  if (!ellisEncAvailable() || ellisByFile) {
    return [
      h('div', { class: 'body-sm', id: noteId }, T.tests.ellisNeedFile),
      button(T.tests.ellisLoad, () => startEllisLoad(() => refresh()), { kind, fk: 'ellis-load', attrs: { 'aria-describedby': noteId } })
    ];
  }
  const passId = `${idPrefix}-pass`;
  const input = h('input', {
    type: 'password', id: passId, class: 'field', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    enterkeyhint: 'go', 'aria-describedby': noteId, 'data-fk': 'ellis-pass'
  });
  const btn = h('button', { type: 'button', class: `btn btn-${kind}`, disabled: true, 'data-fk': 'ellis-open' }, T.tests.ellisOpen);
  let busy = false;
  const sync = () => { btn.disabled = busy || input.value === ''; };
  const open = async () => {
    if (busy || input.value === '') return;
    const pass = input.value;
    busy = true;
    input.disabled = true;
    btn.textContent = T.tests.ellisOpening;
    sync();
    await unlockEllis(pass);
    input.value = '';
    busy = false;
    refresh();
  };
  input.addEventListener('input', sync);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); open(); } });
  btn.addEventListener('click', open);
  const useFile = h('button', {
    type: 'button', class: 'link-btn', 'data-fk': 'ellis-use-file',
    onclick: () => { ellisByFile = true; testStatus.ellis = null; refresh(); }
  }, T.tests.ellisUseFile);
  return [
    h('div', { class: 'body-sm', id: noteId }, T.tests.ellisNeedPass),
    h('div', { class: 'stack-8' }, h('label', { for: passId, class: 'label' }, T.tests.ellisPassLabel), input),
    btn,
    useFile
  ];
}
