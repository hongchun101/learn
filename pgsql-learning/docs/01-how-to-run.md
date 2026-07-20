# 01 — How to Run

Three steps, no guesswork.

```bash
cd pgsql-learning
cp .env.example .env
docker compose -f docker/docker-compose.yml up -d   # primary + replica
docker compose -f docker/docker-compose.yml exec primary \
    psql -U postgres -d learning -f /workspace/sql/contracts/00-master-check.sql
```

For the capstone end-to-end:

```bash
bash scripts/verify-capstone.sh
```

Per-module runner (idempotent):

```bash
docker compose -f docker/docker-compose.yml exec primary \
    psql -U postgres -d learning -f /workspace/modules/01-types-and-tables/demo.sql
```

Reproducibility:

- All module SQL files are idempotent; a second run produces the same
  end state (uses DROP TABLE IF EXISTS).
- The capstone re-applies the entire schema; a second run inside the same
  cluster also works.

Conventions:

- Module SQL lives at `modules/NN-name/demo.sql`.
- Per-module exercises live at `exercises/NN-name.sql`; solutions at
  `exercises/solutions/NN-name.sql`.
- The capstone is in `capstone/sql/01..05.sql` and is exercised by
  `scripts/verify-capstone.sh`.

If you change the docker stack (e.g. swap to Postgres 17), also update
`docker/docker-compose.yml` and pin the image version everywhere.

# 02 — Glossary

> Single source of truth for every term in the curriculum. Whenever a
> module introduces a word, the word links here.
