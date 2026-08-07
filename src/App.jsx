import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import TopNav      from './components/layout/TopNav';
import Dashboard   from './components/layout/Dashboard';
import ChatPanel   from './components/chat/ChatPanel';
import SignInModal from './components/auth/SignInModal';
import { bootstrapGecx } from './components/gecx';

// ── Inner app — consumes AuthContext set up by the wrapper below ───────────────
function AppContent() {
  const { signOut } = useAuth();

  const [chatOpen,    setChatOpen]    = useState(false);
  const [chatIntent,  setChatIntent]  = useState(null);
  const [resetSignal, setResetSignal] = useState(0);  // increment → soft-reset GECX without remounting
  const [signInOpen,  setSignInOpen]  = useState(false);

  /* Bootstrap GECX once on mount */
  useEffect(() => { bootstrapGecx(); }, []);

  /* ── Helpers ── */
  // Always opens the chat (used by dashboard CTAs, sign-in success, etc.)
  const openChat  = (intent = null) => { setChatOpen(true); if (intent) setChatIntent(intent); };
  const closeChat = () => setChatOpen(false);
  // Toggles the panel — wired to the header "Chat with AI" button
  const toggleChat = () => setChatOpen((prev) => !prev);
  const openSignIn  = () => setSignInOpen(true);
  const closeSignIn = () => setSignInOpen(false);

  /* After a successful sign-in, clear any leftover guest session state then open
     chat. Incrementing resetSignal wipes the messages + calls softResetGecx(),
     which clears the SDK's cached session token. When the chat opens next,
     initGecx() fires a fresh registerContext() → runSession. */
  const handleSignInSuccess = () => {
    setResetSignal((n) => n + 1); // clear guest session / stale state
    openChat();                    // always open — user just signed in
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
        onSignIn={openSignIn}
        onSignOut={handleSignOut}
        chatOpen={chatOpen}
      />

      <Dashboard onOpenChat={openChat} onSignIn={openSignIn} />

      <ChatPanel
        isOpen={chatOpen}
        onClose={closeChat}
        onReset={() => {}}
        intent={chatIntent}
        onRequestSignIn={openSignIn}
        resetSignal={resetSignal}
      />

      {/* Backdrop — dims page behind the drop-down panel */}
      {chatOpen && (
        <div className="chat-backdrop" onClick={closeChat} aria-hidden="true" />
      )}

      {/* Feature 1: Sign-in modal */}
      <SignInModal
        isOpen={signInOpen}
        onClose={closeSignIn}
        onSuccess={handleSignInSuccess}
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
