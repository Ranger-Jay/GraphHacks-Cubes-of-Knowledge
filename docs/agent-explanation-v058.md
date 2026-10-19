# Selected-agent explanation binding (v058.00)

Base: `b34dede81aee97408d50a30cab38d6d533cfd671`. This is an isolated candidate,
not a replacement for the accepted release fallback or independent acceptance.

## Behavior

The scene's selected agent card now mounts the existing graph-grounded TalkPanel.
Its persona is the selected Roy, Ava or Guz, with the style selector locked to that
agent. The existing standalone Explain panel still works. Each explanation panel
has its own accessible heading id.

Opening an agent does not request a completion. The user must explicitly press
Explain. The accepted `/api/talk` request, citation/scope validation, provider
budget policy and optional device read-aloud are reused without changes.

The agent explanation is mounted only for READY plus AVAILABLE analysis and keyed
by graph generation, revision and selected agent. Closing/changing the agent,
focusing the unconfigured comparison cube, losing graph readiness or changing the
graph generation unmounts the affected explanation and cancels pending transport.
Late successful fixture responses cannot restore its answer. Comparison focus
also closes the main-cube agent card and stops speech; it does not change the
main graph's status or configure a database for the comparison cube.

The renderer callback and snapshot interfaces are unchanged. A scene-local mount
option forwards focus changes to the React host. The renderer remains a separate
visual-author lane.

## Author verification

- Web TypeScript check and production web build pass.
- Eight focused web tests pass, including an actual React StrictMode/JSDOM mount
  through Shell, MountedSpaceScene and the real adapter. Network replies and audio
  are explicitly fixtures. Opening makes zero requests; the explicit request uses
  the selected persona; comparison focus aborts the request; late reply stays
  hidden; returning preserves main READY; a new generation clears an old answer;
  graph failure removes both explanation surfaces.
- Twelve existing adapter checks pass with their mock DOM.
- The first direct test invocation omitted the repository's web register module
  and failed with React not defined. The shipped register invocation was then
  used successfully; application code was not changed to accommodate that error.

No paid provider call, Cloud mutation or graphical browser proof was performed
for this change. JSDOM and mock-DOM WebGL fallback warnings do not prove graphics.
An independent exact-head browser check is required before acceptance.
