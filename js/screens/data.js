// Временный экран «Данные»: экспорт и импорт (в v0.2 переедут в «Историю» с календарём).
// Тексты и порядок — по макету History, карточка «Экспорт и бэкап».

import { h, card, button, icon, dock } from '../ui.js';
import { T } from '../content.js';
import { S, hasAnyRecords } from '../store.js';
import { logicalDate, logicalDateOfIso, diffDays, dayNumber, weekdayLong, dayMonth } from '../dates.js';
import { lastExport } from '../rules.js';
import { shareSupported } from '../exporter.js';
import { doExport, startImport, startWipe, dataStatus, readReviewFile, reviewStatus } from '../actions.js';
import { refresh, go, reviewHash } from '../nav.js';
import { sortReviews, parseReviewText, reviewErrorText } from '../reviews.js';
import { acceptReview, reviewDate } from './review.js';

// Блок «Вставить текстом» (запасной путь): раскрыт ли, текст и ошибка поля. Живёт в памяти экрана,
// переживает перерисовки; «Отмена» и успешное сохранение его сворачивают.
const paste = { open: false, text: '', error: null };

const focusFk = (fk) => {
  const el = document.querySelector(`[data-fk="${fk}"]`);
  if (el) el.focus();
};

async function loadFromFile() {
  const res = await readReviewFile();
  if (!res) return; // выбор файла отменён
  if (res.error) { reviewStatus.value = { ok: false, text: reviewErrorText(res, 'file') }; refresh(); return; }
  await acceptReview(res.review, {
    onError: (text) => { reviewStatus.value = { ok: false, text }; refresh(); }
  });
}

async function saveFromPaste() {
  const res = parseReviewText(paste.text);
  const fail = (text) => { paste.error = text; refresh(); focusFk('review-paste'); };
  if (res.error) { fail(reviewErrorText(res, 'paste')); return; }
  await acceptReview(res.review, {
    onSaved: () => { paste.open = false; paste.text = ''; paste.error = null; },
    onError: fail,
    onCancel: () => focusFk('review-paste')
  });
}

function pasteBlock() {
  const R = T.reviews;
  if (!paste.open) {
    return h('button', {
      type: 'button', class: 'link-btn', 'data-fk': 'review-paste-open', 'aria-expanded': 'false',
      onclick: () => { paste.open = true; paste.error = null; refresh(); focusFk('review-paste'); }
    }, R.pasteLink);
  }
  const err = h('div', { id: 'review-paste-error', class: 'error' }, icon('alert', 16), paste.error || '');
  err.hidden = !paste.error;
  const field = h('textarea', {
    id: 'review-paste', class: 'field', rows: '6', placeholder: R.pastePh, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    'data-fk': 'review-paste', 'aria-describedby': paste.error ? 'review-paste-hint review-paste-error' : 'review-paste-hint',
    'aria-invalid': paste.error ? 'true' : 'false', value: paste.text,
    oninput: (e) => {
      paste.text = e.target.value;
      if (paste.error) {
        // Ошибка снимается при правке, без перерисовки экрана (клавиатура не сбивается).
        paste.error = null;
        e.target.setAttribute('aria-invalid', 'false');
        e.target.setAttribute('aria-describedby', 'review-paste-hint');
        err.hidden = true;
      }
    }
  });
  return h('div', { class: 'stack-8' },
    h('div', { class: 'stack-4' },
      h('label', { for: 'review-paste', class: 'label' }, R.pasteLabel),
      h('div', { id: 'review-paste-hint', class: 'caption' }, R.pasteHint)),
    field,
    err,
    h('div', { class: 'pair' },
      button(R.pasteCancel, () => { paste.open = false; paste.text = ''; paste.error = null; refresh(); focusFk('review-paste-open'); }, { kind: 'secondary', fk: 'review-paste-cancel' }),
      button(R.pasteSave, saveFromPaste, { fk: 'review-paste-save' })));
}

