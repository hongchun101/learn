-- Solutions 23
DROP ROLE IF EXISTS app_ro;
CREATE ROLE app_ro LOGIN PASSWORD 'app_ro' NOSUPERUSER;

DROP TABLE IF EXISTS docx CASCADE;
CREATE TABLE docx (id bigint, region text);
ALTER TABLE docx ENABLE ROW LEVEL SECURITY;
CREATE POLICY r ON docx USING (region = current_setting('app.region', true));
GRANT SELECT ON docx TO app_ro;
