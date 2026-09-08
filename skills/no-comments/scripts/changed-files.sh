#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -ne 0 ]; then
  printf 'usage: %s\n' "$0" >&2
  exit 2
fi

BASE=""
if command -v gh >/dev/null 2>&1; then
  BASE="$(gh pr view --json baseRefName --jq .baseRefName 2>/dev/null || true)"
fi
if [ -z "$BASE" ]; then
  BASE="$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null \
    | sed 's#^refs/remotes/origin/##' || true)"
fi
if [ -z "$BASE" ]; then
  BASE=main
fi

git check-ref-format --branch "$BASE" >/dev/null
git rev-parse --verify "refs/remotes/origin/${BASE:?}" >/dev/null

{
  git diff --name-only "origin/${BASE:?}...HEAD"
  git diff --name-only
  git diff --cached --name-only
} | LC_ALL=C sort -u
