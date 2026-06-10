---
name: run-homegroups-web
description: Run, start, screenshot, or interact with the Homegroups web app. Use when asked to launch the homegroups web app, take a screenshot, or test a web page change locally.
---

Create React App web app — "Homegroups: Privacy-First Group Management for 12-Step Recovery". Driven via Chrome headless for screenshots. Default port is 3000, but `detox-recovery` (Next.js) is frequently already running there — use port 3001.

## Prerequisites

- Node (any version the project was built with — 18 works)
- Google Chrome: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`

## Run (agent path)

```bash
cd /Users/marcusklein/dev/RecoveryConnect/web
PORT=3001 BROWSER=none node node_modules/.bin/react-scripts start
```

Wait until you see: `Compiled successfully!`

**Take a screenshot:**

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new \
  --screenshot=/tmp/rc-web.png \
  --window-size=1280,800 \
  --disable-gpu \
  http://localhost:3001
```

**Check if the server is ready:**

```bash
until lsof -iTCP:3001 -sTCP:LISTEN 2>/dev/null | grep -q node; do sleep 2; done
echo "RC web ready"
```

## Run (human path)

```bash
cd /Users/marcusklein/dev/RecoveryConnect/web
PORT=3001 npm start
```

Opens browser automatically to localhost:3001.

## Deploy

```bash
cd /Users/marcusklein/dev/RecoveryConnect/web
npm run build && firebase deploy --only hosting
```

## Gotchas

- **Port 3000 is usually taken** — `detox-recovery` (Next.js 15, at `/Users/marcusklein/dev/detox-recovery`) is frequently running on port 3000. Always use `PORT=3001` to avoid the conflict. `react-scripts start` will abort (not auto-increment) if the port is taken.
- **`BROWSER=none`** prevents react-scripts from auto-opening a browser tab — needed for headless/agent use.
- **SPA — curl returns shell only** — `curl http://localhost:3001` returns the CRA HTML shell with `<div id="root"></div>`, not rendered content. Use Chrome headless.

## Troubleshooting

| Error                                       | Fix                                                     |
| ------------------------------------------- | ------------------------------------------------------- |
| `Something is already running on port 3000` | Use `PORT=3001`                                         |
| Screenshot is blank/white                   | Wait for `Compiled successfully!` before screenshotting |
| `react-scripts: command not found`          | Use `node node_modules/.bin/react-scripts start`        |
