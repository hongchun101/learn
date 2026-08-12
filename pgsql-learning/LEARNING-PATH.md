# LEARNING-PATH.md

> One file, one purpose: tell a complete beginner what they need
> to know, what order to do things in, and how to know when they're
> done.

## Before you start — prerequisites

This curriculum assumes you already:

| Skill | What you must be able to do | Verify |
|-------|----------------------------|--------|
| **Linux shell** | `ls`, `cd`, `cp`, `cat`, `grep`, `awk` basics; redirect and pipe | `ls /etc | head` runs cleanly |
| **Git** | `clone`, `pull`, `commit`, `branch`, `merge` | You have a GitHub account |
| **TCP/IP networking** | What a port is, what localhost is, what an IP address is | You can explain `127.0.0.1:5432` |
| **SQL basics** | `SELECT`, `WHERE`, `ORDER BY`, `JOIN`, `GROUP BY`, simple `INSERT`/`UPDATE`/`DELETE` | You can solve HackerRank's "SQL Basics" badge |
| **One scripting language** | Python or Go; can read a 50-line script | You can write a `for` loop and a function |
| **Docker basics** | What a container is, what `docker compose up` does | `docker ps` works on your machine |

If you don't have all six, the curriculum will still work but you'll
spend days fighting infrastructure instead of learning PostgreSQL.
The time math is unforgiving.

## What you don't need

- A CS degree. PostgreSQL rewards people who can read English
  documentation carefully, not people who can recite B-tree deletion
  algorithms from memory.
- A 64-core server. The Docker stack runs on a laptop.
- A million-dollar cluster. The capstone is small; the lessons are
  the same.

## The one-week zero-to-running path

If you want to know *today* whether this curriculum is for you:

```
Day 1 (Sunday)
  Install Docker Desktop / OrbStack / colima.
  Clone this repo. Read README.md top to bottom.
  Do not run anything yet.

Day 2 (Monday)
  cp .env.example .env
  docker compose -f docker/docker-compose.yml up -d
  docker compose -f docker/docker-compose.yml exec primary \
      psql -U postgres -d learning -c 'SELECT version();'
  Run module 01 demo.sql. Read the README first.

Day 3 (Tuesday)
  Run module 02 demo.sql. Solve the exercise. Look at the solution.
  Do not skip the exercise even if it looks easy.

Day 4 (Wednesday)
  Run module 03 demo.sql. Solve the exercise.
  Re-read modules 01–03 README's "Mental model" sections.

Day 5 (Thursday)
  Run modules 04, 05, 06 demo.sql. Solve all three exercises.
  Time how long you spend on each.

Day 6 (Friday)
  Run modules 07, 08, 09 demo.sql. Solve all three exercises.
  Look at `docs/02-glossary.md` for terms you don't recognize.

Day 7 (Saturday)
  Run module 10 demo.sql. Solve the exercise.
  Read `docs/00-overview.md` and `docs/01-architecture.md`.

After Day 7
  If you've kept up: continue with `docs/03-roadmap.md` Phase 1.
  If you've fallen behind: identify which module made you stop, and
  read the README of that module again. Re-do its exercise.
  If Docker is fighting you: stop and fix Docker first. The
  curriculum cannot proceed without a running cluster.
```

## The 90-day expert path

See `docs/03-roadmap.md`. The 90 days are divided into three phases:

| Phase | Days | Modules | Goal |
|-------|------|---------|------|
| 1 — SQL competent in production | 1–30  | 01–10 | Read any `EXPLAIN ANALYZE` plan, write any query |
| 2 — Index and storage literate | 31–60 | 11–19 | Defend any index choice, read any error message |
| 3 — Operate a real cluster | 61–90 | 20–28 + capstone | Ship a backup, fail over, monitor |

## How to know you're "done" with a module

A module is done when **all four** are true:

1. You can read the README without looking anything up.
2. You have run `demo.sql` and understand every line of output.
3. You can solve the exercise *without* looking at the solution.
4. You can answer every question in the module's section of
   `docs/07-interview-150.md` from memory.

If you skip any of those four, you will be back to re-do the module
later. The Phase 1–3 gates exist to force you not to.

## How to know you're "done" with the curriculum

You are done when:

1. You have run every `demo.sql`.
2. You have solved every exercise.
3. You have run the capstone end-to-end.
4. You have written the four `docs/my-notes/` deliverables.
5. You can answer 100 of the 150 questions in
   `docs/07-interview-150.md` from memory.

Then you are *interview-ready*. The next six months of your career
are where you become *operationally ready*, which is what the salary
band you want pays for.

## What you do when you get stuck

1. **Read the README's "Mental model" section.** Most "stuck" is
   actually "I tried to read the code instead of the words".
2. **Run the demo. Read the output.** Don't paste it into ChatGPT.
3. **Look at `docs/02-glossary.md`.** The term you don't know is
   probably there.
4. **Read the relevant chapter of the PostgreSQL manual.** Every
   module links the canonical manual page in its README.
5. **Ask a question.** Make it specific: "I ran this query, I
   expected this plan, I got this plan, why?"

What you don't do:

- Don't install Postgres on your laptop outside Docker. The whole
  point of the stack is reproducibility.
- Don't add extensions the demo doesn't use.
- Don't change the `postgres` user's password.
- Don't run `VACUUM FULL` in production without reading the docs.

## The one file to read first

If you read only one file in this repo, read `docs/00-overview.md`.
It defines the five problems and the vocabulary the rest of the
curriculum uses. Without it, modules 16 onward won't make sense.

## The one file to read last

`docs/07-interview-150.md`. By the time you're ready for it, you
should be able to read a question, see the answer in your head,
and write it down.

## The one file to write yourself

`docs/my-notes/`. By the end of the curriculum you should have four
files in there, in your own words:

- `01-sql-foundation.md` — Part 1.
- `02-internals-handbook.md` — Part 2 + Part 3.
- `03-internals-deep-dive.md` — three of the five universal problems.
- `04-capstone-report.md` — your run of the capstone.

If you can't write those, you haven't learned the material.

## Time budget reminder

135 hours total. That's a part-time graduate course compressed into
three months. Show up daily. Don't binge: 90 minutes a day beats 9
hours on Saturday.
