#!/bin/bash
# Connects Resend to the RCCC Network Supabase project.
# Asks for the Resend API key without showing it, then:
#   1. stores it as the send-email function's RESEND_API_KEY secret,
#   2. turns on Supabase custom SMTP through Resend,
#   3. switches the sign-in email to the 6-digit code template.
# The key is never written to disk or printed.
set -euo pipefail

REF="udnrlisexjymqousvkkn"
SB="/opt/homebrew/bin/supabase"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FROM_EMAIL="${1:-onboarding@resend.dev}"
FROM_NAME="RCCC Network"

printf 'Copy your new Resend API key (starts with re_), then press Return here.\n(Or paste it and press Return. Nothing shows as you paste.) '
IFS= read -rs KEY
echo
# Pick the first re_... key out of whatever arrived (extra spaces or a double paste are fine).
KEY="$(printf '%s' "$KEY" | grep -oE 're_[A-Za-z0-9_]+' | head -1 || true)"
if [ -z "$KEY" ]; then
  KEY="$(pbpaste | grep -oE 're_[A-Za-z0-9_]+' | head -1 || true)"
  [ -n "$KEY" ] && echo "Using the key from your clipboard."
fi
case "$KEY" in
  re_*) ;;
  *) echo "That doesn't look like a Resend key (it should start with re_). Nothing was changed."; exit 1 ;;
esac

echo "1/3  Saving the key as the email function's secret..."
"$SB" secrets set --project-ref "$REF" RESEND_API_KEY="$KEY" EMAIL_FROM="$FROM_NAME <$FROM_EMAIL>" >/dev/null
echo "     Done."

echo "2/3  Turning on Resend as Supabase's email sender, with the code template..."
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/supabase/templates"
cp "$ROOT/supabase/templates/otp.html" "$TMP/supabase/templates/otp.html"
python3 - "$ROOT/supabase/config.toml" "$TMP/supabase/config.toml" "$FROM_EMAIL" "$FROM_NAME" <<'PY'
import sys, re
src, dst, from_email, from_name = sys.argv[1:5]
s = open(src).read()
head = '# [auth.email.smtp]\n# enabled = true\n# host = "smtp.resend.com"'
a = s.find(head)
b = s.find('\n[auth.sms]', a)
if a < 0 or b < 0:
    sys.exit('The Resend block was not found in config.toml; nothing was changed.')
block = s[a:b]
block = '\n'.join(l[2:] if l.startswith('# ') else l for l in block.split('\n'))
block = re.sub(r'admin_email = "[^"]*"', 'admin_email = "%s"' % from_email, block)
block = re.sub(r'sender_name = "[^"]*"', 'sender_name = "%s"' % from_name, block)
s = s[:a] + block + s[b:]
s = s.replace('email_sent = 2', 'email_sent = 30', 1)
open(dst, 'w').write(s)
PY
( cd "$TMP" && RESEND_SMTP_PASS="$KEY" "$SB" config push --project-ref "$REF" --yes >/dev/null )
echo "     Done."

unset KEY
echo "3/3  Connected. Sign-in codes and broadcasts now send through Resend from $FROM_EMAIL."
if [ "$FROM_EMAIL" = "onboarding@resend.dev" ]; then
  echo "     Note: Resend's test sender only delivers to the email you signed up to Resend with."
fi
