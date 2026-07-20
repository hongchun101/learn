// =============================================================================
// Chapter 04 — Demo
// =============================================================================

import {
  nodeCount,
  maxDepth,
  fanOutViolations,
  orphanPages,
  canReach,
  deadEnds,
  stepCount,
  evaluateContrast,
  runFormChecks,
  isTouchTargetCompliant,
  worstHeuristics,
  type IaNode,
  type UserFlow,
  type HeuristicFinding,
  type FormField,
} from './index.js';

export function demo(): void {
  const ia: IaNode = {
    id: 'root',
    label: 'Home',
    children: [
      { id: 'work', label: 'Work', children: [
        { id: 'projects', label: 'Projects', children: [
          { id: 'project-a', label: 'A', children: [] },
          { id: 'project-b', label: 'B', children: [] },
        ] },
        { id: 'tasks', label: 'Tasks', children: [] },
      ] },
      { id: 'inbox', label: 'Inbox', children: [] },
      { id: 'settings', label: 'Settings', children: [
        { id: 'profile', label: 'Profile', children: [] },
        { id: 'prefs', label: 'Preferences', children: [] },
        { id: 'p1', label: 'P1', children: [] },
        { id: 'p2', label: 'P2', children: [] },
        { id: 'p3', label: 'P3', children: [] },
        { id: 'p4', label: 'P4', children: [] },
        { id: 'p5', label: 'P5', children: [] },
        { id: 'p6', label: 'P6', children: [] },
      ] },
    ],
  };
  console.log('[04] IA node count  =', nodeCount(ia));
  console.log('[04] IA max depth   =', maxDepth(ia));
  console.log('[04] IA fanout > 7  =', fanOutViolations(ia, 7).map((f) => f.parentId).join(','));

  // 2. Reachability & orphans
  const links = [
    { from: 'home', to: 'work' },
    { from: 'home', to: 'inbox' },
    { from: 'work', to: 'projects' },
  ];
  const pages = ['home', 'work', 'inbox', 'projects', 'orphaned'];
  console.log('[04] orphans        =', orphanPages(pages, links));
  console.log('[04] can reach      =', canReach(links, 'home', 'projects'));

  // 3. User flow
  const flow: UserFlow = {
    id: 'F1',
    name: 'add task',
    entry: 'home',
    steps: [
      { state: 'home', action: { kind: 'click', target: 'add' }, next: 'task-form' },
      { state: 'task-form', action: { kind: 'submit', form: 'task' }, next: 'task-saved' },
      { state: 'task-form', action: { kind: 'back' }, next: 'home' },
    ],
    happyPath: ['task-form', 'task-saved'],
  };
  console.log('[04] flow steps     =', stepCount(flow));
  console.log('[04] dead ends      =', deadEnds(flow).join(','));

  // 4. WCAG contrast
  const c = evaluateContrast({ foreground: '#ffffff', background: '#3b82f6' });
  console.log('[04] contrast white/blue =', c.ratio.toFixed(2), 'AA=' + c.aaNormal);
  const c2 = evaluateContrast({ foreground: '#888888', background: '#ffffff' });
  console.log('[04] contrast grey/white =', c2.ratio.toFixed(2), 'AA=' + c2.aaNormal);

  // 5. Form a11y
  const fields: FormField[] = [
    { id: 'email', label: 'Email', type: 'email', required: true },
    { id: 'pwd', label: 'Password', type: 'password', required: true, hasError: true },
    { id: 'no-label', label: '', type: 'text', required: false },
  ];
  const failures = runFormChecks(fields);
  console.log('[04] form failures  =', failures.filter((f) => f.failures.length).map((f) => `${f.fieldId}:${f.failures.length}`).join(' '));

  // 6. Touch target
  console.log('[04] 44px vs iOS    =', isTouchTargetCompliant(44, 'ios'));
  console.log('[04] 40px vs Android=', isTouchTargetCompliant(40, 'android'));

  // 7. Heuristics
  const findings: HeuristicFinding[] = [
    { heuristic: 'visibility', severity: 'major', screen: 'home', description: 'no loading state' },
    { heuristic: 'consistency', severity: 'minor', screen: 'profile', description: 'button shape differs' },
    { heuristic: 'visibility', severity: 'critical', screen: 'submit', description: 'no progress indicator' },
  ];
  console.log('[04] worst heur     =', worstHeuristics(findings, 2).map((w) => `${w.heuristic}:${w.score}`).join(','));
  console.log('[04] total score    =', findings.reduce((a, f) => a + (f.severity === 'critical' ? 3 : f.severity === 'major' ? 2 : 1), 0));
}
