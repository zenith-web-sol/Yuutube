# Yuutube Project Documentation

## Quick start

Install dependencies in both folders, configure the backend environment variables, then run the backend and frontend in separate terminals.

```powershell
cd server
npm.cmd install
npm.cmd run dev
```

```powershell
cd yuutube
npm.cmd install
npm.cmd run dev
```

The frontend normally runs on `http://localhost:3000` and the backend on `http://localhost:5000`.

## Environment configuration

The backend `.env` contains the MongoDB connection string and optional Razorpay test credentials. Never commit real secrets. The frontend uses `NEXT_PUBLIC_BACKEND_URL` when the backend is not on localhost.

Required operational checks:

1. MongoDB is reachable.
2. Firebase client configuration is present in the frontend.
3. The frontend backend URL points to the correct Render/local server.
4. Razorpay keys are test keys only during development.
5. Camera/microphone permissions are allowed for meetings. Production meetings require HTTPS.

## Important folders

- `yuutube/src/pages`: Pages Router screens and dynamic watch/channel/meeting routes.
- `yuutube/src/components`: reusable UI, player, comments, uploader, header, sidebar, and meeting controls.
- `yuutube/src/lib`: Axios and Firebase/AuthContext helpers.
- `server/controllers`: request validation and application logic.
- `server/routes`: API route declarations.
- `server/Modals`: Mongoose schemas.
- `server/index.js`: Express startup and Socket.IO meeting signaling.

## Main routes

Frontend routes include `/`, `/explore`, `/watch/[id]`, `/channel/[id]`, `/subscriptions`, `/membership`, `/history`, `/security`, `/meetings`, and `/meetings/[roomId]`.

Backend groups include `/user`, `/video`, `/like`, `/comment`, `/history`, `/watch`, and `/subscription`. Socket.IO meeting events use the `meeting:` prefix.

## Meeting workflow

1. A signed-in host opens `/meetings` and chooses New meeting.
2. The room URL is shareable; guests open it and enter a display name.
3. The pre-join page requests camera/microphone access and shows a preview.
4. Socket.IO exchanges WebRTC offers, answers, and ICE candidates.
5. WebRTC carries audio/video peer-to-peer.
6. Socket.IO carries chat, media status, reactions, hand raises, whiteboard strokes, and moderation commands.
7. Refreshing the room preserves the display name and room code locally; the browser can rejoin after permission is granted again.

## Common errors and fixes

### Dynamic page returns 404

Next.js Pages Router dynamic pages must be directly under the route folder, for example `src/pages/channel/[id].tsx` and `src/pages/watch/[id].tsx`. Stale `.next` output can continue referencing an old nested path. Stop the frontend, remove `.next`, and restart it.

### Axios 500 when subscribing

Older video records stored a non-Mongo uploader value. The backend now validates IDs and attempts to reconnect legacy videos using their channel name. New uploads validate that the uploader is an existing channel before saving.

### Likes increase instead of toggling

The API now stores the user/video reaction and returns authoritative like/dislike counts. The frontend uses those returned counts and states instead of guessing with local increments.

### History contains duplicate videos

History uses one record per viewer/video and updates its latest watch timestamp. The read endpoint also de-duplicates older records without destructive database cleanup.

### Theme starts dark or appears unchanged

The client normalizes the old `system` preference to light/dark and applies the same resolved value to the document. Restart the frontend and clear the old `yuutube-theme` local-storage key once if an old browser value remains.

### Meeting camera does not work

Use localhost or HTTPS, allow camera/microphone permissions, close other applications using the device, and check browser site permissions. A Render sleep or firewall can also interrupt Socket.IO signaling.

### Remote participant cannot connect

Confirm both browsers can reach the same backend URL, Socket.IO is installed on the server, the Render deployment exposes the server correctly, and the STUN server is reachable. Mesh WebRTC may fail on restrictive networks without TURN.

### Meeting page text is invisible

Meeting overlays use explicit dark backgrounds and white text. If new controls are added, avoid light `outline` buttons without a text color on the dark room surface.

## Safe maintenance rules

- Do not commit `.env`, Firebase private keys, MongoDB credentials, or Razorpay secrets.
- Preserve the existing training project and extend it in place.
- Run `npx.cmd tsc --noEmit --pretty false` after frontend changes.
- Run `node --check index.js` and the relevant controller checks after backend changes.
- Test signed-out public watching separately from signed-in actions.
- Test meetings in two browsers, because one browser cannot prove peer signaling works.
- Do not treat browser-local recordings as server backups.

## Planned security implementation

For SMTP OTP, add a mail service abstraction, generate a cryptographically random short-lived OTP, hash it before storage, limit attempts, expire it, and invalidate it after use. Trigger it for first login, suspicious device/IP changes, and login after 30 days. Store only the minimum login metadata required for account security. IP-derived location must be approximate, documented in the privacy policy, and protected with the same access controls as login history.

## Deployment checklist

1. Set Render environment variables and deploy the backend.
2. Set Vercel `NEXT_PUBLIC_BACKEND_URL` to the deployed backend URL.
3. Add the Vercel domain to Firebase authorized domains.
4. Confirm CORS and Socket.IO connections from the deployed frontend.
5. Test upload, public watch, authentication, Razorpay test flow, and a two-browser meeting after deployment.
