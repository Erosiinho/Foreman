#!/bin/sh
set -e

git config --global user.name "${GIT_AUTHOR_NAME:-Foreman Bot}"
git config --global user.email "${GIT_AUTHOR_EMAIL:-foreman@ealb.fr}"

# Wires git's credential helper to `gh`, which authenticates from GH_TOKEN (already in env) —
# without this, `git push` over https has no way to identify itself.
gh auth setup-git

exec "$@"
