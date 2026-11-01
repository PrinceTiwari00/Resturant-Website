# Kungfu Noodles — website

A conversion-focused website for **Kungfu Noodles** (江湖面馆), a Chinese noodle
shop on JP Marg, Thamel, Kathmandu.

Built to the brief in *Kungfu Noodles — Website Development Documentation*: a home page that sells
the shop, a complete menu, an ordering route that works on a phone in one hand, and a contact page
with hours, location and a map.

Static HTML, CSS and vanilla JavaScript. No framework, no build server, no tracking scripts,
no cookie banner. ~190 KB of fonts, ~10 KB of compressed CSS, ~4 KB of JS.

---

## Quick start

```bash
npm install          # only for the dev tooling (fonts, html validation, tests)
npm start            # → http://localhost:3000
```

`server.mjs` is a zero-dependency Node server: static files with brotli/gzip, ETags and sensible
cache headers, plus the `POST /api/contact` endpoint used by the enquiry form.

Prefer a plain static host? Upload the repository root to Netlify, Cloudflare Pages, GitHub Pages or
any nginx box. Everything except the contact form's direct POST works unchanged — the form detects
the missing endpoint and hands the message to WhatsApp instead (see below).

**The admin panel is the exception:** it needs a running Node process and a writable disk (see below).
On a static host it is unavailable; edit `assets/data/menu.json` and run `npm run menu` instead.

---

## Pages

| File | Purpose |
| --- | --- |
| `index.html` | Hero, signature dishes, story, reviews, ordering options, location + lazy map |
| `menu.html` | 24 items in 2 sections at the board numbers, live search, category / vegetarian / spicy filters, transcription note |
| `order.html` | The three ordering routes, delivery partners, how an order runs, FAQ |
| `contact.html` | Enquiry form, hours with a live open/closed badge, map, directions, FAQ |
| `credits.html` | Photo and font attribution (marked `noindex`) |
| `admin.html` | Private menu editor — password protected, `noindex`, never linked from the public pages |
| `404.html` | Error page |

Every page shares: a sticky header with a live order badge, a full-screen mobile menu, the order
drawer, and the footer.

### Business details now come from the live listings

The client brief, the Google Maps place page and the Tripadvisor listing were reconciled into what
the site shows:

| Detail | Value used | Source |
| --- | --- | --- |
| Rating | **4.0 · 739 reviews · 1,200 photos** | Google Maps listing |
| Second rating | **4.5 · 21 reviews** | Tripadvisor listing |
| Hours | **9:00 AM – 11:00 PM daily** | Google and Tripadvisor both say “closes 11 PM” |
| Phone | +977 985-1172950 | Google, Tripadvisor, Facebook |
| Email | manojadhikari2950@gmail.com · kungfurestaurant8@gmail.com | Facebook · Tripadvisor |
| Address | JP Marg, Thamel, Kathmandu 44600 | Google, Tripadvisor |
| Plus code | **P866+W3** | Google Maps (read to a taxi driver) |
| Coordinates | 27.7122735, 85.3102415 | Google Maps place link |
| Services | Dine-in · takeaway · table service · breakfast–dinner · vegetarian friendly · good for kids · groups | Google, Tripadvisor |
| Category | Chinese noodle restaurant | Google |
| Photos | 1,200 on Google · 42 on Tripadvisor | both listings |

Two deliberate decisions:

- **The rating is displayed with attribution and links, but is not in structured data.** Google's
  review-snippet policy does not allow third-party ratings to be marked up as `aggregateRating` on
  your own site — self-marked-up star ratings risk a manual action. If the shop later collects its
  own reviews, that markup can be added properly.
- **Hours follow the live listing, not the brief.** The brief said 9:30 AM – 10:30 PM; both live
  listings say 9 AM – 11 PM. If the brief is right, change `SCHEDULE` in `assets/js/main.js`, the
  hours lists in `index.html` / `contact.html`, and the JSON-LD in both pages.

---

## How ordering works

There is no payment gateway and no customer database — deliberately. The flow is:

1. Customer taps **+** on any dish — or “Add to order” on the home page's signature cards. A sticky
   bar slides up on mobile showing item count and total, and the cart is stored in `localStorage`, so
   it survives page changes, navigation and closing the tab.
2. They add a name, phone number and pickup/delivery choice in the drawer.
3. **Send order** builds a plain-text itemised order — board numbers, quantities, line totals,
   total, customer details, notes, and a “(price to confirm)” flag on any estimated price — and opens
   WhatsApp to **+977 985-1172950** with it pre-filled. Orders can be placed by number because the
   menu carries the board's numbering.
