# Put Cubes of Knowledge online

This guide is for the Vercel reader demo. Your existing FalkorDB Cloud database stays in place.

The hosted version lets visitors inspect synthetic studio evidence. It does not let visitors import ideas or change the database. Local owner rehearsal stays separate.

## Prepare the hosting copy

1. Leave your filming windows open.
2. Open a new PowerShell window.
3. Open your project folder:

   ```powershell
   cd "$env:USERPROFILE\cubes-live-smoke"
   ```

4. Download the hosting branch:

   ```powershell
   git fetch origin buddy/vercel-public-demo-v061
   ```

5. Create a separate hosting folder:

   ```powershell
   git worktree add --detach "$env:USERPROFILE\cubes-hosting" FETCH_HEAD
   ```

6. Open that folder:

   ```powershell
   cd "$env:USERPROFILE\cubes-hosting"
   ```

7. Install the project:

   ```powershell
   npm ci
   ```

8. Build the project:

   ```powershell
   npm run build
   ```

9. Make a private settings file from your working setup:

   ```powershell
   node --env-file="$env:USERPROFILE\cubes-live-smoke\.env" scripts/prepare-vercel-env.mjs
   ```

10. Keep the new `.env.vercel` file private. It contains database credentials. Do not put it on GitHub, Drive, or in a chat.

The command copies your existing signed evidence record. It does not seed, reset, or change your database. It does not replace your working `.env`. It stops if the record fails verification.

## Add the settings in Vercel

1. Open [the Cubes project](https://vercel.com/landboats/graphhacks-cubes-of-knowledge).
2. Open **Settings**.
3. Open **Environment Variables**.
4. Choose **Import .env**.
5. Import the private `.env.vercel` file directly from your computer.
6. Apply the settings to **Preview** and **Production**.
7. Save the settings.
8. Redeploy the reviewed hosting commit.
9. Wait until Vercel says **Ready**.
10. Open the deployment address. Add `/#/releases/rel-wad` at the end.
11. Look for **Graph AVAILABLE** and **GAP**.
12. Open a source link. Confirm that its excerpt appears.
13. Before sharing with judges, open the link in an incognito window. A Vercel sign-in screen means deployment protection still needs adjusting for this project.

If you create the Vercel project manually, use these settings:

| Setting | Value |
| --- | --- |
| Repository | `Ranger-Jay/GraphHacks-Cubes-of-Knowledge` |
| Branch | `buddy/vercel-public-demo-v061` |
| Framework | Other |
| Root directory | Leave empty |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `apps/web/dist` |
| Node.js version | 24.x |

The repository's `vercel.json` supplies the server function and API routing.

## Optional model explanations

Model calls are off in the hosted demo by default. Local explanations keep their existing settings.

To enable hosted explanations, use the existing capped OpenRouter key. Keep the shipped price, budget, citation, and no-retry checks. Set these private Vercel variables:

| Name | Value |
| --- | --- |
| `PUBLIC_DEMO_TALK_ENABLED` | `true` |
| `WEB_ORIGIN` | The exact public HTTPS address, without a final slash |
| `LLM_ENABLED` | `true` |
| `LLM_PROVIDER` | `openrouter` |
| `LLM_MODEL` | The existing configured model |
| `LLM_API_KEY` | The existing capped key, entered privately |

Redeploy after saving. Then click **Explain the current clearance** once. Public access can consume the capped key's remaining allowance. A successful local answer does not prove a hosted answer.

## If something does not work

1. Keep the working filming app open.
2. If Vercel says **Build failed**, open its build log.
3. If the app says **Graph unavailable**, check the private Cloud connection settings.
4. If clearance says **UNKNOWN**, check the signed witness and matching evidence key.
5. Do not reset the database or create a new witness to remove an error.
6. If Explain is unavailable, first check whether hosted model calls are enabled.

## Engineering notes

The deployment environment stores a fixed copy of the existing signed witness. The function reconstructs those exact bytes in a private temporary read cache and checks them with the original ledger verifier. It never initializes a witness from graph contents. Temporary disk is not durable evidence storage. Updating the licensing evidence requires an operator to transfer a newly verified committed witness and redeploy; mismatches fail closed in the meantime.

Every public request uses a server-derived reader identity. Browser authorization headers are replaced. Owner, import, approval, and rehearsal paths are denied before dispatch. Only the synthetic `rel-wad` analysis is exposed. Credentials remain in server configuration. This is a public demonstration reader, not a production company login system.

Deployment and real hosted graph results must be recorded separately from local checks. Until those succeed, the hosting instructions are a setup procedure, not a claim that the site is working online.
