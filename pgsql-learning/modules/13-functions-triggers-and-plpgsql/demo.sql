-- Module 13 — Functions, Triggers, PL/pgSQL
\echo === Module 13: Functions and Triggers ===
SET search_path = sql_core, public;

DROP TABLE IF EXISTS accounts CASCADE;
DROP TABLE IF EXISTS audit_log CASCADE;

CREATE TABLE accounts (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner         text NOT NULL,
    balance_cents bigint NOT NULL CHECK (balance_cents >= 0)
);

CREATE TABLE audit_log (
    id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    op        text NOT NULL,
    actor     text NOT NULL DEFAULT current_user,
    account_id bigint,
    amount    bigint,
    at        timestamptz NOT NULL DEFAULT clock_timestamp()
);

INSERT INTO accounts (owner, balance_cents) VALUES ('alice', 10000), ('bob', 5000);

-- 13.1 SQL function
CREATE OR REPLACE FUNCTION account_total() RETURNS bigint AS $$
    SELECT sum(balance_cents)::bigint FROM accounts;
$$ LANGUAGE SQL;
SELECT account_total();

-- 13.2 PL/pgSQL function with exception handling
CREATE OR REPLACE FUNCTION debit(aid bigint, amount_cents bigint) RETURNS bigint AS $$
DECLARE
    new_balance bigint;
BEGIN
    UPDATE accounts
       SET balance_cents = balance_cents - amount_cents
     WHERE id = aid
    RETURNING balance_cents INTO new_balance;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'account % not found', aid;
    END IF;
    RETURN new_balance;
EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'insufficient funds on account %', aid;
END;
$$ LANGUAGE plpgsql;

-- 13.3 Trigger BEFORE/AFTER row level
CREATE OR REPLACE FUNCTION trg_audit() RETURNS trigger AS $$
BEGIN
    INSERT INTO audit_log (op, account_id, amount)
    VALUES (TG_OP, NEW.id, NEW.balance_cents);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accounts_audit_trg
    AFTER INSERT OR UPDATE OR DELETE ON accounts
    FOR EACH ROW EXECUTE FUNCTION trg_audit();

-- Trigger test
UPDATE accounts SET balance_cents = balance_cents - 100 WHERE owner = 'alice';
SELECT * FROM audit_log;

-- 13.4 STORED GENERATED column vs trigger: prefer STORED when possible.
-- 13.5 SECURITY DEFINER — the function runs as its owner.
CREATE OR REPLACE FUNCTION add_credit(aid bigint, amount bigint) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER AS $$
BEGIN
    UPDATE accounts SET balance_cents = balance_cents + amount WHERE id = aid;
END;
$$;

-- 13.6 IMMUTABLE / STABLE / VOLATILE — affects planner and inlining.
CREATE OR REPLACE FUNCTION inc_cents(x bigint) RETURNS bigint
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
    SELECT x + 1
$$;

-- 13.7 Out parameters / return table
CREATE OR REPLACE FUNCTION top_n_accounts(n int) RETURNS TABLE(id bigint, owner text, balance bigint) AS $$
    SELECT id, owner, balance_cents FROM accounts ORDER BY balance_cents DESC LIMIT n;
$$ LANGUAGE sql;
SELECT * FROM top_n_accounts(2);

-- 13.8 LISTEN/NOTIFY from a trigger
CREATE OR REPLACE FUNCTION trg_notify() RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('account_changed', json_build_object('id', NEW.id, 'op', TG_OP)::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accounts_notify_trg
    AFTER UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION trg_notify();

\echo === Module 13 complete ===
