# Shatranj

The royal game: 3D chess in a candlelit study, played with hand gestures, by voice, or with the mouse, against the engine, across one table, or as a live courier duel with a rival anywhere.

Play it at **https://designbyujjwal.github.io/shatranj/**

Made for laptops and tablets. Best in Chrome or Edge; allow the camera and microphone when asked.

## How it runs

- **The game** is a set of static files, published on GitHub Pages.
- **The duel server** (`server.ts`) keeps the courier invite rooms and links the two players of a live duel. It runs on Render (`render.yaml`) at https://playshatranj.onrender.com. On the free plan it sleeps when idle; the game wakes it as soon as it opens, so it is usually ready by the time a duel starts.

## Run locally

Needs Node.js 20 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:3000. This runs the game and the duel server together.

## Publish

- **Game:** `scripts/publish-pages.sh` builds the game for `/<repo>/` and pushes it to the `gh-pages` branch, which GitHub Pages serves.
- **Duel server:** Render builds `main` with `npm run build` and starts it with `npm start` (it listens on `PORT`).