4. The kitchen confirms by phone or WhatsApp and the customer pays on hand-over (cash, eSewa,
   Fonepay).

Alternatives offered to the customer: a direct `tel:` call, WhatsApp, or the Nepali delivery
platforms (Foodmandu, Pathao Food). Nothing is sent to a server, so ordering works even on a static
host or flaky mobile data.

### Contact form

`assets/js/contact.js` POSTs JSON to `/api/contact`. `server.mjs` validates it, appends it to
`data/inquiries.jsonl` (git-ignored, one JSON object per line) and rate-limits to 5 messages per IP
per 10 minutes. If the endpoint is not there — static hosting, offline — the form shows a
ready-to-send WhatsApp link instead of pretending the message went through.

---

## The admin panel

The shop can add, edit, remove, reorder and photograph dishes at **`/admin`** without touching a file.
It needs the Node server — a static-only host has no API to save to.

### First run

```bash
npm run admin:passwd          # asks for a password, min 10 characters
npm start                     # then open http://localhost:3000/admin
```

That writes `data/admin.json` — a scrypt hash and a random signing secret, `chmod 600`, and
**git-ignored**. There is no default password and no recovery email: if it is lost, run the same
command again to set a new one (existing sessions stop working). Run it again any time to change the
password.

Until a password exists the API answers `503` and the panel refuses to open — it fails closed rather
than falling back to something guessable.

### What the panel does

| Action | What happens |
| --- | --- |
| **Add** | Board number must be free; price must be one already printed on the wall |
| **Edit** | Saves on submit and rebuilds `menu.html` immediately |
| **Delete** | Removes the dish from the site and `menu.json` (historically in git) |
| **Reorder** | ↑ ↓ move a dish within its section; this is also the order on the menu page |
| **Photo** | Upload a JPEG/PNG/WebP; it is re-encoded, stripped of metadata and written at 300/420/620 px |
| **Board prices** | The whitelist itself, editable — with a warning, because it is the price guard |

Every save re-runs `build-menu.mjs`, so the public page and `MENU-SOURCES.md` are never stale.

### How it is secured

- **Password** → scrypt (N=16384, r=8, p=1, 64-byte key), per-install salt, constant-time compare.
- **Sessions** → an HMAC-SHA256 signed token with a 12-hour expiry, sent as `Authorization: Bearer`.
  **No cookies at all**, which means there is no ambient credential for another site to ride and no
  CSRF surface; sign-out also revokes the token server-side.
- **Rate limit** → 8 sign-in attempts per IP per 10 minutes, then `429`.
- **Uploads** → magic-byte sniffing (a `.jpg` full of HTML is rejected with `415`), 12 MB cap, then a
  full re-encode through ImageMagick, which also strips EXIF and anything appended to the file.
- **Paths** → built from the dish id looked up in the menu document, never from the request, so
  `?id=../../etc/passwd` is simply a 404.
- **Output** → the panel writes dish text with `textContent`, so a dish named
  `<img onerror=…>` is a funny name, not script.
- **Same-origin** → mutating requests with a foreign `Origin` header are refused with `403`.

29 API tests and 16 panel tests cover this, including the forged-token, path-traversal, fake-image,
cross-origin and fail-closed cases (`scripts/admin-test.mjs`, `scripts/admin-ui-test.mjs`).

### What it does not do

- **Not multi-user.** One shared password for whoever runs the shop; no accounts, roles or audit log.
- **No HTTPS by itself.** Put it behind a TLS-terminating proxy before it faces the internet — the
  password crosses the wire once per session, and a plain-HTTP login can be read off the network.
- **No backups.** It writes to `assets/data/menu.json`; put the repo on a host with a persistent disk
  and a backup, or a redeploy will reset the menu.
- **No image cropping UI.** Photos are centre-cropped to 4:3 by the pipeline; upload a crop that is
  already close to that.

## Editing content

### Menu

All menu content lives in one file:

```
assets/data/menu.json
```

```json
{
  "no": 1,                    // number printed on the board in the shop
  "id": "kungfu-special",
  "name": "Kungfu Noodles Special",
  "cn": "江湖特色牛肉面",          // the Chinese name printed on the board
  "desc": "The bowl the shop is named for…",
  "price": 350,               // exactly the price printed on the board
  "heat": 2,                  // 0–3 flames, from the flames printed on the board
  "diet": "buff",             // veg | egg | meat | chicken | buff | pork
  "badge": "House special",   // optional
  "source": "Noodle board #01 — “Kungfu noodles-Special” 350, printed ingredients …"
}
```

