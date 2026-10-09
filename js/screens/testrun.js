// Прохождение теста (макет TestQuestion): по одному вопросу, кнопка «Дальше» без автоперехода
// (DECISIONS 2026-10-04), все вопросы обязательны (CONTENT.md, «Правила ответов»).
// Ответы сразу пишутся в черновик (состояние интерфейса, не экспортируется): можно выйти и продолжить.

import { h, button, optionList, testHeader, region } from '../ui.js';
import { T, GAD7 } from '../content.js';
import { logicalDate, isoLocal } from '../dates.js';
import { newDraft, gadResult, ellisResult } from '../testrules.js';
import { saveDraft, saveTestResult } from '../actions.js';
import { go, refresh, fromHash, resultHash } from '../nav.js';
import { uuid } from '../util.js';
import { testDef, stateOf, draftOf } from './testcommon.js';

export function renderTestRun(route) {
  const { testId, from } = route;
  const def = testDef(testId);
  const st = def ? stateOf(testId) : null;
  // Тест закрыт (окно не открыто), неизвестен или нет файла теста Эллиса — на экран, откуда пришли.
  if (!def || !st.open) { go(def ? fromHash(from) : '#/tests', { replace: true }); return null; }

  let draft = draftOf(testId, st.open);
  if (!draft) {
    draft = newDraft({ testId, testVersion: def.testVersion, window: st.open, n: def.n, nowIso: isoLocal() });
    saveDraft(testId, draft);
  }
  const i = Math.min(Math.max(draft.index, 0), def.n - 1);
  const value = draft.answers[i];
  const isLast = i === def.n - 1;
  const isGad = testId === GAD7.test_id;

  const exit = () => go(fromHash(from));

  const showQuestion = (index) => {
    draft.index = index;
    saveDraft(testId, draft);
    refresh();
    // Новый вопрос — с начала экрана, фокус на формулировке (для чтения с экрана).
    window.scrollTo(0, 0);
    const q = document.getElementById('tq');
    if (q) q.focus({ preventScroll: true });
  };

  const pick = (v) => {
    draft.answers[i] = v;
    saveDraft(testId, draft);
    footer.update();
    // Отметка варианта без пересборки экрана, чтобы фокус остался на нём.
    for (const b of optionsEl.querySelectorAll('[role="radio"]')) {
      b.setAttribute('aria-checked', b.getAttribute('data-fk') === `opt-${v}` ? 'true' : 'false');
    }
  };

  const finish = () => {
    if (draft.answers.some((a) => a == null)) {
      // На всякий случай: вернуться к первому вопросу без ответа.
      showQuestion(draft.answers.findIndex((a) => a == null));
      return;
    }
    const base = { answers: draft.answers, window: draft.window, date: logicalDate(), nowIso: isoLocal(), makeId: uuid };
    const rec = isGad ? gadResult(base) : ellisResult({ ...base, test: def.file });
    saveTestResult(rec);
    go(resultHash(rec.id, from), { replace: true });
  };

  const next = () => (isLast ? finish() : showQuestion(i + 1));
  const back = () => (i === 0 ? exit() : showQuestion(i - 1));

  const optionsEl = optionList(def.options, value, pick, { labelledby: 'tq', fk: 'opt' });

  const footer = region(() => {
    const missing = draft.answers[i] == null;
    return [
      missing ? h('div', { class: 'caption center' }, T.testq.needAnswer) : null,
      h('div', { class: 'pair' },
        button(T.testq.back, back, { kind: 'secondary', large: true, fk: 'prev' }),
        button(isLast ? T.testq.finish : T.testq.next, next, { large: true, disabled: missing, fk: 'next' }))
    ];
  }, 'div', 'footer');

  // Инструкция: у GAD-7 — на каждом вопросе (она и есть вопрос), у Эллиса — на первом.
  const instruction = (isGad || i === 0) && def.instruction ? h('div', { class: 'body-sm' }, def.instruction) : null;
  const savedNote = !isGad && i === 0 ? h('div', { class: 'caption' }, T.testq.ellisSaved) : null;

  const el = h('main', { class: 'screen inner' },
    testHeader({
      meta: isGad ? T.testq.gadMeta(i + 1, def.n) : T.testq.ellisMeta(i + 1, def.n),
      index: i + 1, total: def.n, ariaLabel: T.testq.progressAria, onExit: exit, exitLabel: T.testq.exit
    }),
    h('div', { class: 'stack-8' },
      instruction,
      h('h1', { id: 'tq', class: 'h2', tabindex: '-1' }, def.items[i]),
      def.source ? h('div', { class: 'caption' }, def.source) : null,
      savedNote),
    optionsEl,
    footer);

  return { el };
}
