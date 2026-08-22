# Coolify Deployment

Production is a single Coolify **Application** built directly from GitHub with the repository root `Dockerfile`. Compose is retained only for local and provider-portable testing. GHCR is not required.

## Production

Configure the Coolify resource as follows:

| Setting | Value |
| --- | --- |
| Resource | Application |
| Source | Coolify GitHub App |
| Repository | `rick-roche/now-spinning` |
| Branch | `main` |
| Build pack | Dockerfile |
| Dockerfile | `/Dockerfile` |
| Port | `3000` |
| Domain | `https://now-spinning.rickroche.com` |
| Health check | `/api/health` |
| Persistent volume | `/data` |
| Replicas | `1` |

Disable Coolify automatic main-branch deployments. The GitHub Actions `Deploy` workflow triggers the Coolify webhook only after `CI` succeeds, preventing duplicate builds.

The SQLite database must use `DATABASE_PATH=/data/now-spinning.sqlite`. Back up `/data` before upgrades. SQLite and the in-process scheduler currently require one production replica.

## Environment

Set these values in Coolify. Provider credentials are secrets and must not be committed:

```text
NODE_ENV=production
PORT=3000
PUBLIC_APP_ORIGIN=https://now-spinning.rickroche.com
DATABASE_PATH=/data/now-spinning.sqlite
TOKEN_ENCRYPTION_KEY=<base64-encoded-32-byte-key>
LASTFM_CALLBACK_URL=https://now-spinning.rickroche.com/api/auth/lastfm/callback
DISCOGS_CALLBACK_URL=https://now-spinning.rickroche.com/api/auth/discogs/callback
LASTFM_API_KEY=<secret>
LASTFM_API_SECRET=<secret>
DISCOGS_CONSUMER_KEY=<secret>
DISCOGS_CONSUMER_SECRET=<secret>
DEV_MODE=false
```

Leave `ALLOWED_ORIGINS` empty for same-origin production requests.

## Pull Request Previews

Enable Coolify Preview Deployments with a domain template equivalent to `{{pr_id}}.preview.now-spinning.rickroche.com`. Set `Allow Public PR Deployments` to **OFF**. Preview builds execute Pull Request code and must be limited to trusted contributors.

Do not mount production `/data` into previews or provide production OAuth secrets to arbitrary previews. Use isolated ephemeral storage:

```text
NODE_ENV=production
PORT=3000
DATABASE_PATH=/tmp/now-spinning.sqlite
DEV_MODE=true
PUBLIC_APP_ORIGIN=https://{{pr_id}}.preview.now-spinning.rickroche.com
LASTFM_CALLBACK_URL=https://{{pr_id}}.preview.now-spinning.rickroche.com/api/auth/lastfm/callback
DISCOGS_CALLBACK_URL=https://{{pr_id}}.preview.now-spinning.rickroche.com/api/auth/discogs/callback
TOKEN_ENCRYPTION_KEY=<isolated-base64-32-byte-key>
```

Only configure provider credentials when using isolated preview OAuth applications.

## DNS

Point both records at the Hetzner/Coolify server:

```text
now-spinning.rickroche.com
*.preview.now-spinning.rickroche.com
```

Cloudflare may provide DNS-only hosting. The application does not depend on Cloudflare Workers, Pages, KV, Durable Objects, or Wrangler.

## Deployment Flow

```text
Pull Request -> GitHub CI + Coolify Preview
main merge   -> GitHub CI -> authenticated Coolify webhook -> Dockerfile build
```

CI runs `pnpm validate` and validates the Docker build. Coolify checks `/api/health`. The scheduler uses a SQLite lease so only one live container owns background work during replacement; keep production at one replica and preserve `/data`.

## GitHub Secrets

```text
COOLIFY_WEBHOOK
COOLIFY_TOKEN
```
