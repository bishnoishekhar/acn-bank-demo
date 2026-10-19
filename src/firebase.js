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
         orderBy,
         getDoc,
         getDocs,
         onSnapshot,
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
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (currentCustomerId && docSnap.id === currentCustomerId) return;
      if (!data.username) return;
      const name     = data.display_name || data.legal_name || data.preferred_name || 'ACN Bank Customer';
      const initials = name
        .split(' ')
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? '')
        .join('');
      contacts.push({
        customer_id:     docSnap.id,
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

// ── Sign-in & Customer profile builder ───────────────────────────────────────
// Last 10 digits are the comparison key. Stored numbers are E.164 with a +1
// country code ("+12269274374"); users type them in any format they like.
const last10 = (v) => String(v ?? '').replace(/\D/g, '').slice(-10);

// Phone/account aliases matching identify_customer & SignInModal demo hints
const DEMO_PHONE_ALIASES = {
  '2269274374': ['CUST_DOC_1988'],
  '2178582973': ['CUST_DOC_1988', 'CUST_DOC_7777'],
  '4165551234': ['CUST_DOC_1988'],
  '5195551234': ['6oq3lBNGOFWfqOamn9ob'],
  '1234567890': ['6oq3lBNGOFWfqOamn9ob'],
  '7744112233': ['CUST_DOC_7777'],
  '4165550192': ['CUST-9921-X'],
  '4165550144': ['CUST-PREMIUM-001'],
  '6045550188': ['CUST-WEALTH-001'],
  '4165550175': ['CUST-MORTGAGE-001'],
  '4165550163': ['CUST-CARDAPP-001'],
  '4165550131': ['CUST-DISPUTE-INELIGIBLE'],
};

const DEMO_PIN_FALLBACK = {
  'CUST_DOC_1988':           '2244',
  'CUST_DOC_7777':           '1234',
  '6oq3lBNGOFWfqOamn9ob':    '1234',
  'CUST-9921-X':             '1357',
  'CUST-PREMIUM-001':        '9876',
  'CUST-WEALTH-001':         '4321',
  'CUST-MORTGAGE-001':       '1234',
  'CUST-CARDAPP-001':        '1234',
  'CUST-DISPUTE-INELIGIBLE': '1234',
};

async function buildCustomerObject(docId, c) {
  let financials = {};
  try {
    const f = await getDoc(doc(db, 'customers', docId, 'financials', 'profile'));
    if (f.exists()) financials = f.data();
  } catch { /* non-fatal */ }

  const legalName = c.legal_name || c.display_name || c.preferred_name || 'Customer';
  const prefName  = c.preferred_name || legalName.split(' ')[0] || 'there';

  return {
    customerId:         docId,                       // Firestore doc id — what CES needs
    businessCustomerId: c.customer_id ?? docId,
    legalName,
    prefName,
    username:           c.username ?? '',
    accountNumber:      c.account_number ?? '',
    registeredMobile:   c.registered_mobile ?? '',
    email:              c.email ?? '',
    globalStatus:       c.global_status ?? 'ACTIVE',
    preferredLanguage:  c.preferred_language ?? 'en',
    kycExpiresAt:       c.kyc_expires_at ?? '',
    qrEnabled:          c.qr_enabled !== false,
    spendingPersona:    financials.spending_persona ?? '',
    creditScoreValue:   financials.credit_score_value ?? '',
    creditScoreBand:    financials.credit_score_band ?? '',
    annualIncome:       financials.annual_income ?? '',
    preApprovedOffers:  financials.pre_approved_offers ?? [],
  };
}

/**
 * Fetches a full customer profile directly by Firestore document ID.
 */
export async function fetchCustomerById(customerId) {
  if (!customerId) return null;
  try {
    await ensureAnonAuth();
    const snap = await getDoc(doc(db, 'customers', customerId));
    if (!snap.exists()) return null;
    return await buildCustomerObject(snap.id, snap.data());
  } catch (err) {
    console.warn('[Firebase] fetchCustomerById failed:', err.message);
    return null;
  }
}

/**
 * Verifies a customer by registered mobile (or account number) + mobile PIN against Firestore.
 * Supports shared demo phone numbers (e.g. +12178582973 shared by Chander PIN 2244 and Emiliano PIN 1234)
 * by testing all candidate matches against their stored PIN.
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
    const snap = await getDocs(query(collection(db, 'customers'), limit(50)));
    const aliasIds = new Set(DEMO_PHONE_ALIASES[phoneKey] || []);

    const candidates = snap.docs.filter((d) => {
      const data = d.data();
      return (
        aliasIds.has(d.id) ||
        last10(data.registered_mobile) === phoneKey ||
        last10(data.telephony_caller_id) === phoneKey ||
        last10(data.account_number) === phoneKey
      );
    });

    if (!candidates.length) return { ok: false, reason: 'unknown_phone' };

    let sawCredentials = false;
    for (const candidate of candidates) {
      let storedPin = '';
      try {
        const securitySnap = await getDoc(doc(db, 'customers', candidate.id, 'security', 'profile'));
        if (securitySnap.exists()) {
          storedPin = String(securitySnap.data().mobile_pin ?? '').replace(/\D/g, '');
        }
      } catch { /* ignore */ }
      if (!storedPin && DEMO_PIN_FALLBACK[candidate.id]) {
        storedPin = DEMO_PIN_FALLBACK[candidate.id];
      }
      if (storedPin) sawCredentials = true;
      if (storedPin && storedPin === pinKey) {
        const customer = await buildCustomerObject(candidate.id, candidate.data());
        return { ok: true, customer };
      }
    }

    return { ok: false, reason: sawCredentials ? 'bad_pin' : 'no_credentials' };
  } catch (err) {
    console.warn('[Firebase] authenticateCustomer failed:', err.message);
    return { ok: false, reason: 'error' };
  }
}

