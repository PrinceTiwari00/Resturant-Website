# Kungfu Noodles — website

A conversion-focused website for **Kungfu Noodles** (江湖面馆), a hand-pulled Chinese noodle
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

---

## Pages

| File | Purpose |
| --- | --- |
| `index.html` | Hero, signature dishes, story, reviews, ordering options, location + lazy map |
| `menu.html` | 28 items in 3 sections, numbered like the board, live search, category / vegetarian / spicy filters, draft banner |
| `order.html` | The three ordering routes, delivery partners, how an order runs, FAQ |
| `contact.html` | Enquiry form, hours with a live open/closed badge, map, directions, FAQ |
| `credits.html` | Photo and font attribution (marked `noindex`) |
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

## Editing content

### Menu

All menu content lives in one file:

```
assets/data/menu.json
```

```json
{
  "no": 1,                    // number printed on the board in the shop (null if unnumbered)
  "id": "kungfu-special",
  "name": "Kungfu Noodle Special",
  "desc": "Rich, spicy broth, chewy noodles, choice of chicken or buff.",
  "price": 380,
  "heat": 2,                  // 0–3 flames
  "diet": "choice",           // veg | chicken | buff | pork | choice
  "confirmed": true,          // false → renders with an "est." marker
  "badge": "Bestseller",      // optional
  "source": "where this came from — printed in MENU-TO-CONFIRM.md"
}
```

#### Where the menu came from

The shop's real menu is a numbered board — about **15 noodle bowls and 20 cold sides**. The site
transcribes it rather than inventing dishes:

| Source | What it established |
| --- | --- |
| The client brief (PDF) | 4 items: Special Kungfu Noodles, Sichuan Style, Wuhan Style, Preserved Egg / Buff Salad |
| *Sincerely from China* feature (myRepublica) | 15 noodles + 20 sides; pork paws, buff tongue, fried eggs, seasoned cucumbers |
| Karl Rock's Kathmandu cheap-eats guide | Board numbering (#1, #3, #14) and prices: Buff Sichuan Rs 320, Sesame Wuhan Rs 320, Spicy Chicken Rs 240, Kungfu Special Rs 350 |
| Tripadvisor reviews | Kungfu Special Rs 380, Special Chinese Dry Noodles Rs 350, agaric + cucumber Rs 150 each, and the numbers #8, #11, #16 |
| Google Maps reviews/photos | Fresh juices, canned tea Rs 250, super spicy chicken; 4.0 from 739 reviews; review topics naming Special Kungfu Noodles, wuhan style noodles, buff salad, egg & tomato noodle soup, buffalo tongue |
| Tripadvisor photo captions | Chinese dish names straight off the shop's own board: 三鲜蔬菜面, 凉拌猪头肉, 盐水花生, 番茄鸡蛋面, 卤肉牛肉面, 凉拌牛舌 |

**Nothing on the site is presented as certain when it isn't.** Every item carries `confirmed`:

- `true` → price shown plainly.
- `false` → price shown with a dashed **est.** marker, and the menu page displays a draft banner
  counting how many are unconfirmed.

`npm run menu` also writes **`MENU-TO-CONFIRM.md`**, the owner's checklist: every unconfirmed item,
its listed price, and why it needs checking. Flip `confirmed` to `true` as you verify prices — when
the last one is confirmed the banner disappears on its own. No code change needed.

Items still to confirm: the six noodles without board numbers (Kung Pao, Dan Dan, Zhajiang,
Vegetable, Chicken, Special Chinese Dry), their prices, three drinks, and the numbers/prices of
sides beyond the eleven transcribed.

After editing, regenerate the static markup + `Menu` JSON-LD:

```bash
npm run menu
```

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
| `raw/hero` | `hero-{760,1080,1440,1920}`, `hero-portrait-{420,640,900}`, `og-1200.jpg` |
| `raw/dish-*` | `dish-*-{300,420,620,900}` |
| `raw/interior` | `interior-{420,620,900}` (4:5 crop) |
| `raw/order-bg` | `order-bg-{800,1200,1920}` |

Replace a source file, re-run `npm run assets`, done — the `srcset` descriptors already match. The
current photography is AI-generated placeholder art direction; swap in the restaurant's own photos
before launch.

---

## Quality checks

```bash
npm run check     # html-validate + JS syntax + internal links, anchors, assets, menu sync
npm test          # jsdom behaviour tests: filters, search, cart maths, validation, hand-off
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

Every fact on the site traces to a source: the client PDF, the [Google Maps place page](https://www.google.com/maps/place/Kungfu+Noodles/@27.7122735,85.3102415,17z)
(4.0 · 739 reviews, plus code, hours, service options), the [Tripadvisor listing](https://www.tripadvisor.com/Restaurant_Review-g293890-d13462947)
(rating, second email, Chinese dish names in photo captions), the myRepublica feature on the shop,
and Karl Rock's Kathmandu guide (board numbering and prices). `MENU-TO-CONFIRM.md` lists exactly
what is still unverified and why — nothing is presented as certain when it isn't.

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
scripts/
  build-assets.mjs       ImageMagick pipeline
  build-menu.mjs         menu.json → menu.html markup + JSON-LD
  check-links.mjs        link / anchor / asset / menu-sync checker
  smoke-test.mjs         jsdom behaviour tests
server.mjs               static server + /api/contact
```

---

## Before launch — checklist

- [ ] Replace the AI-generated photography with the shop's own photos.
- [ ] Work through `MENU-TO-CONFIRM.md`: confirm each price and number, set `confirmed: true`, run
      `npm run menu`. Add the missing noodle numbers (#2, #4–#7, #9, #10, #12, #13, #15) and the
      remaining cold sides.
- [ ] Confirm the hours: the site now says 9 AM – 11 PM to match the live Google/Tripadvisor listings,
      which contradicts the brief's 10:30 PM close. Update `SCHEDULE`
      in `main.js`, the two hours lists in the HTML, and the JSON-LD.
- [ ] Point the delivery-partner buttons at the restaurant's actual listing pages.
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

Food photography: AI-generated placeholder art. Typefaces: **Fraunces** (Undercase Type) and
**Manrope** (Mikhail Sharanda), both under the SIL Open Font License — the license text ships in
`assets/fonts/OFL.txt`. Details also on `credits.html`.
