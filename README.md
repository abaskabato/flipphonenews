# FlipPhone

**A basic digital flip phone for the world — open source, available everywhere the internet reaches.**

No accounts. No phone numbers. No central servers. Just a 3D flip phone that runs on the open web.

## Mission

Billions of people have a phone in their pocket but no access to private, simple communication. FlipPhone is an open source project that puts a basic digital flip phone in any browser — location-based chat, ephemeral keys, zero tracking. Works on anything with a screen and an internet connection.

## Current feature

- **Nostr Chat** — location-based chat powered by the Nostr protocol. The phone geolocates you, derives a geohash, and drops you into a local channel. Messages are public, relayed through three redundant relays, and rendered on the phone's retro LCD screen. Your key is ephemeral (stored in localStorage). No signup, no account.

## How it works

```
You open the page → 3D flip phone boots → phone locates you → joins local Nostr channel
You type on the phone screen → Enter sends → flip closed = hang up (sends your draft)
```

- Three relays: `wss://relay.damus.io`, `wss://nos.lol`, `wss://relay.nostr.band`
- nostr-tools loaded dynamically from CDN (phone always boots even if CDN is down)
- 5-char geohash precision (city-level), encoded as `#t` tag
- 280-character messages

## Usage

Open `index.html` in any browser. Tap the phone to flip it open. Type to chat. Drag to spin the phone. That's it.

For the best mobile experience: add to home screen (PWA) — it opens without browser chrome and feels like a real app.

## Stack

| What | How |
|---|---|
| 3D rendering | Three.js (vendored, no CDN) |
| Chat protocol | Nostr (`nostr-tools` via esm.sh CDN) |
| Key storage | localStorage (ephemeral) |
| Geolocation | Browser Geolocation API |
| Fullscreen | `requestFullscreen()` + PWA standalone |
| Layout | Static HTML + CSS |

## Local development

```bash
python3 -m http.server 8080   # then open http://localhost:8080
```

No build step. No API keys. Open the folder and serve it.

## Project structure

```
index.html          entry — importmap, PWA meta, hero, 3D scene
js/
  main.js           Three.js scene, render loop, keyboard/input wiring
  phone.js          3D clamshell model (hinge fold)
  nostr-chat.js     Nostr chat client — geohash, relays, canvas rendering
  lcd.js            shared retro-LCD draw helpers (CRT scanlines, etc.)
  faces.js          keypad + external screen canvas painters
  sponsor.js        sponsor billboard texture loader
  audio.js          synthesized flip sound (Web Audio)
  site.js           fullscreen-on-tap, mobile address bar collapse
style.css           layout, hero, controls
manifest.json       PWA manifest
icon.svg            PWA icon / favicon
vendor/             pinned Three.js + addons
```

## Deploy

Push to any static host (Vercel, Netlify, GitHub Pages, your own server). No server-side dependencies. The API endpoints from previous iterations (`api/`) are orphaned but harmless.

## License

Open source.
