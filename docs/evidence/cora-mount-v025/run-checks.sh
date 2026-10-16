#!/usr/bin/env bash
# Run in the repo after a commit; appends one line to per-commit.txt. FALKORDB_PORT=6399 (6379/6390 occupied by other processes).
export FALKORDB_PORT=6399
export PATH=/tmp/node-v24.22.0-linux-x64/bin:$PATH
REPO=${REPO:-/workspace/graphhacks/mount}; OUT=/workspace/hackathon/cora-ideaverse-mount-v025
cd $REPO; sha=$(git rev-parse --short=9 HEAD); subj=$(git log -1 --format=%s)
dirty=$(git status --porcelain | wc -l)
mkdir -p $OUT/logs
r() { "$@" > $OUT/logs/$sha-$1-$2-$3.log 2>&1; echo $?; }
chk=$(r npm run check); bld=$(r npm run build)
npm run test:web > $OUT/logs/$sha-web.log 2>&1; web=$?; wp=$(grep -E "^ℹ pass" $OUT/logs/$sha-web.log | awk '{s+=$3} END{print s+0}'); wf=$(grep -E "^ℹ fail" $OUT/logs/$sha-web.log | awk '{s+=$3} END{print s+0}')
tsc=$(r npx tsc -p tests/web); tscs=$(r npx tsc -p tests/scene)
npm test > $OUT/logs/$sha-npmtest.log 2>&1; nt=$?; np=$(grep -E "^ℹ pass" $OUT/logs/$sha-npmtest.log | awk '{s+=$3} END{print s+0}'); nf=$(grep -E "^ℹ fail" $OUT/logs/$sha-npmtest.log | awk '{s+=$3} END{print s+0}')
echo "$sha | $subj | dirty=$dirty | check=$chk build=$bld web_tests_exit=$web (pass=$wp fail=$wf) tsc_tests_web=$tsc tsc_tests_scene=$tscs FALKORDB_PORT=6399 npm_test_exit=$nt (pass=$np fail=$nf)" | tee -a $OUT/per-commit.txt
