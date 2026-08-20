// ─────────────────────────────────────────────────────────────────────────────
//  ACN Bank — Firebase / Firestore client
//  Used by: AuthContext (sign-in), ChatPanel (@ contacts, card catalog)
//
//  Config is loaded from environment variables (VITE_FIREBASE_*).
//  Local dev:  copy .env.example → .env.local and fill in values.
//  CI/CD:      set the same keys as GitHub Secrets (see .github/workflows/deploy.yml).
//
//  Firestore layout (database: acn-bank-fs-db) — verified against live data:
//    customers/{customerId}
//      ├─ legal_name, preferred_name, registered_mobile, email,
//      │  global_status, preferred_language, kyc_expires_at, username
//      ├─ security/profile      → mobile_pin, security_questions, sin_last_four
//      ├─ financials/profile    → credit_score_value/band, annual_income,
//      │                          spending_persona, pre_approved_offers[]
//      └─ accounts/ cards/ beneficiaries/ bills/ transactions/
//    config/trust_config        → step-up auth thresholds
//    config/{OFFER_*}           → pre-approved offer detail
// ─────────────────────────────────────────────────────────────────────────────
import { initializeApp }        from 'firebase/app';
import { getFirestore,
         collection,
         doc,
         query,
         where,
         getDoc,
         getDocs,
         limit }                from 'firebase/firestore';
import { getAuth,
         signInAnonymously }    from 'firebase/auth';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app, 'acn-bank-fs-db');   // named DB (not default)
const auth = getAuth(app);

// ── Anonymous sign-in ────────────────────────────────────────────────────────
// Gives the frontend a valid Firebase Auth token so Firestore security rules
// can allow reading public customer profile fields (username, display_name).
let _anonAuthPromise = null;
export function ensureAnonAuth() {
  if (!_anonAuthPromise) {
    _anonAuthPromise = signInAnonymously(auth).catch((err) => {
      console.warn('[Firebase] Anonymous sign-in failed:', err.message);
      _anonAuthPromise = null; // allow retry
    });
  }
  return _anonAuthPromise;
}

// ── Contacts loader ──────────────────────────────────────────────────────────
/**
 * Fetches all ACN Bank customers that have a `username` field set,
 * excluding the currently signed-in customer (by customerId).
 *
 * Each returned contact:
 *   { customer_id, display_name, username, avatar_initials }
 */
export async function fetchP2PContacts(currentCustomerId = null) {
  try {
    await ensureAnonAuth();
    const customersRef = collection(db, 'customers');
    const q = query(
      customersRef,
      where('username', '!=', ''),
      limit(20),
    );
    const snap = await getDocs(q);
    const contacts = [];
    snap.forEach((doc) => {
      const data = doc.data();
      if (currentCustomerId && doc.id === currentCustomerId) return;
      if (!data.username) return;
      const name     = data.display_name || 'ACN Bank Customer';
      const initials = name
        .split(' ')
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? '')
        .join('');
      contacts.push({
        customer_id:     doc.id,
        display_name:    name,
        username:        data.username.startsWith('@') ? data.username : `@${data.username}`,
        avatar_initials: initials || '?',
      });
    });
    return contacts;
  } catch (err) {
    console.warn('[Firebase] fetchP2PContacts failed:', err.message);
    return [];
  }
}

// ── Sign-in ──────────────────────────────────────────────────────────────────
// Last 10 digits are the comparison key. Stored numbers are E.164 with a +1
// country code ("+12269274374"); users type them in any format they like.
const last10 = (v) => String(v ?? '').replace(/\D/g, '').slice(-10);

/**
 * Verifies a customer by registered mobile + mobile PIN against Firestore.
 *
 * The customers collection is small (demo scale), so we scan and compare on
 * normalised digits rather than requiring callers to pre-format to the exact
 * E.164 string a `where` clause would need.
 *
 * Only customers with a `security/profile` document can sign in — the others
 * exist purely as P2P transfer contacts.
 *
 * Returns { ok: true, customer } or { ok: false, reason }.
 *   reason: 'unknown_phone' | 'no_credentials' | 'bad_pin' | 'error'
 */
