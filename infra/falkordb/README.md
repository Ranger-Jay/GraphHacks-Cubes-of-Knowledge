# Local runtime baseline

From repository root: copy .env.example to .env, then `npm run graph:up`. Docker Compose reads the root .env for interpolation. Browser: http://127.0.0.1:3001. Database: 127.0.0.1:6379. `npm run graph:down` stops the container without removing its named volume.

This is an unauthenticated **loopback-only development** setup. Remote/public deployment requires explicit auth/TLS configuration; .env client password fields do not automatically configure the Docker server. Do not broaden the host bindings or publish this development database port. The API and browser app are separate local processes.

The image defaults to latest for the first pull. Runtime verification must record its actual immutable digest and replace FALKORDB_IMAGE with that digest before frozen integration evidence. Ping is process liveness only, not proof of GRAPH.QUERY or persistence.

The named /data volume and AOF settings follow [official Docker docs](https://docs.falkordb.com/operations/docker). They are configured, not yet execution-verified in this bootstrap host (Docker absent). The runtime lane must demonstrate create/read plus container restart recovery, and record platform/architecture, image, commands and results in docs/runtime-evidence.md. Never run volume deletion against the demonstration data.
