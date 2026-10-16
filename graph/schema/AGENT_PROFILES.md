# Agent profiles, voices, resources and display-only roles (v028, issue #48)

Graph-lane slice only. The API read, owner authorization and the profile inspector belong to other lanes. Studio-domain labels, outside the licensing evidence witness, tenant-scoped, `synthetic: true`.

## What this is, and is not

- **Is:** a deterministic seed and a verified named read of the three owner-defined synthetic agents (Ava = Agent012, Roy = Agent013, Guz = Agent014), their voice bindings, their skill/memory resource references, the five display roles with their **intended** capabilities, and **display-only** role assignments.
- **Is not an authorization system.** Nothing here allows or denies an action. Current OWNER/READER/AGENT session enforcement is unchanged until a reviewed server-policy migration implements the new taxonomy. `declaredAccessLevel` ("Administrator", as the owner supplied it) is **source provenance only**: no query, API or UI may read it as access. Every capability is marked `implemented: false`; an assignment is always reported `NOT_ENFORCED`. Listed responsibilities (GraphRAG ingestion, skills, memory) are intended, not proof of an implemented capability.

## Fixtures (project-authored, fictional, no distribution license claimed; strict loader `loadAgentFixtures`)

`graph/seed/agents/agent-profiles.json` holds the owner's text **verbatim, including the owner's spelling** (for example "aggreeable", "relucant"); I do not silently correct it. `access-roles.json` holds the five roles (Owner, Administrator, Operator, Reader, CI Auditor, in that order), their intended capability sets and what each cannot do; they are capability sets, not a numeric ladder. `role-assignments.json` holds the owner's decision as **intended, display-only** fixture assignments: Kanny Owner, Roy Administrator, Serena Operator, Ava Reader, Guz CI Auditor. Owner is refused for any synthetic agent. Merely seeding a crew job or title creates no authenticated user; occupational roles and access roles are distinct, and the "additional members default to Reader" rule is a policy-layer rule, not seeded here.

## Graph model

| Label | Holds |
| --- | --- |
| `AgentProfile` | identity, appearance, supplied role/personality/assignment/known-for text, `declaredAccessLevel` (provenance) |
| `VoiceProfile` | provider `ElevenLabs`, external voice id and name. Identifiers, not credentials |
| `ResourceRef` | skills/memory: `declaredPath` verbatim (`..nodes/agents/agent012/skills.md`) and `proposedPath` (`nodes/agents/agent012/skills.md`). No status is stored |
| `AccessRole`, `Capability` | the five roles and 13 intended capabilities |
| `RoleAssignment` | `principalId`, `roleId`, workspace, `status` ACTIVE/REVOKED, `enforcement: NOT_ENFORCED`, `revision`, `assignedAt`, `assignedBy`, `source` |
| `ProfileSource` | the three fixture files with path and SHA-256 (its own label, so the studio and IdeaVerse reads never see it) |

Edges: `USES_VOICE`, `HAS_SKILLS`, `HAS_MEMORY`, `ASSIGNED_TO` (to the existing `Workspace ws-wad-cube`), `DEFINED_IN`, `HAS_CAPABILITY`, `GRANTS_ROLE`, `IN_WORKSPACE`, and **`IS_PRINCIPAL` / `FOR_PRINCIPAL` to the existing Principal nodes only when they exist** (created by the licensing seed). No Principal is created, renamed or given membership, so there is no duplicate identity; a studio-only graph reports `principal.linked: false`.

`seedAgentProfiles` is a deterministic `MERGE` on `(id, tenantId)`; a repeat adds nothing (39 nodes, 48 edges, plus 8 Principal links when the licensing seed ran). Profile, role and capability nodes are refreshed from the fixtures; **`RoleAssignment` is created once and never overwritten by a re-seed**, so a later authorized change or revocation is not reverted. The workspace is created only if absent, so seeding order never resets its revision.

## `agentProfileOverview(client, repoRoot, tenantId)`

One query per tenant; every served fact is re-verified against the fixtures on disk. Each source's stored path and SHA-256 must equal the file; a profile is served only when its fields, voice, both resource refs and all five edges match the fixture; a role only when its fields, `cannot` list and exact capability set match and every capability is still `implemented: false`. Anything that fails is **withheld** and listed under `integrity`. An invalid fixture returns `UNAVAILABLE / FIXTURE_INVALID`; an unreachable graph returns `UNAVAILABLE` with no profile, role or capability; a graph with no records for the tenant returns `EMPTY`. (A graph that has never been written to at all errors on a read-only query and also reads `UNAVAILABLE`, as with the other overviews.)

**Derived role.** The displayed role for a principal is computed only from validated `RoleAssignment` rows for (principal, this workspace, tenant): the role must be a verified role, the assignment must be for this workspace with a matching `GRANTS_ROLE` edge, status ACTIVE or REVOKED, `enforcement: NOT_ENFORCED` (a row that claims enforcement is refused, since no server policy implements it), a valid revision and timestamp, and the expected id (one assignment per principal). Result: `ASSIGNED` (role, intended capabilities each `implemented: false`, "cannot" list, revision, `assignedAt`, `assignedBy`, `source`, and the note "Intended assignment for display. Not enforced: session rights are unchanged."), `UNASSIGNED` (no row, or revoked) or `UNKNOWN` (unknown role, wrong workspace or tenant, edge disagreement, duplicate or conflicting rows, claimed enforcement) with **no role and no capability**. The assignment row is the live source, so an authorized change appears on the next read; it may legitimately differ from the seed fixture, but it is never trusted unvalidated. `effectiveRoleFor` re-reads every call (no cache). Any privileged operation must re-read and must not use this as authorization.

**Resources.** `resolveResource` reports `PRESENT` (regular file, hash and size), `MISSING`, or `UNVERIFIED` (outside `nodes/agents/agentNNN/(skills|memory).md`, a symlink, a non-file, over 1 MiB, or resolving outside the repository). The file is only hashed, never loaded, executed or interpreted. The repository has no `nodes/` directory today, so all six read `MISSING`: no skill or memory is claimed loaded, and the supplied `..nodes/...` strings are kept verbatim next to the proposed normalized paths.

## Limits

- **Assignment rows are not MAC'd and not audited.** A party with graph write credentials could change a role row. That is acceptable only because nothing enforces it. Enforcing roles needs authenticated, audited assignment writes and a policy migration with its own review. Raw graph changes are not permission to bypass the existing authorization boundary.
- Voice and profile data are fixtures; no provider call, lookup or audio is claimed (the owner is recording; lookup is not independently verified).
- No API route, UI inspector or shared transport type exists here; the read types (`AgentProfileOverview`, `AgentProfileView`, `EffectiveRole`, `RoleView`, `ResourceView`) are the proposed additive transport for Buddy to reconcile.
- Needs independent review (Boons assigned) before any consumer relies on it.