// «Разборы недели» (DESIGN.md, «Итог разбора»): список итогов (новые сверху), загрузка файлом и запасной путь — вставка текстом.
function reviewsCard() {
  const R = T.reviews;
  const list = sortReviews(S.reviews).reverse();
  return h('section', { class: 'card', 'aria-labelledby': 'reviews-title' },
    h('div', { class: 'stack-4' },
      h('h2', { id: 'reviews-title', class: 'title' }, R.title),
      list.length ? null : h('div', { class: 'caption' }, R.empty)),
    list.length ? h('div', { class: 'review-list' }, list.map((r) => h('a', { href: reviewHash(r.review_id, 'data'), class: 'review-row', 'data-fk': `review-${r.review_id}` },
      h('span', { class: 'stack-4 min0' },
        h('span', { class: 'body-strong' }, R.rowTitle(r.week, reviewDate(r))),
        h('span', { class: 'caption ellipsis' }, r.action ? `«${r.action}»` : R.rowNoAction)),
      icon('chevronRight', 24)))) : null,
    h('div', { class: list.length ? 'stack-8 divider' : 'stack-8' },
      button(R.loadBtn, loadFromFile, { kind: 'secondary', fk: 'review-load', attrs: { 'aria-describedby': 'review-load-note' } }),
      h('div', { id: 'review-load-note', class: 'caption' }, R.loadNote),
      statusLine(reviewStatus.value),
      pasteBlock()));
}

const statusLine = (st) => {
  if (!st) return null;
  return st.ok
    ? h('div', { class: 'ok-line small', role: 'status' }, icon('check', 16), st.text)
    : h('div', { class: 'error', role: 'status' }, icon('alert', 16), st.text);
};

export function renderData() {
  const today = logicalDate();
  const exp = S.experiment;
  const last = lastExport(S);
  const lastText = last ? T.data.lastExport(diffDays(today, logicalDateOfIso(last.at))) : T.data.lastExportNone;
  const day = exp ? dayNumber(today, exp.start_date) : null;
  const meta = day && day >= 1 && day <= 21 ? T.today.meta(weekdayLong(today), dayMonth(today), day) : `${weekdayLong(today)}, ${dayMonth(today)}`;
  const canExport = !!exp;

  const exportBlock = canExport ? h('div', { class: 'stack-8' },
    button(T.data.download, async () => { await doExport('download'); refresh(); }, { fk: 'download' }),
    shareSupported() ? [
      button(T.data.share, async () => { await doExport('share'); refresh(); }, { kind: 'secondary', fk: 'share', attrs: { 'aria-describedby': 'share-note' } }),
      h('div', { id: 'share-note', class: 'caption' }, T.data.shareNote)
    ] : null,
    statusLine(dataStatus.export)) : h('div', { class: 'caption' }, T.data.exportNeedsStart);

  const content = h('main', { class: 'screen tab' },
    S.memoryOnly ? card('warm', h('div', { class: 'body-sm' }, T.data.memoryOnly)) : null,
    h('div', { class: 'stack-4' },
      h('h1', { class: 'h1' }, T.data.title),
      h('div', { class: 'meta' }, meta)),
    card('',
      h('div', { class: 'stack-4' },
        h('h2', { class: 'title' }, T.data.exportTitle),
        h('div', { class: 'caption' }, lastText)),
      h('div', { class: 'body-sm' }, T.storage.warning),
      S.ui.persisted === false ? h('div', { class: 'note-warm', role: 'note' }, T.storage.persistWarning) : null,
      exportBlock,
      h('div', { class: 'stack-8 divider' },
        h('div', { class: 'stack-4' },
          h('div', { class: 'label' }, T.data.restoreTitle),
          h('div', { id: 'import-note', class: 'caption' }, hasAnyRecords() ? T.data.importNote : T.data.importNoteEmpty)),
        button(T.data.importBtn, () => startImport(() => refresh()), { kind: 'secondary', fk: 'import', attrs: { 'aria-describedby': 'import-note', 'aria-haspopup': 'dialog' } }),
        statusLine(dataStatus.import))),
    reviewsCard(),
    (S.experiment || hasAnyRecords() || Object.keys(S.privateTests).length) ? card('gap-8',
      h('div', { class: 'stack-4' },
        h('h2', { class: 'title' }, T.data.wipeTitle),
        h('div', { id: 'wipe-note', class: 'caption' }, T.data.wipeNote)),
      button(T.data.wipeBtn, () => startWipe((ok) => { if (ok) go('#/today', { replace: true }); else refresh(); }),
        { kind: 'danger', fk: 'wipe', attrs: { 'aria-describedby': 'wipe-note', 'aria-haspopup': 'dialog' } })) : null);
  return { el: h('div', { class: 'page' }, content, dock('data')) };
}
