# 08 — Career Roadmap: Junior to 50K-RMB Expert

> One file. One purpose. Tell you, in plain language, how to go
> from "I know SQL" to "I am paid 50K RMB a month to be the
> PostgreSQL person".

This is calibrated for the Chinese tech market in 2026. Salary
numbers are monthly base, in RMB, in tier-1 cities (Beijing,
Shanghai, Shenzhen, Hangzhou, Guangzhou). Adjust for your city.

## The 50K-RMB PostgreSQL expert — what that means

At 50K base, you are a **mid-senior IC**. You are not a manager. You
are not a tech lead. You are the person the team pages when
something is broken. You:

- Run the on-call rotation for the database.
- Review every schema migration.
- Own the backup / restore / PITR procedure.
- Defend every GUC change with a measurement.
- Write the post-mortem when something goes wrong.
- Help application engineers write queries.
- Are *not* responsible for the application code, the cluster
  provisioning, or the network.

You are paid 50K because the cost of *not* having you is much
higher. One outage per quarter, and you've paid for yourself for
the year.

## The career ladder

```
Level 0: New graduate
  0K – 8K base. Internship or first job.
  You can write SQL. You know what an index is. You have not read
  pg_log.

Level 1: Junior developer
  8K – 15K base.
  You have used Postgres in production for 6 months.
  You can write a JOIN. You have run EXPLAIN.
  You don't know why a query is slow.

Level 2: Mid-level developer
  15K – 25K base.
  You can read an EXPLAIN plan and tell what the planner did.
  You can defend an index choice.
  You don't know why vacuum is important.

Level 3: Senior developer
  25K – 40K base.
  You can operate a Postgres cluster: backup, replication,
  monitoring.
  You don't know how to fix a wraparound emergency.

Level 4: PostgreSQL expert (the 50K tier)
  40K – 70K base.
  You have done all of the above, plus:
  - You can read pg_log and tell what the system was doing.
  - You can write a failover playbook.
  - You can defend any GUC change.
  - You can write a post-mortem that the CTO reads without
    rolling their eyes.
  - You can teach the curriculum in this repo to a junior.

Level 5: Principal / staff / architect
  70K – 150K base.
  Beyond this curriculum. Involves cross-system design,
  organisational influence, and/or specialisation (e.g., Citus,
  PG + Hadoop, PG + AI workloads).
```

## How this curriculum maps to the ladder

| Curriculum milestone | Maps to level |
|----------------------|---------------|
| Read docs/00-overview | L1 |
| Run modules 01–10 | L1 → L2 |
| Run modules 11–15 | L2 |
| Run modules 16–19 | L2 → L3 |
| Run modules 20–24 | L3 |
| Run modules 25–28 | L3 → L4 |
| Run capstone | L4 |
| Read docs/04-incident-playbook | L4 |
| Read docs/05-pitfalls | L4 |
| Read docs/06-tuning-cheatsheet | L4 |
| Answer 100 of 150 interview Qs from memory | L4-ready |

The curriculum itself gets you to **L4-ready**. The job gets you
to **L4**.

## The 50K-tier job, what to look for

A 50K-tier PostgreSQL role usually has:

- A primary/replica cluster to operate.
- Backups and PITR.
- A team of application engineers who will ask you questions.
- A pager rotation that includes you.

Avoid:

- "PostgreSQL + Redis + Kafka + Spark + Hadoop" roles. They're
  looking for a generalist. The PostgreSQL expertise is diluted.
- Roles where the database is managed by an external service
  (RDS, Aurora). You will operate the database through a UI. You
  will not develop expertise.
- Roles where the database is small (< 100 GB). There is not
  enough surface area for incidents.
- Roles where the team is one person. You will be on call 24/7.

Good signals:

- The job description says "PostgreSQL internals", "vacuum",
  "WAL", "replication".
- They have a wiki page on their backup procedure.
- They use `pg_stat_statements` and `auto_explain`.
- They use partitioned tables and have an opinion on the partition
  key.

## How to apply (Chinese tech market, 2026)

### Where to look

- **Boss直聘 (Boss Zhipin)**: most direct application flow.
- **拉勾 (Lagou)**: corporate roles.
- **脉脉 (Maimai)**: networking.
- **猎聘 (Liepin)**: headhunters for mid-senior roles.
- **V2EX**: tech community, occasional job posts.

