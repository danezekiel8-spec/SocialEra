# SocialEra Mobile App

This folder is a separate app workspace for SocialEra. It does not replace or edit the current website flow.

## What it does

- serves a standalone mobile-first app shell on its own port
- proxies `/api/*` and `/assets/*` back to the existing backend
- keeps app UI, state, and installability isolated from the website

## Run it

1. Start the main SocialEra backend on port `5001`.
2. Start this app:

```bash
cd /Users/dansangil/Desktop/Lovada/mobile-app
npm start
```

3. Open [http://localhost:4100](http://localhost:4100)

## Optional configuration

- `PORT`: app server port, defaults to `4100`
- `SOCIALERA_BACKEND_ORIGIN`: backend origin to proxy, defaults to `http://localhost:5001`
