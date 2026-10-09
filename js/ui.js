// Построение DOM и общие компоненты дизайн-системы (docs/DESIGN.md).
// Без фреймворка: экран собирается функцией, при нажатиях экран пересобирается целиком,
// а при наборе текста обновляются только зависимые части — чтобы не сбивать клавиатуру.

import { T } from './content.js';

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') el.value = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === true) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

// Область, которую можно перерисовать отдельно от остального экрана.
export function region(render, tag = 'div', cls = 'region') {
  const el = h(tag, { class: cls });
  el.update = () => el.replaceChildren(...[render()].flat(Infinity).filter((x) => x != null && x !== false));
  el.update();
  return el;
}

// --- Иконки: инлайн stroke-SVG, viewBox 24, stroke 2 ---
const PATHS = {
  check: '<path d="M5 12l5 5L20 7"></path>',
  chevronRight: '<path d="M9 6l6 6-6 6"></path>',
  chevronLeft: '<path d="M15 18l-6-6 6-6"></path>',
  chevronDown: '<path d="M6 9l6 6 6-6"></path>',
  chevronUp: '<path d="M6 15l6-6 6 6"></path>',
  lifebuoy: '<circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="4"></circle><path d="M5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6"></path>',
  sun: '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"></rect><path d="M9 3h6v2H9z"></path><path d="M9 13l2 2 4-4"></path>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><path d="M12 10v6M9 13l3 3 3-3"></path>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path>',
  alert: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v6M12 16.5v.5"></path>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"></path>'
};

export function icon(name, size = 24, strokeWidth) {
  const sw = strokeWidth || (name === 'check' ? 2.5 : 2);
  const t = document.createElement('template');
  t.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;
  return t.content.firstChild;
}

// --- Мелкие элементы ---
export const optional = () => h('div', { class: 'opt' }, T.common.optional);
export const reqStar = () => h('span', { class: 'req', 'aria-hidden': 'true' }, ' *');

export function titleRow(id, text, { opt = false, required = false } = {}) {
  return h('div', { class: 'row-between' },
    h('div', { id, class: 'title' }, text, required ? reqStar() : null),
    opt ? optional() : null);
}

export function card(cls, ...children) {
  return h('div', { class: `card ${cls || ''}`.trim() }, ...children);
}

export function button(label, onClick, { kind = 'primary', large = false, disabled = false, fk, attrs = {} } = {}) {
  return h('button', {
    type: 'button',
    class: `btn btn-${kind}${large ? ' btn-lg' : ''}`,
    disabled,
    'data-fk': fk,
    onclick: disabled ? null : onClick,
    ...attrs
  }, label);
}

// Шкала 1–10: сетка 5 × 2, role="radiogroup". allowClear — значение снимается повторным нажатием.
export function scale10({ value, onPick, labelledby, describedby, required = false, allowClear = false, fk, poles }) {
  const cells = [];
  for (let n = 1; n <= 10; n++) {
    const on = n === value;
    cells.push(h('button', {
      type: 'button', role: 'radio', class: 'cell', 'aria-checked': on ? 'true' : 'false', 'data-fk': `${fk}-${n}`,
      onclick: () => onPick(on && allowClear ? null : n)
    }, String(n)));
  }
  return h('div', { class: 'stack-8' },
    h('div', { class: 'scale', role: 'radiogroup', 'aria-labelledby': labelledby, 'aria-describedby': describedby, 'aria-required': required ? 'true' : null }, cells),
    h('div', { class: 'poles' }, h('span', null, poles[0]), h('span', null, poles[1])));
}

// Сегменты «Да / Частично / Нет», «Хуже / Так же / Лучше», «Завтра / Сегодня».
export function segments(options, value, onPick, { labelledby, describedby, allowClear = true, fk, cols } = {}) {
  return h('div', {
    class: 'segs', role: 'radiogroup', 'aria-labelledby': labelledby, 'aria-describedby': describedby,
    'data-cols': String(cols || options.length)
  }, options.map((o) => {
    const on = o.key === value;
    return h('button', {
      type: 'button', role: 'radio', class: 'cell seg', 'aria-checked': on ? 'true' : 'false', 'data-fk': `${fk}-${o.key}`,
      onclick: () => onPick(on && allowClear ? null : o.key)
    }, o.label);
  }));
}

// Чипы множественного выбора: мягкая заливка с галочкой.
export function chips(options, isOn, onToggle, fk) {
  return h('div', { class: 'chips' }, options.map((name) => {
    const on = isOn(name);
    return h('button', {
      type: 'button', class: 'chip', 'aria-pressed': on ? 'true' : 'false', 'data-fk': `${fk}-${name}`,
      onclick: () => onToggle(name)
    }, on ? icon('check', 16) : null, name);
  }));
}

