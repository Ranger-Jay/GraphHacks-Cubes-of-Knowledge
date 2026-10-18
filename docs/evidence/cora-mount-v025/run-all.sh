#!/usr/bin/env bash
# Fresh disposable stack, then main@1920x1080, main@1280x800, outage@1920x1080.
cd "$(dirname "$0")"; export PATH=/tmp/node-v24.22.0-linux-x64/bin:$PATH
node proof.mjs main 1920 1080 0
node proof.mjs main 1280 800 30
node proof.mjs outage 1920 1080 60
echo ALLDONE
