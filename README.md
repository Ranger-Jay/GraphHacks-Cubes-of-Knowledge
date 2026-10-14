# Cubes of Knowledge

A Graph Hacks entry exploring a fictional studio's current-cut licensing, evidence, authorized actions, and recoverable agent state through FalkorDB.

## Status

Repository bootstrap in progress. No working graph integration, authorization flow, agent execution, deployment, or prize qualification is claimed yet. The scenario uses synthetic data from Warnings After Dark Studios.

## Required demonstration

- Follow current release → cut → track → license/version → source evidence.
- Distinguish stale clearance, unresolved evidence, denied actions, and database unavailability.
- Enforce Kanny's owner permissions and Serena's limited access on the server.
- Persist an authorized agent handoff and recover it in a fresh session.
- Stop and reconnect the real graph database; never substitute a simulated successful answer.

## Stack and setup

Node.js 22+, TypeScript, the official FalkorDB client, React and Three.js. Workspace, Docker, environment, API contract, and CI files are being added in the next bootstrap commits. Do not guess setup commands until those files land.

The database and provider credentials remain server-side. No private team records or production diaries belong in this public repository.

## Engineering discipline

One major feature per commit. Feature versions use v001.00, v002.00, etc.; follow-up fixes, tests, and documentation use decimal revisions such as v002.001. Coordinate version allocation before committing. Preserve feature commits; do not squash independent changes.

Public issues and pull requests contain technical work in one unified project voice. Team planning happens outside this repository. Author-created code requires independent review; human release approval remains required.

## Contest and assistance

Built after the permitted Graph Hacks start, October 14, 2026 at 14:31 America/New_York. Intended tracks: Company Brain, Agent Memory and Coordination, and Agents That Act on Connected Data; qualification remains subject to working evidence.

AI assistance is used. The final README will identify actual tools and contributions. The human entrant is responsible for meaningful contribution, understanding, testing, and final submission.

Official references: [Graph Hacks](https://www.wemakedevs.org/hackathons/falkordb), [rules](https://www.wemakedevs.org/hackathons/falkordb/rules), [FalkorDB docs](https://docs.falkordb.com/).
