// Логика тестов GAD-7 и Эллиса: окна протокола, подсчёт, правило ничьих, проверка приватного файла.
// Чистые функции без DOM (покрыты tests/logic.test.mjs). Спецификация: EXPERIMENT.md
// («Тесты: окна и состояние «не пройден»»), CONTENT.md («Тесты»), PRD §6.2 (test_results).

import { GAD7, ELLIS, ELLIS_SCALES, TEST_WINDOWS } from './content.js';

// --- Окна ---

// Последний результат теста в окне (baseline / final).
export function resultIn(results, testId, window) {
  let best = null;
  for (const r of results) {
    if (r.test_id === testId && r.window === window && (!best || r.taken_at > best.taken_at)) best = r;
  }
  return best;
}

// Состояние теста на дату с номером дня day (≤ 0 — подготовка).
// status: 'todo' — дни 0–3, результата нет; 'done' — исходный пройден, до дня 21 закрыт;
// 'missed' — окно 0–3 прошло без результата; 'final_todo' — с дня 21, повторного нет;
// 'final_done' — повторный пройден. open — какое окно открыто сейчас (или null).
export function testState(results, testId, day) {
  const baseline = resultIn(results, testId, 'baseline');
  const final = resultIn(results, testId, 'final');
  let status;
  let open = null;
  if (day <= TEST_WINDOWS.baselineLastDay) {
    status = baseline ? 'done' : 'todo';
    if (!baseline) open = 'baseline';
  } else if (day < TEST_WINDOWS.finalFirstDay) {
    status = baseline ? 'done' : 'missed';
  } else {
    status = final ? 'final_done' : 'final_todo';
    if (!final) open = 'final';
  }
  return { status, open, baseline, final, last: final || baseline };
}

// --- GAD-7 ---

const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

export function gadComplete(answers) {
  return Array.isArray(answers) && answers.length === GAD7.items.length && answers.every((v) => isInt(v, 0, 3));
}

export function gadScore(answers) {
  if (!gadComplete(answers)) throw new Error('gad7: нужны 7 ответов 0–3');
  return answers.reduce((s, v) => s + v, 0);
}

export function gadBand(score) {
  const b = GAD7.bands.find((x) => score >= x.min && score <= x.max);
  if (!b) throw new Error('gad7: сумма вне 0–21');
  return b;
}

// Запись test_results для GAD-7 (PRD §6.2).
export function gadResult({ answers, window, date, nowIso, makeId }) {
  const score = gadScore(answers);
  return {
    id: makeId(), test_id: GAD7.test_id, test_version: GAD7.test_version, date, taken_at: nowIso,
    window, source: 'app', answers: [...answers], score, band: gadBand(score).key, scales: null
  };
}

// GAD-7 ≥ 10 → safety_signals с triggers: ["gad7"]: attention при 10–14, high при 15–21.
// Карточка не показывается (shown: false): её роль играет экран результата с текстом про специалиста,
// а при 15–21 — ещё и со ссылкой «Если очень плохо» (CONTENT.md, «Уровни сигналов», «Интерпретации GAD-7»).
export function gadSignal({ score, date, nowIso, makeId }) {
  let level = null;
  if (score >= GAD7.signalHighMin) level = 'high';
  else if (score >= GAD7.signalAttentionMin) level = 'attention';
  if (!level) return null;
  return { id: makeId(), date, at: nowIso, level, triggers: ['gad7'], shown: false, variant: null, field: null, list: null };
}

// --- Тест Эллиса: приватный файл ---

const SCALE_IDS = ELLIS_SCALES.map((s) => s.id);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const nonEmpty = (s) => typeof s === 'string' && s.trim() !== '';

