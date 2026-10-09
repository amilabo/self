// Действия, которые затрагивают данные и нужны нескольким экранам:
// создание эксперимента, запись сигналов безопасности, экспорт, импорт, тесты.

import { S, saveExperiment, ensureHabits, putSignal, putMark, saveEvening, addExport, replaceAllData, hasAnyRecords, setUi, clearUi, wipeAllData, putTestResult, savePrivateTest } from './store.js';
import { EXPERIMENT_LENGTH, DAY_BOUNDARY, T } from './content.js';
import { isoLocal, dayMonth } from './dates.js';
import { uuid } from './util.js';
import { ensurePersisted } from './install.js';
import { buildExport, serializeChecked, exportFileName, shareFileName, backupFileName, downloadFile, shareFile, parseImport, summarize, onlyOnPhone } from './exporter.js';
import { showImportConfirm, showWipeConfirm } from './sheets.js';
import { parseEllisFile, gadSignal } from './testrules.js';
import { decryptText } from './ellislock.js';
import { ELLIS_ENC } from './ellis.enc.js';

export function createExperiment(startDate) {
  const exp = {
    start_date: startDate,
    length_days: EXPERIMENT_LENGTH,
    day_boundary: DAY_BOUNDARY,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    created_at: isoLocal(),
    storage_persisted: S.ui.persisted === true
  };
  ensureHabits();
  return saveExperiment(exp);
}

export async function checkPersist() {
  const p = await ensurePersisted();
  if (p == null) return;
  if (S.ui.persisted !== p) setUi('persisted', p);
  if (S.experiment && S.experiment.storage_persisted !== p) {
    S.experiment.storage_persisted = p;
    saveExperiment(S.experiment);
  }
}

// Записывает решения decideStepSignals и ставит флаг «Кризис» на вечер.
export function applyStepSignals(res, date, ev) {
  for (const rec of res.upserts) putSignal(rec);
  if (Object.keys(res.newHashes).length) {
    const all = { ...(S.ui.shown_hashes || {}) };
    all[date] = { ...(all[date] || {}), ...res.newHashes };
    setUi('shown_hashes', all);
  }
  if (res.setCrisis && ev && !ev.crisis) {
    ev.crisis = true;
    putMark(date, 'evening_reflection', true, 'auto');
    saveEvening(ev);
  }
}

export const signalContext = (date) => ({
  shownHashes: (S.ui.shown_hashes || {})[date] || {},
  nowIso: isoLocal(),
  makeId: uuid
});

// --- Экспорт ---

// Статусы последнего действия на экране «Данные» (живут до перезагрузки страницы).
export const dataStatus = { export: null, import: null };

export async function doExport(method) {
  const now = new Date();
  const nowIso = isoLocal(now);
  let text;
  try {
    text = serializeChecked(buildExport(S, nowIso));
  } catch (e) {
    console.error(e);
    dataStatus.export = { ok: false, text: T.data.exportFail };
    return false;
  }
  if (method === 'download') {
    downloadFile(exportFileName(now), text);
    await addExport({ id: uuid(), at: nowIso, method: 'download' });
    dataStatus.export = { ok: true, text: T.data.exportOk };
    return true;
  }
  try {
    const r = await shareFile(shareFileName(now), text);
    if (r === 'shared') {
      await addExport({ id: uuid(), at: nowIso, method: 'share' });
      dataStatus.export = { ok: true, text: T.data.shareOk };
      return true;
    }
    dataStatus.export = null;
    return false;
  } catch (e) {
    console.error(e);
    dataStatus.export = { ok: false, text: T.data.shareFail };
    return false;
  }
}

// --- Импорт ---

const IMPORT_ERRORS = { read: T.data.errRead, format: T.data.errFormat, newer: T.data.errNewer, broken: T.data.errBroken };

function pickFile(accept = '.json,.txt,application/json,text/plain') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files && input.files[0] ? input.files[0] : null), { once: true });
    input.click();
  });
}

async function replace(data, withBackup) {
  if (withBackup) {
    try {
      const now = new Date();
      const text = serializeChecked(buildExport(S, isoLocal(now)));
      downloadFile(backupFileName(now), text);
    } catch (e) {
      console.error(e);
      dataStatus.import = { ok: false, text: T.data.errBackup };
      return false;
    }
  }
  try {
    await replaceAllData(data);
  } catch (e) {
    console.error(e);
    dataStatus.import = { ok: false, text: T.data.errWrite };
    return false;
  }
  await checkPersist();
  dataStatus.import = { ok: true, text: T.data.importOk };
  return true;
}

