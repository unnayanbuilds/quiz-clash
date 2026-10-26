# Quiz Clash — Multiplayer Trivia Game

A React + Vite frontend and Node.js + Express + Socket.IO backend for a real-time room-based trivia game.

## Features

- Create private rooms with a six-character room code
- Join from separate browsers/devices using a room code
- Host-only start, remove-player, and replay controls
- Server-authoritative 12-second question timer
- Random 10-question match selected from a 50-question bank
- One answer per player per question; server-calculated scoring
- Automatic question progression and live leaderboard
- Final results and winner ranking
- Player sees their own nickname; other players see generic labels
- Health endpoint at `/health`

## Requirements

- Node.js 20 or newer
- npm

## Run locally

Open two terminals from the repository root.

Terminal 1 — backend:

```bash
cd server
npm install
npm start
```

Terminal 2 — frontend:

```bash
cd client
npm install
```

Copy `client/.env.example` to `client/.env.local` and set:

```env
VITE_SERVER_URL=http://localhost:3001
```

Then run:

```bash
npm run dev
```

Open the Vite URL in two separate browser sessions to test multiplayer locally.

## Deploy backend to Render

This repository includes `render.yaml` as a Render Blueprint configuration. You can also create a Web Service manually with:

- Repository: `unnayanbuilds/quiz-clash`
- Root Directory: `server`
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`
- Environment variable `CLIENT_ORIGIN`: `https://quiz-clash-mvp.vercel.app`

After deployment, copy the actual Render service URL.

## Deploy frontend to Vercel

- Import the same GitHub repository.
- Set Root Directory to `client`.
- Framework preset: Vite.
- Build Command: `npm run build`.
- Output Directory: `dist`.
- Add environment variable `VITE_SERVER_URL` with the actual deployed backend URL, e.g. `https://YOUR-SERVICE.onrender.com`.
- Redeploy after adding or changing environment variables.

If the Vercel frontend uses a different domain, update `CLIENT_ORIGIN` on the backend to that exact origin, without a trailing slash. For multiple frontend origins, use comma-separated origins.

## Important deployment notes

- Vercel static hosting alone cannot run this persistent Socket.IO backend.
- The backend must run on a host that supports WebSocket connections.
- Free backend services may sleep after inactivity and take time to wake up.
- Room state is stored in memory. Restarting the backend clears active rooms; this MVP does not use a persistent database.
- Do not commit `.env` files or secrets. `.env.example` files contain placeholders only.

## Game rules

- Host leaving closes the room and dismisses all players.
- The next question starts when all connected players answer or the timer expires.
- Scoring: 1,000 points for a correct answer plus up to 500 speed points based on time remaining.
