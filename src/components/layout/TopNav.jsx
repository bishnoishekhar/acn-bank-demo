import { useAuth } from '../../context/AuthContext';

export default function TopNav({ onOpenChat, onSignIn, onSignOut, chatOpen = false }) {
  const { authState, customerName } = useAuth();
  const isAuth = authState === 'authenticated';

  return (
    <nav className="top-nav" role="navigation" aria-label="Main navigation">
      {/* Logo */}
      <div className="nav-logo">
        <span className="nav-logo-mark" aria-hidden="true">»</span>
        ACN Bank
      </div>

      {/* Centre links */}
      <div className="nav-links">
        <a href="#products">Products</a>
        <a href="#services">Services</a>
        <a href="#investing">Investing</a>
        <a href="#about">About</a>
      </div>

      {/* Right-side actions */}
      <div className="nav-actions">
        {isAuth ? (
          <>
            <span className="nav-greeting">Hello, {customerName} 👋</span>
            <button className="nav-btn nav-btn-ghost" onClick={onSignOut}>
              Sign out
            </button>
          </>
        ) : (
          <button className="nav-btn nav-btn-ghost" onClick={onSignIn}>
            Sign in
          </button>
        )}

        {/* Chat toggle — slides panel down when clicked */}
        <button
          className={`nav-btn nav-btn-chat${chatOpen ? ' nav-btn-chat--active' : ''}`}
          onClick={onOpenChat}
          aria-label={chatOpen ? 'Close AI chat' : 'Open AI chat'}
          aria-expanded={chatOpen}
        >
          {chatOpen ? (
            /* X icon when panel is open */
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          ) : (
            /* Chat bubble icon when panel is closed */
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          )}
          Chat with AI
        </button>

        <button className="nav-btn nav-btn-solid" onClick={onSignIn}>
          Open account
        </button>
      </div>
    </nav>
  );
}