### Resume signals that get past the HR filter

- "PostgreSQL" appears in the title or summary.
- A GitHub link showing PostgreSQL projects.
- A blog or notes repo (your `docs/my-notes/` from this curriculum).
- Certifications: none of the typical certs are worth much. Skip.

### Interview format

For a 50K-tier role, expect:

1. **Phone screen (30 min)**: HR filter. Behavioural questions.
   "Why do you want this role?" "Tell me about a database
   problem you solved." Have one or two stories ready.
2. **Technical phone screen (60 min)**: One or two senior
   engineers. Live coding or SQL questions. Expect EXPLAIN
   questions.
3. **On-site (4–6 hours)**: Multiple rounds:
   - SQL / query writing
   - Schema design
   - EXPLAIN analysis
   - Production incident walkthrough ("here's a scenario, walk me
     through it")
   - Behavioural / culture
4. **Final round**: Hiring manager. Usually more strategic.

### The stories you need

Have these three stories ready, each 5 minutes long:

1. **A query I optimized.** Module 10/11/25 territory. Pick a
   query you tuned with a measurable before/after.
2. **An incident I responded to.** Module 17/19/22/26 territory.
   Pick a real incident; if you don't have one, simulate one using
   `docs/04-incident-playbook.md`.
3. **A schema design I owned.** Module 04/14 territory. Pick a
   table you designed, including the partition key and indexes.

## After you get the job

The first 90 days are where you make your reputation.

### Days 1–30: Read everything

- Every pg_log file.
- Every schema migration.
- Every backup / restore procedure.
- Every monitoring alert.
- Every on-call rotation history.

### Days 31–60: Fix one thing

Pick *one* thing that is broken — high impact, low risk, low
effort. Examples:

- An unused index that's bloating writes.
- A query with a known bad plan.
- A monitoring gap.

Ship it. Tell everyone about it.

### Days 61–90: Document one thing

Pick *one* system that is poorly understood and write the canonical
doc for it. Examples:

- The backup procedure.
- The failover procedure.
- The vacuum schedule.
- The query-review checklist.

Put it in the team wiki. Reference it in code review. Make it the
source of truth.

### After 90 days

You are now the "PostgreSQL person" at this company. Congrats.

## When to leave (and when to stay)

Stay if:

- You are learning.
- The incidents are real and varied.
- The team respects your expertise.

Leave if:

- You have learned everything you can here.
- The role has become "DBA for a small database" with no growth.
- The salary has plateaued below market.

A 50K-tier person typically changes jobs every 2–3 years. Each move
gets you a 20–40% bump. Don't be loyal to the company; be loyal to
your craft.

## The career beyond 50K

After 50K, you have three paths:

### Path A: Engineering management

Move from IC to TL to manager. Your PostgreSQL expertise is a
*platform*, not a product. You will spend less time in pg_log and
more time in 1:1s. Compensation at the director level is
100K–200K base + equity.

### Path B: Principal / staff engineer

Stay IC. Become the technical authority on database / storage for
the whole company. Compensation is 80K–150K base + equity.

### Path C: Specialisation

Pick a vertical: PG + AI (vector), PG + time-series (TimescaleDB),
PG + distributed (Citus), PG + cloud-native (Aurora-like), PG +
real-time analytics (Hydra, Materialize). Compensation is variable,
but specialists at the top of their niche make 100K+.

### Path D: Independent consultant

After 3–5 years at the 50K tier, you have enough experience to
consult. Day rate: 5K–15K RMB. You'll have 2–3 long-term clients.
You'll work less and earn more, but you have no benefits, no
vacation, and no learning on someone else's budget.

## The one skill nobody tells you about

The skill that separates a 50K-tier engineer from a 25K-tier
engineer is **written communication**. Specifically:

- Writing a post-mortem that is honest, blameless, and actionable.
- Writing a design doc that the team can review.
- Writing a runbook that someone else can follow at 3 AM.

If you can write clearly, you will be promoted faster than someone
who can only code.

Practice every week. This curriculum's `docs/my-notes/` are your
training ground. Write, then rewrite.

## The final word

50K is not the ceiling. It's a milestone. The ceiling is wherever
you stop learning.

The curriculum in this repo is the foundation. The job is the
practice. The market is the test.

Good luck.
