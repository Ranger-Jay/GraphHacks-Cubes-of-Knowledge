#!/usr/bin/env bash
# Disposable local stack for Cora's v025.13-19 browser proof. Test-only tokens are generated into $W (mode 600), never printed.
# Usage: stack.sh <init|db-up|seed|api-up|studio-up|vite-up|db-down|clean>
set -u
REPO=/workspace/graphhacks/mount-proof
HERE=$(cd "$(dirname "$0")" && pwd)
W=/tmp/cim-live; PORT=6391
export PATH=/tmp/node-v24.22.0-linux-x64/bin:$PATH
PY=/workspace/graphhacks/venv/bin/python
tok() { node -e "process.stdout.write(require('crypto').randomBytes(24).toString('base64url'))"; }
cmd=${1:-}; shift || true
load() { set -a; . $W/env.sh; set +a; }
case $cmd in
  init)
    rm -rf $W; mkdir -p $W/witness $W/db; chmod 700 $W $W/witness
    umask 077
    { echo "API_OWNER_TOKEN=$(tok)"; echo "API_READER_TOKEN=$(tok)"; echo "API_AGENT_TOKEN=$(tok)";
      echo "FALKORDB_HOST=127.0.0.1"; echo "FALKORDB_PORT=$PORT"; echo "FALKORDB_GRAPH=cim_$(tok | tr -d '_-' | cut -c1-10)"; echo "FALKORDB_TIMEOUT_MS=15000";
      echo "GRAPH_EVIDENCE_KEY=test-only-$(tok)-evidence-key"; echo "GRAPH_WITNESS_DIR=$W/witness"; echo "API_TENANT_ID=t-wad"; echo "API_HOST=127.0.0.1"; echo "API_PORT=8787"; } > $W/env.sh
    echo "init ok (tokens in $W/env.sh, not printed)";;
  db-up)
    rm -f $W/stop; setsid $PY $HERE/flite-launcher.py $W/db/db.rdb $PORT $W/stop > $W/flite.log 2>&1 &
    for i in $(seq 1 40); do grep -q READY $W/flite.log && break; sleep 0.5; done; cat $W/flite.log;;
  db-down) touch $W/stop; sleep 2.5; echo "db stopped; port $PORT listening? $(ss -ltn | grep -c ":$PORT ")";;
  seed)
    load; cd $REPO && node --import tsx packages/graph/src/cli.ts seed --init-witness > $W/seed.log 2>&1; echo "seed exit=$?"; tail -2 $W/seed.log;;
  api-up) load; cd $REPO && (setsid node apps/api/dist/server.js > $W/api.log 2>&1 & echo $! > $W/api.pid); sleep 3; echo "api pid $(cat $W/api.pid)";;
  studio-up) load; mkdir -p $REPO/proof && cp $HERE/studio-server.ts $REPO/proof/ && cd $REPO && (setsid node --import tsx proof/studio-server.ts > $W/studio.log 2>&1 & echo $! > $W/studio.pid); sleep 3; curl -s -X GET http://127.0.0.1:8788/__ctl/seed; echo; echo "studio pid $(cat $W/studio.pid)";;
  studio-down) kill $(cat $W/studio.pid) 2>/dev/null; sleep 1;;
  vite-up) load; cd $REPO/apps/web; API_READER_TOKEN="$API_READER_TOKEN" setsid npx vite --config vite.proof.config.ts > $W/vite.log 2>&1 & echo $! > $W/vite.pid; sleep 4; echo "vite pid $(cat $W/vite.pid)";;
  clean) touch $W/stop 2>/dev/null; sleep 2; kill $(cat $W/api.pid) $(cat $W/studio.pid) 2>/dev/null; pkill -f "mount-proof/node_modules/.bin/vite" 2>/dev/null; pkill -f "mount-proof/node_modules/vite" 2>/dev/null; sleep 1; rm -rf $W; echo cleaned;;
esac
