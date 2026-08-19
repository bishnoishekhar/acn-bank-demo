// ─────────────────────────────────────────────────────────────────────────────
//  ACN Bank — Firebase / Firestore client
//  Used by: ChatPanel (@ contacts), future real-time balance updates
//
//  Config is loaded from environment variables (VITE_FIREBASE_*).
//  Local dev:  copy .env.example → .env.local and fill in values.
//  CI/CD:      set the same keys as GitHub Secrets (see .github/workflows/deploy.yml).
// ─────────────────────────────────────────────────────────────────────────────
import { initializeApp }        from 'firebase/app';
import { getFirestore,
         collection,
         query,
         where,
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

export { db, auth };
