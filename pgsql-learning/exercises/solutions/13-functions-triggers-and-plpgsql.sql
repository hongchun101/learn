-- Solutions 13
SET search_path = sql_core, public;

-- Q1
CREATE OR REPLACE FUNCTION add_credit(aid bigint, amount bigint) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
BEGIN
    UPDATE sql_core.accounts SET balance_cents = balance_cents + amount WHERE id = aid;
END
$$;

-- Q2
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.created_at := now();
    RETURN NEW;
END
$$;

-- Q3
CREATE OR REPLACE FUNCTION debitable(aid bigint, amount bigint) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE
    new_balance bigint;
BEGIN
    UPDATE sql_core.accounts
       SET balance_cents = balance_cents - amount
     WHERE id = aid
     RETURNING balance_cents INTO new_balance;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'account % not found', aid;
    END IF;
    RETURN new_balance;
EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'insufficient funds on account %', aid;
END
$$;
