import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { SIGN_IN_SENTINEL, CANADIAN_BILLERS, computeDaysUntil } from './ChatPanel';
import { connectBidiWhenReady, disconnectBidi, isBidiActive } from '../gecxBidi';
import {
  fetchCustomerBills,
  fetchCustomerBeneficiaries,
  fetchP2PContacts,
} from '../../firebase';
import InsightCard from '../Insightcard';
import AccountCarousel from '../AccountCarousel';
import {
  SpendingMiniWidgetsGrid,
  InvestmentCardWidget,
  ContextualProactiveAlert,
  RecentTransactionsWidget,
} from '../FinancialInsightsWidgets';

// ── Quick-action suggestions (mirrors ChatPanel) ───────────────────────────────
const GUEST_SUGGESTIONS = [
  { label: '💳 Explore credit cards', utterance: 'Show me your credit cards' },
  { label: '📈 GIC & investment rates', utterance: 'Check GIC rates' },
  { label: '⚖️ Compare cards',        utterance: 'Compare your credit cards' },
  { label: '✈️ Best card for travel', utterance: 'Which card is best for travel?' },
  { label: '🔐 Sign in',              utterance: SIGN_IN_SENTINEL },
  { label: '💡 What can you do?',     utterance: 'What can you help me with?' },
];

const CUSTOMER_SUGGESTIONS = [
  { label: '💡 Analyze my spending',   utterance: 'Analyze my spending' },
  { label: '🧾 Pay upcoming bill',     utterance: 'Check my upcoming bills and help me pay them' },
  { label: '📈 Check GIC rates',       utterance: 'Check GIC rates' },
  { label: '💰 Check balance',         utterance: 'Check my balance' },
  { label: '💸 Send money',            utterance: 'Transfer money' },
  { label: '📊 Recent transactions',   utterance: 'Show my recent transactions' },
];

// ── BotText — renders **bold** as <strong> ────────────────────────────────────
function FcBotText({ text }) {
  function parseBold(str) {
    const parts = str.split(/(\*\*[^*\n]+\*\*)/g);
    if (parts.length === 1) return str;
    return parts.map((part, i) => {
      const m = part.match(/^\*\*([^*\n]+)\*\*$/);
      return m ? <strong key={i}>{m[1]}</strong> : part;
    });
  }
  const lines = text.split('\n').filter(Boolean);
  if (lines.length <= 1) return <>{parseBold(text)}</>;
  return (
    <>
      {lines.map((line, i) => (
        <span key={i} style={{ display: 'block', marginBottom: i < lines.length - 1 ? '4px' : 0 }}>
          {parseBold(line)}
        </span>
      ))}
    </>
  );
}

// ── FloatingChatWidget ─────────────────────────────────────────────────────────

