// =============================================================================
// Chapter 07 — Demo
// =============================================================================

import {
  onCriticalPath,
  cycleFits,
  burnup,
  averageVelocity,
  velocityStd,
  sprintsToComplete,
  carryOverRate,
  predictability,
  decisionScore,
  rankOptions,
  consensus,
  meetingCost,
  slantScore,
  riskRanking,
  launchReadiness,
  recommendReleaseTier,
  type Task,
  type Sprint,
  type Risk,
  type LaunchCheck,
  type DecisionMatrix,
  type WorkingBackwardsDoc,
} from './index.js';

export function demo(): void {
  // 1. Critical path
  const tasks: Task[] = [
    { id: 'T1', title: 'design', owner: 'des', estimateDays: 3, status: 'done', dependsOn: [], startAt: '2026-01-01' },
    { id: 'T2', title: 'api', owner: 'eng', estimateDays: 5, status: 'in-progress', dependsOn: ['T1'], startAt: '2026-01-04' },
    { id: 'T3', title: 'frontend', owner: 'eng', estimateDays: 4, status: 'in-progress', dependsOn: ['T1'], startAt: '2026-01-04' },
    { id: 'T4', title: 'qa', owner: 'qa', estimateDays: 2, status: 'todo', dependsOn: ['T2', 'T3'], startAt: '2026-01-09' },
  ];
  console.log('[07] critical path  =', onCriticalPath(tasks).join(','));

  // 2. Cycle capacity
  console.log('[07] cycle fits 30pt =', cycleFits({ weeks: 2, capacity: 50 }, 30, 15).fits);

  // 3. Burnup
  const bu = burnup(100, [
    { day: 1, done: 5 },
    { day: 2, done: 8 },
    { day: 3, done: 12 },
  ]);
  console.log('[07] burnup D3 done  =', bu[2]?.totalDone);

  // 4. Velocity
  const sprints: Sprint[] = [
    { id: 's1', committedPoints: 30, completedPoints: 25, teamSize: 4, carryOver: 5 },
    { id: 's2', committedPoints: 32, completedPoints: 30, teamSize: 4, carryOver: 3 },
    { id: 's3', committedPoints: 35, completedPoints: 32, teamSize: 4, carryOver: 3 },
  ];
  console.log('[07] avg velocity    =', averageVelocity(sprints).toFixed(1));
  console.log('[07] velocity std    =', velocityStd(sprints).toFixed(2));
  console.log('[07] sprints for 80pt =', sprintsToComplete(80, sprints));
  console.log('[07] carryover rate  =', (carryOverRate(sprints) * 100).toFixed(1) + '%');
  console.log('[07] predictability  =', (predictability(sprints) * 100).toFixed(0) + '%');

  // 5. Decision matrix
  const m: DecisionMatrix = {
    criteria: [
      { id: 'cost', weight: 0.3 },
      { id: 'speed', weight: 0.2 },
      { id: 'quality', weight: 0.5 },
    ],
    options: [
      { id: 'A', name: 'A', scores: { cost: 5, speed: 3, quality: 4 } },
      { id: 'B', name: 'B', scores: { cost: 3, speed: 5, quality: 5 } },
      { id: 'C', name: 'C', scores: { cost: 4, speed: 4, quality: 3 } },
    ],
  };
  console.log('[07] rank options    =', rankOptions(m).map((o) => `${o.id}:${o.score.toFixed(1)}`).join(' '));
  console.log('[07] A score         =', decisionScore(m, 'A').toFixed(2));

  // 6. Consensus
  console.log('[07] consensus 7/3   =', consensus(['yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'no', 'no', 'no']));

  // 7. Meeting cost
  console.log('[07] meeting cost    =', meetingCost(8, 60, 100).toFixed(0));

  // 8. Slant
  const wb: WorkingBackwardsDoc = {
    headline: 'Customers ship 10× faster',
    summary: 'A new workflow tool for product teams',
    problem: 'teams waste time in status meetings',
    solution: 'a real-time status feed for the customer and their team',
    quote: '"I cancelled my standup the day I installed it."',
    successMetrics: ['+10% activation', '+5% retention'],
  };
  console.log('[07] slant           =', slantScore(wb));

  // 9. Risk register
  const risks: Risk[] = [
    { id: 'R1', description: 'db overload', probability: 0.3, impact: 4, owner: 'eng' },
    { id: 'R2', description: 'marketing misses', probability: 0.5, impact: 2, owner: 'mkt' },
    { id: 'R3', description: 'competitor copies', probability: 0.1, impact: 5, owner: 'pm' },
  ];
  console.log('[07] risk top        =', riskRanking(risks)[0]?.id);

  // 10. Launch readiness
  const checks: LaunchCheck[] = [
    { id: 'L1', name: 'load test', done: true, owner: 'qa' },
    { id: 'L2', name: 'doc', done: true, owner: 'pm' },
    { id: 'L3', name: 'rollback plan', done: false, owner: 'sre' },
  ];
  const r = launchReadiness(checks);
  console.log('[07] launch ready    =', r.ready, r.doneCount + '/' + r.totalCount);

  // 11. Release tier
  console.log('[07] tier multi/noFF =', recommendReleaseTier(false, 'multi-tenant'));
  console.log('[07] tier single/FF  =', recommendReleaseTier(true, 'single-tenant'));
}