// Проверка файла ellis-test.json. Возвращает { test } или { error: 'format' | 'options' | 'scales' | 'items' | 'scoring' }.
// В test остаются только поля, нужные форме; пункты упорядочены по номеру.
export function validateEllisFile(obj) {
  if (!isObj(obj) || obj.test_id !== ELLIS.test_id || !nonEmpty(obj.test_version)) return { error: 'format' };
  if (!Array.isArray(obj.options) || obj.options.length !== ELLIS.options || !obj.options.every(nonEmpty)) return { error: 'options' };
  const keys = isObj(obj.scales) ? Object.keys(obj.scales) : [];
  if (keys.length !== SCALE_IDS.length || !SCALE_IDS.every((id) => keys.includes(id))) return { error: 'scales' };
  if (!isObj(obj.scoring) || obj.scoring.direction !== ELLIS.direction) return { error: 'scoring' };
  const items = obj.items;
  if (!Array.isArray(items) || items.length !== ELLIS.items) return { error: 'items' };
  const seen = new Set();
  const perScale = Object.fromEntries(SCALE_IDS.map((id) => [id, 0]));
  for (const it of items) {
    if (!isObj(it) || !isInt(it.n, 1, ELLIS.items) || seen.has(it.n) || !nonEmpty(it.text)
      || !SCALE_IDS.includes(it.scale) || typeof it.reverse !== 'boolean') return { error: 'items' };
    seen.add(it.n);
    perScale[it.scale] += 1;
  }
  if (!SCALE_IDS.every((id) => perScale[id] === ELLIS.itemsPerScale)) return { error: 'items' };
  const sorted = [...items].sort((a, b) => a.n - b.n).map((it) => ({ n: it.n, text: it.text.trim(), scale: it.scale, reverse: it.reverse }));
  return {
    test: {
      test_id: ELLIS.test_id,
      test_version: obj.test_version.trim(),
      instruction: nonEmpty(obj.instruction) ? obj.instruction.trim() : null,
      options: obj.options.map((o) => o.trim()),
      scoring: { direction: obj.scoring.direction, key_status: obj.scoring.key_status || null },
      items: sorted
    }
  };
}

export function parseEllisFile(text) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) { return { error: 'read' }; }
  return validateEllisFile(obj);
}

// --- Тест Эллиса: подсчёт ---

export function ellisComplete(test, answers) {
  return Array.isArray(answers) && answers.length === test.items.length && answers.every((v) => isInt(v, 1, ELLIS.options));
}

// Суммы шкал строго по ключу файла: прямой пункт = номер варианта (1–6), обратный = 7 − номер.
// answers — сырые ответы 1–6 по порядку пунктов (answers[i] — пункт test.items[i]).
export function ellisScales(test, answers) {
  if (!ellisComplete(test, answers)) throw new Error('ellis: нужны 50 ответов 1–6');
  const sums = Object.fromEntries(SCALE_IDS.map((id) => [id, 0]));
  test.items.forEach((it, i) => {
    const a = answers[i];
    sums[it.scale] += it.reverse ? (ELLIS.options + 1) - a : a;
  });
  return sums;
}

export function ellisResult({ test, answers, window, date, nowIso, makeId }) {
  return {
    id: makeId(), test_id: ELLIS.test_id, test_version: test.test_version, date, taken_at: nowIso,
    window, source: 'app', answers: [...answers], score: null, band: null, scales: ellisScales(test, answers)
  };
}

// Порядок шкал для экрана результата: от более выраженной к менее (меньше сумма — выраженнее),
// при равных суммах — в порядке CONTENT.md. Правило карточек «Заметнее остальных»:
// - 1–2 первые шкалы; если на втором месте несколько шкал с той же суммой — все, но не больше трёх карточек
//   (если с ними получилось бы больше трёх, показывается только первая);
// - если на первом месте две или три шкалы с одной суммой — все они;
// - если на первом месте больше трёх шкал с одной суммой — карточек нет, noDiff (психолог и продакт 2026-10-09).
export function ellisRanking(scales, { maxCards = 3 } = {}) {
  const order = [...SCALE_IDS].sort((a, b) => (scales[a] - scales[b]) || (SCALE_IDS.indexOf(a) - SCALE_IDS.indexOf(b)));
  const groups = [];
  for (const id of order) {
    const g = groups[groups.length - 1];
    if (g && scales[g[0]] === scales[id]) g.push(id); else groups.push([id]);
  }
  const first = groups[0];
  let top;
  if (first.length > maxCards) return { top: [], rest: order, noDiff: true };
  if (first.length >= 2) top = first;
  else {
    const second = groups[1] || [];
    top = 1 + second.length <= maxCards ? [...first, ...second] : first;
  }
  return { top, rest: order.filter((id) => !top.includes(id)), noDiff: false };
}

// --- Черновик ответов (состояние интерфейса, не экспортируется) ---

export function newDraft({ testId, testVersion, window, n, nowIso }) {
  return { test_id: testId, test_version: testVersion, window, answers: Array(n).fill(null), index: 0, started_at: nowIso };
}

// Черновик годится, если он для того же теста, той же версии текста и того же окна.
export function draftFits(draft, { testId, testVersion, window, n }) {
  return !!draft && draft.test_id === testId && draft.test_version === testVersion && draft.window === window
    && Array.isArray(draft.answers) && draft.answers.length === n && Number.isInteger(draft.index);
}

export const answeredCount = (draft) => (draft && Array.isArray(draft.answers) ? draft.answers.filter((v) => v != null).length : 0);
