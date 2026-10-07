-- Postgres runs this once, when the data volume is first created (docker-compose.yml mounts it
-- into /docker-entrypoint-initdb.d). The test suites migrate this database and truncate it between tests.
CREATE DATABASE scholarcrew_test;
