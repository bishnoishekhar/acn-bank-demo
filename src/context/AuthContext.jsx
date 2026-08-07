import { createContext, useContext, useReducer, useCallback } from 'react';

// ── Mock customer registry ─────────────────────────────────────────────────────
// Stub until POST /customers/auth is live. Phone must be entered as E.164.
const MOCK_CUSTOMERS = {
  '+14165550199': { pin: '123456', customerId: 'CUST-9921-X', firstName: 'Chander', lastName: 'Bishnoi' },
  '+16135550101': { pin: '654321', customerId: 'CUST-7777',   firstName: 'Sarah',   lastName: 'Thompson' },
};

// ── State machine: GUEST → AUTHENTICATING → AUTHENTICATED ─────────────────────
const initialState = {
  authState:    'guest',   // 'guest' | 'authenticating' | 'authenticated'
  customerId:   null,
  customerName: null,
  error:        null,
};

function authReducer(state, action) {
  switch (action.type) {
    case 'TRIGGER_AUTH':
      return { ...state, authState: 'authenticating', error: null };
    case 'SIGN_IN_SUCCESS':
      return { ...state, authState: 'authenticated', customerId: action.customerId, customerName: action.customerName, error: null };
    case 'SIGN_IN_ERROR':
      return { ...state, error: action.error };
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
    try {
      // TODO (GAP #1): Replace stub with real endpoint once live:
      //   POST /customers/auth  →  { customerId, firstName, token }
      const normalized = phone.replace(/\D/g, '');
      const entry = Object.entries(MOCK_CUSTOMERS).find(
        ([p]) => p.replace(/\D/g, '') === normalized,
      );
      await new Promise((r) => setTimeout(r, 1100)); // simulate network

      if (entry && entry[1].pin === pin) {
        const { customerId, firstName } = entry[1];
        // sessionStorage only — never localStorage (PCI requirement)
        sessionStorage.setItem('acn_customer_id',   customerId);
        sessionStorage.setItem('acn_customer_name', firstName);
        dispatch({ type: 'SIGN_IN_SUCCESS', customerId, customerName: firstName });
        return { success: true, customerId, firstName };
      }
      dispatch({ type: 'SIGN_IN_ERROR', error: 'Invalid phone number or PIN. Please try again.' });
      return { success: false };
    } catch {
      dispatch({ type: 'SIGN_IN_ERROR', error: 'Connection error. Please try again.' });
      return { success: false };
    }
  }, []);

  const signOut = useCallback(() => {
    sessionStorage.removeItem('acn_customer_id');
    sessionStorage.removeItem('acn_customer_name');
    dispatch({ type: 'SIGN_OUT' });
  }, []);

  const triggerAuth = useCallback(() => dispatch({ type: 'TRIGGER_AUTH' }), []);
  const clearError  = useCallback(() => dispatch({ type: 'CLEAR_ERROR'  }), []);

  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut, triggerAuth, clearError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
