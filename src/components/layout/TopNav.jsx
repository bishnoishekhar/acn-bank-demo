import { useAuth } from '../../context/AuthContext';

export default function TopNav({ onOpenChat, onSignIn, onSignOut, onResetChat, chatOpen = false }) {
  const { authState, customerName } = useAuth();
  const isAuth = authState === 'authenticated';

  return (
    <nav className="top-nav" role="navigation" aria-label="Main navigation">
      {/* TD Bank Logo */}
      <div className="nav-logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} style={{ cursor: 'pointer' }}>
        <span className="td-nav-logo-box" aria-hidden="true">TD</span>
        <div className="td-nav-brand-text">
          <span className="td-nav-brand-name">TD Bank</span>
          <span className="td-nav-brand-tagline">America's Most Convenient Bank®</span>
        </div>
      </div>

      {/* Centre nav links matching TD Online Banking */}
      <div className="nav-links">
        <a
          href="#products"
          className="nav-link is-active"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          Products &amp; Services
        </a>
        <a
          href="#accounts"
          className="nav-link"
          onClick={(e) => {
            e.preventDefault();
            onOpenChat('I want to do my daily banking');
          }}
        >
          My Accounts
        </a>
        <a
          href="#transfers"
          className="nav-link"
          onClick={(e) => {
            e.preventDefault();
            onOpenChat('I want to transfer money');
          }}
        >
          Transfers &amp; Pay
        </a>
        <a
          href="#cards"
          className="nav-link"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById('cards')?.scrollIntoView({ behavior: 'smooth' }) ||
            document.getElementById('cards-section')?.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          Credit Cards
        </a>
        <a
          href="#investing"
          className="nav-link"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById('home-insights-section')?.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          Investing &amp; GICs
        </a>
        <a
          href="#insights"
          className="nav-link"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById('home-insights-section')?.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          Insights
        </a>
      </div>

      {/* Right-side actions */}
      <div className="nav-actions">
        {isAuth ? (
          <>
            <span className="nav-greeting">Hello, {customerName} 👋</span>
            <button
              type="button"
              className="nav-btn nav-btn-ghost"
              onClick={() => {
                if (chatOpen) onOpenChat();
                setTimeout(() => {
                  document.getElementById('my-qr-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 80);
              }}
              title="Jump to your Direct Pay QR code"
            >
              ▦ Direct Pay QR
            </button>
            <button className="nav-btn nav-btn-ghost" onClick={onSignOut}>
              Sign out
            </button>
          </>
        ) : (
          <button className="nav-btn nav-btn-ghost" onClick={onSignIn}>
            Sign in
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

        {/* Chat toggle / TD Assistant */}
        <button
          className={`nav-btn nav-btn-chat${chatOpen ? ' nav-btn-chat--active' : ''}`}
          onClick={onOpenChat}
          aria-label={chatOpen ? 'Close TD Virtual Assistant' : 'Open TD Virtual Assistant'}
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
    </nav>
  );
}
