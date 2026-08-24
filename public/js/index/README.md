# Main display scripts

The server concatenates these source parts in dependency order and serves them
as one `/js/index.js` response. This keeps the original private IIFE scope and
one-request client behavior without requiring a build step.

Order:

1. `core.js` — kiosk behavior, idle screen, shared fetch/bootstrap state
2. `today.js` — ambient context, routines, notifications, morning briefing
3. `camera.js` — frame camera and two-way intercom
4. `photos.js` — curated Immich slideshow and photo actions
5. `news.js` — ambient and full news views
6. `clock.js` — timezone-aware clock and greeting
7. `navigation.js` — tabs and view switching
8. `gestures.js` — photo swipe and entrance animation
9. `alarms-remote.js` — alarms, heartbeat and remote commands
10. `spotify.js` — Spotify SDK, playback, devices, lyrics and media controls
11. `assistant.js` — Gemini Live, follow-up voice and dynamic UI
12. `bootstrap.js` — final startup calls

Keep this list synchronized with `INDEX_SCRIPT_FILES` in
`src/services/script-bundle.js`.
