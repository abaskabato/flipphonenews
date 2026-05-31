# DEAD DROP

**Leave a message buried where you stand.**

DEAD DROP is a 3D flip phone in your browser that pins anonymous messages to real-world places. Stand somewhere, flip the phone open, and read what strangers left at this exact spot. Then leave your own — for the next person who stands here, or sealed in a capsule until a future date.

> Reading is always free. **Leaving** a drop costs a buck. That's the business.

## The idea

Every place has stories no one ever told there. DEAD DROP turns a location into a mailbox:

- **Pin a note for the next stranger** — a confession, a tip, a dare, a love letter to a bench.
- **Seal a capsule for the future** — a message to your future self, an anniversary spot, a memorial — locked until a date you choose, then readable by whoever returns.

No accounts. No names. Just a green LCD, a place, and what people decided to bury there.

## How it works

```
Open the page → 3D flip phone boots → it locates you (geohash, ~1km cell)
Flip open      → read the drops buried at this spot (free)
✚ Leave a drop → type your message → choose OPEN NOW or SEAL IT → pay → it's pinned
```

- Your location is reduced to a **geohash cell** (precision 6, ~1.2km × 0.6km) and given a memorable codename like `OAK-HOLLOW`. The exact coordinates never leave the device.
- Drops live in **Vercel KV**, keyed by cell. A capsule simply stays hidden until its unlock date.
- Identity is an ephemeral random handle (`ANON·X7QF`) in `localStorage`. No signup.

## Making money

Reading is the free, viral, shareable part. The revenue is the **paid pin**:

| Drop type | Default price | Env var |
|---|---|---|
| Open now (note for the next stranger) | $1 | `DROP_PRICE_NOW_CENTS` |
| Sealed capsule (locked until a date) | $3 | `DROP_PRICE_CAPSULE_CENTS` |

Payments run through **Stripe Checkout**. The flow is: `POST /api/create-drop-session` → Stripe-hosted checkout → `POST /api/webhook` verifies payment and persists the drop to KV → it surfaces at its location.

## Demo mode (no keys required)

If Stripe / KV aren't configured, the app **degrades gracefully**: paying is skipped and drops are stored in `localStorage` so you can try the full flow locally. The 3D phone always boots regardless of backend state.

## Local development

Static front-end only (no payments, demo mode):

```bash
python3 -m http.server 8080   # then open http://localhost:8080
```

Full stack with the API routes:

```bash
npm install
npm run dev                    # vercel dev
```

### Environment variables (for the real money path)

```
STRIPE_SECRET_KEY=sk_live_or_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
KV_REST_API_URL=...            # Vercel KV / Upstash Redis
KV_REST_API_TOKEN=...
DROP_PRICE_NOW_CENTS=100       # optional, default 100
DROP_PRICE_CAPSULE_CENTS=300   # optional, default 300
```

## Controls

- **Drag** to spin the phone · **tap** the phone (or **Open / Close**) to flip
- On-screen **▲ ▼ / OK / ‹** d-pad to browse and read drops
- **✚ Leave a drop** to compose · just type when composing · **Enter** advances, **Esc** goes back

## Stack

| What | How |
|---|---|
| 3D rendering | Three.js (vendored, no CDN) |
| Screen UI | Canvas 2D drawn onto the LCD texture (retro green CRT) |
| Location | Browser Geolocation → geohash (`js/geo.js`) |
| Storage | Vercel KV (Upstash Redis), `localStorage` demo fallback |
| Payments | Stripe Checkout + webhook |
| Audio | Web Audio API (synthesized flip snap) |
| Install | PWA (`manifest.json`, fullscreen on tap) |

## Project structure

```
index.html                 entry — importmap, PWA meta, hero, controls
js/
  main.js                  Three.js scene, render loop, input + flip wiring
  phone.js                 3D clamshell model (hinge fold)
  deaddrop.js              the app — state machine: scan→list→read→compose→unlock→pay
  geo.js                   geohash + place codename
  lcd.js                   shared retro-LCD draw helpers
  faces.js                 keypad + external-screen painters
  audio.js                 synthesized flip sound
  site.js                  PWA fullscreen-on-tap
lib/
  store.js                 KV drop persistence (by geohash cell)
api/
  drops.js                 GET unlocked drops for a cell
  create-drop-session.js   POST → Stripe Checkout for one paid pin
  webhook.js               Stripe webhook → persist paid drop to KV
```
