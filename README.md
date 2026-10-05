# YuuTube — A YouTube Clone (MERN + Next.js)

A full-stack YouTube-style video platform built as an internship project. Beyond the core upload/watch/comment experience, it includes a membership + downloads system, live video meetings (Google Meet–style), OTP-gated login security, and AI-assisted comment translation and moderation.

This README doubles as a **build-from-scratch guide**: if you ever need to rebuild this project, start here. Every major feature links to the exact gotchas that cost real time during development, so you don't repeat them.

---

## Tech Stack

**Frontend:** Next.js (Pages Router) + TypeScript, Tailwind CSS, shadcn/ui (Base UI-based components, not Radix), Firebase Auth (Google Sign-In), Socket.io-client, `lucide-react` icons.

**Backend:** Node.js + Express (ESM — `"type": "module"`), MongoDB + Mongoose, Socket.io (for Meetings), Multer + Cloudinary (video storage), Resend (transactional email), `google-translate-api-x` (comment translation).

**Deployment:** Frontend on **Vercel**, backend on **Render** (free tier), MongoDB on **Atlas**, video files on **Cloudinary**, email via **Resend** with a custom domain bought on **Hostinger**.

---

## Repository layout

```
/
├── yuutube/        → Next.js frontend
│   └── src/
│       ├── pages/          (routes)
│       ├── components/     (shared UI)
│       └── lib/             (AuthContext, axiosInstance, meetingStore, firebase.js)
├── server/         → Express backend
│   ├── controllers/
│   ├── routes/
│   ├── Modals/              (Mongoose models — named "Modals", not "Models", throughout)
│   ├── socket/               (meetings.js — Socket.io handlers)
│   └── filehelper/           (Multer + Cloudinary config)
```

**Do not commit `node_modules/` or `.env` from either `yuutube/` or `server/`.** Both projects need their own `.gitignore` with:
```
node_modules/
.env
.env.local
.next/
```
This was missed early in development and had to be cleaned up with `git rm -r --cached` — do it from day one.

---

## Environment variables

### `server/.env`
```
PORT=5000
DB_URL=<MongoDB Atlas connection string>
EMAIL_USER=<Resend-verified sender address, e.g. otp@yourdomain>
RESEND_API_KEY=<Resend API key>
CLOUDINARY_CLOUD_NAME=<...>
CLOUDINARY_API_KEY=<...>
CLOUDINARY_API_SECRET=<...>
RAZORPAY_KEY_ID=<...>        # for membership/subscriptions
RAZORPAY_KEY_SECRET=<...>
```

### `yuutube/.env.local`
```
NEXT_PUBLIC_BACKEND_URL=https://your-backend.onrender.com   # or http://localhost:5000 for local dev
```

**Critical gotcha — ES Module import order and `dotenv`:** in an ESM project (`"type": "module"` in `package.json`), `import` statements are hoisted and run top-to-bottom *before* any other code in the file — including a `dotenv.config()` call written further down. If any imported module (like a controller that configures Nodemailer or Cloudinary at the top level) reads `process.env.X` during its own import, it will see `undefined`, because `dotenv.config()` hasn't run yet.

This caused two separate, hard-to-diagnose bugs in this project (Cloudinary "must supply api_key", Nodemailer "Missing credentials for PLAIN") — both looked like wrong credentials, but were actually a load-order bug.

**Fix, applied in `server/index.js`:**
```js
import "dotenv/config";   // must be the very first line, before any other import
import express from "express";
// ...rest of imports
```
Do **not** write `import dotenv from "dotenv"` + a later `dotenv.config()` call — the side-effect import form above is what actually guarantees ordering.

---

## Setup from scratch

```bash
# Backend
cd server
npm install
npm start          # runs on PORT (default 5000)

# Frontend (separate terminal)
cd yuutube
npm install
npm run dev         # runs on localhost:3000
```

Always restart the **correct** terminal after changing code on that side — a recurring issue during development was editing backend files and only restarting the frontend (or vice versa), leading to "fixed" bugs that mysteriously persisted. If both frontend and backend are running and something still looks stale, do a full stop (Ctrl+C, confirm the prompt returns) and restart both.

### Windows-specific: stale Next.js cache
If dynamic routes (`/watch/[id]`, `/channel/[id]`) start 404ing after resuming a session, the most common cause is the dev server having been killed uncleanly (closing the terminal instead of Ctrl+C) during a prior session, corrupting `.next`'s route manifest. Fix:
```bash
Remove-Item -Recurse -Force .next
npm run dev
```
To avoid it recurring, always stop the dev server with Ctrl+C and wait for the prompt to return before closing the terminal.

---

## Features

