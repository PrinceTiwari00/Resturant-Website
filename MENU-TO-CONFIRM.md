# Menu items to confirm with the kitchen

Generated from `assets/data/menu.json` on 2026-11-01.

`confirmed: false` (or a manually flagged estimate) renders with an **est.** marker on the site and
counts towards the draft banner on the menu page. Flip the flag to `true` once the price is right,
then run `npm run menu` — the banner disappears when every item is confirmed.

**23 of 33 items still to confirm.**

| # | Item | Category | Listed price | Why it needs confirming |
| --- | --- | --- | --- | --- |
| — | Tomato & Egg Noodles | Noodles | Rs 280 | Photo caption 番茄鸡蛋面 on the Tripadvisor listing; Google review topic “egg and tomato noodle soup”. Price estimated. |
| — | Braised Pork & Beef Noodles | Noodles | Rs 350 | Photo caption 卤肉牛肉面 on the Tripadvisor listing. Price estimated. |
| — | Three Fresh Vegetable Noodles | Noodles | Rs 280 | Photo caption 三鲜蔬菜面 “vegetable noodles” on the Tripadvisor listing. Price estimated. |
| — | Kung Pao Chicken Noodles | Noodles | Rs 320 | Named by a Tripadvisor reviewer (“kung poa noodles”). Number and price to confirm. |
| — | Dan Dan Noodles | Noodles | Rs 320 | Japanese Tripadvisor reviewer notes タンタンメン (tan tan men) on the menu. Price to confirm. |
| — | Zhajiang Noodles | Noodles | Rs 320 | Japanese Tripadvisor reviewer notes ジャージャー面 on the menu. Price to confirm. |
| — | Chicken Noodles | Noodles | Rs 300 | Ordered by a Tripadvisor reviewer (“chicken noodles”). Number and price to confirm. |
| — | Sichuan Style Buff Tongue | Cold Counter & Sides | Rs 250 | Photo caption 凉拌牛舌 “Sichuan style buff tone” on Tripadvisor; myRepublica lists buff tongue. Price estimated. |
| — | Pork Head Meat in Chilli Oil | Cold Counter & Sides | Rs 220 | Photo caption 凉拌猪头肉 on the Tripadvisor listing. Price estimated. |
| — | Pig's Ears | Cold Counter & Sides | Rs 200 | Repeated Tripadvisor and Google reviews. Price estimated — to confirm. |
| — | Tripe | Cold Counter & Sides | Rs 200 | Google review “side dishes like peanuts, cucumbers and tripe”. Price estimated. |
| — | Chicken Feet | Cold Counter & Sides | Rs 200 | Tripadvisor review “there are chicken feet, pig's ears, tripe…”. Price estimated. |
| — | Pork Paws | Cold Counter & Sides | Rs 280 | myRepublica feature (“not so typical pork paws”). Price estimated. |
| — | Preserved Egg | Cold Counter & Sides | Rs 150 | Client brief: “Preserved Egg / Buff Salad — traditional Chinese side dishes and cold salads”. Price estimated. |
| — | Salted Egg | Cold Counter & Sides | Rs 100 | Tripadvisor review “salted egg also delicious”. Price estimated. |
| — | Buff Salad | Cold Counter & Sides | Rs 250 | Client brief lists Buff Salad; Google review topic “buff salad” (7 mentions). Price estimated. |
| — | Salted Peanuts | Cold Counter & Sides | Rs 100 | Photo caption 盐水花生 on the Tripadvisor listing; Google review mentions peanuts. Price estimated. |
| — | Fried Egg | Cold Counter & Sides | Rs 80 | myRepublica feature (“typical fried eggs”). Price estimated. |
| — | Fresh Fruit Juice | Drinks | Rs 180 | Tripadvisor review (pineapple, papaya, mango juices). Price estimated. |
| — | Honey Lemon Tea | Drinks | Rs 150 | Tripadvisor review “1 honey lemon tea”. Price estimated. |
| — | Chinese Green Tea | Drinks | Rs 120 | Common to the shop's drinks list; price to confirm. |
| — | Soft Drinks | Drinks | Rs 100 | Standard bottled drinks; price to confirm. |
| — | Mineral Water | Drinks | Rs 60 | Standard; price to confirm. |

## Everything else on the site that needs a human check

- **Numbers.** Only #1, #3, #8, #11, #14 and #16 are confirmed from public sources. The board prints
  numbers up to at least #16 and lists about 15 noodle dishes — add the rest (#2, #4–#7, #9, #10,
  #12, #13, #15).
- **Side dishes.** The shop lists about 20 sides; 13 are transcribed here. Photograph the side-dish
  board and add the rest.
- **Prices.** Confirmed in public sources: Kungfu Special Rs 380 (2022), Buff Sichuan Rs 320, Sesame
  Wuhan Rs 320, Spicy Chicken Rs 240, Special Chinese Dry Noodles Rs 350, Agaric/Cucumber Rs 150 each,
  canned tea Rs 250. Everything else is an educated estimate and is marked *est.* on the site.
- **Hours.** The site now uses the live listings — Google and Tripadvisor both say 9:00 AM – 11:00 PM
  daily. The client brief said 9:30 AM – 10:30 PM, so please confirm which is right; change `SCHEDULE`
  in `assets/js/main.js`, the hours lists in `index.html` and `contact.html`, and the JSON-LD.
- **Rating.** Shown as 4.0 from 739 Google reviews (and 4.5 from 21 Tripadvisor reviews), attributed
  with links. It is deliberately **not** in the structured data as `aggregateRating`: Google's policy
  does not allow third-party review counts to be marked up on your own site. If you collect reviews
  yourselves, that can be added.
- **Recipes/allergens.** The description text is written from reviews and photo captions, not from the
  kitchen — read it before it goes live.
