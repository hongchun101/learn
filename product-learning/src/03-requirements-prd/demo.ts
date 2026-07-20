// =============================================================================
// Chapter 03 — Demo
// =============================================================================

import {
  rankedKano,
  moscowBucket,
  validatePrd,
  renderPrdMarkdown,
  givenWhenThen,
  makeStory,
  stakeholderQuadrant,
  pert,
  widebandDelphi,
  referenceClassForecast,
  calendarWeeks,
  type Prd,
  type Stakeholder,
  type Moscow,
  type UserStory,
} from './index.js';

export function demo(): void {
  // 1. Kano
  const ranked = rankedKano([
    { id: 'F1', pair: { withAnswer: 'like', withoutAnswer: 'dislike' } },
    { id: 'F2', pair: { withAnswer: 'expect', withoutAnswer: 'expect' } },
    { id: 'F3', pair: { withAnswer: 'neutral', withoutAnswer: 'neutral' } },
    { id: 'F4', pair: { withAnswer: 'dislike', withoutAnswer: 'like' } },
  ]);
  console.log('[03] kano ranked   =', ranked.map((r) => `${r.id}:${r.category}`).join(' '));

  // 2. MoSCoW bucketing
  const stories: UserStory[] = [
    makeStory('S1', 'pm', 'add export', 'share', [givenWhenThen('A1', 'logged in', 'click export', 'download starts')], 3),
    makeStory('S2', 'pm', 'add sso', 'compliance', [givenWhenThen('A2', 'admin', 'enable sso', 'enforced')], 13),
    makeStory('S3', 'pm', 'redesign nav', 'easier', [givenWhenThen('A3', 'open', 'click nav', 'see new')], 8),
  ];
  const moscow: Record<string, Moscow> = { S1: 'should', S2: 'must', S3: 'could' };
  const budget = moscowBucket(stories, new Map(Object.entries(moscow)), 16);
  console.log('[03] moscow picked =', budget.map((s) => s.id).join(','));

  // 3. PRD validation
  const prd: Prd = {
    id: 'P1',
    title: 'Status digest',
    author: 'alice',
    status: 'draft',
    problem: 'PMs lose 4h/wk chasing status',
    goals: ['reduce chasing to <30min/wk'],
    nonGoals: ['full standup replacement'],
    successMetrics: [{ id: 'M1', name: 'chase-time', target: '<30min' }],
    stories: [
      makeStory('S1', 'pm', 'see weekly digest', 'save time', [
        givenWhenThen('A1', 'logged in', 'monday 9am', 'digest appears'),
      ], 5),
    ],
    nfrs: [],
    moscow: [{ storyId: 'S1', bucket: 'must' }],
    openQuestions: ['how often?'],
    changelog: [],
  };
  const issues = validatePrd(prd);
  console.log('[03] prd issues    =', issues.length, 'ready=' + issues.every((i) => i.severity !== 'error'));

  // 4. Render to markdown
  const md = renderPrdMarkdown(prd);
  console.log('[03] prd markdown  =', md.split('\n').length, 'lines');

  // 5. Stakeholders
  const sh: Stakeholder[] = [
    { id: 'sh1', name: 'CEO', role: 'exec', power: 5, interest: 4 },
    { id: 'sh2', name: 'Eng Lead', role: 'engineering', power: 4, interest: 5 },
    { id: 'sh3', name: 'CS', role: 'cs', power: 2, interest: 5 },
  ];
  console.log('[03] quadrants     =', sh.map((s) => `${s.name}:${stakeholderQuadrant(s)}`).join(' '));

  // 6. PERT
  const p = pert({ optimistic: 5, mostLikely: 8, pessimistic: 21 });
  console.log('[03] pert E/σ      =', p.expected.toFixed(2), p.sigma.toFixed(2));

  // 7. Wideband Delphi
  const delphi = widebandDelphi([[10, 14, 8, 12], [9, 11, 10, 10]]);
  console.log('[03] delphi        =', delphi.mean.toFixed(2), 'spread=' + delphi.spread);

  // 8. Reference class
  const fc = referenceClassForecast({ p10: 4, p50: 6, p90: 12 }, 0.5);
  console.log('[03] ref-class 0.5 =', fc.toFixed(2), 'weeks');

  // 9. Calendar weeks with holidays
  console.log('[03] cal weeks     =', calendarWeeks(20, 5, [2]).toFixed(2));
}
