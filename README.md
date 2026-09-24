# HTML to Image Server

A small Node.js/Express service that takes a URL, renders it in headless Chromium (Playwright), and returns a WebP screenshot (converted with Sharp). In production it runs under PM2 on the `n8n.gotobizpro.com` VPS on port 3000 over HTTPS. The **gotobizpro** Laravel app uses it to generate canvas and featured images.

Git remote: `https://github.com/rondeo-balos/url-to-image.git` (branch `main`).

## Tech stack

- Node.js (package.json says `>=16`. Playwright 1.56 needs Node 18+, and the VPS deploy docs install Node 20)
- Express 4, with `helmet`, `cors` and `express-rate-limit`
- Playwright (`chromium`) for rendering. Older docs mention Puppeteer, but it is no longer used.
- Sharp for PNG to WebP conversion
- `dotenv` for config
- PM2 as the process manager in production. Docker files exist too (see [Deployment](#deployment)).

## Project structure

```
server.js                 The whole service: routes, singleton browser, concurrency queue, HTTPS startup
server.js.backup          Old version (launches a browser per request, no queue). Not used. Keep for reference or delete.
test.js                   Smoke test script that hits a running server on localhost:3000
examples/                 Sample clients (client.js uses axios; client.html is a browser demo)
deploy/
  ecosystem.config.js     PM2 app config (cwd /var/www/html-to-image, MAX_CONCURRENT=10, SSL paths)
  deploy-https.sh         Current VPS deploy script: copies the app, copies n8n Caddy certs, starts PM2
  deploy.sh               Older VPS deploy script (PM2 + Nginx, HTTP)
  check-and-deploy.sh     Detects Docker/PM2 on the box and redeploys to match
  fix-pm2-permissions.sh  Rebuilds /var/www/.pm2 for the www-data user and restarts
  nginx.conf              Nginx reverse proxy template (not used by the current setup, see Gotchas)
  docker-compose.production.yml  Docker + Traefik + Redis + Prometheus template (placeholders, not used)
Dockerfile, docker-compose.yml   Container build (see Gotchas)
DEPLOYMENT.md             Generic VPS guide (PM2 + Nginx + Let's Encrypt)
HTTPS_DEPLOYMENT.md       Native-HTTPS deploy guide (matches the current production setup)
```

## Prerequisites

- Node.js 18+ (20 recommended) and npm
- The Playwright Chromium browser, plus its system libraries on Linux
- For HTTPS: a certificate and key file that the Node process can read

## Local setup and running

```bash
npm install
npx playwright install chromium        # Linux: also run `npx playwright install-deps chromium`
cp .env.example .env                    # optional; see Environment variables below
npm start                               # node server.js  -> http://localhost:3000
npm run dev                             # nodemon, auto-reload
```

If `SSL_CERT_PATH` and `SSL_KEY_PATH` are not set, or the files do not exist, the server falls back to plain HTTP. At startup it launches Chromium before accepting traffic, so the first request does not pay the cold-start cost.

Smoke test, with the server already running in another terminal:

```bash
npm test          # runs test.js; writes images to ./test-outputs/ (gitignored). Needs internet access.
```

## API reference

All screenshot responses are `image/webp` with `Cache-Control: public, max-age=3600`.

### `GET /screenshot`

| Param | Default | Notes |
|---|---|---|
| `url` | required | Must be `http://` or `https://` |
| `width` | 1200 | Viewport width. Must be 100 to 4000, or the request fails with 400 |
| `height` | 800 | Viewport height. Must be 100 to 4000, or the request fails with 400 |
| `quality` | 80 | WebP quality (1 to 100). Not validated |
| `fullPage` | false | `true` captures the full scroll height. Otherwise the image is clipped to width x height |
| `waitUntil` | `networkidle2` | `load`, `domcontentloaded`, `networkidle0`, `networkidle2`. Both networkidle values map to Playwright's `networkidle` |
| `timeout` | 30000 | Navigation timeout in ms. Not capped (see Gotchas) |

Extra response headers: `X-Screenshot-URL`, `X-Screenshot-Dimensions`.

```bash
curl "http://localhost:3000/screenshot?url=https://example.com&width=1600&height=1000&quality=85" -o shot.webp
```

### `POST /screenshot`

JSON body. The options **must be nested under `options`**. Top-level `width`/`height` are ignored, even though an example in HTTPS_DEPLOYMENT.md puts them there. Width and height are not range-checked on POST.

```bash
curl -X POST http://localhost:3000/screenshot \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","options":{"width":1920,"height":1080,"quality":90,"fullPage":true,"waitUntil":"load","timeout":45000}}' \
  -o shot.webp
```

### `GET /health`

```json
{ "status": "healthy", "timestamp": "...", "uptime": 123.4,
  "browserStatus": "connected", "activeSessions": 0, "queuedRequests": 0, "maxConcurrent": 3 }
```

### `GET /api/docs`

Returns a JSON description of the endpoints.

### Errors

Errors come back as JSON `{ "error": "...", "message": "..." }`:

| Status | Meaning |
|---|---|
| 400 | Missing or invalid `url`, or width/height out of range |
| 404 | Unknown path |
| 429 | Rate limited. Returned as plain text, not JSON |
| 503 | Request waited 30s in the queue without getting a slot |
| 500 | Navigation or screenshot failure |

## Environment variables

`server.js` reads only the variables below. No secrets are needed.

| Name | Purpose | Default |
|---|---|---|
| `PORT` | Listen port (HTTP or HTTPS) | `3000` |
| `MAX_CONCURRENT` | Max screenshots rendering at once. Extra requests queue for up to 30s | `3` (PM2 config sets `10`) |
| `SSL_CERT_PATH` | Path to the TLS certificate. If the file is present, the server serves HTTPS | unset, so HTTP |
| `SSL_KEY_PATH` | Path to the TLS private key | unset, so HTTP |
| `NODE_ENV` | `development` shows the error message in the generic 500 handler | unset |

`.env.example` also lists `DEFAULT_WIDTH`, `DEFAULT_HEIGHT`, `DEFAULT_QUALITY`, `MAX_TIMEOUT`, `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX_REQUESTS`. **The code does not use any of them.** The defaults and the rate limit (100 requests per 15 minutes per IP) are hardcoded in `server.js`.

Precedence: PM2's `env_production` block in `deploy/ecosystem.config.js` sets `SSL_*` and `MAX_CONCURRENT`, and `dotenv` does not override variables that are already set. **On the server, the PM2 config wins over `.env`.**

## Common tasks

| Task | Command |
|---|---|
| Run locally | `npm start` / `npm run dev` |
| Smoke test | `npm test` (server must be running) |
| Prod status/logs | `sudo -u www-data pm2 status` / `sudo -u www-data pm2 logs html-to-image` |
| Prod restart | `sudo -u www-data pm2 restart html-to-image` |
| Reinstall browser (prod) | `sudo -u www-data npx playwright install chromium && sudo npx playwright install-deps chromium` |
| Tune throughput | Change `MAX_CONCURRENT` in `deploy/ecosystem.config.js`, then restart PM2 |

The live process uses **`PM2_HOME=/var/www/.pm2`** (verified on the VPS, 2026-09-24), so prefix every prod `pm2` command with it, e.g. `sudo -u www-data PM2_HOME=/var/www/.pm2 pm2 list`. `deploy-https.sh` doesn't set it.

## Deployment

Production (verified on the VPS on 2026-09-24; full details in [`../n8n-vps/HANDOVER.md` §4.3](../n8n-vps/HANDOVER.md)):

- VPS host `n8n.gotobizpro.com`. The app lives in `/var/www/html-to-image` and runs as `www-data` under PM2 (`deploy/ecosystem.config.js`, fork mode, 1 instance, `max_memory_restart: 512M`).
- Node serves **HTTPS directly on port 3000**. There is no Nginx in front, and `ufw` allows port 3000.
- TLS certs are **borrowed from the n8n Caddy container**. `deploy/deploy-https.sh` copies them from `/var/lib/docker/volumes/n8n_caddy_data/_data/caddy/certificates/.../n8n.gotobizpro.com/` into `/var/www/html-to-image/cert/`, which is gitignored. A **root cron job runs daily at 03:00 UTC** (`/usr/local/bin/update-html-to-image-certs.sh`): it re-copies the certs and restarts the app, so renewals are picked up automatically.
- **The app doesn't come back after a reboot.** `pm2-www-data.service` points at the wrong PM2 home and has been failed since 2026-03-23. Until that's fixed, start it by hand after a reboot: `cd /var/www/html-to-image && sudo -u www-data PM2_HOME=/var/www/.pm2 pm2 start deploy/ecosystem.config.js`.
- The server checkout has a local change to `deploy/ecosystem.config.js` (real cert paths) and is behind `origin/main`. PM2 runs it with `NODE_ENV=development`.
- First-time deploy: see [HTTPS_DEPLOYMENT.md](HTTPS_DEPLOYMENT.md) (`sudo bash deploy/deploy-https.sh`). The generic Nginx + Let's Encrypt route is in [DEPLOYMENT.md](DEPLOYMENT.md).

Update procedure used on the server (the VPS handover has a `git stash`-based alternative). The committed ecosystem file has placeholder cert paths, so they must be patched after every pull:

```bash
cd /var/www/html-to-image && git checkout -- . && git pull
sed -i "s|/path/to/your/cert.crt|/var/www/html-to-image/cert/n8n.gotobizpro.com.crt|g" deploy/ecosystem.config.js
sed -i "s|/path/to/your/cert.key|/var/www/html-to-image/cert/n8n.gotobizpro.com.key|g" deploy/ecosystem.config.js
sudo -u www-data PM2_HOME=/var/www/.pm2 pm2 delete html-to-image
sudo -u www-data PM2_HOME=/var/www/.pm2 pm2 start /var/www/html-to-image/deploy/ecosystem.config.js --env production
sudo -u www-data PM2_HOME=/var/www/.pm2 pm2 save
```

If `npm install` pulled a new Playwright version, also reinstall Chromium as `www-data` (see Common tasks).

## Integrations

- **gotobizpro** (Laravel), `config/services.php` → `services.screenshot`: calls `GET {SCREENSHOT_SERVICE_URL}?url=...&width=...&height=...`. The URL defaults to `https://n8n.gotobizpro.com:3000/screenshot`, and the size defaults to 1600x1000. The call is in `app/Helpers/TemplateHelper.php`, which generates the canvas image. That app renders its own template pages and points this service at them.
- No other caller was found in the sibling repos. The screenshot URL in `knowledge-base-chat-embed` points to a different, Vercel-hosted service.

## Gotchas and handover notes

- **No authentication, and any URL is accepted.** Anyone who can reach port 3000 can make the server fetch any http(s) URL. That includes `localhost`, the VPS's Docker networks and **the office server at `10.8.0.2` over the VPN**, because the VPS is the WireGuard server. This is an SSRF risk. The only protection is the per-IP rate limit and CORS `*`. Add an API key or an allowlist if the service is exposed more widely.
- **Certificate renewal.** The certs are *copied* from Caddy. The daily 03:00 UTC cron re-copies them, but it **always** restarts the app, even when the cert hasn't changed, so in-flight screenshots fail once a day. Compare the cert first and restart only on change. If HTTPS errors appear, check `/var/log/html-to-image-cert-update.log`.
- **Concurrency model.** There is one shared Chromium, with a new browser context per request. `MAX_CONCURRENT` slots are available, and waiting requests get a 503 after 30s in the queue. A watchdog force-closes any context older than **60s**. A caller-supplied `timeout` above about 55s will therefore be killed mid-navigation. If the browser crashes, it is relaunched on the next request, and context creation is retried once.
- `uncaughtException` triggers a graceful shutdown, which calls `process.exit(0)`. PM2 then restarts the process (`autorestart`, `max_restarts: 10`).
- The rate limiter has no `trust proxy` setting. If you put Nginx or another proxy in front, every client will share the proxy's IP and hit the 100 requests per 15 minutes limit together.
- `deploy/nginx.conf` also `listen`s on port 3000, which conflicts with Node on 3000. It is an unused template. Fix the ports before using it.
- The **Docker setup is probably broken as committed** (not tested). `node:18-slim` has no `curl`, so the `HEALTHCHECK` will fail. Playwright's Chromium is installed as root, but the container runs as `pptruser`, so the browser is likely not found. The production compose file is all placeholders (`your-domain.com`, `your-email@example.com`).
- `server.js.backup` is an older, unused implementation. `package.json` keywords and the old docs still mention Puppeteer, and the API version is inconsistent (`/api/docs` reports 2.0.0, `package.json` says 1.0.0). These are cosmetic.
- `DEPLOYMENT.md` uses the placeholder repo URL `github.com/your-username/html-to-image`. The real remote is listed at the top of this file.
- The PM2 log paths (`./logs/*.log`) are relative to `/var/www/html-to-image`. `deploy-https.sh` creates that directory.
- There are no automated unit tests or CI. `test.js` is a manual smoke test against live internet sites.