#### Where the menu comes from

**There is no estimate path in this project, by design.** The shop publishes no written menu; it
prices everything on two picture boards fixed to the wall inside the door, and both are photographed
on its own listings. Every number, Chinese name, English name and price in `menu.json` is transcribed
from those photographs — 11 noodles (#01, #02, #03, #08, #09, #11, #12, #13, #14, #15, #16) and 13
cold sides (#20–#28, #31, #32, #34, #36).

| Source | What it established |
| --- | --- |
| The shop's own noodle board (Nosh Nepal listing, menu photo 1) | Numbers, Chinese names, printed ingredients and prices for the noodle run |
| The shop's own cold-counter board (Nosh Nepal listing, menu photo 2) | The same for the sides, and the Rs 150 / Rs 240 price split |
| Google Maps reviews and review topics | Confirms #1, #8, #11, #14, #15, #16, fried egg, peanuts, cucumber, tripe, pork ears, buff tongue |
| Tripadvisor listing and photo captions | Chinese dish names on the board: 三鲜蔬菜面, 凉拌猪头肉, 盐水花生, 番茄鸡蛋面, 卤肉牛肉面, 凉拌牛舌 |
| *Sincerely from China* feature (myRepublica) | Handmade noodles, ingredients imported from China, pork paws and buff tongue among the sides |

A reviewer's or a feature's price is never used to set a menu price — only the board is. The
report showing one row per board tile is generated to **`MENU-SOURCES.md`**; a smoke test asserts that
no item carries a price outside the set printed on the boards (100, 150, 240, 320, 350) and that every
item has a transcription in its `source`.

Numbers the photographs do not clearly show are **omitted rather than guessed** — the wall carries more
than is listed here. To fill the gaps, photograph each board straight on with no glare and add the rows.

#### Changing the menu — add, update or delete a dish

Two ways: use the **[admin panel](#the-admin-panel)** at `/admin` (no file editing), or edit
`assets/data/menu.json` directly as below. Both go through the same validator.

Everything is driven by `assets/data/menu.json`. Edit it, then run two commands:

```bash
npm run menu     # rebuilds menu.html + the Menu JSON-LD + MENU-SOURCES.md
npm run check    # verifies the result (includes the menu guard)
```

That is the whole loop. Nothing else on the site needs touching, and `npm run menu` is safe to run
as often as you like — it only rewrites the blocks between the `build:menu-*` markers.

**Add a dish.** Copy an existing block inside the category's `items` array and change the fields.
`no` must be the number printed on the board, and `price` must be one of the prices listed in
`meta.boardPrices`:

```json
{
  "no": 5,
  "id": "example-dish",
  "name": "Name exactly as printed in English on the board",
  "cn": "菜的中文名字",
  "desc": "One or two lines, built from the ingredients printed under the name.",
  "price": 320,
  "heat": 1,
  "diet": "buff",
  "source": "Noodle board #05 — «printed English name» 320, printed ingredients «…»"
}
```

`price` must already be in `meta.boardPrices` (100, 150, 240, 320, 350 today). If the board genuinely
prints a price that is not in that list, add the number to `meta.boardPrices` first — the guard exists
so a typo cannot become a real price on the page.

> **Watch the older photographs.** There is more than one picture of the same wall in circulation, and
> the prices on it have gone up: an older Tripadvisor photo shows #06 at 290 and the vegetable noodles
> at 280, while the straight-on Nosh Nepal board shows the same dishes at 320. **The site uses the
> higher, newer board.** When you add a row, use the newest photograph you have and say which one in
> `source`.

**Update a dish or a price.** Change the field in place and re-run the two commands. If you change a
price, `npm run menu` rewrites the menu page, and `npm run check` will also catch the hand-written
"add to order" buttons on the home page, which carry their own `data-price` — it names the file and
the stale number so you can fix it.

**Delete a dish.** Remove the object from the JSON and run the two commands. If you forget the
rebuild, the guard fails with `"x" is on the page but no longer in menu.json — it was deleted; run
"npm run menu"`. If the dish is also featured on the home page, it fails with
`index.html: "add to order" button for "x", which is not in menu.json any more` — delete or repoint
that card too.

**A new price on the board.** Prices are whitelisted on purpose, so a typo (`32` for `320`) cannot go
live. When the shop genuinely changes a price, photograph the board, then add the new number to
`meta.boardPrices` and use it on the item.

#### What the guard refuses

`node scripts/menu-check.mjs` (part of `npm run check`) is the safety net. It fails on:

- a price that is not in `meta.boardPrices` — nothing goes live that isn't read off the wall;
- a missing `cn` (Chinese name), `source`, `desc`, `diet` or `heat`;
- a `source` that doesn't quote the board number it was transcribed from;
- duplicate ids or duplicate board numbers;
- the menu page and the JSON disagreeing in either direction (added-but-not-built,
  deleted-but-still-listed).

Prices, ids and the board numbers are the parts a visitor sees and pays, so they get the strictest
checks.

The generated HTML is real markup inside `menu.html`, so the menu is crawlable, indexable and
readable without JavaScript. Client-side search and filters only layer on top of it.

### Prices, hours and details

- Hours: `SCHEDULE` in `assets/js/main.js` (drives the live open/closed badge) **and** the hours
  lists in `index.html` / `contact.html`, **and** `openingHoursSpecification` in the JSON-LD.
- Phone / WhatsApp / email: search for `9851172950` and `manojadhikari2950` across the HTML.
- Address and coordinates: `JP Marg`, `27.7122735`, `85.3102415`.
- Delivery partners: links in `order.html#partners`.

### Photography

Source art lives in `assets/img/raw/` (`.jpg`, `.jpeg` or `.png`, any size). The pipeline crops and
writes responsive WebP + JPEG derivatives:

```bash
npm run assets        # requires ImageMagick (`convert`) on the PATH
```

| Source | Output |
| --- | --- |
| `raw/hero` | `hero-{760,1080,1440}`, `hero-portrait-{420,640,900}`, `og-1200.jpg` |
| `raw/shopfront`, `raw/story` | `shopfront-*`, `story-*` (4:5 and 4:3 crops) |
| `raw/dish-beijing`, `raw/dish-cold-sides` | `dish-*-{300,420,620}` |
| `raw/board-noodles`, `raw/board-sides` | `board-*-{420,620}` — the menu boards, shown on `credits.html#menu` |
| `raw/order-bg` | `order-bg-{800,1200,1920}` |

Replace a source file, re-run `npm run assets`, done — the `srcset` descriptors in the HTML match.

**Every photograph on the site is a real photograph of the shop**, published by it or by customers on
its Google Maps, Tripadvisor and Nosh Nepal listings. There is no stock photography and no generated
imagery anywhere in the project, and `credits.html` says so on the page.

---

## Quality checks

```bash
npm run check     # html-validate + JS syntax + internal links/anchors/assets + menu data guard
npm test          # jsdom + API tests: filters, search, cart maths, admin auth/CRUD/uploads
```

`npm test` loads the real HTML files in jsdom and runs the real scripts, then exercises the paths a
customer takes — filtering the menu, adding dishes, switching to delivery, submitting an invalid
order, and a full WhatsApp hand-off with line items and totals.

---

## Deployment notes

- **Canonical domain.** `https://kungfunoodles.com.np` is used in `<link rel="canonical">`, Open
  Graph tags, `sitemap.xml` and JSON-LD. Replace it everywhere if the site lands elsewhere:

  ```bash
  grep -rl "kungfunoodles.com.np" --include="*.html" --include="*.xml" --include="*.txt" . \
    | xargs sed -i 's#https://kungfunoodles.com.np#https://YOUR-DOMAIN#g'
  ```

- **Caching.** `/assets/*` is served with a one-week cache; HTML is `no-cache`. Bump a query string
  or rename the file when you swap an image in place.
- **Redirects.** `server.mjs` resolves `/menu` → `menu.html`. On nginx, add
  `try_files $uri $uri.html $uri/ =404;`.
- **Trailing-slash hosting.** Check that `/` serves `index.html` (both Netlify and Cloudflare do).

---

## What came from where

Every fact on the site traces to a source: the shop's two menu boards (all dish numbers, Chinese
names and prices), the [Google Maps place page](https://www.google.com/maps/place/Kungfu+Noodles/@27.7122735,85.3102415,17z)
(4.0 · 739 reviews · plus code · hours · service options · review text), the [Tripadvisor listing](https://www.tripadvisor.com/Restaurant_Review-g293890-d13462947)
(4.5 · 21 reviews · second email · Chinese dish names in photo captions), the Nosh Nepal listing
(Rs 500 average spend, 9 AM–11 PM, Delivery / Takeaway / Family-friendly tags) and the myRepublica
feature on the shop.

Where a fact could not be sourced it was **removed rather than invented** — that includes payment
methods, delivery fees and radii, takeaway timings, table booking policy and any claim about who
cooks what. `MENU-SOURCES.md` is generated from `menu.json` and lists the transcription for every
item.

## Accessibility & performance

- Semantic landmarks, one `h1` per page, skip link, visible focus rings, 48 px tap targets.
- The drawer and mobile menu are real dialogs: focus is moved in, trapped, restored on close, and
  `inert` is toggled so closed panels are unreachable.
- Every interactive control has an accessible name; heat levels and diet markers expose text
  alternatives; `prefers-reduced-motion` disables the hero drift, the marquee and reveal animations.
- Filters and search update live without a reload; results are announced via a live-region summary.
- Google Maps is **not** loaded until the visitor taps “Load the map”.
- Images are responsive WebP with JPEG fallbacks, width/height set to avoid layout shift, and
  everything below the fold is lazy-loaded.

---

## Project layout

```
assets/
  css/styles.css         design system + all components (one file, sectioned)
  data/menu.json         single source of truth for the menu
  fonts/                 self-hosted Fraunces + Manrope subsets (OFL)
  img/                   generated responsive images (+ raw/ source art)
  js/
    main.js              header, mobile nav, reveals, live hours, lazy map
    menu.js              search + filter layer over the static menu
    order.js             cart, drawer, validation, WhatsApp hand-off
    contact.js           enquiry form with API → WhatsApp fallback
    admin.js             the /admin panel
scripts/
  build-assets.mjs       ImageMagick pipeline
  build-menu.mjs         menu.json → menu.html markup + JSON-LD + MENU-SOURCES.md
  check-links.mjs        link / anchor / asset checker
  menu-check.mjs         menu data guard: board prices, required fields, page sync
  admin-passwd.mjs       set / replace the admin password
  admin-test.mjs         admin API tests (auth, CRUD, uploads, traversal)
  admin-ui-test.mjs      admin panel tests in jsdom (incl. XSS-in-dish-name)
  lib/auth.mjs           scrypt password + signed session tokens
  lib/menu-validate.mjs  the one validator, shared by the CLI and the API
  smoke-test.mjs         jsdom behaviour tests
server.mjs               static server + /api/contact
```

---

## Before launch — checklist

- [ ] Photograph both boards straight on, no glare, and add the numbers the current photos cut off:
      noodles #04–#07, #10, #17–#19 and the cold counter #29, #30, #33, #35, #37.
- [ ] Add the fridge drinks, with board prices, if the shop wants them orderable.
- [ ] Run `npm run admin:passwd` on the live server and give the password to the owner only.
- [ ] Serve the site over HTTPS before the admin panel goes public, and make sure the host keeps
      `assets/data/menu.json` and `assets/img/raw/` on a persistent disk with backups.
- [ ] Confirm the hours: the site now says 9 AM – 11 PM to match the live Google/Tripadvisor listings,
      which contradicts the brief's 10:30 PM close. Update `SCHEDULE`
      in `main.js`, the two hours lists in the HTML, and the JSON-LD.
- [ ] Ask the shop for its delivery fee and radius, and which payment methods it takes — both were
      removed from the site rather than guessed at, and can go back the moment they are known.
- [ ] Check the review quotations: the three on the home page are real Google reviews (Sudish
      Shrestha, Sushma Shrestha, Prozwal Manandhar) shown with names and relative dates — confirm the
      shop is happy to display them, and refresh them as new reviews come in.
- [ ] Verify the Google/Tripadvisor rating figures before launch (4.0 / 739 and 4.5 / 21 at time of
      writing) and update the `index.html` hero, the reviews footer and the contact page.
- [ ] Set the canonical domain (see Deployment notes) and add `sitemap.xml` to Google Search
      Console, then create/claim the Google Business Profile.
- [ ] Decide where enquiries should land: `data/inquiries.jsonl` on the server, or forward it to
      email/WhatsApp with a small integration.

## Credits

Photography: the shop's own, from its Google Maps, Tripadvisor and Nosh Nepal listings — credited on
`credits.html`. Typefaces: **Fraunces** (Undercase Type) and
**Manrope** (Mikhail Sharanda), both under the SIL Open Font License — the license text ships in
`assets/fonts/OFL.txt`. Details also on `credits.html`.
