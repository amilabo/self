// Результат теста: GAD-7 (макет TestResult) и тест Эллиса (макет EllisResult).
// Тексты — CONTENT.md, «Интерпретации GAD-7» и «Результат теста Эллиса».
// У Эллиса никаких чисел, баллов и норм — ни на экране, ни в aria (DESIGN.md).

import { h, button, backLink, helpLink } from '../ui.js';
import { T, GAD7, ELLIS, ELLIS_SCALES } from '../content.js';
import { S } from '../store.js';
import { gadBand, ellisRanking, resultIn } from '../testrules.js';
import { go, fromHash } from '../nav.js';
import { resultDay } from './testcommon.js';

function gadScreen(rec, from) {
  const band = gadBand(rec.score);
  const bandIdx = GAD7.bands.indexOf(band);
  const baseline = rec.window === 'final' ? resultIn(S.tests, GAD7.test_id, 'baseline') : null;

  const scoreCard = h('div', { class: 'card gap-16' },
    h('div', { class: 'stack-4' },
      h('div', { class: 'score-line' },
        h('div', { class: 'score' }, String(rec.score)),
        h('div', { class: 'score-of' }, T.gadResult.of)),
      h('div', { class: 'h3' }, band.title)),
    h('div', { class: 'stack-8' },
      h('div', { class: 'bands', 'aria-hidden': 'true' }, GAD7.bands.map((b, k) => h('div', { class: `band band-${k + 1}` }))),
      h('div', { class: 'band-labels' }, T.gadResult.bandLabels.map((l, k) => h('span', { class: k === bandIdx ? 'on' : null }, l)))),
    baseline ? h('div', { class: 'stack-4 divider-12' },
      h('div', { class: 'kv' },
        h('span', { class: 'kv-key' }, T.gadResult.compareDay(resultDay(baseline))),
        h('span', { class: 'kv-value' }, T.gadResult.compareValue(baseline.score, gadBand(baseline.score).short))),
      h('div', { class: 'caption' }, T.gadResult.compareNote)) : null);

  const specialist = h('section', { class: 'card warm gap-8', 'aria-labelledby': 'spec-title' },
    h('h2', { id: 'spec-title', class: 'title' }, T.gadResult.specialistTitle),
    band.specialist.map((p) => h('div', { class: 'body-sm' }, p)),
    band.helpLink ? h('div', { class: 'stack-4' },
      helpLink(),
      h('div', { class: 'caption' }, T.gadResult.helpCaption)) : null);

  return [
    h('div', { class: 'stack-4' },
      h('div', { class: 'meta' }, T.gadResult.meta(resultDay(rec))),
      h('h1', { class: 'h1' }, T.gadResult.title)),
    scoreCard,
    h('section', { class: 'card gap-8', 'aria-labelledby': 'meaning-title' },
      h('h2', { id: 'meaning-title', class: 'title' }, T.gadResult.meaningTitle),
      h('div', { class: 'body' }, band.meaning)),
    specialist
  ];
}

const SCALE = Object.fromEntries(ELLIS_SCALES.map((s) => [s.id, s]));

function ellisScreen(rec) {
  const R = T.ellisResult;
  const rank = ellisRanking(rec.scales);
  const list = (ids) => h('ol', { class: 'rank-list' }, ids.map((id) => h('li', null, SCALE[id].name)));

  const top = rank.noDiff
    ? h('section', { class: 'stack-8', 'aria-labelledby': 'top' },
      h('h2', { id: 'top', class: 'title' }, R.topTitle),
      h('div', { class: 'card' }, h('div', { class: 'body' }, R.noDiff)))
    : h('section', { class: 'stack-8', 'aria-labelledby': 'top' },
      h('h2', { id: 'top', class: 'title' }, R.topTitle),
      h('div', { class: 'stack-12' }, rank.top.map((id) => {
        const s = SCALE[id];
        return h('article', { class: 'card' },
          h('div', { class: 'stack-4' },
            h('h3', { class: 'h3' }, s.name),
            h('div', { class: 'caption' }, s.science)),
          h('div', { class: 'body' }, s.about),
          h('div', { class: 'stack-4 divider-12' },
            h('div', { class: 'label' }, R.markersTitle),
            h('div', { class: 'body-sm text' }, s.markers)));
      })));

  const rest = rank.rest.length ? h('section', { class: 'stack-8', 'aria-labelledby': 'rest' },
    h('h2', { id: 'rest', class: 'title' }, rank.noDiff ? R.allTitle : R.restTitle),
    list(rank.rest)) : null;

  return [
    h('div', { class: 'stack-8' },
      h('div', { class: 'stack-4' },
        h('div', { class: 'meta' }, rec.window === 'final' ? R.metaRepeat : R.metaFirst),
        h('h1', { class: 'h1' }, R.title)),
      h('div', { class: 'body' }, R.intro)),
    top,
    rest,
    h('div', { class: 'caption' }, R.footer)
  ];
}

export function renderTestResult(route) {
  const rec = S.tests.find((t) => t.id === route.id);
  const ok = rec && ((rec.test_id === GAD7.test_id && Number.isInteger(rec.score))
    || (rec.test_id === ELLIS.test_id && rec.scales && ELLIS_SCALES.every((s) => Number.isFinite(rec.scales[s.id]))));
  if (!ok) { go('#/tests', { replace: true }); return null; }
  const back = () => go(fromHash(route.from));
  const el = h('main', { class: 'screen inner result' },
    backLink(route.from === 'today' ? T.common.today : T.gadResult.backTests, back),
    rec.test_id === GAD7.test_id ? gadScreen(rec, route.from) : ellisScreen(rec),
    h('div', { class: 'push-bottom' }, button(T.common.done, back, { large: true, fk: 'result-done' })));
  return { el };
}
