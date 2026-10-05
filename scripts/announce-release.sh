#!/usr/bin/env bash
set -euo pipefail
CL=src/content/docs/docs/changelog.md

[ -n "${HOOK:-}" ] || { echo "::warning::DISCORD_RELEASE_WEBHOOK unset — skipping"; exit 0; }

# Version = the dispatch input if given, else the newest "## x.y.z"
# heading. Anchor is the dotless slug github-slugger emits (1.6.11 ->
# 1611), matching the live page.
if [ -n "${VER_INPUT:-}" ]; then
  VER="$VER_INPUT"
else
  VER=$(grep -m1 -E '^## [0-9]+\.[0-9]+\.[0-9]+$' "$CL" | sed 's/^## //')
fi
[[ "$VER" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "::error::invalid stable version"; exit 1; }
if grep -Fxq "$VER" .github/announced-versions.txt; then
  echo "freemkv $VER predates the announcement ledger — skipping"
  exit 0
fi
CLAIM="refs/tags/discord-announced/v$VER"
EXISTING=$(git ls-remote --refs origin "$CLAIM")
if [ -n "$EXISTING" ]; then
  echo "freemkv $VER already claimed — skipping"
  exit 0
fi
ANCHOR=${VER//./}
URL="https://freemkv.org/docs/changelog/#${ANCHOR}"

# The section = lines between "## VER" and the next "## ", with the
# HTML bits (the <small>date</small> tag) stripped so it reads as
# clean markdown in Discord.
SECTION=$(awk -v v="## $VER" '$0==v{f=1;next} f&&/^## /{exit} f{print}' "$CL" \
            | sed -E 's/<[^>]+>//g')
[ -n "$SECTION" ] || { echo "::error::no changelog section for '$VER'"; exit 1; }

# The first non-blank line is the release date. Fold it into the
# header rather than leaving it as an orphan line in the body.
FIRST=$(printf '%s\n' "$SECTION" | awk 'NF{print; exit}')
if printf '%s' "$FIRST" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'; then
  HEADER="@everyone **freemkv $VER** — released $FIRST"
  BODY=$(printf '%s\n' "$SECTION" | awk 'NF&&!seen{seen=1;next} seen{print}')
else
  HEADER="@everyone **freemkv $VER** was just released."
  BODY="$SECTION"
fi
# Trim leading blank lines so the body starts at the first heading.
BODY=$(printf '%s\n' "$BODY" | awk 'NF{f=1} f')

CONTENT=$(printf '%s\n\n%s\n\n%s' "$HEADER" "$BODY" "$URL")

# Discord hard-limits `content` to 2000 chars; leave headroom.
CONTENT=${CONTENT:0:1900}

# Claim BEFORE sending: an uncertain HTTP result must not ping everyone twice.
# A failed send requires an operator to inspect Discord before removing this tag.
gh api --method POST "repos/$GITHUB_REPOSITORY/git/refs" \
  -f ref="$CLAIM" -f sha="$(git rev-parse HEAD)" >/dev/null

# allowed_mentions.parse=["everyone"] is REQUIRED for @everyone to
# actually ping when posting through a webhook.
jq -n --arg c "$CONTENT" \
  '{content:$c, allowed_mentions:{parse:["everyone"]}}' \
| curl -fsS -X POST "$HOOK" -H 'Content-Type: application/json' -d @-
echo "Announced freemkv $VER"