// Многострочное или однострочное поле. Значение в модель пишет onInput.
export function textField({ id, value, placeholder, rows = 2, single = false, onInput, describedby, labelledby, onFocus, onBlur, required = false }) {
  const attrs = {
    id, class: 'field', placeholder, 'aria-describedby': describedby, 'aria-labelledby': labelledby,
    'aria-required': required ? 'true' : null, 'data-fk': id,
    oninput: onInput ? (e) => onInput(e.target.value) : null, onfocus: onFocus, onblur: onBlur
  };
  if (single) return h('input', { type: 'text', autocomplete: 'off', ...attrs, value: value || '' });
  return h('textarea', { rows: String(rows), ...attrs, value: value || '' });
}

// Обязательное уточнение к «другое»: поле, ошибка под ним; ошибка обновляется при наборе.
export function otherField({ id, value, placeholder, onInput, required = true }) {
  const errId = `${id}-error`;
  const err = h('div', { id: errId, class: 'error' }, icon('alert', 16), T.common.otherError);
  const input = textField({ id, value, placeholder, single: true, describedby: errId, required });
  const sync = (v) => {
    const missing = required && !(v && v.trim());
    input.setAttribute('aria-invalid', missing ? 'true' : 'false');
    err.hidden = !missing;
  };
  input.addEventListener('input', (e) => { onInput(e.target.value); sync(e.target.value); });
  sync(value);
  return h('div', { class: 'stack-8' },
    h('label', { for: id, class: 'label' }, T.common.otherLabel, required ? reqStar() : null),
    input, err);
}

// Слайдер силы 0–10 с состоянием «не оценено» (null): пунктирный трек без ползунка.
export function strengthSlider({ label, value, ariaLabel, onSet, fk, emo }) {
  const rated = typeof value === 'number';
  const valueText = h('span', { class: rated ? 'slider-val rated' : 'slider-val' });
  const input = h('input', {
    type: 'range', min: '0', max: '10', step: '1', class: rated ? 'range' : 'range unrated',
    'aria-label': ariaLabel, 'data-fk': fk, value: String(rated ? value : 5)
  });
  const show = (v) => {
    const r = typeof v === 'number';
    valueText.textContent = r ? T.step2.rated(v) : T.step2.unrated;
    valueText.className = r ? 'slider-val rated' : 'slider-val';
    input.className = r ? 'range' : 'range unrated';
    input.setAttribute('aria-valuetext', r ? T.step2.rated(v) : T.step2.unratedAria);
  };
  const set = () => { const v = Number(input.value); show(v); onSet(v); };
  input.addEventListener('input', set);
  // Касание ровно в середину трека не меняет value и не даёт input — ставим значение по click.
  input.addEventListener('click', set);
  show(rated ? value : null);
  return h('div', { class: 'stack-4' },
    h('div', { class: 'slider-head' }, h('span', { class: 'slider-name', 'data-emo': emo }, label), valueText),
    input);
}

// Шапка шага: «назад», «Шаг N из 3», полоса прогресса.
export function stepHeader(step, backLabel, onBack) {
  const bar = h('div');
  bar.style.width = `${Math.round((step / 3) * 100)}%`;
  return h('div', { class: 'stack-8' },
    h('div', { class: 'row-center' },
      h('button', { type: 'button', class: 'back-link', onclick: onBack, 'data-fk': 'back' }, icon('chevronLeft'), backLabel),
      h('div', { class: 'meta' }, T.common.stepOf(step, 3))),
    h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Вечерний круг', 'aria-valuemin': '0', 'aria-valuemax': '3', 'aria-valuenow': String(step) }, bar));
}

export function backLink(label, onClick) {
  return h('button', { type: 'button', class: 'back-link', onclick: onClick, 'data-fk': 'back' }, icon('chevronLeft'), label);
}

export function helpLink(onClick) {
  return h('a', { href: '#/help', class: 'help-link', onclick: onClick }, icon('lifebuoy'), T.common.helpLink);
}

// Нижняя навигация и закреплённая над ней ссылка «Если очень плохо».
export function dock(active) {
  const tab = (key, hash, iconName, label) => h('a', {
    href: hash, class: `nav-tab${active === key ? ' active' : ''}`, 'aria-current': active === key ? 'page' : null
  }, h('span', { class: 'nav-tab-icon' }, icon(iconName)), label);
  return h('div', { class: 'dock' },
    helpLink(),
    h('nav', { class: 'nav', 'aria-label': 'Разделы' },
      tab('today', '#/today', 'sun', T.nav.today),
      tab('tests', '#/tests', 'clipboard', T.nav.tests),
      tab('data', '#/data', 'folder', T.nav.data)));
}

export function quote(caption, text) {
  return h('div', { class: 'stack-4' }, h('div', { class: 'caption' }, caption), h('div', { class: 'quote' }, `«${text}»`));
}
