// Нижние листы и полноэкранное окно (DESIGN.md: «Сигналы безопасности», «Лист подтверждения»).
// Окна безопасности закрываются только кнопками; листы подтверждения — ещё и тапом по затемнению.

import { h, button, icon } from './ui.js';
import { T, SAFETY } from './content.js';

let current = null;
const listeners = new Set();

export function onOverlayChange(fn) { listeners.add(fn); }
const emit = () => { for (const fn of listeners) fn(current); };
export const currentOverlay = () => current;

export function closeOverlay() {
  if (!current) return;
  document.getElementById('overlay').replaceChildren();
  document.body.classList.remove('modal-open');
  const app = document.getElementById('app');
  if (app) app.inert = false;
  current = null;
  emit();
}

function openOverlay(node, { safety = false, dismiss = null, full = false } = {}) {
  closeOverlay();
  const scrim = full ? null : h('div', { class: 'scrim', 'aria-hidden': 'true', onclick: dismiss || null });
  document.getElementById('overlay').replaceChildren(h('div', { class: 'overlay' }, scrim, node));
  document.body.classList.add('modal-open');
  const app = document.getElementById('app');
  if (app) app.inert = true;
  current = { safety, dismiss };
  emit();
  const f = node.querySelector('[data-autofocus]');
  if (f) f.focus({ preventScroll: true });
}

function sheet(id, title, body, actions, role = 'dialog') {
  return h('div', { class: 'sheet', role, 'aria-modal': 'true', 'aria-labelledby': id, 'aria-describedby': `${id}-text` },
    h('div', { class: 'stack-8' },
      h('h2', { id, class: 'h3', tabindex: '-1', 'data-autofocus': true }, title),
      h('div', { id: `${id}-text`, class: 'body' }, body)),
    actions);
}

const stackButtons = (...b) => h('div', { class: 'stack-8' }, ...b);

// show — результат decideStepSignals / decideAttention.
export function showSafety(show, { onBack, onHelp, onOk }) {
  const done = (fn) => () => { closeOverlay(); if (fn) fn(); };
  if (show.kind === 'crisis') {
    // Утром и днём (быстрая запись) круга нет — без «круг можно не заканчивать».
    const text = show.deleted
      ? (show.morning ? SAFETY.crisis.textDeletedDay : SAFETY.crisis.textDeleted)
      : show.morning ? SAFETY.crisis.textMorning : SAFETY.crisis.text;
    const node = h('div', { class: 'fullscreen', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'crisis-title', 'aria-describedby': 'crisis-text' },
      h('div', { class: 'stack-12' },
        h('h1', { id: 'crisis-title', class: 'h1', tabindex: '-1', 'data-autofocus': true }, SAFETY.crisis.title),
        h('div', { id: 'crisis-text', class: 'body' }, text)),
      h('div', { class: 'stack-8 push-bottom' },
        button(SAFETY.backToRecord, done(onBack), { kind: 'secondary', large: true }),
        button(SAFETY.openHelp, done(onHelp), { large: true })));
    openOverlay(node, { safety: true, full: true });
    return;
  }
  if (show.kind === 'high') {
    const t = SAFETY.high[show.variant];
    openOverlay(sheet('high-title', t.title, t.text, stackButtons(
      button(SAFETY.backToRecord, done(onBack), { kind: 'secondary', large: true }),
      button(SAFETY.openHelp, done(onHelp), { large: true }))), { safety: true });
    return;
  }
  if (show.kind === 'attention') {
    const t = SAFETY.attention[show.variant];
    const emotions = (show.emotions || []).map((e) => `«${e}»`).join(' и ');
    const text = t.text.replace('{emotions}', emotions);
    const link = h('a', {
      href: '#/help', class: 'help-link in-sheet',
      onclick: (e) => { e.preventDefault(); closeOverlay(); if (onHelp) onHelp(); }
    }, icon('lifebuoy'), T.common.helpLink);
    openOverlay(sheet('att-title', t.title, text, h('div', { class: 'stack-16' },
      link, button(SAFETY.attention.ok, done(onOk), { large: true }))), { safety: true });
  }
}

// Лист «Черновик записи не сохранится» (шаг 2).
export function showDraftConfirm({ onKeep, onDrop }) {
  const keep = () => { closeOverlay(); if (onKeep) onKeep(); };
  openOverlay(sheet('draft-title', T.step2.draftTitle, T.step2.draftText, stackButtons(
    button(T.step2.draftKeep, keep, { kind: 'secondary', large: true }),
    button(T.step2.draftDrop, () => { closeOverlay(); onDrop(); }, { large: true }))), { dismiss: keep });
}

// Лист «Запись не сохранится» (быстрая запись днём, «Отмена» с заполненными полями).
export function showDiscardConfirm({ onDrop }) {
  openOverlay(sheet('discard-title', T.day.discardTitle, T.day.discardText, stackButtons(
    button(T.day.discardKeep, closeOverlay, { kind: 'secondary', large: true }),
    button(T.day.discardDrop, () => { closeOverlay(); onDrop(); }, { large: true }))), { dismiss: closeOverlay });
}

// Лист подтверждения импорта.
export function showImportConfirm({ fileLine, phoneLine, onlyPhoneLine, onCancel, onConfirm }) {
  const cancel = () => { closeOverlay(); if (onCancel) onCancel(); };
  const body = h('div', { class: 'stack-12' },
    h('div', { class: 'stack-8' }, h('div', null, fileLine), h('div', null, phoneLine)),
    onlyPhoneLine ? h('div', { class: 'note-warm' }, onlyPhoneLine) : null,
    h('div', { class: 'body-sm' }, T.data.impBackup));
  openOverlay(sheet('imp-title', T.data.impTitle, body, h('div', { class: 'pair' },
    button(T.data.impCancel, cancel, { kind: 'secondary', large: true }),
    button(T.data.impConfirm, () => { closeOverlay(); onConfirm(); }, { large: true }))), { dismiss: cancel });
}

// Лист подтверждения «Удалить все данные».
export function showWipeConfirm({ withBackup, onConfirm }) {
  const body = h('div', { class: 'stack-12' },
    h('div', null, T.data.wipeConfirmText),
    withBackup ? h('div', { class: 'body-sm' }, T.data.wipeBackup) : null);
  openOverlay(sheet('wipe-title', T.data.wipeConfirmTitle, body, h('div', { class: 'pair' },
    button(T.data.wipeCancel, closeOverlay, { kind: 'secondary', large: true }),
    button(T.data.wipeConfirm, () => { closeOverlay(); onConfirm(); }, { kind: 'danger', large: true }))), { dismiss: closeOverlay });
}
