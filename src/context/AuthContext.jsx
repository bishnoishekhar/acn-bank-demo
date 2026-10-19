import { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import {
  authenticateCustomer,
  authenticateCustomerFromChat,
  fetchCustomerById,
} from '../firebase';

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

  const persistCustomer = useCallback((customer) => {
    if (!customer) return;
    sessionStorage.setItem('acn_customer_id',   customer.customerId);
    sessionStorage.setItem('acn_customer_name', customer.prefName);
    dispatch({ type: 'SIGN_IN_SUCCESS', customer });
  }, []);

  // Restore session across page reloads within the same browser tab
  useEffect(() => {
    const savedId = sessionStorage.getItem('acn_customer_id');
    if (!savedId || state.authState === 'authenticated') return;
    let cancelled = false;
    fetchCustomerById(savedId).then((customer) => {
      if (!cancelled && customer) {
        persistCustomer(customer);
      }
    });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = useCallback(async (phone, pin) => {
    dispatch({ type: 'TRIGGER_AUTH' });
    const result = await authenticateCustomer(phone, pin);

    if (!result.ok) {
      dispatch({ type: 'SIGN_IN_ERROR', error: ERROR_COPY[result.reason] ?? ERROR_COPY.error });
      return { success: false, reason: result.reason };
    }

    persistCustomer(result.customer);
    return { success: true, customer: result.customer };
  }, [persistCustomer]);

  // Silent sign-in triggered when the user authenticates inside the CES chat
  // (e.g. entering phone + PIN in the chat conversation) so the web header,
  // My QR card, QR history, and @ menu sync immediately without resetting chat.
  const signInFromChat = useCallback(async ({ customerId, phone, pin, customerName } = {}) => {
    const result = await authenticateCustomerFromChat({ customerId, phone, pin, customerName });
    if (!result.ok || !result.customer) {
      return { success: false, reason: result.reason || 'not_found' };
    }
    persistCustomer(result.customer);
    return { success: true, customer: result.customer };
  }, [persistCustomer]);

  const signInByCustomerId = useCallback(async (customerId) => {
    const customer = await fetchCustomerById(customerId);
    if (!customer) return { success: false, reason: 'not_found' };
    persistCustomer(customer);
    return { success: true, customer };
  }, [persistCustomer]);

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
        customerId:      customer?.customerId ?? null,
        customerName:    customer?.prefName   ?? null,
        isAuthenticated: state.authState === 'authenticated',
        signIn,
        signInFromChat,
        signInByCustomerId,
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

