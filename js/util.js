// Мелкие помощники без зависимостей от интерфейса.

export function uuid() {
  if (self.crypto && typeof self.crypto.randomUUID === 'function') return self.crypto.randomUUID();
  // Запасной вариант для небезопасного контекста (http по адресу в локальной сети).
  const b = self.crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// plural(5, ['вечер', 'вечера', 'вечеров']) → 'вечеров'
export function plural(n, forms) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

export const isBlank = (s) => typeof s !== 'string' || s.trim() === '';

// Пустая строка хранится как null («нет ответа»), а не как "".
export const textOrNull = (s) => (isBlank(s) ? null : s.trim());
