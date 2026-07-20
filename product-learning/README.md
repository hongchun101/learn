# Product Learning — A From-0-to-Expert Curriculum

> 9 chapters, 1 shared TypeScript contract, runnable code-first curriculum.
> Read top-to-bottom and you can ship, measure, defend, and grow any product
> from idea to platform.

## What this is

A complete, code-first curriculum on product management, covering
**every core discipline** a working PM needs. Every chapter is a
runnable TypeScript module with its own unit tests; every chapter ships
a `demo()` that prints real values for the formulas so you can see
the numbers move. The aim is to take a learner from "what does a PM
do?" to "I can read any PRD, plan any A/B, model any LTV, and defend
any decision in front of a room."

## Curriculum

| #  | Chapter                                  | What you learn                                                                                                              |
| -- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 01 | PM Fundamentals & Mental Models          | Problem statements, JTBD, value props, hypotheses, RICE/ICE/WSJF, 4 Risks, CIRCLES, JTBD, opportunity sizing, decision log. |
| 02 | User Research                            | Recruitment & sampling, screener, saturation, interview guide, sentiment, themes, Cohen's κ, personas, SUS, NPS, Cronbach's α, A/B, Bayesian. |
| 03 | Requirements & PRD                       | Kano, MoSCoW, story points, Given/When/Then, PRD validation, stakeholders (power/interest), RACI, PERT, Wideband Delphi, reference-class. |
| 04 | Product Design & UX                      | Information architecture (depth, fan-out, orphans, reachability), user flows, WCAG contrast, Nielsen's 10 heuristics, touch targets, form a11y. |
| 05 | Data-Driven Decisions & Metrics          | Metric trees, HEART, AARRR, funnels, cohorts, LTV/CAC, payback, Rule of 40, Burn multiple, anomaly detection (z-score, EWMA), Beta. |
| 06 | Growth & Monetization                    | K-factor, viral growth, CAC payback, SEO ROI, price elasticity, stickiness, power-law & exponential retention, habit, smoke test, pricing tiers, A/B sample size, mSPRT, CUPED, UCB1. |
| 07 | Project Management & Collaboration       | Critical path, cycle capacity, burnup, velocity, sprint predictability, decision matrices, consensus, working-backwards, risk register, release tier. |
| 08 | Product Strategy & Lifecycle             | BCG, GE/McKinsey, lifecycle stage, investment, Ansoff, portfolio concentration, OKRs, good-strategy check, chasm, Wardley, build-vs-buy. |
| 09 | Advanced Topics                          | Platforms (Metcalfe, GMV, liquidity, two-sided), AI products (precision/recall/F1, log-loss, LLM cost, safety, hallucination, refusal), privacy (PII detection, retention, DSAR, consent), i18n (currency, date, expansion, locale readiness), verticals (compliance, cycle-time, enterprise readiness). |

## Project layout

```
product-learning/
├── src/
│   ├── 01-fundamentals/         models, priority, mental-models, opportunities, demo
│   ├── 02-user-research/        models, recruitment, interview, survey, quant, demo
│   ├── 03-requirements-prd/     models, kano, prd, stakeholders, estimation, demo
│   ├── 04-design-ux/            models, architecture, flow, accessibility, heuristics, demo
│   ├── 05-metrics-data/         models, funnel, business, tree, anomaly, demo
│   ├── 06-growth-monetization/  models, retention, pricing, experiments, demo
│   ├── 07-pm-collaboration/     models, scheduling, agile, decisions, launch, demo
│   ├── 08-strategy-lifecycle/   models, portfolio, lifecycle, strategy, demo
│   └── 09-advanced-topics/      platform, ai-product, privacy, i18n, verticals, demo
├── tests/                       one vitest spec per chapter (ch01..ch09)
├── scripts/run-all-demos.ts     runs every chapter's demo
├── package.json
├── tsconfig.json                strict + noUncheckedIndexedAccess
├── tsconfig.build.json
├── vitest.config.ts
├── eslint.config.js
├── .prettierrc.json
└── README.md
```

## How to study

1. Read the chapter header in the source file. Each starts with a
   `Goal:` block that lists the concepts the chapter teaches.
2. Read the chapters in order — `02` builds on the personas from `01`,
   `05` uses the A/B tests from `02`, `07` uses the velocity from `05`,
   and so on.
3. After each chapter, run `npx vitest run tests/ch<NN>-...` to check
   your understanding by reading what is asserted.
4. Then run `npm run demo` (or `npx tsx scripts/run-all-demos.ts`) to
   watch every chapter's demo print real numbers.

## Quality gates

The repository passes each of these on a clean clone:

```bash
npm install
npm run typecheck      # tsc --noEmit, strict + noUncheckedIndexedAccess
npm test               # vitest run, every chapter spec
npm run lint           # eslint src tests
npm run build          # tsc -p tsconfig.build.json → dist/
npm run demo           # runs every chapter's demo
```

## Conventions

- **Strict TypeScript**: every value has a precise type. `any` is
  forbidden. `noUncheckedIndexedAccess` is on, so every array/record
  access returns `T | undefined`.
- **Pure functions** wherever possible; classes only when state belongs
  together (BitCursor-style utilities in ch04).
- **No network, no filesystem, no randomness from global state** in core
  logic: clocks, RNG, and time sources are injected as parameters so
  every algorithm is deterministic and testable.
- **Every claim about a framework is sourced inline with a citation**
  (book, paper, blog post). Search the source for "BCG", "RICE", or
  "GDPR" to find them.
- **The code is organized so each concept is implemented against the
  underlying primitive, then wrapped in a named function** (e.g. RICE
  primitives → `riceScore` → `riceToBucket`).

## Learning outcomes

A learner who completes every chapter and exercise will be able to:

- Frame any product decision as a hypothesis and pick a cheap test.
- Run a recruitment, code observations, synthesize personas, and report
  findings with confidence intervals and inter-rater agreement.
- Write and validate a PRD, including MoSCoW, RACI, PERT estimation,
  and a stakeholder map.
- Critique a design with Nielsen's heuristics, run a WCAG contrast
  check, and reason about information architecture.
- Design a metric tree with one North Star, defend a balanced HEART
  set, and read cohort retention & funnel drop-off.
- Compute LTV, CAC, payback, Rule of 40, and Burn multiple from raw
  inputs, and recommend a pricing tier from a feature usage signal.
- Plan a sprint with capacity, critical-path scheduling, velocity, and
  a launch readiness check, and write a working-backwards press release.
- Score a portfolio on BCG and GE/McKinsey, classify lifecycle stage,
  set OKRs, and decide build-vs-buy from a Wardley map.
- Evaluate a platform's two-sided health, an AI product's precision /
  recall / F1 / log-loss / LLM-cost, a privacy programme's PII surface,
  and a locale launch's readiness.
