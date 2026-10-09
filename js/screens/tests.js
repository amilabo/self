// «Тесты» — заглушка до v0.2: текст GAD-7 ещё не сверен (OPEN_QUESTIONS).

import { h, card, icon, dock } from '../ui.js';
import { T } from '../content.js';

export function renderTests() {
  const content = h('main', { class: 'screen tab' },
    h('h1', { class: 'h1' }, T.tests.title),
    card('',
      h('div', { class: 'stack-4' },
        h('h2', { class: 'h3' }, T.tests.gadTitle),
        h('div', { class: 'body-sm' }, T.tests.gadText)),
      h('div', { class: 'lock-plate' }, icon('lock', 16), T.tests.soon)));
  return { el: h('div', { class: 'page' }, content, dock('tests')) };
}