export default function FloatingChatWidget({
  messages = [],
  isOpen,
  onOpen,
  onClose,
  onSend,
  onRequestSignIn,
}) {
  const { isAuthenticated, customerId, customerName } = useAuth();
  const AI_SUGGESTIONS = isAuthenticated ? CUSTOMER_SUGGESTIONS : GUEST_SUGGESTIONS;

  const [inputVal,          setInputVal]          = useState('');
  const [unread,            setUnread]            = useState(0);
  const [voiceActive,       setVoiceActive]       = useState(false);
  const [activePopover,     setActivePopover]     = useState(null); // 'contact' | 'suggestions' | null
  const [contactTab,        setContactTab]        = useState('billers');
  const [customerBills,     setCustomerBills]     = useState([]);
  const [beneficiaries,     setBeneficiaries]     = useState([]);
  const [p2pContacts,       setP2pContacts]       = useState([]);
  const [billerSearch,      setBillerSearch]      = useState('');
  const [billerCategory,    setBillerCategory]    = useState('All');
  const [selectedBillerId,  setSelectedBillerId]  = useState(null);
  const [customBillerAmt,   setCustomBillerAmt]   = useState('');

  const msgsRef         = useRef(null);
  const prevCountRef    = useRef(messages.length);
  const galleryInputRef = useRef(null);
  const popoverRef      = useRef(null);

  const isResponding = messages.some((m) => m.type === 'typing');
  const hasContent   = messages.some(
    (m) =>
      m.type === 'bot' ||
      m.type === 'user' ||
      m.type === 'combo' ||
      m.type === 'insight' ||
      m.type === 'investment-card' ||
      m.type === 'spending-dashboard' ||
      m.type === 'transactions-widget',
  );

  // Load customer bills, beneficiaries, and P2P contacts when signed in
  useEffect(() => {
    if (!isAuthenticated || !customerId) {
      setCustomerBills([]);
      setBeneficiaries([]);
      setP2pContacts([]);
      return;
    }
    let cancelled = false;
    Promise.all([
      fetchCustomerBills(customerId),
      fetchCustomerBeneficiaries(customerId),
      fetchP2PContacts(customerId),
    ]).then(([bills, benes, contacts]) => {
      if (cancelled) return;
      setCustomerBills(bills || []);
      setBeneficiaries(benes || []);
      setP2pContacts(contacts || []);
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, customerId]);

  // ── Scroll + unread badge ──────────────────────────────────────────────────
  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;

    if (!isOpen && messages.length > prevCountRef.current) {
      const newOnes = messages.slice(prevCountRef.current);
      const newBot  = newOnes.filter((m) => m.type === 'bot' || m.type === 'combo').length;
      if (newBot > 0) setUnread((u) => u + newBot);
    }
    prevCountRef.current = messages.length;
  }, [messages, isOpen]);

  useEffect(() => { if (isOpen) setUnread(0); }, [isOpen]);

  // Close popover when clicking outside
  useEffect(() => {
    if (!activePopover) return;
    const handler = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setActivePopover(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [activePopover]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const handleSend = (text) => {
    const msg = (text ?? inputVal).trim();
    if (!msg || isResponding) return;
    setInputVal('');
    setActivePopover(null);
    if (msg === SIGN_IN_SENTINEL) { onRequestSignIn?.(); return; }
    onSend?.(msg);
  };

  const handleSuggestion = (s) => {
    setActivePopover(null);
    if (s.utterance === SIGN_IN_SENTINEL) { onRequestSignIn?.(); return; }
    onSend?.(s.utterance);
  };

  const toggleVoice = useCallback(() => {
    if (isBidiActive()) {
      disconnectBidi();
      setVoiceActive(false);
      return;
    }

    setVoiceActive(true);
    connectBidiWhenReady().then((ok) => {
      if (!ok) {
        setVoiceActive(false);
        console.warn('[ACN] floating widget could not start the voice session');
      }
    });
  }, []);

  useEffect(() => {
    const sync = setInterval(() => setVoiceActive(isBidiActive()), 500);
    return () => clearInterval(sync);
  }, []);

  const unpaidBills = customerBills.filter(
    (b) => !b.is_paid && String(b.status || '').toLowerCase() !== 'paid',
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fc-widget">
      {isOpen && (
        <div className="fc-panel">

          {/* ── Header ── */}
          <div className="fc-header">
            <div className="fc-avatar">A</div>
            <div className="fc-info">
              <div className="fc-title">
                ACN Bank AI {isAuthenticated && customerName ? `· ${customerName}` : ''}
              </div>
              <div className="fc-status">
                <span className="fc-status-dot" />
                {isResponding ? 'Typing…' : 'Online'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActivePopover((p) => (p === 'contact' ? null : 'contact'))}
              style={{
                padding: '4px 9px',
                borderRadius: 999,
                border: '1px solid #BFDBFE',
                background: activePopover === 'contact' ? '#002147' : '#EFF6FF',
                color: activePopover === 'contact' ? '#FFFFFF' : '#002147',
                fontSize: 10.5,
                fontWeight: 800,
                cursor: 'pointer',
              }}
              title="Open Canadian Utility Billers & Payees"
            >
              @ Billers {unpaidBills.length > 0 ? `(${unpaidBills.length})` : ''}
            </button>
            <button className="fc-close" onClick={onClose} aria-label="Minimise chat">✕</button>
          </div>

          {/* ── Messages ── */}
          <div className="fc-messages" ref={msgsRef}>
            {!hasContent && !isResponding && (
              <div className="fc-empty">
                <div className="fc-empty-icon">💬</div>
                <p>Ask anything or tap <strong>@</strong> below to pay utility bills</p>
              </div>
            )}

            {messages.map((msg) => {
              if (msg.type === 'bot') return (
                <div key={msg.id} className="fc-bot-bubble">
                  <FcBotText text={msg.text} />
                </div>
              );

              if (msg.type === 'user') return (
                <div key={msg.id} className="fc-user-bubble">{msg.text}</div>
              );

              if (msg.type === 'typing') return (
                <div key={msg.id} className="fc-typing">
                  <span /><span /><span />
                </div>
              );

              if (msg.type === 'insight') return (
                <div key={msg.id} style={{ width: '100%' }}>
                  <InsightCard
                    payload={msg.payload}
                    onCta={(v) => handleSend(v)}
                  />
                </div>
              );

              if (msg.type === 'investment-card') return (
                <div key={msg.id} style={{ width: '100%' }}>
                  <InvestmentCardWidget
                    payload={msg.payload}
                    onAction={(v) => handleSend(v)}
                  />
                </div>
              );

              if (msg.type === 'spending-dashboard') return (
                <div key={msg.id} style={{ width: '100%' }}>
                  <SpendingMiniWidgetsGrid
                    mode="chat"
                    payload={msg.payload}
                    customerName={customerName}
                    bills={customerBills}
                    onAction={(v) => handleSend(v)}
                  />
                </div>
              );

              if (msg.type === 'contextual-alert') return (
                <div key={msg.id} style={{ width: '100%' }}>
                  <ContextualProactiveAlert
                    payload={msg.payload}
                    onAction={(v) => handleSend(v)}
                  />
                </div>
              );

              if (msg.type === 'transactions-widget') return (
                <div key={msg.id} style={{ width: '100%' }}>
                  <RecentTransactionsWidget
                    payload={msg.payload}
                    onAction={(v) => handleSend(v)}
                  />
                </div>
              );

              if (msg.type === 'carousel') return (
                <div key={msg.id} style={{ width: '100%' }}>
                  <AccountCarousel
                    payload={msg.payload}
                    onCta={(v) => handleSend(v)}
                  />
                </div>
              );

              // Combo card — show heading + actual action pill buttons
              if (msg.type === 'combo' && (msg.heading || msg.actions?.length > 0)) return (
                <div key={msg.id} className="fc-bot-bubble" style={{ maxWidth: '94%' }}>
                  {msg.heading && <FcBotText text={msg.heading} />}
                  {msg.actions?.length > 0 && (
                    <div className="fc-combo-actions">
                      {msg.actions.map((action, i) => {
                        const label = action.content || action.utterance || '';
                        const isSignIn = action.isSignIn || action.utterance === SIGN_IN_SENTINEL;
                        return (
                          <button
                            key={i}
                            className={`fc-action-pill${isSignIn ? ' fc-action-signin' : ''}`}
                            onClick={() => isSignIn
                              ? onRequestSignIn?.()
                              : handleSend(action.utterance || action.content)
                            }
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );

              if (msg.type === 'receipt') return (
                <div key={msg.id} className="fc-bot-bubble">
                  ✓ {msg.payload?.title || 'Done'}
                </div>
              );

              return null;
            })}
          </div>

          {/* ── @ Utility Billers & Payees Popover Sheet ── */}
          {activePopover === 'contact' && (
            <div
              ref={popoverRef}
              style={{
                background: '#FFFFFF',
                borderTop: '1px solid #CBD5E1',
                maxHeight: 315,
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 -8px 24px rgba(15, 23, 42, 0.08)',
              }}
            >
              <div className="cp-menu-tabs">
                <button
                  type="button"
                  className={`cp-menu-tab${contactTab === 'billers' ? ' active' : ''}`}
                  onClick={() => setContactTab('billers')}
                >
                  ⚡ Utility Billers {unpaidBills.length > 0 ? `(${unpaidBills.length} due)` : ''}
                </button>
                <button
                  type="button"
                  className={`cp-menu-tab${contactTab === 'recipients' ? ' active' : ''}`}
                  onClick={() => setContactTab('recipients')}
                >
                  👥 Payees & QR
                </button>
              </div>

              {contactTab === 'billers' && (
                <div style={{ overflowY: 'auto', paddingBottom: 8 }}>
                  {/* 1. Upcoming unpaid bills */}
                  {isAuthenticated && unpaidBills.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div className="cp-menu-section-label" style={{ color: '#B45309', fontWeight: 800 }}>
                        ⚡ Your Upcoming Bills ({unpaidBills.length} due)
                      </div>
                      {unpaidBills.map((bill) => {
                        const amt = Number(bill.amount || bill.amount_due || 0).toFixed(2);
                        const billerTitle = bill.payee_name || bill.biller_name || 'Utility Bill';
                        const days = computeDaysUntil(bill.due_date);
                        const badgeText =
                          days !== null && days <= 3
                            ? `Due in ${Math.max(0, days)}d · Urgent`
                            : days !== null
                              ? `Due in ${days}d`
                              : `Due soon`;
                        return (
                          <div
                            key={bill.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 8,
                              padding: '7px 10px',
                              margin: '4px 8px',
                              borderRadius: 10,
                              background: '#FFFBEB',
                              border: '1px solid #FDE68A',
                            }}
                          >
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ fontSize: 12, fontWeight: 800, color: '#0F172A' }}>
                                  {billerTitle}
                                </span>
                                <span
                                  style={{
                                    fontSize: 9.5,
                                    fontWeight: 800,
                                    padding: '1px 6px',
                                    borderRadius: 999,
                                    background: '#FEF3C7',
                                    color: '#B45309',
                                  }}
                                >
                                  {badgeText}
                                </span>
                              </div>
                              <div style={{ fontSize: 10.5, color: '#64748B', marginTop: 1 }}>
                                Acct #{bill.account_number || 'On file'} · <strong>CAD ${amt}</strong>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleSend(`Pay my ${billerTitle} bill of $${amt} now`)}
                              style={{
                                padding: '5px 10px',
                                borderRadius: 8,
                                border: 'none',
                                background: '#002147',
                                color: '#FFFFFF',
                                fontSize: 10.5,
                                fontWeight: 800,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              Pay ${amt}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* 2. Search & Category Filter */}
                  <div style={{ padding: '4px 10px 6px' }}>
                    <input
                      type="text"
                      placeholder="Search Canadian utility, telecom & tax billers…"
                      value={billerSearch}
                      onChange={(e) => setBillerSearch(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 9px',
                        borderRadius: 8,
                        border: '1px solid #CBD5E1',
                        fontSize: 11.5,
                        marginBottom: 5,
                      }}
                    />
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {['All', 'Utilities', 'Telecom', 'Tax & Gov'].map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setBillerCategory(cat)}
                          style={{
                            padding: '3px 8px',
                            borderRadius: 999,
                            fontSize: 10,
                            fontWeight: 700,
                            cursor: 'pointer',
                            border: billerCategory === cat ? '1px solid #002147' : '1px solid #CBD5E1',
                            background: billerCategory === cat ? '#002147' : '#F8FAFC',
                            color: billerCategory === cat ? '#FFFFFF' : '#475569',
                          }}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="cp-menu-section-label">Canadian Billers Directory</div>
                  {CANADIAN_BILLERS.filter((b) => {
                    const matchesCat = billerCategory === 'All' || b.category === billerCategory;
                    const q = billerSearch.trim().toLowerCase();
                    const matchesSearch =
                      !q ||
                      b.name.toLowerCase().includes(q) ||
                      b.sub.toLowerCase().includes(q);
                    return matchesCat && matchesSearch;
                  }).map((b) => {
                    const isExpanded = selectedBillerId === b.id;
                    return (
                      <div key={b.id} style={{ borderBottom: '1px solid #F1F5F9', paddingBottom: isExpanded ? 6 : 0 }}>
                        <button
                          type="button"
                          className="cp-menu-biller-row"
                          onClick={() => {
                            setSelectedBillerId(isExpanded ? null : b.id);
                            setCustomBillerAmt('');
                          }}
                          style={{ width: '100%', justifyContent: 'space-between' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <div className="cp-menu-biller-avatar">{b.emoji}</div>
                            <div>
                              <div className="cp-menu-biller-name">{b.name}</div>
                              <div className="cp-menu-biller-sub">{b.sub}</div>
                            </div>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#002147' }}>
                            {isExpanded ? '▴' : 'Pay ›'}
                          </span>
                        </button>

                        {isExpanded && (
                          <div style={{ padding: '4px 10px 4px 48px', display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
                            {(b.presets || [50, 100, 150]).map((amt) => (
                              <button
                                key={amt}
                                type="button"
                                onClick={() => handleSend(`Pay $${amt} to ${b.name}`)}
                                style={{
                                  padding: '3px 8px',
                                  borderRadius: 999,
                                  border: '1px solid #002147',
                                  background: '#F0F9FF',
                                  color: '#002147',
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                Pay ${amt}
                              </button>
                            ))}
                            <input
                              type="number"
                              min="1"
                              step="0.01"
                              placeholder="Custom $"
                              value={customBillerAmt}
                              onChange={(e) => setCustomBillerAmt(e.target.value)}
                              style={{
                                width: 68,
                                padding: '3px 6px',
                                borderRadius: 6,
                                border: '1px solid #CBD5E1',
                                fontSize: 10.5,
                              }}
                            />
                            {Number(customBillerAmt) > 0 && (
                              <button
                                type="button"
                                onClick={() => handleSend(`Pay $${Number(customBillerAmt).toFixed(2)} to ${b.name}`)}
                                style={{
                                  padding: '3px 8px',
                                  borderRadius: 6,
                                  border: 'none',
                                  background: '#002147',
                                  color: '#FFFFFF',
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                Go
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {contactTab === 'recipients' && (
                <div style={{ overflowY: 'auto', paddingBottom: 8 }}>
                  {!isAuthenticated ? (
                    <div className="cp-menu-empty">
                      <span className="cp-menu-empty-icon">🔐</span>
                      <p>Sign in to view saved payees & P2P contacts</p>
                      <button className="cp-menu-signin" onClick={() => { setActivePopover(null); onRequestSignIn?.(); }}>
                        Sign in
                      </button>
                    </div>
                  ) : (
                    <>
                      <div style={{ padding: '6px 10px' }}>
                        <button
                          type="button"
                          onClick={() => handleSend('Generate a QR code so someone can pay me')}
                          style={{
                            width: '100%',
                            padding: '8px 11px',
                            borderRadius: 9,
                            border: 'none',
                            background: '#002147',
                            color: '#FFFFFF',
                            fontSize: 11.5,
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          ▦ Generate My ACN QR Pay Code →
                        </button>
                      </div>
                      {beneficiaries.map((ben) => {
                        const bName = ben.name || ben.nickname || 'Payee';
                        return (
                          <button
                            key={ben.id}
                            type="button"
                            className="cp-menu-biller-row"
                            onClick={() => handleSend(`Transfer money to ${bName}`)}
                          >
                            <div className="cp-menu-biller-avatar cp-contact-avatar">
                              {bName.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="cp-menu-biller-name">{bName}</div>
                              <div className="cp-menu-biller-sub">{ben.bank_name || 'Interac e-Transfer'}</div>
                            </div>
                          </button>
                        );
                      })}
                      {p2pContacts.map((c) => (
                        <button
                          key={c.customer_id}
                          type="button"
                          className="cp-menu-biller-row"
                          onClick={() => handleSend(`Transfer money to ${c.username}`)}
                        >
                          <div className="cp-menu-biller-avatar cp-contact-avatar">
                            {c.avatar_initials}
                          </div>
                          <div>
                            <div className="cp-menu-biller-name">{c.display_name}</div>
                            <div className="cp-menu-biller-sub">{c.username}</div>
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── AI suggestions popover ── */}
          {activePopover === 'suggestions' && (
            <div className="fc-suggestions-tray" ref={popoverRef}>
              {AI_SUGGESTIONS.map((s) => (
                <button
                  key={s.utterance}
                  className="fc-suggestion-pill"
                  onClick={() => handleSuggestion(s)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}

          {/* ── Input bar ── */}
          <div className="fc-input-bar">
            {/* Icon buttons */}
            <div className="fc-icon-btns">
              {/* Gallery / image */}
              <button
                className="fc-icon-btn"
                onClick={() => galleryInputRef.current?.click()}
                title="Attach image"
                aria-label="Attach image"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
              </button>
              {/* Hidden file input */}
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    onSend?.(`[Image: ${e.target.files[0].name}]`);
                    e.target.value = '';
                  }
                }}
              />

              {/* @ Billers & Recipients Hub */}
              <button
                className={`fc-icon-btn${activePopover === 'contact' ? ' active' : ''}`}
                onClick={() => setActivePopover((v) => (v === 'contact' ? null : 'contact'))}
                title="Canadian Utility Billers & Payees (@)"
                aria-label="Utility Billers and Payees"
                style={{ fontWeight: 800, fontSize: 15 }}
              >
                @
              </button>

              {/* AI suggestions / sparkle */}
              <button
                className={`fc-icon-btn${activePopover === 'suggestions' ? ' active' : ''}`}
                onClick={() => setActivePopover((v) => (v === 'suggestions' ? null : 'suggestions'))}
                title="Quick suggestions"
                aria-label="AI suggestions"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              </button>
            </div>

            {/* Text input */}
            <input
              className="fc-input"
              type="text"
              placeholder="Type a message…"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              disabled={isResponding}
              autoComplete="off"
              aria-label="Message input"
            />

            {/* Mic button */}
            <button
              className={`fc-icon-btn fc-mic-btn${voiceActive ? ' listening' : ''}`}
              onClick={toggleVoice}
              disabled={isResponding}
              title={voiceActive ? 'Stop listening' : 'Voice input'}
              aria-label={voiceActive ? 'Stop voice input' : 'Voice input'}
            >
              {voiceActive ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                  <rect x="4" y="4" width="16" height="16" rx="2"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              )}
            </button>

            {/* Send button */}
            <button
              className="fc-send"
              onClick={() => handleSend()}
              disabled={isResponding || !inputVal.trim()}
              aria-label="Send message"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff"
                   strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── FAB ── */}
      <button
        className="fc-fab"
        onClick={isOpen ? onClose : onOpen}
        title={isOpen ? 'Minimise chat' : 'Open ACN Bank AI chat'}
        aria-label={isOpen ? 'Minimise chat' : 'Open AI chat'}
      >
        {unread > 0 && !isOpen && (
          <span className="fc-badge">{unread > 9 ? '9+' : unread}</span>
        )}
        {isOpen ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff"
               strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        )}
      </button>
    </div>
  );
}
