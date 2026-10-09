// Точка входа: загрузка данных, маршруты, перерисовка экранов, секундомер, service worker.

import { S, loadAll, ensureHabits, flushPending, saveEvening } from './store.js';
import { parseRoute, takeAfterRender, takeSkipLeave, noteVisit, setRefresh, refresh, go } from './nav.js';
import { closeOverlay, onOverlayChange, showSafety } from './sheets.js';
import { timer } from './session.js';
import { initInstall, onInstallChange } from './install.js';
import { checkPersist } from './actions.js';
import { renderToday } from './screens/today.js';
import { renderMorning } from './screens/morning.js';
import { renderEvening } from './screens/evening.js';
import { renderHelp } from './screens/help.js';
import { renderData } from './screens/data.js';
import { renderTests } from './screens/tests.js';
import { renderTestRun } from './screens/testrun.js';
import { renderTestResult } from './screens/testresult.js';

// В одностраничном превью (tools/build_preview.py) заменяется на true: без service worker.
const PREVIEW = false;

const SCREENS = {
  today: renderToday, morning: renderMorning, evening: renderEvening, help: renderHelp, data: renderData,
  tests: renderTests, test: renderTestRun, result: renderTestResult
};
let current = null;

function showFatal(e) {
  console.error(e);
  const app = document.getElementById('app');
  app.replaceChildren();
  const box = document.createElement('main');
  box.className = 'screen inner';
  box.innerHTML = '<h1 class="h1">Что-то пошло не так</h1><div class="body">Записи сохранены в телефоне. Закройте форму и откройте снова. Если ошибка повторится, сделайте экспорт на экране «Данные».</div><a class="btn btn-secondary" href="#/data">Данные</a>';
  app.append(box);
}

function renderRoute({ isRefresh = false } = {}) {
  try {
    const route = parseRoute();
    let pending = null;
    if (!isRefresh) {
      // Уход с экрана: шаг вечернего круга сохраняется и проверяется, даже если ушли кнопкой «назад» телефона.
      const skip = takeSkipLeave();
      if (current && current.leave && !skip) pending = current.leave();
      current = null;
      timer.detach();
      closeOverlay();
      noteVisit(location.hash || '#/today');
    }
    const app = document.getElementById('app');
    const scrollY = window.scrollY;
    const active = document.activeElement;
    const fk = active && active.getAttribute ? active.getAttribute('data-fk') : null;

    const render = SCREENS[route.name] || renderToday;
    const result = render(route);
    if (!result) return; // экран перенаправил на другой маршрут
    current = result;
    app.replaceChildren(result.el);

    if (isRefresh) {
      window.scrollTo(0, scrollY);
      if (fk) {
        const el = app.querySelector(`[data-fk="${CSS.escape(fk)}"]`);
        if (el) el.focus({ preventScroll: true });
      }
    } else {
      window.scrollTo(0, 0);
      const after = takeAfterRender();
      if (after) after();
    }
    if (pending && pending.show) {
      showSafety(pending.show, {
        onBack: () => go(pending.backHash),
        onHelp: () => go('#/help', { skipLeaveCheck: true }),
        onOk: () => {}
      });
    }
  } catch (e) {
    showFatal(e);
  }
}

function persistNow() {
  timer.update();
  const ev = timer.evening;
  if (ev) saveEvening(ev, { touch: false });
  flushPending();
}

// Новая версия формы обновляет базу, а в другой вкладке открыта старая: ждём, пока её закроют.
function showBlocked() {
  const app = document.getElementById('app');
  app.replaceChildren();
  const box = document.createElement('main');
  box.className = 'screen inner';
  box.innerHTML = '<h1 class="h1">Форма открыта в другой вкладке</h1><div class="body">Закройте другие вкладки или окна с формой — эта откроется сама. Записи не пропадут.</div>';
  app.append(box);
}

async function init() {
  initInstall();
  try {
    await loadAll({ onBlocked: showBlocked });
  } catch (e) {
    showFatal(e);
    return;
  }
  if (S.experiment) ensureHabits();

  setRefresh(() => renderRoute({ isRefresh: true }));
  window.addEventListener('hashchange', () => renderRoute());
  // Окна безопасности и экран помощи — не шаги круга: секундомер на паузе.
  onOverlayChange((cur) => timer.setPaused(!!(cur && cur.safety)));
  onInstallChange(() => { if (['today', 'data'].includes(parseRoute().name)) refresh(); });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistNow();
    else {
      timer.update();
      // Могла смениться логическая дата (граница суток 04:00), а с ней окна тестов.
      if (['today', 'data', 'tests'].includes(parseRoute().name)) refresh();
    }
  });
  window.addEventListener('pagehide', persistNow);
  setInterval(() => timer.update(), 10000);

  if (!location.hash || location.hash === '#') location.replace('#/today');
  renderRoute();

  checkPersist().then(() => { if (parseRoute().name === 'data') refresh(); });

  if (!PREVIEW && 'serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('service worker', e));
  }
}

init();
