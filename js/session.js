// Общий секундомер вечернего круга: накопленное время сохраняется в черновик.

import { createStepTimer } from './timer.js';
import { saveEvening } from './store.js';

export const timer = createStepTimer((ev) => saveEvening(ev, { debounce: true, touch: false }));