### Core video platform
Upload, playback, comments (with replies, likes/dislikes, edit/delete, reporting), subscriptions, history, watch later, liked videos, search, channel pages.

### Membership & Downloads
A subscription-tier system (`Free`/`Bronze`/`Silver`/`Gold`) gates a per-day video download quota. Downloaded videos get their own listing page (`/download`) and a restricted single-video view (`/download/[id]`) that shows only the player, channel info, and description — no comments, likes, or subscribe controls.

**Key lesson — Next.js routing:** a page's route is determined entirely by its path under `pages/`, not by any component name. `pages/download/index.tsx` → `/download`; `pages/download/[id]/index.tsx` (or `pages/download/[id].tsx`, functionally identical) → `/download/:id`. A component of the same shape living in `components/` is never a route — it needs a thin wrapper page in `pages/` that imports and renders it.

### Account Security
- **Theme**: `light` / `dark` / `system`. In `system` mode, theme automatically follows IST time — light from 5:00 AM–12:00 PM, dark otherwise — re-checked every 60 seconds via a `setInterval`, not just on page load.
- **Login history**: each login records IP, browser + version, OS, device type, device model (best-effort — modern browsers intentionally limit how much of this is exposed via User-Agent), and **IP-based geolocation** (city/state/country) via `ip-api.com` (free, no key). History is collapsed to **one row per device signature**, with the requester's own matching row flagged `isCurrentDevice`.
- **OTP-gated new-device login**: if a login's signature (IP + browser + OS + device type + city + state) doesn't match a still-"trusted" (≤30-day) prior login, the backend emails a 6-digit OTP via Resend before completing login. A resend button with a 30-second cooldown is included.

**Key lesson — geolocation on localhost:** `req.socket.remoteAddress` is always `::1`/`127.0.0.1` in local dev, so geolocation correctly shows "Unavailable" there by design — this is not a bug. Only a real deployed backend (or a hardcoded test IP like `8.8.8.8`) will show real location data.

**Key lesson — email delivery:**
1. Gmail SMTP (via Nodemailer) works locally but is **blocked outbound on Render's free tier** (`ETIMEDOUT`/`ENETUNREACH` on ports 465 and 587) — a platform network restriction, not fixable in code.
2. Switched to **Resend**, an HTTP-based (port 443) email API — works through Render's restrictions since it's not raw SMTP.
3. Resend's free/testing sender (`onboarding@resend.dev`) can only send to the account owner's own email. Sending to arbitrary users requires **verifying a real domain** you control (DNS access) — a `vercel.app`/`netlify.app` subdomain won't work, since you don't control its DNS. A cheap domain (~$1–2/year on Namecheap/Hostinger, often supporting UPI for Indian buyers) plus 5 DNS records (DKIM, 2× CNAME, MX, DMARC) solves this permanently.

### Video Calling (Meetings)
WebRTC mesh video calls via `Socket.io` signaling (`server/socket/meetings.js`) — no third-party video SDK. Supports: screen share, live chat, emoji reactions, raise-hand, a shared whiteboard, local recording (`MediaRecorder`), host/co-host roles, mute-all/lock-meeting/remove-participant moderation, and a distinct **"End meeting for everyone"** action (separate from an individual "Leave") that force-disconnects every participant and tears down the room.

Meetings can be instant or scheduled; scheduling and history sync to the backend per signed-in user (falls back to `localStorage` for guests) via `lib/meetingStore.ts`.

**Key lesson:** role-change events (like promoting a co-host) must be **broadcast to the whole room**, not just sent privately to the affected person — otherwise only that one person's UI updates and nobody else ever sees who's host/co-host.

### Video storage (Cloudinary, not local disk)
Videos are uploaded via Multer directly into Cloudinary storage, not the server's local filesystem.

**Key lesson — this is the single most important architectural note in this README.** Render's (and most PaaS free tiers') local disk is **ephemeral** — anything written to it is wiped on every redeploy or restart. A video upload flow that writes to `uploads/` on the server and stores that relative path in MongoDB will work perfectly in local dev and then silently 404 in production the first time the backend redeploys. If building this from scratch, go straight to Cloudinary/S3/Backblaze (or similar persistent object storage) for any uploaded file — never local disk on a free-tier host.

