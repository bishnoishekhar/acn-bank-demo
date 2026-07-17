import { useState, useEffect, useRef } from 'react';
import ChatWindow from './components/ChatWindow';
import { bootstrapGecx } from './components/gecx';

/* Hero product visual — premium credit card (replaces the old rotating chat mockup) */

export default function App() {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatIntent, setChatIntent] = useState(null);
  const [showBadge, setShowBadge] = useState(true);
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipTimer = useRef(null);

  /* ── Bootstrap GECX once on mount ── */
  useEffect(() => {
    bootstrapGecx();
    tooltipTimer.current = setTimeout(() => setShowTooltip(true), 6000);
    return () => {
      clearTimeout(tooltipTimer.current);
    };
  }, []);

  const openChat = (intent = null) => {
    setChatOpen(true);
    setChatIntent(intent);
    setShowBadge(false);
    setShowTooltip(false);
    clearTimeout(tooltipTimer.current);
  };

  const closeChat = () => setChatOpen(false);
  const dismissTooltip = () => {
    setShowTooltip(false);
    clearTimeout(tooltipTimer.current);
  };

  return (
    <>
      {/* ── Nav ── */}
      <nav>
        <div className="logo">
          <div className="logo-mark">»</div>
          ACN Bank
        </div>
        <div className="nav-links">
          <a href="#">Products</a>
          <a href="#">Services</a>
          <a href="#">Investing</a>
          <a href="#">About</a>
        </div>
        <div className="nav-btns">
          <button className="btn-ghost">Sign in</button>
          <button className="btn-purple" onClick={() => openChat()}>Chat with us</button>
          <button className="btn-solid">Open account</button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-left">
            <div className="hero-badge">
              <div className="badge-dot" />
              Agentic AI · Built on Accenture × Google GECX
            </div>
            <h1>Your time matters.<br /><span>We act fast.</span></h1>
            <p>Finally, banking on your terms. No queues, no long calls, no paperwork — just tell us what you need and it's handled, securely and personally.</p>
            <div className="hero-ctas">
              <button className="btn-hero" onClick={() => openChat()}>Get started</button>
              <button className="btn-hero-ghost">See what it can do</button>
            </div>
            <div className="stats">
              <div className="stat"><div className="stat-val">50+</div><div className="stat-lbl">Banking actions</div></div>
              <div className="stat"><div className="stat-val">&lt;30s</div><div className="stat-lbl">Task completion</div></div>
              <div className="stat"><div className="stat-val">24/7</div><div className="stat-lbl">Always on</div></div>
              <div className="stat"><div className="stat-val">4.8★</div><div className="stat-lbl">Satisfaction</div></div>
            </div>
          </div>

          {/* Product visual — premium credit card */}
          <div className="hero-right">
            <div className="acn-card-stage">
              <div className="acn-credit-card">
                <div className="acn-cc-sheen" />
                <div className="acn-cc-top">
                  <span className="acn-cc-bank">ACN Bank</span>
                  <span className="acn-cc-flag">Platinum</span>
                </div>
                <div className="acn-cc-chip" />
                <div className="acn-cc-number">
                  <span>5412</span><span>7534</span><span>8901</span><span>4242</span>
                </div>
                <div className="acn-cc-bottom">
                  <div>
                    <div className="acn-cc-label">Card Holder</div>
                    <div className="acn-cc-value">CHANDER BISHNOI</div>
                  </div>
                  <div>
                    <div className="acn-cc-label">Expires</div>
                    <div className="acn-cc-value">09/29</div>
                  </div>
                  <div className="acn-cc-network">VISA</div>
                </div>
              </div>
              <div className="acn-float acn-float-1">✅&nbsp; Transfer complete · 3s</div>
              <div className="acn-float acn-float-2">🎁&nbsp; Pre-approved · 5× points</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Products ── */}
      <section className="products">
        <div className="section-label">What the agent handles</div>
        <div className="product-grid">
          <div className="product-card">
            <div className="product-icon">🎁</div>
            <h3>Apply for products</h3>
            <p>Open a chequing or savings account, apply for a credit card or loan — guided step by step with no paperwork.</p>
            <button className="card-cta" onClick={() => openChat('I want to apply for a product')}>Get started →</button>
          </div>
          <div className="product-card">
            <div className="product-icon">🏦</div>
            <h3>Daily banking</h3>
            <p>Transfer money, pay bills, check your card status, and manage beneficiaries — all through a single conversation.</p>
            <button className="card-cta" onClick={() => openChat('I want to do my daily banking')}>Get started →</button>
          </div>
          <div className="product-card">
            <div className="product-icon">📊</div>
            <h3>Know your finances</h3>
            <p>Check balances, review recent transactions, track spending patterns, and view your credit score — instantly.</p>
            <button className="card-cta" onClick={() => openChat('I want to know my finances')}>Get started →</button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer>
        <span>© 2026 ACN Bank · Agentic banking powered by Accenture × Google GECX</span>
        <span>Chat with us ↘</span>
      </footer>

      {/* ── FAB ── */}
      <div className="acn-fab-wrapper">
        <div className={`acn-tooltip${showTooltip ? ' show' : ''}`}>
          <div className="acn-tooltip-title">Hi there! 👋</div>
          <div className="acn-tooltip-text">Transfer money, check balances, apply for products — all in seconds.</div>
          <button className="acn-tooltip-btn" onClick={() => openChat()}>Start a conversation →</button>
          <button className="acn-tooltip-dismiss" onClick={dismissTooltip}>Maybe later</button>
          <div className="tooltip-arrow" />
        </div>
        <div className="acn-fab" onClick={() => openChat()}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
          {showBadge && <div className="acn-fab-badge">1</div>}
        </div>
      </div>

      {/* ── Chat window ── */}
      <ChatWindow
        isOpen={chatOpen}
        onClose={closeChat}
        onReset={() => {}}
        intent={chatIntent}
      />
    </>
  );
}
