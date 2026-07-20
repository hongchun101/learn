// =============================================================================
// Chapter 02 — Demo
// =============================================================================

import {
  defaultInterviewGuide,
  stratifiedSample,
  sampleSizeForProportion,
  saturationPoint,
  sentimentBreakdown,
  cohensKappa,
  synthesizePersonas,
  susScore,
  nps,
  cronbachsAlpha,
  worstDropOff,
  describe,
  twoProportionZ,
  probabilityBBeatsA,
  type Recruit,
  type Observation,
  type SurveyResponse,
} from './index.js';

export function demo(): void {
  // 1. Interview guide
  const guide = defaultInterviewGuide('chasing status updates');
  console.log('[02] interview guide phases =', guide.map((g) => g.phase).join(','));

  // 2. Recruitment
  const recruits: Recruit[] = [
    { id: 'r1', segment: 'startup', experienceLevel: 4, usageLevel: 3, timezone: 'UTC' },
    { id: 'r2', segment: 'startup', experienceLevel: 5, usageLevel: 4, timezone: 'UTC' },
    { id: 'r3', segment: 'midmarket', experienceLevel: 2, usageLevel: 2, timezone: 'EST' },
    { id: 'r4', segment: 'midmarket', experienceLevel: 3, usageLevel: 4, timezone: 'EST' },
    { id: 'r5', segment: 'enterprise', experienceLevel: 1, usageLevel: 1, timezone: 'PST' },
  ];
  const sample = stratifiedSample(recruits, 4);
  console.log('[02] stratified sample =', sample.map((r) => r.id).join(','));

  console.log('[02] sample size 50%@5% =', sampleSizeForProportion(0.5, 0.05, 1.96));

  // 3. Coding & saturation
  const observations: Observation[] = [
    { id: 'o1', participantId: 'r1', quote: 'I lose an hour a day in status', sentiment: 'frustrated', theme: 'time-cost' },
    { id: 'o2', participantId: 'r2', quote: 'It would be great if updates pushed', sentiment: 'frustrated', theme: 'time-cost' },
    { id: 'o3', participantId: 'r2', quote: 'I wish the team had a single source of truth', sentiment: 'confused', theme: 'fragmentation' },
    { id: 'o4', participantId: 'r3', quote: 'Slack threads get lost', sentiment: 'frustrated', theme: 'fragmentation' },
    { id: 'o5', participantId: 'r4', quote: 'Status is often out of date', sentiment: 'confused', theme: 'freshness' },
    { id: 'o6', participantId: 'r5', quote: 'We tried a wiki but nobody used it', sentiment: 'neutral', theme: 'freshness' },
  ];
  console.log('[02] saturation at  =', saturationPoint(observations));
  console.log('[02] sentiment      =', sentimentBreakdown(observations));
  console.log('[02] kappa A vs B   =', cohensKappa(
    observations.map((o) => o.theme),
    observations.map((o) => (o.id === 'o3' ? 'time-cost' : o.theme)),
  ).toFixed(3));
  console.log('[02] personas       =', synthesizePersonas(recruits, observations, 2).map((p) => p.id).join(','));

  // 4. SUS & NPS
  console.log('[02] SUS            =', susScore([4, 2, 4, 2, 4, 2, 4, 2, 4, 2]).toFixed(2));
  console.log('[02] NPS            =', nps([10, 10, 9, 8, 7, 6, 5, 4, 3, 0]).score.toFixed(1));

  // 5. Cronbach's α
  const ratings: number[][] = [
    [4, 3, 5, 4],
    [3, 4, 4, 3],
    [5, 5, 5, 4],
    [2, 3, 2, 2],
  ];
  console.log('[02] Cronbach α     =', cronbachsAlpha(ratings).toFixed(3));

  // 6. Survey drop-off
  const responses: SurveyResponse[] = [
    { id: '1', participantId: 'p1', answers: { Q1: 5, Q2: 4, Q3: 3, Q4: 2 } },
    { id: '2', participantId: 'p2', answers: { Q1: 5, Q2: 4, Q3: 3 } },
    { id: '3', participantId: 'p3', answers: { Q1: 4, Q2: 4 } },
  ];
  console.log('[02] worst drop-off =', worstDropOff(responses, ['Q1', 'Q2', 'Q3', 'Q4']));

  // 7. Descriptive stats & A/B
  console.log('[02] describe times =', describe([12, 14, 9, 11, 13, 10]).mean.toFixed(2));
  const ab = twoProportionZ({ conversionsA: 100, nA: 1000, conversionsB: 130, nB: 1000 });
  console.log('[02] A/B lift       =', (ab.lift * 100).toFixed(1) + '%', 'p=', ab.pValue.toFixed(4));
  console.log('[02] P(B>A)         =', probabilityBBeatsA({ conversionsA: 100, nA: 1000, conversionsB: 130, nB: 1000 }).toFixed(3));
}
