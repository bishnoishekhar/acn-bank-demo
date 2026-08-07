import { useAuth } from '../../context/AuthContext';

const PRODUCTS = [
  {
    icon: '💳',
    title: 'Apply for products',
    desc:  'Open a chequing or savings account, apply for a credit card or loan — guided step by step with no paperwork.',
    intent: 'I want to apply for a product',
  },
  {
    icon: '🏦',
    title: 'Daily banking',
    desc:  'Transfer money, pay bills, check your card status, and manage beneficiaries — all through a single conversation.',
    intent: 'I want to do my daily banking',
  },
  {
    icon: '📊',
    title: 'Know your finances',
    desc:  'Check balances, review recent transactions, track spending patterns, and view your credit score — instantly.',
    intent: 'I want to know my finances',
  },
];

export default function Dashboard({ onOpenChat, onSignIn }) {
  const { authState, customerName } = useAuth();

  return (
    <main className="dashboard">

      {/* Auth welcome banner */}
      {authState === 'authenticated' && (
        <div className="auth-banner" role="status">
          <span className="auth-banner-icon" aria-hidden="true">✅</span>
          <span>
            Welcome back, <strong>{customerName}</strong>!
            Your AI assistant is ready — open the chat to get started.
          </span>
          <button className="auth-banner-cta" onClick={() => onOpenChat()}>
            Open chat →
          </button>
        </div>
      )}

      {/* ── Hero ── */}
      <section className="hero" id="hero">
        <div className="hero-inner">

          {/* Left: copy */}
          <div className="hero-left">
            <div className="hero-badge">
              <span className="hero-badge-dot" aria-hidden="true" />
              Agentic AI · Built on Accenture × Google GECX
            </div>

            <h1>
              Your time matters.<br />
              <span className="hero-accent">We act fast.</span>
            </h1>

            <p>
              Finally, banking on your terms. No queues, no long calls,
              no paperwork — just tell us what you need and it's handled,
              securely and personally.
            </p>

            <div className="hero-ctas">
              <button className="btn-hero" onClick={() => onOpenChat()}>
                Get started
              </button>
              <button
                className="btn-hero-ghost"
                onClick={() => onOpenChat('Tell me about ACN Bank products')}
              >
                See what it can do
              </button>
            </div>

            <div className="hero-stats" role="list" aria-label="Key statistics">
              {[
                { val: '50+',  lbl: 'Banking actions' },
                { val: '<30s', lbl: 'Task completion'  },
                { val: '24/7', lbl: 'Always on'        },
                { val: '4.8★', lbl: 'Satisfaction'     },
              ].map(({ val, lbl }) => (
                <div key={lbl} className="hero-stat" role="listitem">
                  <span className="stat-val">{val}</span>
                  <span className="stat-lbl">{lbl}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: animated credit card */}
          <div className="hero-right" aria-hidden="true">
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
      <section className="products" id="products">
        <p className="section-label">What the agent handles</p>
        <div className="product-grid">
          {PRODUCTS.map((p) => (
            <div key={p.title} className="product-card">
              <div className="product-icon" aria-hidden="true">{p.icon}</div>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
              <button className="card-cta" onClick={() => onOpenChat(p.intent)}>
                Get started →
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="site-footer">
        <span>© 2026 ACN Bank · Agentic banking powered by Accenture × Google GECX</span>
        <button className="footer-chat-link" onClick={() => onOpenChat()}>Chat with us ↗</button>
      </footer>

    </main>
  );
}
