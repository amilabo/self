// Итог недельного разбора (0.3.0): экран «Итог разбора» (только чтение) и общий сценарий сохранения
// файла или вставки. Устройство — DESIGN.md, «Итог разбора (форма 0.3)», тексты — CONTENT.md, «Итог разбора в форме».
// Проверка файла и выбор действия недели — чистые функции в reviews.js.

import { h, backLink, kvRow, icon } from '../ui.js';
import { T } from '../content.js';
import { S } from '../store.js';
import { dayMonth } from '../dates.js';
import { latestReview, reviewErrorText } from '../reviews.js';
import { saveReview, replaceReview, deleteReview, reviewStatus } from '../actions.js';
import { showReviewReplace, showReviewDelete } from '../sheets.js';
import { go, back, canGoBack, reviewHash, refresh } from '../nav.js';

// Дата итога для подписей — дата разбора (review_id), «18 октября».
export const reviewDate = (r) => dayMonth(r.review_id);

// Строка успеха на экране итога: один показ сразу после сохранения или замены (переживает перерисовку на месте,
// сбрасывается при уходе с экрана).
let flash = null;
const FLASH_MS = 15000;
function takeFlash(id) {
  if (!flash || flash.id !== id) return null;
  if (Date.now() - flash.at > FLASH_MS) { flash = null; return null; }
  return flash.text;
}

// Ошибка удаления на экране итога (до ухода с него).
let deleteError = null;

// Сохранение проверенного итога (из файла или вставки). Без предпросмотра: после сохранения открывается сам итог
// со строкой «Итог сохранён.» / «Итог заменён.», «назад» — на «Данные». Тот же итог второй раз — как сохранение.
// onSaved — перед переходом к итогу; onError(text) — не удалось записать; onCancel — «Отмена» в листе замены.
export async function acceptReview(review, { onSaved, onError, onCancel } = {}) {
  const open = (text) => {
    flash = { id: review.review_id, text, at: Date.now() };
    reviewStatus.value = null;
    if (onSaved) onSaved();
    go(reviewHash(review.review_id, 'data'));
  };
  const res = await saveReview(review);
  if (res.status === 'saved' || res.status === 'same') { open(T.reviews.saved); return; }
  if (res.status === 'error') { if (onError) onError(reviewErrorText({ error: 'write' })); return; }
  showReviewReplace({
    date: reviewDate(review),
    onCancel,
    onConfirm: async () => {
      const r = await replaceReview(review);
      if (r.status === 'saved') open(T.reviews.replaced);
      else if (onError) onError(reviewErrorText({ error: 'write' }));
    }
  });
}

function startDelete(rec, route) {
  const latest = latestReview(S.reviews);
  showReviewDelete({
    date: reviewDate(rec),
    withAction: !!(latest && latest.review_id === rec.review_id && rec.action),
    onConfirm: async () => {
      const ok = await deleteReview(rec.review_id);
      if (!ok) { deleteError = T.data.errWrite; refresh(); return; }
      deleteError = null;
      reviewStatus.value = { ok: true, text: T.reviews.deleted(reviewDate(rec)) };
      // На «Данные» без возврата на удалённый итог: пришли с «Данных» — шаг назад, иначе замена записи истории.
      if (route.from === 'data' && canGoBack()) back('#/data');
      else go('#/data', { replace: true });
    }
  });
}

const section = (id, title, ...children) => h('section', { class: 'card gap-8', 'aria-labelledby': id },
  h('h2', { id, class: 'overline' }, title), ...children);

export function renderReview(route) {
  const rec = route.id ? S.reviews.get(route.id) : null;
  if (!rec) { go('#/data', { replace: true }); return null; }
  const R = T.reviews;
  const fromHash = route.from === 'today' ? '#/today' : '#/data';
  const ok = takeFlash(rec.review_id);
  const marks = [
    rec.prev_action_done && R.prevValue[rec.prev_action_done] ? kvRow(R.prevKey, R.prevValue[rec.prev_action_done]) : null,
    Number.isInteger(rec.rating) ? kvRow(R.ratingKey, R.ratingValue(rec.rating)) : null
  ].filter(Boolean);

  const el = h('main', { class: 'screen inner result' },
    backLink(route.from === 'today' ? T.common.today : T.nav.data, () => back(fromHash)),
    ok ? h('div', { class: 'ok-line', role: 'status' }, icon('check', 16), ok) : null,
    h('div', { class: 'stack-4' },
      h('div', { class: 'meta' }, R.meta(rec.week, reviewDate(rec))),
      h('h1', { class: 'h1' }, R.screenTitle)),
    section('rev-action', R.actionTitle,
      rec.action ? h('div', { class: 'quote' }, `«${rec.action}»`) : h('div', { class: 'body-sm' }, R.noAction)),
    rec.notes && rec.notes.length ? section('rev-notes', R.notesTitle,
      h('ul', { class: 'plain-list' }, rec.notes.map((n) => h('li', { class: 'body' }, n)))) : null,
    marks.length ? section('rev-marks', R.marksTitle, h('div', { class: 'kv-list' }, marks)) : null,
    h('div', { class: 'stack-8' },
      h('div', { class: 'caption' }, R.footer),
      h('button', { type: 'button', class: 'link-btn', 'data-fk': 'review-delete', 'aria-haspopup': 'dialog', onclick: () => startDelete(rec, route) }, R.deleteLink),
      deleteError ? h('div', { class: 'error', role: 'status' }, icon('alert', 16), deleteError) : null));
  // Уход с экрана: строка успеха и ошибка удаления больше не показываются (перерисовка на месте их сохраняет).
  return { el, leave: () => { deleteError = null; flash = null; } };
}
