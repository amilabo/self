// Итог недельного разбора (DECISIONS 2026-10-15, контракт файла v1; PRD §6.2 `reviews`).
// Чистые функции: разбор текста файла или вставки, проверка, план сохранения, текущее действие недели.
// Экраны и слой данных (store.js, actions.js) вызывают их; DOM и IndexedDB здесь не используются.

import { isYmd } from './dates.js';
import { T } from './content.js';

export const REVIEW_FORMAT = 'self-review';
export const REVIEW_FORMAT_VERSION = 1;

// Лимиты контракта v1 и мягкий запас. До `soft` — как в контракте; от `soft` до `hard` — принимаем
// без обрезки (Claude может немного превысить, а обрезка ломает формулировку владелицы); больше `hard` —
// это уже не «одно действие» и не «главное в двух строках», файл отклоняется.
export const REVIEW_LIMITS = { text: 200, textHard: 500, notes: 2, notesHard: 4 };

const PREV_DONE = ['да', 'частично', 'нет'];
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const chars = (s) => [...s].length; // символы, а не UTF-16-единицы

// Настоящая календарная дата ГГГГ-ММ-ДД (2026-02-30 — нет).
export function isRealDate(s) {
  if (!isYmd(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function isIsoTime(s) {
  return typeof s === 'string' && ISO_TIME.test(s) && !Number.isNaN(Date.parse(s));
}

// Снимает обёртки вокруг JSON: BOM, пробелы, блок кода ```json … ``` (вставка из чата),
// текст до и после объекта («Вот итог: {…}»). Возвращает строку-кандидат для JSON.parse.
export function unwrapJsonText(text) {
  let s = String(text).replace(/^﻿/, '').trim();
  const fence = s.match(/```[^\n`]*\n([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  else if (s.startsWith('```')) s = s.replace(/^```[^\n]*\n?/, '').trim(); // закрывающие ``` потерялись при копировании
  if (!s.startsWith('{')) {
    const a = s.indexOf('{');
    const b = s.lastIndexOf('}');
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
  } else if (!s.endsWith('}')) {
    const b = s.lastIndexOf('}');
    if (b > 0) s = s.slice(0, b + 1);
  }
  return s;
}

function parseJson(s) {
  try { return { obj: JSON.parse(s) }; } catch (e) { /* ниже — вторая попытка */ }
  // Неразрывные пробелы при копировании с телефона ломают JSON.parse вне строк.
  if (/[  ]/.test(s)) {
    try { return { obj: JSON.parse(s.replace(/[  ]/g, ' ')) }; } catch (e) { /* не JSON */ }
  }
  return null;
}

// Строка или null: пробелы по краям обрезаются, пустая → null. undefined (поля нет) → null.
// Возвращает { value } или { error } (не строка или длиннее жёсткого лимита).
function textField(v) {
  if (v == null) return { value: null };
  if (typeof v !== 'string') return { error: true };
  const t = v.trim();
  if (!t) return { value: null };
  if (chars(t) > REVIEW_LIMITS.textHard) return { error: true };
  return { value: t };
}

const broken = (field) => ({ error: 'broken', field });

// Проверка и нормализация объекта контракта v1. Возвращает { review } или { error, field? }.
// Коды: 'format' — не итог разбора; 'newer' — format_version новее поддерживаемой; 'broken' — поле не по контракту
// (field — какое, для отладки; экрану достаточно кода). Лишние поля игнорируются и не сохраняются.
// Необязательные поля (export_from, prev_action_done, action, notes, rating) можно не указывать — это null / [].
export function normalizeReview(obj) {
  if (!isObj(obj) || obj.format !== REVIEW_FORMAT) return { error: 'format' };
  const fv = obj.format_version;
  if (!Number.isInteger(fv) || fv < 1) return broken('format_version');
  if (fv > REVIEW_FORMAT_VERSION) return { error: 'newer' };

  if (!isRealDate(obj.review_id)) return broken('review_id');
  if (!isRealDate(obj.reviewed_at)) return broken('reviewed_at');
  if (!Number.isInteger(obj.week) || obj.week < 1 || obj.week > 4) return broken('week');

  const exportFrom = obj.export_from == null || (typeof obj.export_from === 'string' && obj.export_from.trim() === '') ? null : obj.export_from;
  if (exportFrom !== null && !isIsoTime(exportFrom)) return broken('export_from');

  let prev = obj.prev_action_done == null ? null : obj.prev_action_done;
  if (prev !== null) {
    if (typeof prev !== 'string') return broken('prev_action_done');
    prev = prev.trim().toLowerCase();
    if (prev === '') prev = null;
    else if (!PREV_DONE.includes(prev)) return broken('prev_action_done');
  }

  const action = textField(obj.action);
  if (action.error) return broken('action');

  let notes = [];
  if (obj.notes != null) {
    if (!Array.isArray(obj.notes)) return broken('notes');
    for (const n of obj.notes) {
      const t = textField(n);
      if (t.error) return broken('notes');
      if (t.value !== null) notes.push(t.value);
    }
    if (notes.length > REVIEW_LIMITS.notesHard) return broken('notes');
  }

  const rating = obj.rating == null ? null : obj.rating;
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) return broken('rating');

  return {
    review: {
      format: REVIEW_FORMAT,
      format_version: REVIEW_FORMAT_VERSION,
      review_id: obj.review_id,
      week: obj.week,
      reviewed_at: obj.reviewed_at,
      export_from: exportFrom,
      prev_action_done: prev,
      action: action.value,
      notes,
      rating
    }
  };
}

// Текст файла или вставки → { review } | { error: 'empty' | 'read' | 'format' | 'newer' | 'broken', field? }.
// 'empty' — пустая вставка; 'read' — не JSON (повреждён или скопирован не целиком).
export function parseReviewText(text) {
  if (text == null || String(text).replace(/^﻿/, '').trim() === '') return { error: 'empty' };
  const parsed = parseJson(unwrapJsonText(text));
  if (!parsed) return { error: 'read' };
  return normalizeReview(parsed.obj);
}

// Запись хранилища `reviews` = объект контракта + момент загрузки.
export const reviewRecord = (review, nowIso) => ({ ...review, imported_at: nowIso });

const CONTENT_KEYS = ['format_version', 'review_id', 'week', 'reviewed_at', 'export_from', 'prev_action_done', 'action', 'notes', 'rating'];
export const sameReview = (a, b) => CONTENT_KEYS.every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));

// Что будет при сохранении: 'new' — итога с таким review_id нет; 'same' — тот же итог уже загружен
// (повторная загрузка того же файла, спрашивать нечего); 'conflict' — другой итог с тем же review_id (экран спросит «Заменить?»).
// reviews — Map review_id → запись.
export function planReviewSave(reviews, review) {
  const existing = reviews.get(review.review_id);
  if (!existing) return { status: 'new' };
  return { status: sameReview(existing, review) ? 'same' : 'conflict', existing };
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
// По reviewed_at, при равенстве — по review_id и времени загрузки.
const byReviewed = (a, b) => cmp(a.reviewed_at, b.reviewed_at) || cmp(a.review_id, b.review_id) || cmp(a.imported_at || '', b.imported_at || '');

// Итоги по возрастанию reviewed_at (экспорт; список на экране — в обратном порядке).
export function sortReviews(reviews) {
  return [...(reviews ? reviews.values() : [])].sort(byReviewed);
}

// Последний итог по reviewed_at или null.
export function latestReview(reviews) {
  const all = sortReviews(reviews);
  return all.length ? all[all.length - 1] : null;
}

// Текст ошибки для экрана (CONTENT.md, «Итог разбора в форме», «Ошибки»).
// source: 'file' — строка статуса под кнопкой загрузки; 'paste' — ошибка поля «Текст итога».
// Не JSON в файле — «Это не итог разбора» (DESIGN.md), во вставке — «скопирован не целиком».
export function reviewErrorText(res, source) {
  const R = T.reviews;
  switch (res.error) {
    case 'file': return R.errFile;
    case 'empty': return source === 'paste' ? R.errEmpty : R.errFormat;
    case 'read': return source === 'paste' ? R.errPasteRead : R.errFormat;
    case 'newer': return R.errNewer;
    case 'broken': return R.errWhat[res.field] ? R.errBroken(R.errWhat[res.field]) : R.errFormat; // format_version не число — не наш файл
    case 'write': return T.data.errWrite;
    default: return R.errFormat;
  }
}

// Действие недели для «Сегодня»: action последнего итога. Показывается, пока не загружен следующий итог;
// если в следующем итоге действие не выбрано (null), карточки нет — прежнее действие не всплывает.
export function weekAction(reviews) {
  const r = latestReview(reviews);
  return r ? r.action : null;
}
