// Замер активного времени вечернего круга для H3 (EXPERIMENT.md, «Замер времени (H3)»).
// Секундомер шага идёт, только когда шаг открыт, страница видима, фокус не в поле дневника
// и не открыто окно безопасности или экран помощи. Время в поле дневника копится в journal_ms.
// После completed_at замер заморожен.

export function createStepTimer(onChange) {
  let ev = null;
  let step = null;
  let journal = false;
  let paused = false;
  let cur = null;
  let last = 0;

  function bucket() {
    if (!ev || ev.completed_at || !step || paused || document.visibilityState !== 'visible') return null;
    return journal ? 'journal_ms' : `step${step}_ms`;
  }

  // Добавляет прошедшее время в текущую корзину и пересчитывает, какая корзина активна.
  function flush() {
    const now = Date.now();
    let changed = false;
    if (cur && ev && !ev.completed_at) {
      const delta = now - last;
      if (delta > 0) {
        const t = ev.timing;
        t[cur] = (t[cur] || 0) + delta;
        t.active_ms = (t.step1_ms || 0) + (t.step2_ms || 0) + (t.step3_ms || 0);
        changed = true;
      }
    }
    last = now;
    cur = bucket();
    if (changed && onChange) onChange(ev);
  }

  return {
    attach(evening, stepNo) { flush(); ev = evening; step = stepNo; journal = false; flush(); },
    detach() { flush(); ev = null; step = null; journal = false; cur = null; },
    setJournal(on) { flush(); journal = on; flush(); },
    setPaused(on) { flush(); paused = on; flush(); },
    update() { flush(); },
    get evening() { return ev; }
  };
}
