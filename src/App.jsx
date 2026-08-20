import { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import TopNav      from './components/layout/TopNav';
import Dashboard   from './components/layout/Dashboard';
import ChatPanel   from './components/chat/ChatPanel';
import SignInModal from './components/auth/SignInModal';
import { bootstrapGecx, setCesVariables, clearCesVariables } from './components/gecx';

/* ── CES session variables ─────────────────────────────────────────────────────
   Built from the Firestore profile and pushed into the CES session so the agent
   knows who it is talking to without asking. `auth_mode` is the master gate the
   Lead Orchestrator branches on.

   All of these must be declared in app.json variableDeclarations.
── */
function guestVariables() {
  return {
    auth_mode:             'guest',
    authentication_status: false,
    auth_level:            0,
    is_existing_customer:  false,
    customerId:            '',
    customer_id:           '',
    pref_name:             '',
    customer_name:         '',
    web_channel:           true,
  };
}

function customerVariables(c) {
  return {
    auth_mode:             'authenticated',
    authentication_status: true,
    auth_level:            2,
    is_existing_customer:  true,
    customerId:            c.customerId,
    customer_id:           c.businessCustomerId,
    pref_name:             c.prefName,
    customer_name:         c.legalName,
    // preferred_language is a CES PREDEFINED variable — it cannot be declared in
    // app.json, so we do not write it from here either. The profile load
    // (orchestrate_lookup) sets it from the same Firestore field.
    kyc_expires_at:        c.kycExpiresAt,
    customer_global_status: c.globalStatus,
    spending_persona:      c.spendingPersona,
    credit_score_value:    c.creditScoreValue,
    annual_income:         c.annualIncome,
    web_channel:           true,
  };
}

// ── Inner app — consumes AuthContext set up by the wrapper below ───────────────
function AppContent() {
  const { customer, authState, signOut } = useAuth();

  const [chatOpen,    setChatOpen]    = useState(false);
  const [chatIntent,  setChatIntent]  = useState(null);
  const [resetSignal, setResetSignal] = useState(0);  // increment → soft-reset GECX without remounting
  const [signInOpen,  setSignInOpen]  = useState(false);

  /* Where the sign-in request came from decides what happens afterwards:
       'nav'  → header button: start a clean authenticated session.
       'chat' → the agent gated an action: keep the transcript and resume it. */
  const signInOrigin = useRef('nav');

  /* Bootstrap GECX once on mount, as a guest until proven otherwise. */
  useEffect(() => {
    bootstrapGecx();
    setCesVariables(guestVariables());
  }, []);

  /* Mirror auth state into the CES session whenever it changes. This is the
     single place the bridge is written, so the chatbot can never be out of step
     with the page chrome. */
  useEffect(() => {
    if (authState === 'authenticated' && customer) {
      setCesVariables(customerVariables(customer));
    } else if (authState === 'guest') {
      clearCesVariables();
      setCesVariables(guestVariables());
    }
  }, [authState, customer]);

  // Holds the ChatPanel reset function — set by ChatPanel via onExposeReset
  const chatResetRef  = useRef(null);
  // Holds ChatPanel's "resume after sign-in" function
  const chatResumeRef = useRef(null);

  /* ── Helpers ── */
  // Always opens the chat (used by dashboard CTAs, sign-in success, etc.)
  const openChat  = (intent = null) => { setChatOpen(true); if (intent) setChatIntent(intent); };
  const closeChat = () => setChatOpen(false);
  // Toggles the panel — wired to the header "Chat with AI" button
  const toggleChat = () => setChatOpen((prev) => !prev);

  const openSignInFromNav  = () => { signInOrigin.current = 'nav';  setSignInOpen(true); };
  const openSignInFromChat = () => { signInOrigin.current = 'chat'; setSignInOpen(true); };
  const closeSignIn        = () => setSignInOpen(false);

  /* After a successful sign-in the auth effect above has already pushed the new
     variables into the CES session, so both paths below are only about what the
     user should see next. */
  const handleSignInSuccess = () => {
    if (signInOrigin.current === 'chat') {
      // The agent asked us to authenticate mid-flow. Keep the transcript and
      // let CES pick the journey back up from its own target_intent.
      chatResumeRef.current?.();
      setChatOpen(true);
      return;
    }
    // Header sign-in: wipe the guest session so the agent greets us properly
    // as a returning customer instead of continuing an anonymous thread.
    setResetSignal((n) => n + 1);
    openChat();
  };

  /* Sign-out: clear frontend auth state and send a soft-reset signal to ChatPanel.
     ChatPanel wipes its React state and calls softResetGecx() which kills the CES
     session token and clears _initDone — WITHOUT unmounting <chat-messenger>.
     The SDK binding to the web component element stays intact, so the next open
     triggers a fresh initGecx() / registerContext() as a guest successfully. */
  const handleSignOut = () => {
    signOut();
    setResetSignal((n) => n + 1);
    setChatOpen(false);
    setChatIntent(null);
  };

  return (
    <>
      <TopNav
        onOpenChat={toggleChat}
        onSignIn={openSignInFromNav}
        onSignOut={handleSignOut}
        onResetChat={() => chatResetRef.current?.()}
        chatOpen={chatOpen}
      />

      <Dashboard onOpenChat={openChat} onSignIn={openSignInFromNav} />

      <ChatPanel
        isOpen={chatOpen}
        onClose={closeChat}
        onReset={() => {}}
        onExposeReset={(fn) => { chatResetRef.current = fn; }}
        onExposeResume={(fn) => { chatResumeRef.current = fn; }}
        intent={chatIntent}
        onRequestSignIn={openSignInFromChat}
        resetSignal={resetSignal}
      />

      {/* Backdrop — dims page behind the drop-down panel */}
      {chatOpen && (
        <div className="chat-backdrop" onClick={closeChat} aria-hidden="true" />
      )}

      {/* Sign-in modal — shared by the header button and the agent's auth gate */}
      <SignInModal
        isOpen={signInOpen}
        onClose={closeSignIn}
        onSuccess={handleSignInSuccess}
        context={signInOrigin.current}
      />
    </>
  );
}

/* ── Root: wrap with AuthProvider ─────────────────────────────────────────── */
export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
