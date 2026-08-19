// ─────────────────────────────────────────────────────────────────────────────
//  ACN Bank — Firebase / Firestore client
//  Used by: ChatPanel (@ contacts), future real-time balance updates
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
  apiKey:            'AIzaSyAanZm_QOvu_Vede6g_sjRAr-dqaImv3z0',
  authDomain:        'emvnzir-canada-song.firebaseapp.com',
  projectId:         'emvnzir-canada-song',
  storageBucket:     'emvnzir-canada-song.firebasestorage.app',
  messagingSenderId: '483471568825',
  appId:             '1:483471568825:web:a3e01d8d5d2ead83d59068',
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
 *
 * Requires Firestore rule:
 *   match /customers/{doc} {
 *     allow read: if request.auth != null
 *                 && resource.data.keys().hasOnly(['username','display_name']);
 *   }
 * OR a broader allow-read rule for authenticated users during development.
 */
export async function fetchP2PContacts(currentCustomerId = null) {
  try {
    await ensureAnonAuth();
    const customersRef = collection(db, 'customers');
    // Only fetch docs where username field is not empty
    const q = query(
      customersRef,
      where('username', '!=', ''),
      limit(20),
    );
    const snap = await getDocs(q);
    const contacts = [];
    snap.forEach((doc) => {
      const data = doc.data();
      // Skip the current logged-in user
      if (currentCustomerId && doc.id === currentCustomerId) return;
      if (!data.username) return;
      const name    = data.display_name || 'ACN Bank Customer';
      const initials = name
        .split(' ')
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? '')
        .join('');
      contacts.push({
        customer_id:    doc.id,
        display_name:   name,
        username:       data.username.startsWith('@') ? data.username : `@${data.username}`,
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
