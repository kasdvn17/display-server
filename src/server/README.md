# Server runtime parts

These files are concatenated and compiled in the exact order listed by
`src/server.js`. They deliberately share one private CommonJS scope so existing
caches and integration state do not become browser globals or circular module
dependencies.

- `runtime-core.js` — imports, configuration, shared state and base helpers
- `calendar.js` — ICS parsing and photo/calendar preferences
- `ambient-context.js` — weather, air quality, routing and commute context
- `routines-notifications.js` — routines, briefing and notifications
- `camera.js` — WebRTC signaling routes
- `alarms.js` — persisted alarms
- `remote-control.js` — heartbeat and authenticated remote commands
- `immich-curator.js` — photo pool, metadata and Immich proxy
- `spotify.js` — OAuth, Web API, player and device controls
- `lyrics.js` — synchronized lyric providers
- `news-static.js` — news and page/static routes
- `gemini-live.js` — Gemini configuration, tools and integration helpers
- `dynamic-ui-routes.js` — dynamic UI conversion, voice routes and final server startup

Do not reorder parts without checking which helpers and shared state the later
part expects from an earlier one.
