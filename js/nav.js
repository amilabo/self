// Маршруты на hash: #/today, #/morning, #/evening/2026-10-12/1, #/help, #/data, #/tests,
// #/test/gad7[/today] (прохождение теста), #/result/<id>[/today] (результат). /today — вернуться на «Сегодня».
// Хранит короткий стек переходов, чтобы «назад» с экрана помощи возвращал туда, откуда пришли.

let afterRender = null;
let skipLeave = false;
let refreshFn = null;
const stack = [];

export function parseRoute(hash = location.hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const name = parts[0] || 'today';
  if (name === 'evening') {
    const step = Number(parts[2]);
    return { name, date: parts[1] || null, step: [1, 2, 3].includes(step) ? step : 1 };
  }
  if (name === 'test') return { name, testId: parts[1] || null, from: parts[2] === 'today' ? 'today' : 'tests' };
  if (name === 'result') return { name, id: parts[1] || null, from: parts[2] === 'today' ? 'today' : 'tests' };
  return { name };
}

export const testHash = (testId, from = 'tests') => `#/test/${testId}${from === 'today' ? '/today' : ''}`;
export const resultHash = (id, from = 'tests') => `#/result/${id}${from === 'today' ? '/today' : ''}`;
export const fromHash = (from) => (from === 'today' ? '#/today' : '#/tests');

export const eveningHash = (date, step) => `#/evening/${date}/${step}`;

// after — что сделать после отрисовки нового экрана (например, показать окно безопасности).
// skipLeaveCheck — шаг уже проверен перед переходом, повторная проверка не нужна.
export function go(hash, { replace = false, after = null, skipLeaveCheck = false } = {}) {
  afterRender = after;
  skipLeave = skipLeaveCheck;
  if (location.hash === hash) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  if (replace) location.replace(hash); else location.hash = hash;
}

export function takeAfterRender() { const f = afterRender; afterRender = null; return f; }
export function takeSkipLeave() { const s = skipLeave; skipLeave = false; return s; }

export function noteVisit(hash) {
  if (stack.length > 1 && stack[stack.length - 2] === hash) stack.pop();
  else if (stack[stack.length - 1] !== hash) stack.push(hash);
}

export function canGoBack() { return stack.length > 1; }

export function back(fallback = '#/today') {
  if (stack.length > 1) history.back(); else go(fallback, { replace: true });
}

export function setRefresh(fn) { refreshFn = fn; }
// Перерисовать текущий экран без проверки ухода с шага (после нажатий).
export function refresh() { if (refreshFn) refreshFn(); }
