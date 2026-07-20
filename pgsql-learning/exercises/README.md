# Exercises

Each `exercises/NN-*.sql` is a graded problem set for module `NN`. The
expected output (a \"reference query\") lives in `exercises/solutions/`.
Each exercise also has a verifier under `scripts/verify-module.sh NN`.

Run any set:

```
docker compose -f docker/docker-compose.yml exec primary psql -U postgres -d learning \
  -f /workspace/exercises/01-types-and-tables.sql
bash scripts/verify-module.sh 01
```
