@echo off
rem Windows-friendly launcher that runs the capstone verifier end-to-end.
rem Each step pipes docker exec output through; failures abort.

setlocal
cd /d "%~dp0\.."

set COMPOSE_FILE=docker/docker-compose.yml
set PG_USER=postgres

call :exec capstone/sql/01-schema.sql
call :exec capstone/sql/02-functions-triggers-rls.sql
call :exec capstone/sql/03-seed.sql
call :exec capstone/sql/04-queries.sql
call :exec capstone/sql/05-ops.sql
call :exec sql/contracts/00-master-check.sql

echo === capstone invariants ===
docker compose -f %COMPOSE_FILE% exec -T primary psql -U %PG_USER% -d learning -v ON_ERROR_STOP=on -X -A -c "SELECT count(*) AS partition_count FROM pg_inherits WHERE inhrelid::regclass::text LIKE 'shop.orders_%';"

echo === CAPSTONE OK ===
endlocal
exit /b 0

:exec
docker compose -f %COMPOSE_FILE% exec -T primary psql -U %PG_USER% -d learning -v ON_ERROR_STOP=on -X -f "/workspace/%~1"
exit /b %ERRORLEVEL%
