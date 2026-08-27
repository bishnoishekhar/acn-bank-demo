// ─────────────────────────────────────────────────────────────────────────────
//  ACN Bank card art — filenames served from /public/images.
//
//  Vite sets BASE_URL to the configured base (e.g. /acn-bank-demo/ in prod,
//  / in plain dev). Prefixing with it ensures the path resolves in both.
//
//  Keys are the card_id values from src/data/cardCatalog.js, which are the
//  same productId strings the CES credit-card tools emit in widget payloads.
//  Consumers: CardsSection (landing grid) and CardWidgets (chat carousel /
//  comparison).
// ─────────────────────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL;
const img = (name) => `${BASE}images/${name}`;

export const CARD_IMAGES = {
  'acn-infinite-travel-visa':     img('image 1.png'),
  'acn-travel-rewards-visa':      img('image 2.png'),
  'acn-cash-back-mastercard':     img('image 3.png'),
  'acn-everyday-cash-mastercard': img('image 4.png'),
  'acn-low-rate-visa':            img('image 5.png'),
  'acn-starter-visa':             img('image 6.png'),
};

export function cardImageFor(productId) {
  return CARD_IMAGES[productId] || null;
}