// onDone(ok) вызывается после замены или ошибки (не вызывается при отмене выбора файла).
export async function startImport(onDone) {
  const file = await pickFile();
  if (!file) return;
  let text;
  try { text = await file.text(); } catch (e) { text = null; }
  const parsed = text == null ? { error: 'read' } : parseImport(text);
  if (parsed.error) {
    dataStatus.import = { ok: false, text: IMPORT_ERRORS[parsed.error] };
    onDone(false);
    return;
  }
  const data = parsed.data;
  if (!hasAnyRecords()) {
    onDone(await replace(data, false));
    return;
  }
  const inFile = summarize(data.evenings, data.mornings);
  const onPhone = summarize([...S.evenings.values()], [...S.mornings.values()]);
  const only = onlyOnPhone(S, data);
  showImportConfirm({
    fileLine: T.data.impFile(inFile.label, inFile.last),
    phoneLine: T.data.impPhone(onPhone.label, onPhone.last),
    onlyPhoneLine: only.length ? T.data.impOnlyPhone(only.map(dayMonth).join(', ')) : null,
    onCancel: () => {},
    onConfirm: async () => onDone(await replace(data, true))
  });
}

// --- Удалить все данные ---
// Перед удалением, если есть записи, скачивается бэкап (как перед импортом). onDone(ok) — после удаления или ошибки.
export function startWipe(onDone) {
  const withBackup = hasAnyRecords();
  showWipeConfirm({
    withBackup,
    onConfirm: async () => {
      if (withBackup) {
        try {
          const now = new Date();
          downloadFile(backupFileName(now), serializeChecked(buildExport(S, isoLocal(now))));
        } catch (e) {
          console.error(e);
          dataStatus.import = { ok: false, text: T.data.errBackup };
          onDone(false);
          return;
        }
      }
      try {
        await wipeAllData();
      } catch (e) {
        console.error(e);
        dataStatus.import = { ok: false, text: T.data.errWipe };
        onDone(false);
        return;
      }
      dataStatus.export = null;
      dataStatus.import = null;
      onDone(true);
    }
  });
}

// --- Тесты ---

// Статус загрузки файла теста Эллиса на экране «Тесты» (живёт до перезагрузки страницы).
export const testStatus = { ellis: null };

// Выбор и проверка ellis-test.json. Файл хранится в отдельном хранилище IndexedDB, в экспорт не входит.
// onDone(ok) — после сохранения или ошибки (не вызывается при отмене выбора файла).
export async function startEllisLoad(onDone) {
  const file = await pickFile('.json,application/json');
  if (!file) return;
  let text;
  try { text = await file.text(); } catch (e) { text = null; }
  const parsed = text == null ? { error: 'read' } : parseEllisFile(text);
  if (parsed.error) {
    testStatus.ellis = { ok: false, text: T.tests.ellisErr[parsed.error] };
    onDone(false);
    return;
  }
  onDone(await keepEllis(parsed.test, T.tests.ellisLoaded));
}

async function keepEllis(test, okText) {
  try {
    await savePrivateTest(test);
  } catch (e) {
    console.error(e);
    testStatus.ellis = { ok: false, text: T.tests.ellisErr.write };
    return false;
  }
  testStatus.ellis = { ok: true, text: okText };
  return true;
}

// Есть ли в форме зашифрованный тест Эллиса (ellis.enc.js не заглушка).
export const ellisEncAvailable = () => ELLIS_ENC != null;

// Тест Эллиса по паролю: расшифровка шифра из ellis.enc.js, проверка как у файла, сохранение в private_tests.
// Пароль нигде не сохраняется. Возвращает true, если тест открыт.
export async function unlockEllis(password) {
  let text;
  try {
    text = await decryptText(ELLIS_ENC, password);
  } catch (e) {
    if (!e || !e.code) console.error(e);
    testStatus.ellis = { ok: false, text: T.tests.ellisErr[e && e.code] || T.tests.ellisErr.broken };
    return false;
  }
  const parsed = parseEllisFile(text);
  if (parsed.error) {
    testStatus.ellis = { ok: false, text: T.tests.ellisErr.broken };
    return false;
  }
  return keepEllis(parsed.test, T.tests.ellisUnlocked);
}

export const draftKey = (testId) => `test_draft_${testId}`;

// Сохраняет результат теста, убирает черновик; для GAD-7 ≥ 10 пишет сигнал в журнал (EXPERIMENT.md).
export function saveTestResult(rec) {
  putTestResult(rec);
  clearUi(draftKey(rec.test_id));
  if (rec.test_id === 'gad7') {
    const sig = gadSignal({ score: rec.score, date: rec.date, nowIso: rec.taken_at, makeId: uuid });
    if (sig) putSignal(sig);
  }
}

export function saveDraft(testId, draft) {
  return setUi(draftKey(testId), draft);
}