/**
 * Resolves a customer who authenticated inside the CES chat session so the
 * Web UI (AuthContext) can auto-sign in without a separate login prompt.
 */
export async function authenticateCustomerFromChat({ customerId, phone, pin, customerName } = {}) {
  try {
    await ensureAnonAuth();
    if (customerId) {
      const customer = await fetchCustomerById(customerId);
      if (customer) return { ok: true, customer };
    }
    if (phone && pin) {
      const res = await authenticateCustomer(phone, pin);
      if (res.ok) return res;
    }
    if (phone) {
      const phoneKey = last10(phone);
      const snap = await getDocs(query(collection(db, 'customers'), limit(50)));
      const aliasIds = DEMO_PHONE_ALIASES[phoneKey] || [];
      const match =
        snap.docs.find((d) => aliasIds.includes(d.id)) ||
        snap.docs.find(
          (d) =>
            last10(d.data().registered_mobile) === phoneKey ||
            last10(d.data().account_number) === phoneKey,
        );
      if (match) {
        return { ok: true, customer: await buildCustomerObject(match.id, match.data()) };
      }
    }
    if (customerName) {
      const norm = String(customerName).trim().toLowerCase();
      const snap = await getDocs(query(collection(db, 'customers'), limit(50)));
      const match = snap.docs.find((d) => {
        const data = d.data();
        const legal = String(data.legal_name || data.display_name || '').toLowerCase();
        const pref  = String(data.preferred_name || '').toLowerCase();
        return legal === norm || pref === norm || (norm.length >= 4 && legal.startsWith(norm));
      });
      if (match) {
        return { ok: true, customer: await buildCustomerObject(match.id, match.data()) };
      }
    }
    return { ok: false, reason: 'not_found' };
  } catch (err) {
    console.warn('[Firebase] authenticateCustomerFromChat failed:', err.message);
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

// ── Card holdings ────────────────────────────────────────────────────────────
/**
 * Reads the credit cards a signed-in customer already holds.
 *
 * Used to hide products the customer owns from the public catalogue. Debit
 * cards, and closed or cancelled cards, are ignored — a blocked card still
 * counts as held, because they still have it.
 *
 * card_catalog_id / product_name / credit_limit are written by
 * scripts/seedCustomerCardHoldings.mjs. Cards seeded before that script ran
 * simply won't match a catalogue id, and are left out of heldCardIds rather
 * than guessed at.
 *
 * Returns { heldCardIds: Set<string>, heldCardNames: string[], totalCreditLimit }
 * and an empty set on any failure, so a read error never hides the catalogue.
 */
const CREDIT_CARD_TYPES = new Set(['credit', 'credit_card', 'creditcard']);
/* Everything except these counts as held — including a card awaiting
   activation, which has been granted and must not be offered again. */
const CLOSED_CARD_STATUSES = new Set(['closed', 'cancelled', 'canceled', 'expired']);

export async function fetchCustomerCardHoldings(customerId) {
  const empty = { heldCardIds: new Set(), heldCardNames: [], totalCreditLimit: 0 };
  if (!customerId) return empty;

  try {
    await ensureAnonAuth();
    const snap = await getDocs(collection(db, 'customers', customerId, 'cards'));

    const heldCardIds = new Set();
    const heldCardNames = [];
    let totalCreditLimit = 0;

    snap.forEach((d) => {
      const card = d.data();
      const type = String(card.type ?? '').toLowerCase();
      const status = String(card.status ?? '').toLowerCase();
      if (!CREDIT_CARD_TYPES.has(type)) return;
      if (CLOSED_CARD_STATUSES.has(status)) return;

      totalCreditLimit += Number(card.credit_limit ?? 0);
      if (card.card_catalog_id) {
        heldCardIds.add(card.card_catalog_id);
        if (card.product_name) heldCardNames.push(card.product_name);
      }
    });

    return { heldCardIds, heldCardNames, totalCreditLimit };
  } catch (err) {
    console.warn('[Firebase] fetchCustomerCardHoldings failed:', err.message);
    return empty;
  }
}

// ── Application status ───────────────────────────────────────────────────────
/**
 * Reads one card application for the emailed status page.
 *
 * The token in the link is the authorisation: it is compared against the token
 * stored on the record, and a mismatch is reported as not-found rather than
 * "wrong token", so the link cannot be used to probe which references exist.
 *
 * The token itself is never returned to the caller.
 *
 * Returns { ok: true, application } or { ok: false, reason }.
 *   reason: 'not_found' | 'error'
 */
export async function fetchApplicationStatus(applicationId, token) {
  if (!applicationId || !token) return { ok: false, reason: 'not_found' };

  try {
    await ensureAnonAuth();
    const snap = await getDoc(doc(db, 'card_applications', applicationId));
    if (!snap.exists()) return { ok: false, reason: 'not_found' };

    const data = snap.data();
    if (String(data.status_token ?? '') !== String(token)) {
      return { ok: false, reason: 'not_found' };
    }

    const { status_token, document_ref_hash, ...safe } = data;
    return { ok: true, application: { application_id: snap.id, ...safe } };
  } catch (err) {
    console.warn('[Firebase] fetchApplicationStatus failed:', err.message);
    return { ok: false, reason: 'error' };
  }
}

// ── ACN QR Pay history & live subscription ──────────────────────────────────
function isQrTxn(data = {}) {
  const cat = String(data.category || '').toLowerCase();
  const desc = String(data.description || data.merchant || '').toLowerCase();
  const ref = String(data.reference || '').toLowerCase();
  return (
    cat === 'qr_transfer' ||
    cat === 'qr_credit' ||
    cat === 'qr_payment' ||
    desc.includes('qr ') ||
    desc.includes('acn qr') ||
    ref.startsWith('qr-')
  );
}

/**
 * Returns the most recent QR Pay transactions on this customer.
 */
export async function fetchQrTransactions(customerId, max = 5) {
  if (!customerId) return [];
  try {
    await ensureAnonAuth();
    const col = collection(db, 'customers', customerId, 'transactions');
    const snap = await getDocs(query(col, limit(40)));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((t) => isQrTxn(t))
      .sort((a, b) => String(b.timestamp || b.date || '').localeCompare(String(a.timestamp || a.date || '')))
      .slice(0, max);
  } catch (err) {
    console.warn('[Firebase] fetchQrTransactions failed:', err.message);
    return [];
  }
}

/**
 * Real-time listener on customers/{customerId}/transactions for QR Pay activity.
 * Fires immediately with initial QR transactions and again whenever a mobile app
 * user scans the QR code and completes a transfer.
 */
export function subscribeQrTransactions(customerId, onUpdate, max = 6) {
  if (!customerId || typeof onUpdate !== 'function') return () => {};
  let unsub = null;
  let cancelled = false;

  ensureAnonAuth().then(() => {
    if (cancelled) return;
    const col = collection(db, 'customers', customerId, 'transactions');
    unsub = onSnapshot(
      col,
      (snap) => {
        const items = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((t) => isQrTxn(t))
          .sort((a, b) => String(b.timestamp || b.date || '').localeCompare(String(a.timestamp || a.date || '')))
          .slice(0, max);
        onUpdate(items);
      },
      (err) => {
        console.warn('[Firebase] subscribeQrTransactions error:', err.message);
      },
    );
  });

  return () => {
    cancelled = true;
    if (unsub) unsub();
  };
}

// ── Customer Accounts, Bills, Beneficiaries & Transactions ──────────────────
export async function fetchCustomerAccounts(customerId) {
  if (!customerId) return [];
  try {
    await ensureAnonAuth();
    const snap = await getDocs(collection(db, 'customers', customerId, 'accounts'));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('[Firebase] fetchCustomerAccounts failed:', err.message);
    return [];
  }
}

export function subscribeCustomerAccounts(customerId, onUpdate) {
  if (!customerId || typeof onUpdate !== 'function') return () => {};
  let unsub = null;
  let cancelled = false;

  ensureAnonAuth().then(() => {
    if (cancelled) return;
    const col = collection(db, 'customers', customerId, 'accounts');
    unsub = onSnapshot(
      col,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        onUpdate(items);
      },
      (err) => {
        console.warn('[Firebase] subscribeCustomerAccounts error:', err.message);
      },
    );
  });

  return () => {
    cancelled = true;
    if (unsub) unsub();
  };
}

export async function fetchCustomerBills(customerId) {
  if (!customerId) return [];
  try {
    await ensureAnonAuth();
    const snap = await getDocs(collection(db, 'customers', customerId, 'bills'));
    const DEFAULT_AMOUNTS = {
      enbridge: 187.40,
      'hydro one': 224.30,
      'toronto hydro': 118.40,
      rogers: 142.75,
      bell: 125.00,
      telus: 110.00,
      waterloo: 1842.00,
      intact: 164.50,
    };
    return snap.docs
      .map((d) => {
        const raw = d.data() || {};
        const payeeName =
          raw.payee_name ||
          raw.biller_name ||
          raw.name ||
          raw.merchant ||
          (String(raw.category || '').toLowerCase() === 'insurance'
            ? 'Intact Insurance'
            : String(raw.category || '').toLowerCase() === 'telecom'
              ? 'Rogers Wireless'
              : 'Enbridge Gas');
        const lowerName = String(payeeName).toLowerCase();
        const fallbackKey = Object.keys(DEFAULT_AMOUNTS).find((k) => lowerName.includes(k));
        const rawAmt = Number(raw.amount ?? raw.amount_due ?? raw.balance ?? raw.minimum_payment ?? 0);
        const finalAmount = rawAmt > 0 ? rawAmt : (fallbackKey ? DEFAULT_AMOUNTS[fallbackKey] : 124.50);
        const statusStr = String(raw.status || 'pending').toLowerCase();
        const isPaid = statusStr === 'paid' || raw.is_paid === true;
        return {
          id: d.id,
          ...raw,
          payee_name: payeeName,
          biller_name: payeeName,
          amount: finalAmount,
          amount_due: finalAmount,
          status: isPaid ? 'paid' : 'pending',
          is_paid: isPaid,
        };
      })
      .sort((a, b) => {
        if (a.is_paid !== b.is_paid) return a.is_paid ? 1 : -1;
        return String(a.due_date || '9999').localeCompare(String(b.due_date || '9999'));
      });
  } catch (err) {
    console.warn('[Firebase] fetchCustomerBills failed:', err.message);
    return [];
  }
}

export async function fetchCustomerBeneficiaries(customerId) {
  if (!customerId) return [];
  try {
    await ensureAnonAuth();
    const snap = await getDocs(collection(db, 'customers', customerId, 'beneficiaries'));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('[Firebase] fetchCustomerBeneficiaries failed:', err.message);
    return [];
  }
}

export async function fetchCustomerTransactions(customerId, max = 25) {
  if (!customerId) return [];
  try {
    await ensureAnonAuth();
    const snap = await getDocs(query(collection(db, 'customers', customerId, 'transactions'), limit(max * 2)));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(b.timestamp || b.date || '').localeCompare(String(a.timestamp || a.date || '')))
      .slice(0, max);
  } catch (err) {
    console.warn('[Firebase] fetchCustomerTransactions failed:', err.message);
    return [];
  }
}

export { db, auth };

