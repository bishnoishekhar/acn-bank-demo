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
    category: 'Accounts & Deposits',
    badge: 'Popular',
    title: 'Checking & Savings Accounts',
    desc:  'Open a TD Beyond Checking, Convenience Checking, or high-yield Savings account in minutes — guided step by step with zero paperwork.',
    intent: 'I want to apply for a product',
  },
  {
    icon: '🏦',
    category: 'Daily Banking',
    badge: 'Instant',
    title: 'Daily Banking & Transfers',
    desc:  'Transfer funds between accounts, pay utility bills, send money with Direct Pay / Zelle®, and manage payees in a single conversation.',
    intent: 'I want to do my daily banking',
  },
  {
    icon: '📊',
    category: 'Financial Health',
    badge: 'Smart Insights',
    title: 'Spending & Financial Intelligence',
    desc:  'Check live balances, review recent statements, monitor categorized monthly spending trends, and review credit score health.',
    intent: 'Analyze my spending',
  },
  {
    icon: '📈',
    category: 'Investing & Wealth',
    badge: 'Up to 3.80%',
    title: 'Guaranteed GICs & Term Deposits',
    desc:  'Compare guaranteed TD GIC rates up to 3.80% and high-yield TFSA/RRSP options with interactive compound growth simulators.',
    intent: 'Check GIC rates',
  },
  {
    icon: '📱',
    category: 'Financing',
    badge: 'Budget-Friendly',
    title: 'Lifestyle & Easy Payment Plans',
    desc:  'Finance the tech, travel, or appliances you want today. Spread the cost across flexible monthly instalments with TD Easy Payment Plan.',
    intent: 'I want to buy something on Easy Payment Plan',
  },
  {
    icon: '🏠',
    category: 'Home Lending',
    badge: 'Pre-Approval',
    title: 'TD Mortgages & Home Lending',
    desc:  'Explore competitive fixed & variable mortgage rates, calculate down payments, and receive a fast pre-approval estimate in seconds.',
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

      {/* ── TD Online Banking Sub-bar / Products & Services Breadcrumbs ── */}
      <div className="td-subnav-bar">
        <div className="td-subnav-inner">
          <div className="td-breadcrumb">
            <span className="td-breadcrumb-root">Online Banking</span>
            <span className="td-breadcrumb-sep">/</span>
            <span className="td-breadcrumb-item">Settings</span>
            <span className="td-breadcrumb-sep">/</span>
            <span className="td-breadcrumb-current">Products &amp; Services</span>
          </div>
          <div className="td-subnav-quicklinks">
            <a
              href="#products"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              Explore Products
            </a>
            <a
              href="#cards-section"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById('cards')?.scrollIntoView({ behavior: 'smooth' }) ||
                document.getElementById('cards-section')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              Credit Cards
            </a>
            <a
              href="#home-insights-section"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById('home-insights-section')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              Wealth &amp; GICs
            </a>
            {authState === 'authenticated' && (
              <a
                href="#my-qr-section"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('my-qr-section')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Direct Pay QR
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ── Hero ── */}
      <section className="hero" id="hero">
        <div className="hero-inner">

          {/* Left: copy */}
          <div className="hero-left">
            <div className="hero-badge">
              <span className="hero-badge-dot" aria-hidden="true" />
              TD Bank Online Banking · Products &amp; Services
            </div>

            <h1>
              Unexpectedly human.<br />
              <span className="hero-accent">Banking made convenient.</span>
            </h1>

            <p>
              Explore our full suite of personal accounts, cash back cards, mortgages,
              and guaranteed investments. Fast, paperless, and backed 24/7 by the
              intelligent TD Assistant — banking on your terms.
            </p>

            <div className="hero-ctas">
              <button
                className="btn-hero"
                onClick={() => {
                  document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Explore Products &amp; Services
              </button>
              <button
                className="btn-hero-ghost"
                onClick={() => onOpenChat('Analyze my spending')}
              >
                Financial Insights &amp; Tools
              </button>
            </div>

            <div className="hero-stats" role="list" aria-label="Key statistics">
              {[
                { val: '50+',  lbl: 'Banking Services' },
                { val: '<30s', lbl: 'Digital Decisions' },
                { val: '24/7', lbl: 'Always On'         },
                { val: '4.8★', lbl: 'Customer Rating'   },
              ].map(({ val, lbl }) => (
                <div key={lbl} className="hero-stat" role="listitem">
                  <span className="stat-val">{val}</span>
                  <span className="stat-lbl">{lbl}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: animated TD credit card */}
          <div className="hero-right" aria-hidden="true">
            <div className="acn-card-stage">
              <div className="acn-credit-card td-credit-card">
                <div className="acn-cc-sheen" />
                <div className="acn-cc-top">
                  <div className="td-cc-logo-wrap">
                    <span className="td-cc-logo-box">TD</span>
                    <span className="acn-cc-bank">TD Bank</span>
                  </div>
                  <span className="acn-cc-flag">Cash Rewards · Visa</span>
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
              <div className="acn-float acn-float-2">🎁&nbsp; TD Rewards · 5× points</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── My QR + Live QR History (receive side, Direct Pay) ── */}
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
            <p className="section-label" style={{ marginBottom: 4 }}>TD Direct Pay QR · Receive Instant Transfers</p>
            <p style={{ margin: 0, fontSize: 13, color: '#52685B' }}>
              Signed in as <strong>{customer.legalName || customerName}</strong> — scan with the TD Bank Mobile App to send money directly to this account.
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

      {/* ── Home Financial Insights & Spending Breakdown ── */}
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
            TD Financial Intelligence &amp; Cashflow Insights
          </p>
          <p style={{ margin: '0 0 16px', fontSize: 13.5, color: '#52685B' }}>
            Real-time category spending breakdowns, upcoming utility bills, saving rate progress, and guaranteed GIC investment simulator.
          </p>
          <SpendingMiniWidgetsGrid
            mode="dashboard"
            customerName={authState === 'authenticated' ? (customer?.legalName || customerName) : 'TD Demo Preview'}
            bills={customerBills}
            onAction={(utterance) => onOpenChat(utterance)}
          />
        </div>

        <InvestmentCardWidget
          payload={{ principal: 25000 }}
          onAction={(utterance) => onOpenChat(utterance)}
        />
      </section>

      {/* ── Products & Services Catalog ── */}
      <section className="products" id="products">
        <div className="section-header-wrap" style={{ textAlign: 'center', marginBottom: 32 }}>
          <p className="section-label" style={{ justifyContent: 'center' }}>
            TD Products &amp; Services
          </p>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: '#003F2D', margin: '4px 0 10px', letterSpacing: '-0.5px' }}>
            Products built around how you live
          </h2>
          <p style={{ fontSize: 14.5, color: '#52685B', maxWidth: 640, margin: '0 auto' }}>
            Select any banking solution below to learn more, calculate your savings, or begin an instant paperless application.
          </p>
        </div>

        <div className="product-grid">
          {PRODUCTS.map((p) => (
            <div key={p.title} className="product-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div className="product-icon" aria-hidden="true">{p.icon}</div>
                {p.badge && (
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 800,
                      padding: '3px 8px',
                      borderRadius: 999,
                      background: '#E8F5E9',
                      color: '#005030',
                      border: '1px solid #C8E6C9',
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {p.badge}
                  </span>
                )}
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#008542', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                {p.category}
              </span>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
              <button className="card-cta" onClick={() => onOpenChat(p.intent)}>
                Explore &amp; Apply →
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── Public card catalogue ── */}
      <div id="cards-section">
        <CardsSection onOpenChat={onOpenChat} />
      </div>

      {/* ── Site Footer ── */}
      <footer className="site-footer">
        <div className="site-footer-inner">
          <div className="footer-top">
            <div className="footer-logo">
              <span className="td-nav-logo-box footer-logo-box" aria-hidden="true">TD</span>
              <span className="footer-brand">TD Bank</span>
            </div>
            <div className="footer-links">
              <a
                href="#products"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Products &amp; Services
              </a>
              <a
                href="#cards-section"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('cards')?.scrollIntoView({ behavior: 'smooth' }) ||
                  document.getElementById('cards-section')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Credit Cards
              </a>
              <a
                href="#home-insights-section"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('home-insights-section')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Investing &amp; Wealth
              </a>
              <a href="#privacy" onClick={(e) => e.preventDefault()}>Privacy &amp; Security</a>
              <a href="#terms" onClick={(e) => e.preventDefault()}>Terms of Service</a>
            </div>
          </div>
          <div className="footer-bottom">
            <span>
              © 2026 TD Bank, N.A. All rights reserved. Member FDIC / CDIC | Equal Housing Lender ⌂ | Agentic AI banking powered by Google GECX.
            </span>
            <button className="footer-chat-link" onClick={() => onOpenChat()}>
              Chat with TD Assistant ↗
            </button>
          </div>
        </div>
      </footer>

    </main>
  );
}
