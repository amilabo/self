// Установка на главный экран (beforeinstallprompt) и защита хранилища (persist).

let deferred = null;
const listeners = new Set();
const emit = () => { for (const fn of listeners) fn(); };

export function initInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    emit();
  });
  window.addEventListener('appinstalled', () => { deferred = null; emit(); });
  const mq = window.matchMedia('(display-mode: standalone)');
  if (mq.addEventListener) mq.addEventListener('change', emit);
}

export const onInstallChange = (fn) => listeners.add(fn);

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export const canPromptInstall = () => !!deferred;

export async function promptInstall() {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  e.prompt();
  let accepted = false;
  try { accepted = (await e.userChoice).outcome === 'accepted'; } catch (err) { accepted = false; }
  emit();
  return accepted;
}

// persist() защищает только от автоудаления браузером, не от ручной очистки (EXPERIMENT.md).
export async function ensurePersisted() {
  const st = navigator.storage;
  if (!st || !st.persisted) return null;
  try {
    let p = await st.persisted();
    if (!p && st.persist) p = await st.persist();
    return p;
  } catch (e) {
    return null;
  }
}
