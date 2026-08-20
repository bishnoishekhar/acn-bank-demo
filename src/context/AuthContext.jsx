import { createContext, useContext, useReducer, useCallback } from 'react';
import { authenticateCustomer } from '../firebase';

// ── State machine: GUEST → AUTHENTICATING → AUTHENTICATED ─────────────────────
// `customer` holds the full Firestore profile once authenticated. It is the
// single source of truth for both the page chrome and the CES variable bridge,
// so the chatbot and the web page can never disagree about who is signed in.
const initialState = {
  authState: 'guest',   // 'guest' | 'authenticating' | 'authenticated'
  customer:  null,
  error:     null,
};

const ERROR_COPY = {
  unknown_phone:  'We could not find an account with that phone number.',
  no_credentials: 'That account has no PIN set up yet. Please contact support.',
  bad_pin:        'Incorrect PIN. Please try again.',
  error:          'Connection error. Please try again.',
};

function authReducer(state, action) {
  switch (action.type) {
    case 'TRIGGER_AUTH':
      return { ...state, authState: 'authenticating', error: null };
    case 'SIGN_IN_SUCCESS':
      return { authState: 'authenticated', customer: action.customer, error: null };
    case 'SIGN_IN_ERROR':
      return { ...state, authState: 'guest', error: action.error };
    case 'SIGN_OUT':
      return { ...initialState };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    default:
      return state;
  }
}

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  const signIn = useCallback(async (phone, pin) => {
    dispatch({ type: 'TRIGGER_AUTH' });
    const result = await authenticateCustomer(phone, pin);

    if (!result.ok) {
      dispatch({ type: 'SIGN_IN_ERROR', error: ERROR_COPY[result.reason] ?? ERROR_COPY.error });
      return { success: false, reason: result.reason };
    }

    // sessionStorage only — never localStorage (PCI requirement). Values are
    // non-secret profile fields; the PIN is never persisted anywhere.
    sessionStorage.setItem('acn_customer_id',   result.customer.customerId);
    sessionStorage.setItem('acn_customer_name', result.customer.prefName);
    dispatch({ type: 'SIGN_IN_SUCCESS', customer: result.customer });
    return { success: true, customer: result.customer };
  }, []);

  const signOut = useCallback(() => {
    sessionStorage.removeItem('acn_customer_id');
    sessionStorage.removeItem('acn_customer_name');
    dispatch({ type: 'SIGN_OUT' });
  }, []);

  const clearError = useCallback(() => dispatch({ type: 'CLEAR_ERROR' }), []);

  const { customer } = state;

  return (
    <AuthContext.Provider
      value={{
        ...state,
        // Flattened conveniences — several components only need these two.
        customerId:   customer?.customerId ?? null,
        customerName: customer?.prefName   ?? null,
        isAuthenticated: state.authState === 'authenticated',
        signIn,
        signOut,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
