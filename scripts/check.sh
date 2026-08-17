#!/usr/bin/env sh
set -eu
node --check public/app.js
node --check public/sw.js
python3 -m json.tool public/manifest.webmanifest >/dev/null
if grep -Eqi '(service_role|sb_secret_|SUPABASE_SECRET)' public/config.js; then
  echo 'Secret-like value found in public/config.js' >&2
  exit 1
fi
echo 'Fitnest checks passed.'