### Comment translation
A "Translate" button + language dropdown (~90 languages, alphabetical) on every comment/reply, calling `POST /translate` on the backend, which uses `google-translate-api-x` (an unofficial wrapper around Google Translate's public web endpoint — free, no API key, but not officially sanctioned, so it can break without notice; fine for a project like this, reconsider for production scale).

**Why not the official Google Cloud Translate API:** it requires a billing account enabled, which in India requires a refundable security deposit (~₹1000) even to use the free tier — a real barrier for personal projects. `google-translate-api-x` was the practical free alternative.

### Profanity filter + CAPTCHA
Comments are checked against a basic blocked-word list. The 3rd flagged comment permanently sets `requiresCaptcha: true` on the user; every comment after that must be submitted with a correctly solved arithmetic CAPTCHA (generated server-side, expires in 5 minutes), returned via HTTP 428, solved inline in the comment box, and resubmitted automatically.

### Voice search
Browser-native `SpeechRecognition`/`webkitSpeechRecognition` (Web Speech API) — zero backend cost, Chrome/Edge only (Firefox unsupported; detected and degrades gracefully to a disabled state with an explanatory tooltip).

---

## Deployment

### Backend → Render
- Root directory: `server`
- Build command: `npm install`
- Start command: `npm start` (→ `node index.js`)
- Set every `server/.env` variable in Render's **Environment** tab — they are **not** read from a committed `.env` file (which shouldn't be committed anyway).
- **Any env var change requires a redeploy to take effect** — Render doesn't hot-reload a running process's environment.

### Frontend → Vercel
- Root directory: `yuutube`
- Production branch: `main`
- Set `NEXT_PUBLIC_BACKEND_URL` in **Environment Variables**, scoped to Production, pointing at the Render URL (no trailing slash).
- `NEXT_PUBLIC_*` variables are baked in **at build time** — adding/changing one without triggering a new build does nothing.

### Common deployment bugs and their actual causes
| Symptom | Real cause |
|---|---|
| API calls go to `localhost:5000` on the live site | `axiosInstance.js` had a hardcoded `baseURL` instead of reading `process.env.NEXT_PUBLIC_BACKEND_URL` |
| Videos 404 in production after working locally | Render's ephemeral disk wiped `uploads/` on redeploy (see Cloudinary note above) |
| OTP email never arrives, 502 on login | (1) Gmail SMTP blocked by Render's network policy, or (2) wrong `EMAIL_USER`, or (3) Resend sender domain not verified for the recipient |
| Google popup sign-in silently fails (`auth/popup-blocked`) | Firebase/Google SDK imported via `await import(...)` *inside* the click handler — the async gap between the click and `signInWithPopup` is enough for browsers to no longer treat the popup as tied to a user gesture. Fix: import Firebase statically at module top level, call `signInWithPopup` as the first synchronous line of the handler. |
| `auth/cancelled-popup-request` repeating | Caused by clicking "Sign in" again while a previous attempt was still pending — each new call cancels the last. Add an in-flight guard (`useRef`) around the sign-in function. |
| `signInWithRedirect` never resolves with a user, `getRedirectResult` returns `null` | Modern browsers (Chrome and Edge both, not just Edge's Tracking Prevention) partition/block third-party storage, which the redirect flow across `*.firebaseapp.com` depends on. **Use `signInWithPopup`, not redirect**, for a more reliable cross-browser flow, provided the popup-blocked issue above is also fixed. |

---

## Known limitations (honest list)

- `google-translate-api-x` is unofficial and could break if Google changes its public endpoint.
- Device model detection from User-Agent is inherently limited — modern mobile browsers deliberately withhold exact model strings for privacy.
- Meeting recording only captures the local user's own camera/mic/screen (via `MediaRecorder` on the client), not a server-side composite of the whole call.
- Resend's free tier has a monthly send cap; fine for a student project, would need a paid tier or a different provider at real scale.
- The video model's `filepath` field now holds a mix of legacy broken local paths (from before the Cloudinary migration) and full Cloudinary URLs — both `VideoPlayer.tsx` and `VideoCard.tsx` detect which type a given value is (`/^https?:\/\//i.test(...)`) and handle both, but any surviving legacy record will still 404 since the underlying file is gone.

---

## If rebuilding from scratch — suggested order

1. Scaffold backend (Express + Mongoose + `"type": "module"`), put `import "dotenv/config"` as literally the first line of `index.js` before anything else.
2. Set up Cloudinary for video storage **before** writing any upload code — never start with local disk storage even "temporarily," it creates a migration you'll have to redo later.
3. Build auth with Firebase Google Sign-In using `signInWithPopup` (not redirect) with static imports from day one.
4. Add the login-history/OTP/geolocation security layer once basic auth is solid.
5. Build out core video CRUD + comments before adding peripheral features (meetings, translation, voice search) — those are genuinely independent and can be added/removed without touching the core.
6. Set up `.gitignore` (`node_modules/`, `.env`) before the first commit, not after.
7. Deploy early and often (even an empty skeleton) to catch environment-variable and ephemeral-storage issues before they compound with a full feature set on top.