export async function authenticateCustomer(phone, pin) {
  const phoneKey = last10(phone);
  const pinKey   = String(pin ?? '').replace(/\D/g, '');
  if (phoneKey.length !== 10 || !pinKey) return { ok: false, reason: 'unknown_phone' };

  try {
    await ensureAnonAuth();
    const snap  = await getDocs(query(collection(db, 'customers'), limit(50)));
    const match = snap.docs.find((d) => last10(d.data().registered_mobile) === phoneKey);
    if (!match) return { ok: false, reason: 'unknown_phone' };

    const securitySnap = await getDoc(doc(db, 'customers', match.id, 'security', 'profile'));
    if (!securitySnap.exists()) return { ok: false, reason: 'no_credentials' };

    const storedPin = String(securitySnap.data().mobile_pin ?? '').replace(/\D/g, '');
    if (!storedPin) return { ok: false, reason: 'no_credentials' };
    if (storedPin !== pinKey) return { ok: false, reason: 'bad_pin' };

    const c = match.data();
    // financials is optional — a customer can authenticate without it.
    let financials = {};
    try {
      const f = await getDoc(doc(db, 'customers', match.id, 'financials', 'profile'));
      if (f.exists()) financials = f.data();
    } catch { /* non-fatal */ }

    return {
      ok: true,
      customer: {
        customerId:        match.id,                       // Firestore doc id — what CES needs
        businessCustomerId: c.customer_id ?? '',
        legalName:         c.legal_name ?? '',
        prefName:          c.preferred_name || (c.legal_name ?? '').split(' ')[0] || 'there',
        registeredMobile:  c.registered_mobile ?? '',
        email:             c.email ?? '',
        globalStatus:      c.global_status ?? '',
        preferredLanguage: c.preferred_language ?? 'en',
        kycExpiresAt:      c.kyc_expires_at ?? '',
        spendingPersona:   financials.spending_persona ?? '',
        creditScoreValue:  financials.credit_score_value ?? '',
        creditScoreBand:   financials.credit_score_band ?? '',
        annualIncome:      financials.annual_income ?? '',
        preApprovedOffers: financials.pre_approved_offers ?? [],
      },
    };
  } catch (err) {
    console.warn('[Firebase] authenticateCustomer failed:', err.message);
    return { ok: false, reason: 'error' };
  }
}

// ── Step-up auth policy ──────────────────────────────────────────────────────
// config/trust_config drives when a signed-in customer must re-verify.
// Falls back to the same values the document currently holds so the UI still
// behaves sensibly if the read is blocked.
const TRUST_FALLBACK = {
  view_only_auth:       'none',
  confirm_only_max:     200,
  pin_auth_max:         1000,
  otp_auth_above:       1000,
  card_block_auth:      'otp',
  card_unblock_auth:    'otp',
  dispute_auth:         'otp',
  new_beneficiary_auth: 'otp',
};

let _trustPromise = null;
export function fetchTrustConfig() {
  if (!_trustPromise) {
    _trustPromise = (async () => {
      try {
        await ensureAnonAuth();
        const s = await getDoc(doc(db, 'config', 'trust_config'));
        return s.exists() ? { ...TRUST_FALLBACK, ...s.data() } : TRUST_FALLBACK;
      } catch (err) {
        console.warn('[Firebase] fetchTrustConfig failed:', err.message);
        return TRUST_FALLBACK;
      }
    })();
  }
  return _trustPromise;
}

// ── Pre-approved offers ──────────────────────────────────────────────────────
/** Resolves offer ids from financials.pre_approved_offers into config/{id} docs. */
export async function fetchOffers(offerIds = []) {
  if (!offerIds.length) return [];
  try {
    await ensureAnonAuth();
    const docs = await Promise.all(
      offerIds.map((id) => getDoc(doc(db, 'config', id)).catch(() => null)),
    );
    return docs
      .filter((s) => s?.exists())
      .map((s) => ({ offer_id: s.id, ...s.data() }));
  } catch (err) {
    console.warn('[Firebase] fetchOffers failed:', err.message);
    return [];
  }
}

// ── Card catalogue ───────────────────────────────────────────────────────────
/**
 * Reads the public card catalogue from Firestore (collection: card_catalog).
 * Seeded by scripts/seedCardCatalog.mjs from src/data/cardCatalog.js.
 *
 * Returns [] on any failure — callers fall back to the bundled catalogue so the
 * page always renders.
 */
export async function fetchCardCatalog() {
  try {
    await ensureAnonAuth();
    const snap = await getDocs(query(collection(db, 'card_catalog'), limit(30)));
    const cards = snap.docs.map((d) => ({ card_id: d.id, ...d.data() }));
    // Keep a stable, intentional order rather than Firestore's id ordering.
    cards.sort((a, b) => (b.fit_score_base ?? 0) - (a.fit_score_base ?? 0));
    return cards;
  } catch (err) {
    console.warn('[Firebase] fetchCardCatalog failed:', err.message);
    return [];
  }
}

export { db, auth };
