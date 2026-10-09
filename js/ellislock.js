// Расшифровка теста Эллиса, зашифрованного паролем владельца (tools/encrypt_ellis.mjs, ellis.enc.js).
// PBKDF2-SHA256 (пароль в NFC) → ключ AES-GCM 256 → расшифровка. Чистая функция над WebCrypto:
// пароль и ключ никуда не пишутся, открытый текст возвращается вызывающему. Ту же функцию проверяют автотесты.

export class UnlockError extends Error {
  // code: 'password' — пароль не подошёл; 'broken' — шифр в форме повреждён; 'nocrypto' — нет WebCrypto.
  constructor(code) { super(code); this.code = code; }
}

const isStr = (s) => typeof s === 'string' && s !== '';

export function encValid(enc) {
  return !!enc && typeof enc === 'object' && enc.v === 1 && enc.kdf === 'PBKDF2-SHA256' && enc.cipher === 'AES-GCM'
    && Number.isInteger(enc.iter) && enc.iter > 0 && isStr(enc.salt) && isStr(enc.iv) && isStr(enc.data);
}

function fromB64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Возвращает расшифрованный текст или бросает UnlockError.
export async function decryptText(enc, password, subtle = globalThis.crypto && globalThis.crypto.subtle) {
  if (!encValid(enc)) throw new UnlockError('broken');
  if (!subtle) throw new UnlockError('nocrypto');
  let salt;
  let iv;
  let data;
  try {
    salt = fromB64(enc.salt);
    iv = fromB64(enc.iv);
    data = fromB64(enc.data);
  } catch (e) {
    throw new UnlockError('broken');
  }
  const base = await subtle.importKey('raw', new TextEncoder().encode(String(password).normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: enc.iter }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  let plain;
  try {
    plain = await subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  } catch (e) {
    // AES-GCM не различает «неверный пароль» и «испорченный шифр»: оба дают OperationError.
    if (e && e.name === 'OperationError') throw new UnlockError('password');
    throw new UnlockError('broken');
  }
  return new TextDecoder().decode(plain);
}
