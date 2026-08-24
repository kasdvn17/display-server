# Immich Digital Frame

A self-hosted smart display designed for older iPads, including the iPad Air 2.
It combines an Immich photo frame with weather, news, calendars, alarms,
Spotify playback, synchronized lyrics, Gemini Live, remote control, and a
peer-to-peer camera intercom.

> [!IMPORTANT]
> The current Media player uses the Spotify Web Playback SDK and therefore
> **requires an active Spotify Premium account**. A future version using
> SoundCloud is planned, but SoundCloud playback is not included in this
> release.

## Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Quick installation](#quick-installation)
- [Configuration](#configuration)
- [Spotify setup](#spotify-setup)
- [Running the display](#running-the-display)
- [Pages and endpoints](#pages-and-endpoints)
- [iPad and Safari notes](#ipad-and-safari-notes)
- [Project structure](#project-structure)
- [Security](#security)
- [Troubleshooting](#troubleshooting)

## Features

### Photo frame

- Curated Immich albums and unalbumed photo stories
- Location- and time-based events
- One-, two-, and three-year memories
- Rediscovery mode and configurable album exclusions
- Server-side photo selection, EXIF checks, and story construction to reduce
  client workload
- Configurable slideshow interval and an on-screen photo countdown

### Today dashboard

- Weather and air-quality context
- Upcoming calendar events from an ICS feed
- Commute estimates and event-aware departure suggestions
- Context-aware morning, leaving, day-check, and evening routines
- Persistent notification center
- Automatic morning briefing during a configurable time window

### Gemini Live assistant

- Voice conversations with 12-second follow-up listening only when Gemini asks
  for more information
- Shared dynamic UI renderer for weather, directions, people, news, calendar,
  and recipes
- Current-location routing through Nominatim and OSRM
- Request timeout handling and visible tool errors
- Server-side processing where practical to keep the display responsive
- Safe Gemini tools for ambient context, calendar, routines, briefing,
  notifications, alarms, frame control/status, camera status, news, lyrics,
  and Spotify
- Immich/photo APIs, credentials, OAuth tokens, heartbeat traffic, and WebRTC
  signaling are intentionally not exposed to Gemini

### Media — Spotify Premium

- Native Spotify catalog search
- Spotify Connect device discovery and switching
- Automatic recovery to the active, local browser, or first available player
  after a selected device disconnects or the display reloads
- Gemini tools for playback control, current-track status, device listing, and
  player selection
- Browser playback through the Spotify Web Playback SDK
- Play, pause, previous, next, seek, shuffle, repeat, and volume controls where
  the platform allows them
- Synchronized lyrics from LRCLIB with a lyrics.ovh fallback
- Tap a timed lyric line to seek to that position
- Server-side caching, request coalescing, and `Retry-After` cooldown handling
  to reduce Spotify API usage

Spotify is the only music provider in this version. SoundCloud support will be
provided in a later release.

### Alarms, remote control, and camera

- Server-saved alarms using the configured local timezone
- Authenticated remote control for navigation, recovery, routines,
  notifications, diagnostics, alarms, and Gemini text queries
- Authenticated WebRTC camera intercom
- Responsive Vietnamese interface with lightweight animations and reduced-motion
  support

## Prerequisites

| Requirement | Purpose | Link |
| --- | --- | --- |
| Node.js 18 or newer and npm | Runs the Express server | [Download Node.js](https://nodejs.org/en/download) |
| An accessible Immich server and API key | Supplies the photo library | [Immich documentation](https://docs.immich.app/) |
| Spotify Premium | Required by the current Media player | [Spotify Premium](https://www.spotify.com/premium/) |
| Spotify developer application | OAuth, Web API, and Web Playback SDK | [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) |
| Gemini API key | Required only for Gemini Live features | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| HTTPS hostname | Recommended for deployment; required for the remote camera and a non-loopback Spotify callback | [Cloudflare Tunnel documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) |

You also need a modern browser with JavaScript enabled. Safari is supported,
although iOS imposes additional autoplay and volume restrictions.

## Quick installation

```bash
git clone https://github.com/kasdvn17/display-server.git
cd display-server
npm install
cp .env.example .env
```

Edit `.env`, configure at least the Immich values, and then start the server:

```bash
npm start
```

Keep the project structure intact. The root `server.js` is intentionally a
small entrypoint that loads `src/server.js`; do not replace it with the larger
file from `src/`. Root compatibility shims are included for older or
accidentally flattened installations, but the documented structure is
recommended.

The default display URL is:

```text
http://localhost:8080/
```

From another device on the same network, replace `localhost` with the server's
LAN address, for example `http://192.168.1.100:8080/`.

## Configuration

All runtime configuration is read from `.env`. Start with
[`.env.example`](./.env.example), which documents every supported option.
Display timing, Spotify polling, Gemini timeouts, alarm confirmation, camera
polling, remote refresh and theme color can all be tuned there without editing
JavaScript source files.

### Minimum Immich configuration

```env
PORT=8080
IMMICH_URL=https://photos.example.com
IMMICH_API_KEY=your_immich_api_key
IMMICH_PUBLIC_URL=https://photos.example.com
```

Create the key from the Immich web application's user settings. Limit its
permissions where possible. `IMMICH_PUBLIC_URL` is used for links opened by the
display; it may differ from an internal `IMMICH_URL`.

### Common optional integrations

| Variables | Enables |
| --- | --- |
| `GEMINI_API_KEY`, `GEMINI_LIVE_MODEL` | Gemini Live assistant |
| `NEWS_RSS_URL`, `NEWS_LIMIT` | Home news moments and the News tab |
| `FRAME_CALENDAR_ICS_URL`, `FRAME_CALENDAR_NAME` | Calendar events in Today |
| `FRAME_LATITUDE`, `FRAME_LONGITUDE` | Fallback location for weather and directions |
| `FRAME_COMMUTE_TARGETS` | Scheduled and calendar-aware commute estimates |
| `REMOTE_CONTROL_TOKEN` | Authenticated `/remote` page |
| `CAMERA_REMOTE_TOKEN` and optional TURN settings | Authenticated `/camera` page |
| `FRAME_TIMEZONE` | Display clock, calendar, routines, and alarms |

Keep private or secret ICS URLs in `.env`; the server fetches them without
exposing the feed URL to the browser.

## Spotify setup

The [Spotify Web Playback SDK requires Spotify
Premium](https://developer.spotify.com/documentation/web-playback-sdk/howtos/web-app-player/).
Free accounts cannot initialize this project's browser player.

1. Sign in to the [Spotify Developer
   Dashboard](https://developer.spotify.com/dashboard) using the Premium
   account that will control playback.
2. Create an application and copy its Client ID and Client Secret.
3. Add the exact callback URL used by `SPOTIFY_REDIRECT_URI` to the
   application's redirect URIs.
4. Add the following values to `.env`:

```env
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=https://display.example.com/spotify/callback
SPOTIFY_AFTER_LOGIN_URL=https://display.example.com/?spotify=connected
SPOTIFY_DEVICE_NAME=Nest Frame · iPad
```

5. Restart the server, open the **Media** tab, and select **Connect Spotify**.

Spotify does not accept a normal LAN HTTP address as a production OAuth
callback. Use an HTTPS hostname that routes `/spotify/callback` to this Node.js
server, or use a loopback address while testing on the server itself. See
[Spotify's Web API getting-started
guide](https://developer.spotify.com/documentation/web-api/tutorials/getting-started)
for the authorization model.

The refresh token is stored server-side in `.spotify-token.json`; it is never
embedded in the display page. If Spotify revokes or expires authorization, use
**Connect Spotify** again.

### Spotify platform behavior

This build pauses Spotify when you leave **Media** for a photo or news view and
hides the Immich slideshow while Media is open. This separation helps the
project avoid synchronizing Spotify recordings with slideshow or news visuals.
Review the [Spotify Developer Policy](https://developer.spotify.com/policy) and
[Spotify compliance guidance](https://developer.spotify.com/compliance-tips)
before deploying or modifying the integration, especially for anything beyond
personal, non-commercial use.

## Running the display

For normal use, keep the Node.js process running and open the main page in the
iPad browser or kiosk application:

```bash
npm start
```

For an always-on installation, place the process behind your preferred service
manager or container and expose it through HTTPS. This repository does not
install a system service automatically.

## Pages and endpoints

| Path | Description | Authentication |
| --- | --- | --- |
| `/` | Main photo frame and smart-display interface | None by default |
| `/remote` | Remote control, recovery, alarms, diagnostics, and messages | `REMOTE_CONTROL_TOKEN` |
| `/camera` | WebRTC camera viewer/intercom | `CAMERA_REMOTE_TOKEN` |
| `/spotify/login` | Starts Spotify authorization | Spotify account login |
| `/spotify/callback` | Spotify OAuth callback | OAuth state validation |

Use long, random values for remote and camera tokens. Camera access should only
be exposed over HTTPS.

## iPad and Safari notes

- iOS requires a user gesture before audio playback can begin. The first track
  or a transferred playback session may require one tap.
- iOS keeps output volume under physical/system control. JavaScript cannot
  reliably change the device volume.
- Browser geolocation and camera access normally require HTTPS.
- If Safari keeps an old interface after an update, reload the page or clear
  website data so the latest versioned assets are fetched.
- The interface uses lightweight transform/opacity animations and respects
  `prefers-reduced-motion`.

## Project structure

```text
server.js                 Minimal Node.js entrypoint
src/
├── server.js             Small ordered runtime loader
├── config.js             Environment configuration and paths
├── README.md             Backend module notes
├── server/               Server runtime split by integration/domain
└── services/
    ├── style-bundle.js   Server-side CSS bundle assembly
    └── script-bundle.js  Server-side display JS bundle assembly
public/
├── index.html            Main display markup
├── remote.html           Remote-control markup
├── camera.html           Camera viewer markup
├── frame-config.json     Display theme configuration
├── css/
│   ├── index.css         Ordered main stylesheet manifest
│   ├── index/            Main styles split by feature and cascade order
│   ├── remote.css        Remote-control styles
│   └── camera.css        Camera viewer styles
└── js/
    ├── index/            Main display behavior split by feature
    ├── remote.js         Remote-control behavior
    └── camera.js         Camera viewer behavior
```

HTML files contain markup only. Presentation and browser behavior live in their
matching `css/` and `js/` files. The main stylesheet and display JavaScript are
split into ordered feature modules for maintainability, then served as one CSS
and one JavaScript response to minimize client requests. Server runtime parts
are also grouped by domain while retaining one shared lifecycle for caches and
integrations.

## Security

Never commit or publish these files:

```text
.env
.spotify-token.json
.frame-state.json
.frame-hidden-assets.json
```

They are ignored by the included `.gitignore`, but you should still protect
backups and file permissions. Do not expose the server directly to the public
internet without HTTPS and access controls.

## Troubleshooting

### The Media player does not start

- Confirm that the connected Spotify account has an active Premium
  subscription.
- Tap a playback control once to satisfy Safari's user-gesture requirement.
- Verify that the Spotify redirect URI exactly matches the Dashboard setting.
- Reconnect Spotify if authorization has expired or been revoked.
- If Spotify returns `429`, wait for the server cooldown instead of repeatedly
  reloading the page.

### Photos do not appear

- Verify `IMMICH_URL` and `IMMICH_API_KEY`.
- Confirm that the key has permission to read the required assets and albums.
- Set `IMMICH_PUBLIC_URL` when the browser cannot reach the internal Immich
  hostname.

### Camera or location permission is unavailable

- Serve the site over HTTPS.
- Check Safari site permissions for camera, microphone, and location.
- Configure a TURN server if WebRTC cannot connect across NAT or CGNAT.

### Gemini is unavailable

- Verify `GEMINI_API_KEY` and `GEMINI_LIVE_MODEL`.
- Inspect the visible assistant error message or the diagnostics section on
  `/remote`.

## Music-provider roadmap

This release intentionally uses Spotify only. A newer Media implementation
using SoundCloud is planned for a future release so Spotify Premium will not be
the only playback path. No SoundCloud resolver, fallback, or cross-service ID
mapping is included yet.
