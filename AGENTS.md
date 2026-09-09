# W6 Paris — Project & Agent Guidelines

## 1. Project Overview
W6 Paris is a luxury Parisian home fragrance house (*Maison de parfum d'intérieur*) located at 12 Rue Boulard, 75014 Paris. The website is an e-commerce platform built with pure HTML5, vanilla JavaScript, CSS3, and an Express/Node.js backend (`server.js`).

- **Repository Path**: `/Users/luciez/w6paris-website`
- **Languages**: French (`fr` — default client-facing) and English (`en` — via `js/i18n.js`)
- **Review Rating**: 5/5 stars (certified reviews)

---

## 2. Brand Identity & Aesthetic Rules
- **Luxury & Understated**: Minimalist typography, subtle borders, high-end perfumery aesthetic.
- **Strict Emoji Rule**: **Never use playful or tacky emojis** (e.g. 📦, ✨, 📍, 🔄) anywhere on the website, product pages, accordion headers, cart drawer, or automated transactional emails.
- **Consistency**: Whenever modifying text, options, or styling, ensure changes are propagated across the entire website (`index.html`, `product.html`, `shop.html`, `shipping.html`, `faq.html`, `js/i18n.js`, `js/data.js`, `data/products.json`, and `server.js`).

---

## 3. Products & Features
- **Diffuseurs à froid**:
  - **Diffuseur i6**: Precision cold nebulization, coverage up to 100 m², **connects directly to the phone via Bluetooth** for customized scheduling and intensity.
  - **Diffuseur i7**: High-end cold diffusion, coverage up to 150 m², **connects directly to the phone via Bluetooth** for tailored ambient control.
  - **Diffuseur Nomade**: Compact, one-button sleek design for spaces up to 45 m².
  - **Pack Duo**: 2 Nomade diffusers + all 7 fragrances in 10 ml included free.
- **Gift Policy**: One complimentary fragrance (choice of 7) included with every diffuser purchase.
- **Fragrances composed in Grasse**: Ambre Divine, Ébène, Ispahan, Secret Garden, Midnight, Un Jardin à Rio, Rosewood (10 ml & 100 ml).

---

## 4. Shipping & Delivery Guidelines
- **Preparation & Dispatch**: 24–48 business hours to 19 European countries.
- **Delivery Methods**: Point Relais (pickup point) and Tracked Home Delivery, or free Showroom Pickup at 12 Rue Boulard, 75014 Paris.
- **Free Delivery Policy**: Point Relais delivery is complimentary in Metropolitan France (and in Belgium, Luxembourg, and the Netherlands for fragrance orders). **Never advertise or mention the obsolete "150 €" threshold.**
- **Automatic Delivery Discounts (Option 1 - Highest single discount per cart)**:
  - **Diffuseur i6**: -10,00 € off shipping (Relais & Domicile)
  - **Diffuseur i7**: -8,00 € off shipping (Relais & Domicile)
  - **Diffuseur Nomade**: -6,00 € off shipping (Relais & Domicile)
  - **Pack Duo**: -5,00 € off shipping (Relais & Domicile)
  - **Fragrances (10 ml & 100 ml)**: -4,00 € off shipping (Relais & Domicile)
  - Minimum delivery fee is always 0,00 € (never negative). Highlighted as a clear discount at checkout.

---

## 5. Technical Architecture
- `js/data.js` and `data/products.json`: Synchronized product catalogs for client and server.
- `js/i18n.js`: Centralized translations dictionary for all bilingual site text.
- `server.js`: Express server handling Stripe checkout sessions, Resend order notification emails, Mondial Relay tracking, and API endpoints.
