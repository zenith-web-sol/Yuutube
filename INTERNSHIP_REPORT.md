# Yuutube Clone — Internship Project Report

## 1. Project overview

Yuutube is a responsive YouTube-inspired video platform built on the training project. It demonstrates user authentication, channels, video uploading and playback, engagement features, subscriptions, memberships, account security, watch history, and live meetings. The work stayed on the original project rather than creating a replacement application.

**Project type:** MERN-style full-stack web application  
**Frontend:** Next.js Pages Router, React, TypeScript, Tailwind CSS  
**Backend:** Node.js, Express, MongoDB/Mongoose  
**Authentication:** Firebase Google sign-in with a MongoDB user profile  
**Payments:** Razorpay Test Mode for demonstration memberships  
**Deployment target:** Vercel frontend and Render backend using free tiers  

### Suggested screenshot 1 — Home page

Capture the responsive home page showing the header, sidebar, category tabs, and video grid. Label it: “Figure 1. Yuutube home page and responsive navigation.”

## 2. Objectives

- Extend the original training project with realistic internship features.
- Keep the application usable on free hosting plans.
- Make the interface responsive on desktop and mobile widths.
- Protect account-only actions while allowing public video watching.
- Provide a maintainable codebase and documented troubleshooting process.

## 3. Implemented features

### Authentication and profiles

Firebase handles sign-in while the backend creates or updates the corresponding MongoDB user. Users can create a channel, edit channel information, select a theme, view account security history, and sign out.

### Video platform

Users can upload videos from their own channel, browse the video grid, search, open a public watch page, use a custom responsive player, and use keyboard controls. The player supports play/pause, seeking, volume, mute, fullscreen, theatre mode, picture-in-picture, captions, playback speed, and saved playback position.

### Engagement

Likes and dislikes are persistent per user and video, and repeated clicks toggle the reaction correctly. Comments support replies and reactions. Watch Later, reports, and other protected actions request sign-in without blocking public playback.

### Channels and subscriptions

Uploaded videos retain their channel ID and appear on the channel page. Channel subscriptions toggle persistently and appear in the Subscriptions feed. A user cannot subscribe to their own channel. Legacy uploads are handled with a repair path where possible.

### Membership

Membership plans are shown on the Membership page. Razorpay Test Mode supports order creation and payment verification without charging real money. Demo activation is available for local testing when payment credentials are not configured.

### Watch history and security history

History keeps one latest record per user/video and moves it to the newest position when watched again. Login history updates the existing browser/device record instead of creating an unnecessary duplicate on every login.

### Meetings

Yuutube Meetings provides a host page and invite-link joining flow. Signed-in users can host; invitees can join with a display name without a second meeting account. Current meeting capabilities include camera/microphone preview, WebRTC video/audio, chat, participant panel, screen sharing, local recording, five reactions, raise hand, whiteboard drawing, host lock, mute-all, participant mute/video stop, removal, and co-host promotion.

### Suggested screenshot 2 — Meeting pre-join

Capture the camera/microphone preview and “Join meeting as” form. Label it: “Figure 2. Meeting pre-join hardware check and invite sharing.”

### Suggested screenshot 3 — Meeting room

Capture the video tiles, toolbar, People panel, and Chat panel. Label it: “Figure 3. Live meeting room with participant and collaboration controls.”

## 4. Responsive design

The layout uses responsive grid/flex utilities, mobile navigation, compact controls, adaptive video tiles, and mobile-safe spacing. Test at approximately 375px, 768px, 1024px, and 1440px widths.

### Suggested screenshot 4 — Mobile layout

Capture the application at a mobile width with the sidebar closed and the video cards stacked. Label it: “Figure 4. Mobile-responsive Yuutube layout.”

## 5. Architecture

The browser calls the Express API through the shared Axios instance. Express controllers validate request data and use Mongoose models for MongoDB access. Socket.IO runs beside Express for meeting signaling and collaboration events. WebRTC carries peer media directly between browsers; the server does not store meeting recordings.

## 6. Testing summary

Test public watch access while signed out, sign-in-protected actions, upload/channel relationships, like toggling, comment replies, subscription persistence, membership demo activation, theme switching, keyboard player controls, mobile layout, two-browser meetings, guest joining, screen sharing, recording, whiteboard, host moderation, and refresh/rejoin behavior.

## 7. Known limitations and realistic scope

WebRTC quality depends on browser permissions, network conditions, and STUN availability. Mesh calls are appropriate for a demonstration but do not scale like a production SFU. Local recording records the selected local/screen stream and is downloaded in the browser. Free Render/Vercel instances may sleep and can interrupt an active meeting.

## 8. Future security roadmap

The next security phase should add SMTP-based OTP verification for first login, suspicious login, and logins after 30 days. The system should record IP address, approximate country, state/region, city where legally and technically appropriate, browser, operating system, device type, login timestamp, and a trusted-device decision. Add rate limiting, OTP expiry and attempt limits, hashed OTP storage, audit logging, privacy notice, retention rules, and a user-visible device/session revocation screen. Location should be treated as approximate and collected only with a clear privacy justification.

### Suggested screenshot 5 — Security page

Capture the current security page showing login history and the planned OTP/location area as an annotated future-work mockup. Label it: “Figure 5. Account security area and planned verification roadmap.”

## 9. Conclusion

The project demonstrates a complete, responsive video platform built incrementally on the original training codebase. It combines practical free-tier deployment decisions with realistic user flows and clearly identifies the areas—scalable meetings, SMTP verification, stronger authorization, and privacy controls—that would be required before production use.
