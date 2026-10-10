#!/bin/sh
# Re-arms the demo's local sign-in link and restores Jordan's award letters in the dev database.
set -eu
cd "$(dirname "$0")/../.."
docker compose exec -T db psql -v ON_ERROR_STOP=1 -q -U scholarcrew -d scholarcrew < demo/scholarcrew-tour/fixtures/prepare.sql
