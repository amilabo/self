// Экран «Если очень плохо» (CONTENT.md, тексты дословно). Без номеров и контактов,
// без нижней кнопки: выход только ссылкой «назад» на экран, с которого пришли.

import { h, card, backLink } from '../ui.js';
import { T, HELP } from '../content.js';
import { back, canGoBack } from '../nav.js';

export function renderHelp() {
  const el = h('main', { class: 'screen inner help' },
    backLink(canGoBack() ? T.common.back : T.common.today, () => back('#/today')),
    h('div', { class: 'stack-8' },
      h('h1', { class: 'h1' }, HELP.title),
      h('div', { class: 'body' }, HELP.intro)),
    h('section', { class: 'card', 'aria-labelledby': 'help-now' },
      h('h2', { id: 'help-now', class: 'title' }, HELP.nowTitle),
      h('ol', { class: 'help-steps' }, HELP.steps.map((t, i) => h('li', null,
        h('span', { class: 'badge', 'aria-hidden': 'true' }, String(i + 1)),
        h('span', { class: 'body' }, t))))),
    h('section', { class: 'card warm gap-8', 'aria-labelledby': 'help-danger' },
      h('h2', { id: 'help-danger', class: 'title' }, HELP.dangerTitle),
      h('div', { class: 'body' }, HELP.dangerText)),
    h('section', { class: 'card gap-8', 'aria-labelledby': 'help-long' },
      h('h2', { id: 'help-long', class: 'title' }, HELP.longTitle),
      h('div', { class: 'body' }, HELP.longText)),
    h('div', { class: 'quote' }, HELP.footer));
  return { el };
}
