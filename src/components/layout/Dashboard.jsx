import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { fetchCustomerBills } from '../../firebase';
import CardsSection from './CardsSection';
import MyQrCard from '../MyQrCard';
import QrHistoryCard from '../QrHistoryCard';
import { SpendingMiniWidgetsGrid, InvestmentCardWidget } from '../FinancialInsightsWidgets';

export default function Dashboard({ onOpenChat }) {
  const { authState, customerName, customer, customerId } = useAuth();
  const [customerBills, setCustomerBills] = useState([]);
  const [activeCategory, setActiveCategory] = useState('cards');

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

  const scrollToSection = (id, categoryId) => {
    setActiveCategory(categoryId);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <main className="dashboard td-portal-layout">

      {/* ── 1. Hero Banner with Couple Photo & Centered Green Overlay Box ── */}
      <section className="td-hero-banner" id="hero" aria-label="Products and Services overview">
        <div className="td-hero-overlay-box">
          <h1 className="td-hero-title">Products &amp; Services</h1>
          <p className="td-hero-desc">
            Need a checking account, a credit card or a personal loan?<br />
            We can help with your financial needs and make banking easy.
          </p>
        </div>
      </section>

      {/* ── 2. Circular Icon Category Bar ── */}
      <nav className="td-icon-bar" aria-label="Product Categories">
        <div className="td-icon-bar-inner">

          {/* 1. Bank Cards */}
          <button
            type="button"
            className={`td-icon-item${activeCategory === 'cards' ? ' is-active' : ''}`}
            onClick={() => scrollToSection('bank-cards-section', 'cards')}
          >
            <div className="td-icon-circle">
              <svg width="28" height="20" viewBox="0 0 24 18" fill="none" stroke="#238234" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="1" y="2" width="22" height="14" rx="2" />
                <line x1="1" y1="7" x2="23" y2="7" />
                <line x1="5" y1="12" x2="9" y2="12" />
              </svg>
            </div>
            <span className="td-icon-label">Bank Cards</span>
          </button>

          {/* 2. Bank Accounts */}
          <button
            type="button"
            className={`td-icon-item${activeCategory === 'accounts' ? ' is-active' : ''}`}
            onClick={() => scrollToSection('bank-accounts-section', 'accounts')}
          >
            <div className="td-icon-circle">
              <svg width="26" height="22" viewBox="0 0 24 20" fill="none" stroke="#238234" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h17a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z" />
                <path d="M4 6V4a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v2" />
                <circle cx="17.5" cy="13" r="1.5" fill="#238234" />
              </svg>
            </div>
            <span className="td-icon-label">Bank Accounts</span>
          </button>

          {/* 3. Loans & Lines of Credit */}
          <button
            type="button"
            className={`td-icon-item${activeCategory === 'loans' ? ' is-active' : ''}`}
            onClick={() => scrollToSection('loans-section', 'loans')}
          >
            <div className="td-icon-circle">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#238234" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v12M15 9.5a2.5 2.5 0 0 0-2.5-2.5h-1a2.5 2.5 0 0 0 0 5h1a2.5 2.5 0 0 1 0 5h-1A2.5 2.5 0 0 1 9 14.5" />
              </svg>
            </div>
            <span className="td-icon-label">Loans &amp; Lines of Credit</span>
          </button>

          {/* 4. Investments */}
          <button
            type="button"
            className={`td-icon-item${activeCategory === 'investments' ? ' is-active' : ''}`}
            onClick={() => scrollToSection('investments-section', 'investments')}
          >
            <div className="td-icon-circle">
              <svg width="26" height="22" viewBox="0 0 24 20" fill="none" stroke="#238234" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="7" width="20" height="13" rx="2" />
                <path d="M16 7V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v3" />
                <path d="M2 12h20" />
              </svg>
            </div>
            <span className="td-icon-label">Investments</span>
          </button>

          {/* 5. Mobile Banking */}
          <button
            type="button"
            className={`td-icon-item${activeCategory === 'mobile' ? ' is-active' : ''}`}
            onClick={() => scrollToSection('mobile-section', 'mobile')}
          >
            <div className="td-icon-circle">
              <svg width="22" height="26" viewBox="0 0 18 24" fill="none" stroke="#238234" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="1" width="14" height="22" rx="3" />
                <line x1="8" y1="19" x2="10" y2="19" />
              </svg>
            </div>
            <span className="td-icon-label">Mobile Banking</span>
          </button>

          {/* 6. Other Products & Services */}
          <button
            type="button"
            className={`td-icon-item${activeCategory === 'other' ? ' is-active' : ''}`}
            onClick={() => scrollToSection('other-products-section', 'other')}
          >
            <div className="td-icon-circle">
              <svg width="26" height="24" viewBox="0 0 24 22" fill="none" stroke="#238234" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 8l10-6 10 6v2H2V8z" />
                <line x1="4" y1="10" x2="4" y2="18" />
                <line x1="9" y1="10" x2="9" y2="18" />
                <line x1="15" y1="10" x2="15" y2="18" />
                <line x1="20" y1="10" x2="20" y2="18" />
                <rect x="1" y="18" width="22" height="3" rx="1" />
              </svg>
            </div>
            <span className="td-icon-label">Other Products &amp; Services</span>
          </button>

        </div>
      </nav>

      {/* Horizontal Divider */}
      <div className="td-category-divider" />

      {/* ── 3. Bank Cards Feature Section (3 Tiles exactly matching screenshot) ── */}
      <section className="td-cards-feature-wrap" id="bank-cards-section">
        <h2 className="td-section-title">Bank Cards</h2>

        <div className="td-tiles-grid">
          {/* Tile 1: Solid Green Box */}
          <div className="td-tile-card">
            <div className="td-tile-box td-tile-box--green">
              <svg width="34" height="26" viewBox="0 0 24 18" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="1" y="2" width="22" height="14" rx="2" />
                <line x1="1" y1="7" x2="23" y2="7" />
                <line x1="5" y1="12" x2="9" y2="12" />
              </svg>
              <p className="td-tile-text">
                Bank and shop worldwide with convenience and security.
              </p>
            </div>
            <div className="td-tile-indicator">
              <svg width="24" height="18" viewBox="0 0 24 18" fill="none" stroke="#238234" strokeWidth="1.8">
                <rect x="1" y="2" width="22" height="14" rx="2" />
                <line x1="1" y1="7" x2="23" y2="7" />
              </svg>
            </div>
          </div>

          {/* Tile 2: Photo 1 (Person smiling with laptop & card) */}
          <div className="td-tile-card">
            <div className="td-tile-box td-tile-box--photo1" aria-label="Customer using credit card online" />
            <div className="td-tile-indicator">
              <svg width="24" height="18" viewBox="0 0 24 18" fill="none" stroke="#238234" strokeWidth="1.8">
                <rect x="1" y="2" width="22" height="14" rx="2" />
                <line x1="1" y1="7" x2="23" y2="7" />
              </svg>
            </div>
          </div>

          {/* Tile 3: Photo 2 (Person tapping card at checkout terminal) */}
          <div className="td-tile-card">
            <div className="td-tile-box td-tile-box--photo2" aria-label="Customer paying contactless with card" />
            <div className="td-tile-indicator">
              <svg width="24" height="18" viewBox="0 0 24 18" fill="none" stroke="#238234" strokeWidth="1.8">
                <rect x="1" y="2" width="22" height="14" rx="2" />
                <line x1="1" y1="7" x2="23" y2="7" />
              </svg>
            </div>
          </div>
        </div>

        {/* ── Interactive Credit Cards Catalog ── */}
        <div id="cards" style={{ marginTop: 24 }}>
          <CardsSection onOpenChat={onOpenChat} />
        </div>
      </section>

      {/* ── 4. Bank Accounts Section (Checking & Savings) ── */}
      <section className="td-content-section" id="bank-accounts-section" style={{ background: '#F8FAFC', padding: '48px 5%' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <h2 className="td-section-title" style={{ margin: 0 }}>Bank Accounts</h2>
            <p style={{ color: '#52685B', fontSize: 14.5, margin: '8px 0 0' }}>
              Everyday chequing and high-interest savings accounts tailored to your lifestyle.
            </p>
          </div>

          <div className="product-grid" style={{ maxWidth: 1000, margin: '0 auto' }}>
            <div className="product-card">
              <div className="product-icon">💳</div>
              <h3>TD Beyond Checking</h3>
              <p>Unlimited transactions, fee-free worldwide ATMs, and complimentary overdraft protection.</p>
              <button className="card-cta" onClick={() => onOpenChat('I want to open a checking account')}>
                Apply for Checking →
              </button>
            </div>
            <div className="product-card">
              <div className="product-icon">👛</div>
              <h3>TD High-Yield Savings</h3>
              <p>Earn high daily interest on every dollar with automated deposit round-ups and no minimum balance.</p>
              <button className="card-cta" onClick={() => onOpenChat('I want to open a savings account')}>
                Explore Savings →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. Loans & Lines of Credit ── */}
      <section className="td-content-section" id="loans-section" style={{ padding: '48px 5%' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <h2 className="td-section-title" style={{ margin: 0 }}>Loans &amp; Lines of Credit</h2>
            <p style={{ color: '#52685B', fontSize: 14.5, margin: '8px 0 0' }}>
              Competitive fixed and variable rates for home purchases, renovations, and personal projects.
            </p>
          </div>

          <div className="product-grid" style={{ maxWidth: 1000, margin: '0 auto' }}>
            <div className="product-card">
              <div className="product-icon">🏠</div>
              <h3>TD Mortgages &amp; Home Equity</h3>
              <p>Calculate down payments, check pre-approval estimates, and lock in competitive fixed or variable rates.</p>
              <button className="card-cta" onClick={() => onOpenChat('I want a mortgage pre-approval estimate')}>
                Estimate Mortgage →
              </button>
            </div>
            <div className="product-card">
              <div className="product-icon">📱</div>
              <h3>Lifestyle &amp; Easy Payment Plans</h3>
              <p>Finance electronics, appliances, and travel over flexible monthly instalments with zero surprises.</p>
              <button className="card-cta" onClick={() => onOpenChat('I want to buy something on Easy Payment Plan')}>
                Explore EPP Plans →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. Investments & Guaranteed Growth ── */}
      <section className="td-content-section" id="investments-section" style={{ background: '#F8FAFC', padding: '48px 5%' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <h2 className="td-section-title" style={{ margin: 0 }}>Investments</h2>
            <p style={{ color: '#52685B', fontSize: 14.5, margin: '8px 0 0' }}>
              Guaranteed Term Deposits &amp; GIC investments with CDIC protection and tax-free compounding.
            </p>
          </div>

          <InvestmentCardWidget
            payload={{ principal: 25000 }}
            onAction={(utterance) => onOpenChat(utterance)}
          />
        </div>
      </section>

      {/* ── 7. Mobile Banking & Direct Pay QR ── */}
      <section className="td-content-section" id="mobile-section" style={{ padding: '48px 5%' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <h2 className="td-section-title" style={{ margin: 0 }}>Mobile Banking</h2>
            <p style={{ color: '#52685B', fontSize: 14.5, margin: '8px 0 0' }}>
              Bank from anywhere with the TD mobile experience and instant Direct Pay QR transfers.
            </p>
          </div>

          {authState === 'authenticated' && customer?.customerId && customer.qrEnabled !== false ? (
            <div id="my-qr-section" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 24 }}>
              <MyQrCard />
              <QrHistoryCard />
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '24px', background: '#FFFFFF', borderRadius: 12, border: '1px solid #D6E2D9', maxWidth: 600, margin: '0 auto' }}>
              <p style={{ fontSize: 14, color: '#003F2D', fontWeight: 700, margin: '0 0 10px' }}>
                Sign in to access your TD Direct Pay QR code
              </p>
              <p style={{ fontSize: 13, color: '#52685B', margin: '0 0 16px' }}>
                Receive instant zero-fee money transfers directly into your checking account.
              </p>
              <button className="card-cta" onClick={() => onOpenChat('I want to do my daily banking')}>
                Explore Daily Banking →
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── 8. Other Products & Services / Financial Insights ── */}
      <section className="td-content-section" id="other-products-section" style={{ background: '#F8FAFC', padding: '48px 5%' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <h2 className="td-section-title" style={{ margin: 0 }}>Other Products &amp; Services</h2>
            <p style={{ color: '#52685B', fontSize: 14.5, margin: '8px 0 0' }}>
              Real-time cashflow intelligence, utility bill reminders, and 24/7 TD Assistant support.
            </p>
          </div>

          <SpendingMiniWidgetsGrid
            mode="dashboard"
            customerName={authState === 'authenticated' ? (customer?.legalName || customerName) : 'TD Demo Preview'}
            bills={customerBills}
            onAction={(utterance) => onOpenChat(utterance)}
          />
        </div>
      </section>

      {/* ── 9. Site Footer ── */}
      <footer className="site-footer">
        <div className="site-footer-inner">
          <div className="footer-top">
            <div className="footer-logo">
              <span className="td-nav-logo-box footer-logo-box" aria-hidden="true">TD</span>
              <span className="footer-brand">TD Bank</span>
            </div>
            <div className="footer-links">
              <a href="#bank-cards-section">Bank Cards</a>
              <a href="#bank-accounts-section">Bank Accounts</a>
              <a href="#loans-section">Loans &amp; Mortgages</a>
              <a href="#investments-section">Investments</a>
              <a href="#mobile-section">Mobile Banking</a>
              <a href="#privacy" onClick={(e) => e.preventDefault()}>Privacy &amp; Security</a>
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
