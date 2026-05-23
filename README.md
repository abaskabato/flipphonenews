# FlipPhoneNews

An interactive **3D WebGL flip phone** that streams the day's top tech headlines on
its tiny green LCD — with a **self-serve, auto-pilot sponsorship billboard** on the
lid. Drag to rotate, tap to flip it open/closed (with a synthesized clamshell snap),
and watch live Hacker News scroll by.

Four moving parts:

1. **Interactive 3D phone** — Three.js clamshell with metallic materials, real
   hinge fold, OrbitControls drag/zoom, open/close animation + Web Audio "snap".
2. **Zero-work news feed** — pulls the top stories from the public Hacker News API
   (client-side, refreshes every 10 min) and renders them as a scrolling CRT-green
   `CanvasTexture` on the inner screen.
3. **Sponsor billboard** — the lid's external panel is a swappable texture driven by
   the active sponsor.
4. **Self-serve Stripe checkout** — `/sponsor` lets an advertiser buy a slot; on a
   successful payment a Stripe webhook activates their logo automatically. No emails,
   no invoices.

## Layout

```
index.html            3D phone page
sponsor.html          self-serve advertiser checkout page
style.css             page chrome for index.html
js/
  main.js             scene, lighting, controls, render loop, wiring
  phone.js            builds the clamshell model (hinge fold geometry)
  news.js             Hacker News fetch + scrolling LCD canvas
  faces.js            keypad + external clock canvas painters
  sponsor.js          loads the active sponsor, swaps the billboard texture
  audio.js            synthesized flip sound (Web Audio, no asset files)
vendor/               pinned Three.js + addons (no CDN dependency)
data/sponsor.json     default/fallback sponsor record (committed)
api/
  sponsor.js                    GET active sponsor (KV-backed)
  create-checkout-session.js    POST -> Stripe Checkout Session
  webhook.js                    Stripe webhook -> activates sponsor in KV
lib/store.js          KV persistence (Vercel KV / Upstash)
vercel.json           function + caching config
```

The front-end always reads `GET /api/sponsor`. If that's unavailable (e.g. pure
static hosting) it falls back to `data/sponsor.json`, then to a built-in
"YOUR BRAND HERE" placeholder — so the page never breaks.

## Local development

Static front-end only (no payments):

```bash
python3 -m http.server 8123   # then open http://localhost:8123
```

Full stack incl. serverless functions:

```bash
npm install
npm i -g vercel
vercel dev                     # serves the site + /api/* functions
```

## Deploy (Vercel)

1. Push to GitHub and import the repo in Vercel (zero-config: static root + `api/`).
2. Add a **Vercel KV** store (Storage tab) — it auto-injects `KV_REST_API_URL` and
   `KV_REST_API_TOKEN`.
3. Set environment variables:

   | Variable | Required | Notes |
   |---|---|---|
   | `STRIPE_SECRET_KEY` | yes | `sk_live_…` / `sk_test_…` |
   | `STRIPE_WEBHOOK_SECRET` | yes | `whsec_…` from the webhook endpoint (step 4) |
   | `KV_REST_API_URL` / `KV_REST_API_TOKEN` | yes | auto-set by Vercel KV |
   | `SPONSOR_PRICE_CENTS` | no | slot price in cents (default `4900` = $49) |
   | `SPONSOR_SLOT_DAYS` | no | slot length in days (default `7`) |

4. In the Stripe Dashboard → **Developers → Webhooks**, add an endpoint:
   `https://<your-domain>/api/webhook`, listening for **`checkout.session.completed`**.
   Copy its signing secret into `STRIPE_WEBHOOK_SECRET` and redeploy.

## How a sponsorship goes live

```
/sponsor form ──POST──▶ /api/create-checkout-session ──▶ Stripe Checkout
                                                              │ (card succeeds)
                                                              ▼
sponsor.json texture ◀── /api/sponsor ◀── KV ◀── /api/webhook (verifies signature,
                                                  writes record with TTL = slot length)
```

The record auto-expires after the slot ends (Redis TTL), reverting the billboard to
the open placeholder with no manual cleanup.

## Notes & extension points

- **Logos** are supplied as a public image **URL** with CORS enabled (loaded straight
  into a WebGL texture). To accept file *uploads* instead, add
  [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) and store the resulting
  URL in the checkout metadata.
- The Stripe webhook needs the **raw request body**; `api/webhook.js` disables body
  parsing and buffers the stream itself. Test locally with
  `stripe listen --forward-to localhost:3000/api/webhook`.
- Headline source is swappable — `fetchHeadlines()` in `js/news.js` is the only place
  that knows about Hacker News.
