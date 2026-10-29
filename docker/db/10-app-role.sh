#!/bin/sh
# Database role of the application (forga_app): owns the database "forga" and everything in it, may create databases
# (restore into a new database and swap), but is no superuser: it cannot read files of the server, run programs or
# change other roles. The superuser POSTGRES_USER (forga) stays for administration only.
#
# Runs automatically when the database volume is created (/docker-entrypoint-initdb.d). For an existing installation
# run it once by hand, then restart the application with the new DATABASE_URL (see dokumentation/implementiert/betrieb.md):
#   docker compose -f docker/compose.yml exec db sh /docker-entrypoint-initdb.d/10-app-role.sh
set -eu

: "${FORGA_DB_APP_PASSWORD:?FORGA_DB_APP_PASSWORD is missing}"
DB=${POSTGRES_DB:-forga}
ADMIN=${POSTGRES_USER:-forga}

psql -v ON_ERROR_STOP=1 -U "$ADMIN" -d "$DB" -v app_password="$FORGA_DB_APP_PASSWORD" -v db="$DB" <<'SQL'
SELECT format('CREATE ROLE forga_app LOGIN CREATEDB NOSUPERUSER NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'forga_app') \gexec
SELECT format('ALTER ROLE forga_app LOGIN CREATEDB NOSUPERUSER NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', :'app_password') \gexec
SELECT format('ALTER DATABASE %I OWNER TO forga_app', :'db') \gexec
-- Existing installation: schemas, tables and sequences of core and modules go to the application role.
DO $$
DECLARE
  item record;
BEGIN
  FOR item IN SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg\_%' AND nspname <> 'information_schema' LOOP
    EXECUTE format('ALTER SCHEMA %I OWNER TO forga_app', item.nspname);
  END LOOP;
  FOR item IN
    SELECT n.nspname, c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname NOT LIKE 'pg\_%' AND n.nspname <> 'information_schema' AND c.relkind IN ('r', 'p', 'S', 'v', 'm')
      -- Sequences of serial columns follow their table.
      AND NOT (c.relkind = 'S' AND EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype IN ('a', 'i')))
  LOOP
    EXECUTE format(CASE item.relkind WHEN 'S' THEN 'ALTER SEQUENCE %I.%I OWNER TO forga_app' WHEN 'v' THEN 'ALTER VIEW %I.%I OWNER TO forga_app' WHEN 'm' THEN 'ALTER MATERIALIZED VIEW %I.%I OWNER TO forga_app' ELSE 'ALTER TABLE %I.%I OWNER TO forga_app' END, item.nspname, item.relname);
  END LOOP;
END $$;
SQL
echo "Role forga_app owns the database $DB."
