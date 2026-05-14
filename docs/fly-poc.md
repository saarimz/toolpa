# Fly.io Writable Filesystem POC

This repo is configured for a Fly.io proof-of-concept deployment where the
builder can write generated instrument source files to a persistent filesystem.

The POC intentionally runs the app in Next dev mode:

```bash
pnpm dev --hostname 0.0.0.0 --port "$PORT"
```

That matters because the current builder writes real source files under
`app/tools/<slug>/`. A production `pnpm start` server runs a precompiled
`next build` output and will not compile brand-new routes written after the
server starts. For a live `/build` demo, run the dev-workshop shape below.

## Files

- `Dockerfile`: builds a Node image with pnpm dependencies and Chromium for the
  browser audio gate.
- `fly.toml`: single-machine Fly app config with a persistent `/data` volume.
- `scripts/start-poc-workshop.sh`: seeds the repo into the mounted volume and
  starts Next dev from the writable workspace.
- `scripts/fly-deploy-poc.sh`: creates the Fly app, creates the volume, sets
  secrets, deploys, and keeps the service at one Machine.
- `.dockerignore`: keeps local build output, secrets, and dependency folders out
  of the image.

## Runtime Shape

```text
/app
  image copy created by Docker

/data/ai-daw-tools
  persistent writable workspace seeded on first boot
  generated app/tools/<slug>/ files live here
  .audit/generated-tools.json lives here
  .audit/snapshots/<slug>/ lives here
```

The startup script seeds `/data/ai-daw-tools` only when it does not already have
a `package.json`. That keeps generated tools and registry changes alive across
restarts and deploys.

To intentionally wipe and reseed the POC workspace, set this for one deploy:

```bash
AI_DAW_RESET_WORKSPACE=1
```

Only do that after saving anything generated in the demo.

## One-Command Deploy

Install and authenticate `flyctl`, then run:

```bash
FLY_APP_NAME=your-ai-daw-tools-poc-name \
AI_GATEWAY_API_KEY=... \
scripts/fly-deploy-poc.sh
```

Optional variables:

```bash
FLY_REGION=iad
FLY_VOLUME_NAME=ai_daw_tools_data
FLY_VOLUME_SIZE=20
AI_GATEWAY_MODEL=deepseek/deepseek-v4-flash
```

If `AI_GATEWAY_API_KEY` is not in the environment, the deploy script will try to
read it from `.env.local`.

## Manual Deploy

1. Pick an app name and edit `fly.toml`:

   ```toml
   app = "your-ai-daw-tools-poc-name"
   primary_region = "iad"
   ```

2. Create the app:

   ```bash
   fly apps create your-ai-daw-tools-poc-name
   ```

3. Create the persistent volume:

   ```bash
   fly volumes create ai_daw_tools_data \
     --app your-ai-daw-tools-poc-name \
     --region iad \
     --size 20 \
     --yes
   ```

4. Set secrets:

   ```bash
   fly secrets set AI_GATEWAY_API_KEY=... --app your-ai-daw-tools-poc-name
   fly secrets set AI_GATEWAY_MODEL=deepseek/deepseek-v4-flash --app your-ai-daw-tools-poc-name
   ```

5. Deploy:

   ```bash
   fly deploy --app your-ai-daw-tools-poc-name --config fly.toml
   ```

6. Keep the app at one Machine:

   ```bash
   fly scale count 1 --app your-ai-daw-tools-poc-name --yes
   ```

7. Open the app:

   ```bash
   fly open --app your-ai-daw-tools-poc-name
   ```

The app should land at `/dashboard`. Use `/build` to generate a simple L1 tool,
then restart the Machine and confirm the generated source and
`.audit/generated-tools.json` persist.

## Operational Notes

- Keep this POC to one Machine. Fly volumes are local to Machines and are not
  automatically replicated.
- The first boot is slower because the volume workspace is seeded and
  dependencies are installed there.
- Code updates after the first seed do not overwrite the volume workspace. For a
  clean demo after changing repo code, set `AI_DAW_RESET_WORKSPACE=1` once or
  create a fresh volume.
- This runs a Next dev server on the public internet. Protect or share the URL
  carefully.
- This is not the final production architecture. The production path should be
  Git-backed generation plus redeploy, or a dynamic `/tools/[slug]` renderer
  backed by database/object storage.
