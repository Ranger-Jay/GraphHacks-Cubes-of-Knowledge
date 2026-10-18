#!/usr/bin/env bash
# usage: ci.sh <commit>  -> checks out detached in mount-ci and runs run-checks.sh there
cd /workspace/graphhacks/mount-ci && git checkout -q --detach "$1" && git clean -fdq -e node_modules -e apps/web/node_modules && REPO=/workspace/graphhacks/mount-ci /workspace/hackathon/cora-ideaverse-mount-v025/run-checks.sh
