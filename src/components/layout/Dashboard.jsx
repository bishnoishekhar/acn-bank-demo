import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { fetchCustomerBills } from '../../firebase';
import CardsSection from './CardsSection';
import MyQrCard from '../MyQrCard';
import QrHistoryCard from '../QrHistoryCard';
import { SpendingMiniWidgetsGrid, InvestmentCardWidget } from '../FinancialInsightsWidgets';

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
    intent: 'Analyze my spending',
  },
  {
    icon: '📈',
    title: 'GICs & Registered Investing',
    desc:  'Compare guaranteed GIC rates up to 3.80% and high-yield TFSA/RRSP options with interactive compounding projections.',
    intent: 'Check GIC rates',
  },
  {
    icon: '📱',
    title: 'Lifestyle Financing',
    desc:  'Own the phone, laptop, or gadget you actually want. Split the cost across easy monthly instalments with our Easy Payment Plan.',
    intent: 'I want to buy something on Easy Payment Plan',
  },
  {
    icon: '🏠',
    title: 'Mortgage estimate',
    desc:  'See what a home mortgage could look like for you — property price, down payment, tenure, and your monthly figure in seconds.',
    intent: 'I want a mortgage pre-approval estimate',
  },
];

export default function Dashboard({ onOpenChat }) {
  const { authState, customerName, customer, customerId } = useAuth();
  const [customerBills, setCustomerBills] = useState([]);

  // Hero card art shows the real cardholder once signed in, a placeholder before.
  const cardHolder = customer?.legalName?.toUpperCase() || 'YOUR NAME HERE';

  useEffect(() => {
    if (authState !== 'authenticated' || !customerId) {
      setCustomerBills([]);
      return;
    }
    let cancelled = false;
    fetchCustomerBills(customerId).then((bills) => {
      if (!cancelled) setCustomerBills(bills || []);
    });
    return () => {
      cancelled = true;
    };
  }, [authState, customerId]);

  return (
    <main className="dashboard">

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
                onClick={() => onOpenChat('Analyze my spending')}
              >
                Explore financial insights
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
                    <div className="acn-cc-value">{cardHolder}</div>
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

      {/* ── My QR + Live QR History (receive side, ACN QR Pay) ── */}
      {authState === 'authenticated' && customer?.customerId && customer.qrEnabled !== false && (
        <section
          id="my-qr-section"
          style={{
            maxWidth: 1120,
            margin: '16px auto 28px',
            padding: '0 24px',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <p className="section-label" style={{ marginBottom: 4 }}>ACN QR Pay · Receive Instant Transfers</p>
            <p style={{ margin: 0, fontSize: 13, color: '#64748B' }}>
              Signed in as <strong>{customer.legalName || customerName}</strong> — scan with the ACN Bank Mobile App to send money directly to this account.
            </p>
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              alignItems: 'stretch',
              gap: 24,
            }}
          >
            <MyQrCard />
            <QrHistoryCard />
          </div>
        </section>
      )}

      {/* ── Home Financial Insights & Spending Breakdown (Mini-2x2 Widgets + Pie Chart + GIC Projector) ── */}
      <section
        id="home-insights-section"
        style={{
          maxWidth: 1200,
          margin: '0 auto 56px',
          padding: '0 5%',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        <div>
          <p className="section-label" style={{ marginBottom: 6 }}>
            Financial Intelligence & Interactive Insights
          </p>
          <p style={{ margin: '0 0 16px', fontSize: 13.5, color: '#64748B' }}>
            Real-time category pie breakdown, spending trend pulse, upcoming utility bills, saving rate gauge, and GIC growth simulator.
          </p>
          <SpendingMiniWidgetsGrid
            mode="dashboard"
            customerName={authState === 'authenticated' ? (customer?.legalName || customerName) : 'ACN Demo Preview'}
            bills={customerBills}
            onAction={(utterance) => onOpenChat(utterance)}
          />
        </div>

        <InvestmentCardWidget
          payload={{ principal: 25000 }}
          onAction={(utterance) => onOpenChat(utterance)}
        />
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

      {/* ── Public card catalogue (guest-browsable, scenario 1) ── */}
      <CardsSection onOpenChat={onOpenChat} />

      {/* ── Footer ── */}
      <footer className="site-footer">
        <span>© 2026 ACN Bank · Agentic banking powered by Accenture × Google GECX</span>
        <button className="footer-chat-link" onClick={() => onOpenChat()}>Chat with us ↗</button>
      </footer>

    </main>
  );
}
