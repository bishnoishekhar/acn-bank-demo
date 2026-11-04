import { useAuth } from '../../context/AuthContext';

export default function TopNav({ onOpenChat, onSignIn, onSignOut, onResetChat, chatOpen = false }) {
  const { authState, customerName } = useAuth();
  const isAuth = authState === 'authenticated';

  return (
    <header className="top-nav" role="banner">
      {/* Left side: TD Logo + Main navigation */}
      <div className="nav-left-group">
        {/* TD Green Logo Square */}
        <div
          className="td-nav-logo"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          title="TD Bank Home"
        >
          <span className="td-nav-logo-box" aria-hidden="true">TD</span>
        </div>

        {/* Primary Nav Links */}
        <nav className="nav-links" aria-label="Main navigation">
          <a
            href="#my-td"
            className="nav-link"
            onClick={(e) => {
              e.preventDefault();
              if (isAuth) {
                document.getElementById('my-qr-section')?.scrollIntoView({ behavior: 'smooth' });
              } else {
                onOpenChat('I want to do my daily banking');
              }
            }}
          >
            My TD
          </a>
          <a
            href="#products"
            className="nav-link is-active"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById('products-section')?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            Products
          </a>
          <a
            href="#solutions"
            className="nav-link"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById('home-insights-section')?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            Solutions <span className="nav-chevron">▾</span>
          </a>
          <a
            href="#learning"
            className="nav-link"
            onClick={(e) => {
              e.preventDefault();
              onOpenChat('Analyze my spending');
            }}
          >
            Learning <span className="nav-chevron">▾</span>
          </a>
        </nav>
      </div>

      {/* Right side: Utilities + Login + AI Assistant */}
      <div className="nav-actions">
        {/* Location icon */}
        <button
          type="button"
          className="nav-icon-link"
          title="Find a TD Location or ATM"
          onClick={() => onOpenChat('Find nearby branches or ATMs')}
          aria-label="Locations"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#238234" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" fill="#238234" />
          </svg>
        </button>

        {/* Help icon */}
        <button
          type="button"
          className="nav-icon-link"
          title="Customer Support & Help"
          onClick={() => onOpenChat('Help and Customer Service')}
          aria-label="Help"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#238234" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </button>

        {/* Language selector */}
        <span className="nav-lang">
          EN <span className="nav-chevron">▾</span>
        </span>

        {/* Auth / Log In */}
        {isAuth ? (
          <div className="nav-user-wrap">
            <span className="nav-greeting">Hello, {customerName}</span>
            <button
              type="button"
              className="nav-btn-link"
              onClick={() => {
                if (chatOpen) onOpenChat();
                setTimeout(() => {
                  document.getElementById('my-qr-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 80);
              }}
              title="Jump to Direct Pay QR"
            >
              Direct Pay
            </button>
            <button type="button" className="nav-login-btn" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        ) : (
          <button type="button" className="nav-login-btn" onClick={onSignIn}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#238234" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" fill="#238234" />
            </svg>
            <span>Log In <span className="nav-chevron">▾</span></span>
          </button>
        )}

        {/* Reset button — only when chat is open */}
        {chatOpen && (
          <button
            className="nav-icon-btn"
            onClick={onResetChat}
            title="New conversation"
            aria-label="Start new conversation"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
            </svg>
          </button>
        )}

        {/* TD AI Chat toggle */}
        <button
          className={`nav-btn nav-btn-chat${chatOpen ? ' nav-btn-chat--active' : ''}`}
          onClick={onOpenChat}
          aria-label={chatOpen ? 'Close TD Assistant' : 'Open TD Assistant'}
          aria-expanded={chatOpen}
        >
          {chatOpen ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          )}
          <span>TD Assistant</span>
        </button>
      </div>
    </header>
  );
}
