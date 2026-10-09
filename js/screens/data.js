// Временный экран «Данные»: экспорт и импорт (в v0.2 переедут в «Историю» с календарём).
// Тексты и порядок — по макету History, карточка «Экспорт и бэкап».

import { h, card, button, icon, dock } from '../ui.js';
import { T } from '../content.js';
import { S, hasUserData } from '../store.js';
import { logicalDate, logicalDateOfIso, diffDays, dayNumber, weekdayLong, dayMonth } from '../dates.js';
import { lastExport } from '../rules.js';
import { shareSupported } from '../exporter.js';
import { doExport, startImport, dataStatus } from '../actions.js';
import { refresh } from '../nav.js';

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
    statusLine(dataStatus.export)) : null;

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
          h('div', { id: 'import-note', class: 'caption' }, hasUserData() ? T.data.importNote : T.data.importNoteEmpty)),
        button(T.data.importBtn, () => startImport(() => refresh()), { kind: 'secondary', fk: 'import', attrs: { 'aria-describedby': 'import-note', 'aria-haspopup': 'dialog' } }),
        statusLine(dataStatus.import))));
  return { el: h('div', { class: 'page' }, content, dock('data')) };
}
