import { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import TopNav               from './components/layout/TopNav';
import Dashboard            from './components/layout/Dashboard';
import ChatPanel            from './components/chat/ChatPanel';
import FloatingChatWidget   from './components/chat/FloatingChatWidget';
import SignInModal          from './components/auth/SignInModal';
import ApplicationStatus    from './components/ApplicationStatus';
import { bootstrapGecx, setCesVariables, clearCesVariables } from './components/gecx';

/* The link in both applicant emails lands here:
     ?application=APP_20260820_7F3A9C&token=<opaque>
   Read once at module load — this is a landing page, not a route the user
   navigates between. */
function readApplicationLink() {
  try {
    const params = new URLSearchParams(window.location.search);
    const applicationId = params.get('application');
    const token = params.get('token');
    return applicationId && token ? { applicationId, token } : null;
  } catch {
    return null;
  }
}

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

  const [appLink, setAppLink] = useState(readApplicationLink);
  const [chatOpen,    setChatOpen]    = useState(false);
  const [chatIntent,  setChatIntent]  = useState(null);
  const [resetSignal, setResetSignal] = useState(0);  // increment → soft-reset GECX without remounting
  const [signInOpen,  setSignInOpen]  = useState(false);

  // ── Floating chat widget state ────────────────────────────────────────────
  // Mirrors the header ChatPanel's messages so the widget shows the same thread.
  const [floatOpen,     setFloatOpen]     = useState(false);
  const [floatMessages, setFloatMessages] = useState([]);
  const floatSendRef   = useRef(null);   // set by ChatPanel via onExposeSend
  const prevChatOpen   = useRef(false);  // detects header panel closing

  /* When the header chat panel closes AND there are messages, auto-open the
     floating widget so the conversation doesn't feel like it disappeared. */
  useEffect(() => {
    if (!chatOpen && prevChatOpen.current) {
      const hasContent = floatMessages.some(
        (m) => m.type === 'bot' || m.type === 'user' || m.type === 'combo',
      );
      if (hasContent) setFloatOpen(true);
    }
    prevChatOpen.current = chatOpen;
  }, [chatOpen, floatMessages]);

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

  /* Leaving the status page drops the query string so a refresh, or the
     browser's back button, returns to the normal site rather than re-opening
     the emailed link. */
  const exitApplicationStatus = () => {
    setAppLink(null);
    try {
      window.history.replaceState({}, '', window.location.pathname);
    } catch { /* non-fatal — the state change alone is enough */ }
  };

  /* An emailed status link takes over the page. Deliberately no TopNav or chat:
     the recipient may be a prospect with no account, and the one thing they
     came for is the status of their application. */
  if (appLink) {
    return (
      <ApplicationStatus
        applicationId={appLink.applicationId}
        token={appLink.token}
        onExit={exitApplicationStatus}
      />
    );
  }

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
        onMessagesChange={setFloatMessages}
        onExposeSend={(fn) => { floatSendRef.current = fn; }}
      />

      {/* Backdrop — dims page behind the drop-down panel */}
      {chatOpen && (
        <div className="chat-backdrop" onClick={closeChat} aria-hidden="true" />
      )}

      {/* ── Floating chat widget — mirrors the header chat session ── */}
      <FloatingChatWidget
        messages={floatMessages}
        isOpen={floatOpen}
        onOpen={() => setFloatOpen(true)}
        onClose={() => setFloatOpen(false)}
        onSend={(text) => floatSendRef.current?.(text)}
      />

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
