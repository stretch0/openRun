#!/bin/sh
set -e

# When Docker bind-mounts a ./data folder that doesn't exist yet, it creates
# it owned by root, and openRun (which runs as the unprivileged `node` user)
# can't write there. Starting as root, hand the data folder to `node`, then
# drop root for good.
if [ "$(id -u)" = "0" ]; then
  data="${DATA_DIR:-/data}"
  mkdir -p "$data"
  find "$data" ! -user node -exec chown node:node {} +
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec "$@"
