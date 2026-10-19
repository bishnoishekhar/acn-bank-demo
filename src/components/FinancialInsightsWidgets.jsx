import { useMemo, useState } from 'react';

export const DEFAULT_SPENDING_CATEGORIES = [
  { id: 'utilities',     name: 'Utilities & Bills',   amount: 554.45, prevAmount: 476.20, color: '#0284C7', bg: '#E0F2FE', icon: '⚡', txCount: 4 },
  { id: 'groceries',     name: 'Groceries & Market',  amount: 842.50, prevAmount: 795.00, color: '#10B981', bg: '#D1FAE5', icon: '🛒', txCount: 11 },
  { id: 'dining',        name: 'Dining & Coffee',     amount: 456.75, prevAmount: 523.10, color: '#F59E0B', bg: '#FEF3C7', icon: '🍽️', txCount: 14 },
  { id: 'entertainment', name: 'Entertainment',       amount: 245.44, prevAmount: 180.20, color: '#8B5CF6', bg: '#EDE9FE', icon: '🎬', txCount: 6 },
  { id: 'shopping',      name: 'Shopping & Digital',  amount: 389.99, prevAmount: 210.00, color: '#EF4444', bg: '#FEE2E2', icon: '🛍️', txCount: 5 },
  { id: 'transport',     name: 'Transit & Fuel',      amount: 198.30, prevAmount: 190.50, color: '#06B6D4', bg: '#CFFAFE', icon: '🚗', txCount: 8 },
];

export const GIC_RATES = [
  { id: '6m',   label: '6 Months', years: 0.5, rate: 3.45, tag: 'Short Term' },
  { id: '1y',   label: '1 Year',   years: 1,   rate: 3.80, tag: '★ Most Popular', highlight: true },
  { id: '2y',   label: '2 Years',  years: 2,   rate: 3.75, tag: 'Balanced' },
  { id: '3y',   label: '3 Years',  years: 3,   rate: 3.70, tag: 'Mid Term' },
  { id: '4y',   label: '4 Years',  years: 4,   rate: 3.65, tag: 'Steady' },
  { id: '5y',   label: '5 Years',  years: 5,   rate: 3.65, tag: 'Max Lock-In' },
  { id: 'tfsa', label: 'TFSA Promo', years: 1, rate: 4.65, tag: 'Tax-Free Promo' },
];

// ── Live CES Widget Provenance & Payload Inspector Bar (For Demo Verification) ──
export function CesWidgetProvenanceBar({ toolName, payload }) {
  const [showJson, setShowJson] = useState(false);
  const resolvedTool = payload?.name || toolName || 'custom-widget';
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          padding: '4px 9px',
          borderRadius: 8,
          background: '#F0FDF4',
          border: '1px solid #BBF7D0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#16A34A',
              display: 'inline-block',
              boxShadow: '0 0 0 2px #DCFCE7',
            }}
          />
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 800,
              color: '#166534',
              letterSpacing: '0.03em',
            }}
          >
            CES Custom Widget · <code>{resolvedTool}</code>
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowJson((v) => !v)}
          style={{
            padding: '2px 7px',
            borderRadius: 6,
            border: '1px solid #86EFAC',
            background: showJson ? '#166534' : '#FFFFFF',
            color: showJson ? '#FFFFFF' : '#166534',
            fontSize: 9,
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          {showJson ? 'Hide CES JSON ▲' : '{ } View CES Payload'}
        </button>
      </div>
      {showJson && (
        <pre
          style={{
            marginTop: 6,
            padding: '8px 10px',
            borderRadius: 8,
            background: '#0F172A',
            color: '#E2E8F0',
            fontSize: 10,
            lineHeight: 1.4,
            maxHeight: 170,
            overflow: 'auto',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}
        >
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ── SVG Multi-Segment Donut / Pie Chart ──────────────────────────────────────
export function SpendingDonutChart({
  categories = DEFAULT_SPENDING_CATEGORIES,
  size = 116,
  strokeWidth = 22,
  selectedId = null,
  onSelectCategory,
}) {
  const total = useMemo(
    () => categories.reduce((sum, c) => sum + Number(c.amount || 0), 0) || 1,
    [categories],
  );
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  let cumulativeFraction = 0;
  const segments = categories.map((cat) => {
    const val = Number(cat.amount || 0);
    const fraction = val / total;
    const dash = Math.max(0, fraction * circumference - 2.2);
    const offset = -cumulativeFraction * circumference;
    cumulativeFraction += fraction;
    return {
      ...cat,
      fraction,
      pct: Math.round(fraction * 100),
      dash,
      offset,
    };
  });

  const activeCat =
    segments.find((s) => s.id === selectedId) ||
    segments.slice().sort((a, b) => b.amount - a.amount)[0];

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#F1F5F9"
          strokeWidth={strokeWidth}
        />
        {segments.map((seg) => {
          const isSelected = selectedId ? seg.id === selectedId : seg.id === activeCat?.id;
          return (
            <circle
              key={seg.id}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={isSelected ? strokeWidth + 3 : strokeWidth}
              strokeDasharray={`${seg.dash} ${circumference}`}
              strokeDashoffset={seg.offset}
              strokeLinecap="butt"
              style={{
                cursor: onSelectCategory ? 'pointer' : 'default',
                transition: 'stroke-width 0.2s ease, opacity 0.2s ease',
                opacity: selectedId && selectedId !== seg.id ? 0.55 : 1,
              }}
              onClick={() => onSelectCategory?.(seg.id === selectedId ? null : seg.id)}
            />
          );
        })}
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          textAlign: 'center',
          padding: 8,
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 800, color: '#64748B', lineHeight: 1.1 }}>
          {activeCat?.pct || 0}%
        </span>
        <span style={{ fontSize: 11, fontWeight: 900, color: '#0F172A', lineHeight: 1.15, marginTop: 1 }}>
          ${Math.round(activeCat?.amount || 0)}
        </span>
      </div>
    </div>
  );
}

// ── Mini-2x2 Financial Insights Grid + Category Pie Chart (Light Mode) ──────
const PALETTE = [
  { color: '#0284C7', bg: '#E0F2FE', icon: '⚡' },
  { color: '#10B981', bg: '#D1FAE5', icon: '🛒' },
  { color: '#F59E0B', bg: '#FEF3C7', icon: '🍽️' },
  { color: '#8B5CF6', bg: '#EDE9FE', icon: '🎬' },
  { color: '#EF4444', bg: '#FEE2E2', icon: '🛍️' },
  { color: '#06B6D4', bg: '#CFFAFE', icon: '🚗' },
];

export function SpendingMiniWidgetsGrid({
  mode = 'dashboard', // 'dashboard' | 'chat'
  payload = null,
  customerName = '',
  bills = [],
  onAction,
}) {
  const isChat = mode === 'chat';

  const categories = useMemo(() => {
    if (Array.isArray(payload?.categories) && payload.categories.length > 0) {
      return payload.categories.map((c, idx) => {
        const pal = PALETTE[idx % PALETTE.length];
        const amt = Number(c.amount || 0);
        const vsPct = Number(c.vsLastMonthPct ?? 8);
        const prev = amt / (1 + vsPct / 100 || 1);
        return {
          id: String(c.id || c.name || `cat-${idx}`).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          name: c.name || `Category ${idx + 1}`,
          amount: amt,
          prevAmount: Number(c.prevAmount || prev.toFixed(2)),
          color: c.color || pal.color,
          bg: c.bg || pal.bg,
          icon: c.icon || pal.icon,
          txCount: Number(c.count || c.txCount || 4),
        };
      });
    }
    return DEFAULT_SPENDING_CATEGORIES;
  }, [payload]);

  const [selectedCatId, setSelectedCatId] = useState(categories[0]?.id || 'utilities');

  const totalSpend = useMemo(
    () =>
      Number(payload?.total_spend || payload?.totalSpend || 0) ||
      categories.reduce((s, c) => s + c.amount, 0),
    [payload, categories],
  );
  const totalPrevSpend = useMemo(
    () => categories.reduce((s, c) => s + c.prevAmount, 0) || 1,
    [categories],
  );
  const momPct =
    payload?.mom_pct != null
      ? Number(payload.mom_pct).toFixed(1)
      : (((totalSpend - totalPrevSpend) / totalPrevSpend) * 100).toFixed(1);

  const unpaidBills = useMemo(() => {
    if (Array.isArray(payload?.upcoming_bills) && payload.upcoming_bills.length > 0) {
      return payload.upcoming_bills.map((b, i) => ({
        id: b.id || `ces-b-${i}`,
        payee_name: b.payee_name || b.biller_name || 'Utility Bill',
        amount: Number(b.amount || b.due_amount || 0),
        due_date: b.due_date || '2026-10-24',
        category: b.category || 'Utilities',
      }));
    }
    const rawUnpaid = (bills || []).filter(
      (b) => !b.is_paid && String(b.status || 'pending').toLowerCase() !== 'paid',
    );
    if (rawUnpaid.length > 0) return rawUnpaid;
    return [
      { id: 'b1', payee_name: 'Enbridge Gas', amount: 187.40, due_date: '2026-10-21', category: 'Utilities' },
      { id: 'b2', payee_name: 'Hydro One', amount: 224.30, due_date: '2026-10-23', category: 'Utilities' },
      { id: 'b3', payee_name: 'Rogers Wireless', amount: 142.75, due_date: '2026-10-27', category: 'Telecom' },
    ];
  }, [payload, bills]);

  const upcomingTotal = useMemo(
    () => unpaidBills.reduce((s, b) => s + Number(b.amount || b.amount_due || 0), 0),
    [unpaidBills],
  );

  const selectedCat = categories.find((c) => c.id === selectedCatId) || categories[0];
  const selectedCatDelta = (
    ((selectedCat.amount - selectedCat.prevAmount) / (selectedCat.prevAmount || 1)) *
    100
  ).toFixed(1);

  const monthlyIncome = Number(payload?.monthly_income || 6850);
  const savingRate =
    payload?.saving_rate != null
      ? Number(payload.saving_rate)
      : Math.max(0, Math.round(((monthlyIncome - totalSpend - upcomingTotal) / monthlyIncome) * 100));
  const spendRatioPct = Math.round((totalSpend / monthlyIncome) * 100);

  const cardStyle = {
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: 16,
    padding: isChat ? '12px 13px' : '16px 18px',
    boxShadow: '0 4px 16px rgba(15, 23, 42, 0.05)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    minWidth: 0,
  };

  return (
    <div
      style={{
        background: isChat ? '#F8FAFC' : '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: isChat ? 16 : 22,
        padding: isChat ? 12 : 22,
        boxShadow: isChat ? '0 6px 20px rgba(15, 23, 42, 0.06)' : '0 12px 34px rgba(0, 33, 71, 0.07)',
        width: '100%',
        color: '#0F172A',
      }}
    >
      {isChat && <CesWidgetProvenanceBar toolName="acn-spending-dashboard" payload={payload} />}
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: isChat ? 10 : 16,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                padding: '3px 9px',
                borderRadius: 999,
                background: '#EFF6FF',
                border: '1px solid #BFDBFE',
                color: '#0056B3',
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              ✦ Sep 20 – Oct 19 · Smart Insights
            </span>
            {customerName && (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B' }}>
                for {customerName}
              </span>
            )}
          </div>
          <h3
            style={{
              margin: '5px 0 0',
              fontSize: isChat ? 15 : 20,
              fontWeight: 800,
              color: '#002147',
              letterSpacing: '-0.3px',
            }}
          >
            Spending Breakdown & Cashflow Pulse
          </h3>
        </div>
        {onAction && (
          <button
            type="button"
            onClick={() => onAction('Show my spending insights and upcoming utility bills')}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: '1px solid #CBD5E1',
              background: '#FFFFFF',
              color: '#002147',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Ask AI Advisor →
          </button>
        )}
      </div>

      {/* ── Mini-2x2 Grid (Inspired by Mobile Insights Cards, Light Mode) ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isChat
            ? 'repeat(2, minmax(0, 1fr))'
            : 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: isChat ? 10 : 14,
          marginBottom: isChat ? 12 : 16,
        }}
      >
        {/* 1. TREND MINI WIDGET */}
        <div style={{ ...cardStyle, background: 'linear-gradient(180deg, #FFFFFF 0%, #F0F9FF 100%)', borderColor: '#BAE6FD' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: '#0369A1' }}>
              <span>📈 Trend</span>
              <span style={{ fontSize: 10, background: '#E0F2FE', padding: '2px 6px', borderRadius: 999 }}>MoM</span>
            </div>
            <div style={{ fontSize: isChat ? 20 : 24, fontWeight: 900, color: '#0F172A', marginTop: 4 }}>
              +{momPct}<span style={{ fontSize: 13, fontWeight: 700, color: '#64748B' }}>%</span>
            </div>
          </div>

          {/* Smooth SVG Area Sparkline */}
          <div style={{ margin: '8px 0 6px' }}>
            <svg width="100%" height="44" viewBox="0 0 160 44" preserveAspectRatio="none">
              <defs>
                <linearGradient id="acnTrendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0284C7" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#0284C7" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d="M 4 34 Q 28 30, 46 22 T 92 16 T 132 12 L 154 8 L 154 42 L 4 42 Z"
                fill="url(#acnTrendGrad)"
              />
              <path
                d="M 4 34 Q 28 30, 46 22 T 92 16 T 132 12 L 154 8"
                fill="none"
                stroke="#0284C7"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
              <circle cx="154" cy="8" r="4" fill="#0284C7" stroke="#FFFFFF" strokeWidth="1.5" />
            </svg>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: '#0369A1' }}>
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: '#0284C7',
                color: '#FFFFFF',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
              }}
            >
              ↑
            </span>
            <span>Increasing (+$213 vs Sep)</span>
          </div>
        </div>

        {/* 2. TOP SPENDING (DONUT / PIE CHART) MINI WIDGET */}
        <div style={{ ...cardStyle, background: 'linear-gradient(180deg, #FFFFFF 0%, #FDF4FF 100%)', borderColor: '#E9D5FF' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: '#6D28D9' }}>
            <span>🥧 Top Spending</span>
            <span style={{ fontSize: 10, color: '#64748B' }}>6 categories</span>
          </div>
          <div style={{ fontSize: isChat ? 17 : 21, fontWeight: 900, color: '#0F172A', marginTop: 2 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B', marginRight: 2 }}>CAD</span>
            ${totalSpend.toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '4px 0' }}>
            <SpendingDonutChart
              categories={categories}
              size={isChat ? 88 : 98}
              strokeWidth={isChat ? 16 : 18}
              selectedId={selectedCatId}
              onSelectCategory={setSelectedCatId}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: '#0F172A' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: selectedCat.color, flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedCat.name}
              </span>
            </span>
            <span style={{ color: selectedCat.color, fontWeight: 800 }}>
              ${selectedCat.amount.toFixed(0)}
            </span>
          </div>
        </div>

        {/* 3. UPCOMING BILLS MINI WIDGET */}
        <div style={{ ...cardStyle, background: 'linear-gradient(180deg, #FFFFFF 0%, #FFFBEB 100%)', borderColor: '#FDE68A' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: '#B45309' }}>
              <span>🗓️ Upcoming Bills</span>
              <span style={{ fontSize: 10, background: '#FEF3C7', padding: '2px 6px', borderRadius: 999, fontWeight: 800 }}>
                {unpaidBills.length} due
              </span>
            </div>
            <div style={{ fontSize: isChat ? 18 : 22, fontWeight: 900, color: '#0F172A', marginTop: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B', marginRight: 2 }}>CAD</span>
              ${upcomingTotal.toFixed(2)}
            </div>
          </div>

          {/* Calendar timeline markers */}
          <div style={{ margin: '10px 0 6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', padding: '6px 2px' }}>
              <div style={{ position: 'absolute', left: 4, right: 4, top: '50%', height: 2, background: '#FDE68A', zIndex: 0 }} />
              {[
                { day: '19', active: false },
                { day: '21', active: true, label: 'Enbridge' },
                { day: '23', active: true, label: 'Hydro' },
                { day: '27', active: true, label: 'Rogers' },
                { day: '31', active: false },
              ].map((d) => (
                <div key={d.day} style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  <span
                    style={{
                      width: d.active ? 10 : 6,
                      height: d.active ? 10 : 6,
                      borderRadius: '50%',
                      background: d.active ? '#D97706' : '#CBD5E1',
                      border: '2px solid #FFFFFF',
                      boxShadow: d.active ? '0 0 0 2px #FDE68A' : 'none',
                    }}
                  />
                  <span style={{ fontSize: 9, fontWeight: d.active ? 800 : 600, color: d.active ? '#92400E' : '#94A3B8' }}>
                    Oct {d.day}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#92400E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Next: {unpaidBills[0]?.payee_name} (${Number(unpaidBills[0]?.amount || 187.40).toFixed(2)})
            </span>
            {onAction && (
              <button
                type="button"
                onClick={() =>
                  onAction(
                    `Pay my ${unpaidBills[0]?.payee_name || 'Enbridge Gas'} bill of $${Number(
                      unpaidBills[0]?.amount || 187.4,
                    ).toFixed(2)} now`,
                  )
                }
                style={{
                  padding: '3px 8px',
                  borderRadius: 999,
                  border: 'none',
                  background: '#D97706',
                  color: '#FFFFFF',
                  fontSize: 10,
                  fontWeight: 800,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                Pay →
              </button>
            )}
          </div>
        </div>

        {/* 4. SAVING RATE GAUGE MINI WIDGET */}
        <div style={{ ...cardStyle, background: 'linear-gradient(180deg, #FFFFFF 0%, #ECFDF5 100%)', borderColor: '#A7F3D0' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: '#047857' }}>
              <span>🍃 Saving Rate</span>
              <span style={{ fontSize: 10, background: '#D1FAE5', padding: '2px 6px', borderRadius: 999, fontWeight: 800 }}>
                4.65% APY
              </span>
            </div>
            <div style={{ fontSize: isChat ? 20 : 24, fontWeight: 900, color: '#0F172A', marginTop: 4 }}>
              {savingRate}<span style={{ fontSize: 13, fontWeight: 700, color: '#64748B' }}>%</span>
            </div>
          </div>

          {/* Curved SVG Gauge Arc */}
          <div style={{ margin: '6px 0 2px', display: 'flex', justifyContent: 'center' }}>
            <svg width="140" height="46" viewBox="0 0 140 46">
              <path
                d="M 12 38 A 62 62 0 0 1 128 38"
                fill="none"
                stroke="#E2E8F0"
                strokeWidth="8"
                strokeLinecap="round"
              />
              <path
                d="M 12 38 A 62 62 0 0 1 102 16"
                fill="none"
                stroke="#10B981"
                strokeWidth="8"
                strokeLinecap="round"
              />
              <circle cx="96" cy="15" r="7" fill="#FFFFFF" stroke="#059669" strokeWidth="3.5" />
            </svg>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: '#047857' }}>
            <span>● Healthy (+$1,620 saved)</span>
            {onAction && (
              <button
                type="button"
                onClick={() => onAction('Transfer $500 from my Chequing account to my Savings account')}
                style={{
                  padding: '2px 7px',
                  borderRadius: 999,
                  border: '1px solid #059669',
                  background: '#FFFFFF',
                  color: '#047857',
                  fontSize: 10,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Boost
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 5. MONEY FLOW BAR + INTERACTIVE CATEGORY PIE BREAKDOWN */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isChat ? '1fr' : '1.05fr 1.45fr',
          gap: isChat ? 10 : 14,
        }}
      >
        {/* Money Flow Widget */}
        <div style={{ ...cardStyle, background: '#F8FAFC' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#002147' }}>⇄ Monthly Money Flow</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#059669' }}>
              {spendRatioPct}% of income spent
            </span>
          </div>

          <div style={{ fontSize: isChat ? 18 : 21, fontWeight: 900, color: '#0F172A', margin: '6px 0 8px' }}>
            CAD ${monthlyIncome.toLocaleString('en-CA')}{' '}
            <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B' }}>net inflow</span>
          </div>

          {/* Inflow Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#059669', width: 42 }}>↓ In</span>
            <div style={{ flex: 1, height: 12, borderRadius: 999, background: '#D1FAE5', overflow: 'hidden' }}>
              <div style={{ width: '100%', height: '100%', background: 'linear-gradient(90deg, #10B981, #06B6D4)', borderRadius: 999 }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#0F172A', width: 58, textAlign: 'right' }}>
              ${monthlyIncome.toLocaleString()}
            </span>
          </div>

          {/* Outflow Multi-Category Stacked Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#0284C7', width: 42 }}>↑ Out</span>
            <div
              style={{
                flex: 1,
                height: 12,
                borderRadius: 999,
                background: '#E2E8F0',
                overflow: 'hidden',
                display: 'flex',
                gap: 1.5,
              }}
            >
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  title={`${cat.name}: $${cat.amount}`}
                  style={{
                    width: `${(cat.amount / monthlyIncome) * 100}%`,
                    height: '100%',
                    background: cat.color,
                  }}
                />
              ))}
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#0F172A', width: 58, textAlign: 'right' }}>
              ${Math.round(totalSpend).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Interactive Category Pie Legend & MoM Comparison */}
        <div style={{ ...cardStyle, background: '#FFFFFF' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#002147' }}>
              📊 Spending by Transaction Type (Click slice/row)
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, color: Number(selectedCatDelta) > 0 ? '#DC2626' : '#059669' }}>
              {selectedCat.name}: {Number(selectedCatDelta) > 0 ? `+${selectedCatDelta}%` : `${selectedCatDelta}%`} vs last mo
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isChat ? '1fr' : 'repeat(2, minmax(0, 1fr))',
              gap: 6,
            }}
          >
            {categories.map((cat) => {
              const pct = Math.round((cat.amount / totalSpend) * 100);
              const delta = (((cat.amount - cat.prevAmount) / cat.prevAmount) * 100).toFixed(0);
              const isSelected = cat.id === selectedCatId;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCatId(cat.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '6px 9px',
                    borderRadius: 10,
                    border: isSelected ? `1.5px solid ${cat.color}` : '1px solid #F1F5F9',
                    background: isSelected ? cat.bg : '#F8FAFC',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 3,
                        background: cat.color,
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {cat.icon} {cat.name}
                      </div>
                      <div style={{ fontSize: 9.5, color: '#64748B' }}>
                        {cat.txCount} txns · {pct}% share
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: '#0F172A' }}>
                      ${cat.amount.toFixed(2)}
                    </div>
                    <div
                      style={{
                        fontSize: 9.5,
                        fontWeight: 700,
                        color: Number(delta) > 0 ? '#D97706' : '#059669',
                      }}
                    >
                      {Number(delta) > 0 ? `↑ +${delta}%` : `↓ ${delta}%`}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Creative Investment & GIC Projected Growth Card Widget (Light Mode) ──────
export function InvestmentCardWidget({ payload = {}, onAction }) {
  const [principal, setPrincipal] = useState(Number(payload?.principal || 25000));
  const rateOptions = useMemo(() => {
    if (Array.isArray(payload?.rates) && payload.rates.length > 0) {
      return payload.rates.map((r, i) => {
        const termStr = String(r.term || r.label || `${i + 1} Year`);
        const yrMatch = termStr.match(/(\d+(?:\.\d+)?)/);
        const isMonths = /month/i.test(termStr);
        const years = yrMatch ? (isMonths ? Number(yrMatch[1]) / 12 : Number(yrMatch[1])) : 1;
        return {
          id: String(r.id || `ces-r-${i}`),
          label: termStr,
          years: Math.max(0.5, years),
          rate: Number(r.rate || 3.8),
          tag: r.badge || r.tag || (i === 1 ? '★ Most Popular' : 'Guaranteed'),
          highlight: i === 1 || Boolean(r.highlight),
        };
      });
    }
    return GIC_RATES;
  }, [payload]);

  const [selectedRateId, setSelectedRateId] = useState(rateOptions[1]?.id || rateOptions[0]?.id || '1y');

  const selectedTerm = rateOptions.find((r) => r.id === selectedRateId) || rateOptions[1] || rateOptions[0];

  // Calculate compounded return for selected term AND 1..5 year trajectory for the graph
  const maturityValue = principal * Math.pow(1 + selectedTerm.rate / 100, selectedTerm.years);
  const guaranteedInterest = maturityValue - principal;
  const stdBankInterest = principal * Math.pow(1 + 0.005, selectedTerm.years) - principal;
  const extraEarned = Math.max(0, guaranteedInterest - stdBankInterest);

  // Build 5-year projection bars + curve at the selected rate
  const projectionPoints = useMemo(() => {
    return [1, 2, 3, 4, 5].map((yr) => {
      const gicVal = principal * Math.pow(1 + selectedTerm.rate / 100, yr);
      const gicGain = gicVal - principal;
      const bankGain = principal * Math.pow(1 + 0.005, yr) - principal;
      return { yr, gicVal, gicGain, bankGain };
    });
  }, [principal, selectedTerm]);

  const maxGain = Math.max(...projectionPoints.map((p) => p.gicGain), 100);

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid #CBD5E1',
        borderTop: '4px solid #0056B3',
        borderRadius: 18,
        padding: 16,
        boxShadow: '0 10px 28px rgba(0, 33, 71, 0.08)',
        color: '#0F172A',
        width: '100%',
        marginTop: 6,
        marginBottom: 6,
      }}
    >
    
      {/* Top Badge & Title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <div>
          <span
            style={{
              display: 'inline-block',
              padding: '3px 9px',
              borderRadius: 999,
              background: '#EFF6FF',
              color: '#0056B3',
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            📈 ACN Wealth · Non-Redeemable GIC & TFSA Projector
          </span>
          <h4 style={{ margin: '5px 0 0', fontSize: 16, fontWeight: 800, color: '#002147' }}>
            {payload?.headline || 'Interactive Rate & Guaranteed Growth Simulator'}
          </h4>
        </div>
        <div
          style={{
            padding: '4px 10px',
            borderRadius: 10,
            background: '#ECFDF5',
            border: '1px solid #A7F3D0',
            color: '#047857',
            fontSize: 10,
            fontWeight: 800,
            textAlign: 'right',
          }}
        >
          🛡️ CDIC Insured
          <div style={{ fontSize: 9, fontWeight: 600 }}>Up to $100,000</div>
        </div>
      </div>

      {/* Deposit Amount Selector */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 5 }}>
          <span>Select Investment Principal (Min. $500)</span>
          <span style={{ color: '#002147', fontWeight: 800 }}>CAD ${principal.toLocaleString('en-CA')}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[5000, 10000, 25000, 50000, 100000].map((amt) => (
            <button
              key={amt}
              type="button"
              onClick={() => setPrincipal(amt)}
              style={{
                flex: '1 1 60px',
                padding: '6px 8px',
                borderRadius: 9,
                border: principal === amt ? '1.5px solid #0056B3' : '1px solid #E2E8F0',
                background: principal === amt ? '#EFF6FF' : '#F8FAFC',
                color: principal === amt ? '#002147' : '#475569',
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              ${(amt / 1000).toFixed(0)}k
            </button>
          ))}
        </div>
      </div>

      {/* Term & Rate Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))',
          gap: 6,
          marginBottom: 14,
        }}
      >
        {rateOptions.map((item) => {
          const active = item.id === selectedRateId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedRateId(item.id)}
              style={{
                padding: '8px 9px',
                borderRadius: 11,
                border: active ? '2px solid #0056B3' : '1px solid #E2E8F0',
                background: active
                  ? 'linear-gradient(180deg, #EFF6FF 0%, #DBEAFE 100%)'
                  : '#FFFFFF',
                textAlign: 'left',
                cursor: 'pointer',
                position: 'relative',
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B' }}>{item.label}</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: active ? '#002147' : '#0F172A', margin: '2px 0' }}>
                {item.rate.toFixed(2)}%
              </div>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  color: item.highlight ? '#B45309' : '#0284C7',
                }}
              >
                {item.tag}
              </div>
            </button>
          );
        })}
      </div>

      {/* Projected Return Highlight + Creative SVG Compounding Growth Graph */}
      <div
        style={{
          background: 'linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 100%)',
          border: '1px solid #BFDBFE',
          borderRadius: 14,
          padding: 13,
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#475569' }}>
              Projected Maturity Value ({selectedTerm.label} @ {selectedTerm.rate.toFixed(2)}% APY)
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#002147', letterSpacing: '-0.4px' }}>
              CAD ${maturityValue.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span
              style={{
                display: 'inline-block',
                padding: '4px 10px',
                borderRadius: 999,
                background: '#D1FAE5',
                color: '#047857',
                fontSize: 11.5,
                fontWeight: 900,
              }}
            >
              +${guaranteedInterest.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Guaranteed Return
            </span>
            <div style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>
              +${extraEarned.toFixed(0)} more than standard 0.50% savings
            </div>
          </div>
        </div>

        {/* SVG Bar + Growth Curve Graph */}
        <div style={{ background: '#FFFFFF', borderRadius: 10, padding: '10px 12px 8px', border: '1px solid #E2E8F0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, color: '#64748B', marginBottom: 6 }}>
            <span>5-Year Compounding Interest Trajectory ({selectedTerm.rate.toFixed(2)}% APY vs 0.50% Bank Avg)</span>
            <span style={{ color: '#0056B3' }}>■ ACN GIC/TFSA &nbsp; <span style={{ color: '#CBD5E1' }}>■ Avg Bank</span></span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, alignItems: 'end', height: 86, paddingTop: 14 }}>
            {projectionPoints.map((pt) => {
              const barH = Math.max(14, Math.round((pt.gicGain / maxGain) * 58));
              const bankH = Math.max(4, Math.round((pt.bankGain / maxGain) * 58));
              const isSelectedYr = Math.ceil(selectedTerm.years) === pt.yr;
              return (
                <div key={pt.yr} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 800, color: isSelectedYr ? '#0056B3' : '#475569' }}>
                    +${Math.round(pt.gicGain).toLocaleString()}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 60 }}>
                    <div
                      style={{
                        width: 18,
                        height: barH,
                        borderRadius: '5px 5px 2px 2px',
                        background: isSelectedYr
                          ? 'linear-gradient(180deg, #0056B3 0%, #0284C7 100%)'
                          : 'linear-gradient(180deg, #38BDF8 0%, #93C5FD 100%)',
                        boxShadow: isSelectedYr ? '0 3px 10px rgba(0,86,179,0.28)' : 'none',
                        transition: 'height 0.25s ease',
                      }}
                    />
                    <div
                      style={{
                        width: 8,
                        height: bankH,
                        borderRadius: '3px 3px 1px 1px',
                        background: '#CBD5E1',
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 10, fontWeight: isSelectedYr ? 800 : 600, color: isSelectedYr ? '#002147' : '#64748B' }}>
                    Year {pt.yr}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Action CTAs */}
      {onAction && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            onClick={() =>
              onAction(
                `I want to open a ${selectedTerm.label} GIC for $${principal.toLocaleString()} at ${selectedTerm.rate.toFixed(2)}%`,
              )
            }
            style={{
              flex: '1 1 160px',
              padding: '9px 14px',
              borderRadius: 10,
              border: 'none',
              background: '#002147',
              color: '#FFFFFF',
              fontSize: 12,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Open {selectedTerm.label} GIC ({selectedTerm.rate.toFixed(2)}%) →
          </button>
          <button
            type="button"
            onClick={() => onAction('Check my TFSA balance and contribution room')}
            style={{
              padding: '9px 12px',
              borderRadius: 10,
              border: '1px solid #CBD5E1',
              background: '#F8FAFC',
              color: '#002147',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Check TFSA Balance
          </button>
          <button
            type="button"
            onClick={() => onAction('Book an appointment with a financial advisor')}
            style={{
              padding: '9px 12px',
              borderRadius: 10,
              border: '1px solid #CBD5E1',
              background: '#FFFFFF',
              color: '#475569',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Book Advisor
          </button>
        </div>
      )}
    </div>
  );
}

// ── Contextual Proactive Insight Card (Triggered After Bill Pay / Transfer) ──
export function ContextualProactiveAlert({ payload = {}, onAction }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || !payload) return null;

  const badge = payload.badge || '⚡ Proactive Spending Alert';
  const headline = payload.headline || 'Utilities & Bills spend is +16.4% higher than last month';
  const detail =
    payload.detail ||
    payload.body ||
    'Including this payment, your monthly Utilities & Telecom spend reached CAD $554.45 compared to CAD $476.20 last month.';
  const currentMonthAmt = Number(payload.current_month_amt ?? payload.currentMonthAmt ?? 554.45);
  const lastMonthAmt = Number(payload.last_month_amt ?? payload.lastMonthAmt ?? 476.20);
  const categoryName = payload.category_name || payload.categoryName || 'Utilities & Bills';
  const accent = payload.accent || '#D97706';
  const bgTint = payload.bgTint || '#FFFBEB';
  const borderTint = payload.borderTint || '#FDE68A';
  const primaryCtaLabel = payload.primary_cta_label || payload.primaryCtaLabel || 'See full category breakdown';
  const primaryCtaUtterance = payload.primary_cta_utterance || payload.primaryCtaUtterance || 'Analyze my spending';
  const secondaryCtaLabel = payload.secondary_cta_label || payload.secondaryCtaLabel || '';
  const secondaryCtaUtterance =
    payload.secondary_cta_utterance || payload.secondaryCtaUtterance || 'Check my upcoming bills and help me pay them';

  const maxAmt = Math.max(currentMonthAmt, lastMonthAmt, 1);
  const pctDiff = (((currentMonthAmt - lastMonthAmt) / lastMonthAmt) * 100).toFixed(1);

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: `1.5px solid ${borderTint}`,
        borderLeft: `5px solid ${accent}`,
        borderRadius: 14,
        padding: '12px 14px',
        boxShadow: '0 8px 22px rgba(15, 23, 42, 0.06)',
        color: '#0F172A',
        marginTop: 6,
        marginBottom: 6,
        width: '100%',
      }}
    >
      
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span
          style={{
            padding: '3px 8px',
            borderRadius: 999,
            background: bgTint,
            color: accent,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {badge}
        </span>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: 15, cursor: 'pointer' }}
          aria-label="Dismiss insight"
        >
          ×
        </button>
      </div>

      <div style={{ fontSize: 13.5, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>
        {headline}
      </div>
      <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.5, marginBottom: 10 }}>
        {detail}
      </div>

      {/* Month-over-Month Visual Comparison Bars */}
      <div
        style={{
          background: '#F8FAFC',
          border: '1px solid #E2E8F0',
          borderRadius: 10,
          padding: '8px 10px',
          marginBottom: 10,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, fontWeight: 700, color: '#475569', marginBottom: 5 }}>
          <span>{categoryName} · Month-over-Month Comparison</span>
          <span style={{ color: accent, fontWeight: 800 }}>
            ↑ +{pctDiff}% vs. last month
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#0F172A', width: 68 }}>This Month</span>
          <div style={{ flex: 1, height: 10, borderRadius: 999, background: '#E2E8F0', overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.min(100, Math.round((currentMonthAmt / maxAmt) * 100))}%`,
                height: '100%',
                background: accent,
                borderRadius: 999,
              }}
            />
          </div>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: '#0F172A', width: 64, textAlign: 'right' }}>
            ${currentMonthAmt.toFixed(2)}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: '#64748B', width: 68 }}>Last Month</span>
          <div style={{ flex: 1, height: 10, borderRadius: 999, background: '#E2E8F0', overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.min(100, Math.round((lastMonthAmt / maxAmt) * 100))}%`,
                height: '100%',
                background: '#94A3B8',
                borderRadius: 999,
              }}
            />
          </div>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: '#64748B', width: 64, textAlign: 'right' }}>
            ${lastMonthAmt.toFixed(2)}
          </span>
        </div>
      </div>

      {onAction && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button
            type="button"
            onClick={() => onAction(primaryCtaUtterance)}
            style={{
              padding: '7px 12px',
              borderRadius: 8,
              border: 'none',
              background: '#002147',
              color: '#FFFFFF',
              fontSize: 11,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {primaryCtaLabel} →
          </button>
          {secondaryCtaLabel && (
            <button
              type="button"
              onClick={() => onAction(secondaryCtaUtterance)}
              style={{
                padding: '7px 11px',
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#0F172A',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {secondaryCtaLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Default fallback transactions if CES sends partial array ────────────────
const DEFAULT_CES_TRANSACTIONS = [
  {
    id: 'txn-1',
    date: 'Aug 18, 2026',
    merchant: 'Loblaws',
    category: 'Groceries',
    amount: -142.3,
    type: 'debit',
    status: 'Posted',
    icon: '🛒',
    is_anomaly: false,
  },
  {
    id: 'txn-2',
    date: 'Aug 17, 2026',
    merchant: 'Tim Hortons',
    category: 'Dining',
    amount: -18.4,
    type: 'debit',
    status: 'Posted',
    icon: '☕',
    is_anomaly: false,
  },
  {
    id: 'txn-3',
    date: 'Aug 16, 2026',
    merchant: 'Unknown Online Vendor',
    category: 'Shopping / Anomaly',
    amount: -249.99,
    type: 'debit',
    status: 'Disputed / Unusual',
    icon: '🚨',
    is_anomaly: true,
  },
  {
    id: 'txn-4',
    date: 'Aug 15, 2026',
    merchant: 'ACN Payroll Deposit',
    category: 'Income / Payroll',
    amount: 3200.0,
    type: 'credit',
    status: 'Posted',
    icon: '💼',
    is_anomaly: false,
  },
  {
    id: 'txn-5',
    date: 'Aug 14, 2026',
    merchant: 'Toronto Hydro',
    category: 'Utilities',
    amount: -118.4,
    type: 'debit',
    status: 'Posted',
    icon: '⚡',
    is_anomaly: false,
  },
  {
    id: 'txn-6',
    date: 'Aug 12, 2026',
    merchant: 'Uber Trip',
    category: 'Transit',
    amount: -42.0,
    type: 'debit',
    status: 'Posted',
    icon: '🚕',
    is_anomaly: false,
  },
  {
    id: 'txn-7',
    date: 'Aug 10, 2026',
    merchant: 'Shoppers Drug Mart',
    category: 'Health & Pharmacy',
    amount: -94.5,
    type: 'debit',
    status: 'Posted',
    icon: '💊',
    is_anomaly: false,
  },
  {
    id: 'txn-8',
    date: 'Aug 08, 2026',
    merchant: 'Netflix.com',
    category: 'Subscriptions',
    amount: -22.99,
    type: 'debit',
    status: 'Posted',
    icon: '🎬',
    is_anomaly: false,
  },
  {
    id: 'txn-9',
    date: 'Aug 05, 2026',
    merchant: 'LCBO',
    category: 'Dining & Beverages',
    amount: -89.4,
    type: 'debit',
    status: 'Posted',
    icon: '🍷',
    is_anomaly: false,
  },
  {
    id: 'txn-10',
    date: 'Aug 02, 2026',
    merchant: 'Presto Transit',
    category: 'Transit',
    amount: -77.51,
    type: 'debit',
    status: 'Posted',
    icon: '🚇',
    is_anomaly: false,
  },
];

function inferTxnVisuals(txn = {}) {
  const cat = String(txn.category || '').toLowerCase();
  const merch = String(txn.merchant || txn.description || '').toLowerCase();
  const isAnomaly =
    Boolean(txn.is_anomaly) ||
    cat.includes('anomaly') ||
    String(txn.status || '').toLowerCase().includes('dispute') ||
    String(txn.status || '').toLowerCase().includes('unusual') ||
    merch.includes('unknown online');

  if (isAnomaly) {
    return { icon: txn.icon || '🚨', bg: '#FEF2F2', border: '#FECACA', color: '#DC2626', isAnomaly: true };
  }
  if (Number(txn.amount) > 0 || String(txn.type || '').toLowerCase() === 'credit' || cat.includes('payroll') || cat.includes('income')) {
    return { icon: txn.icon || '💼', bg: '#ECFDF5', border: '#A7F3D0', color: '#059669', isAnomaly: false };
  }
  if (cat.includes('grocer') || merch.includes('loblaws') || merch.includes('metro')) {
    return { icon: txn.icon || '🛒', bg: '#F0FDF4', border: '#BBF7D0', color: '#16A34A', isAnomaly: false };
  }
  if (cat.includes('util') || merch.includes('hydro') || merch.includes('enbridge') || merch.includes('rogers')) {
    return { icon: txn.icon || '⚡', bg: '#EFF6FF', border: '#BFDBFE', color: '#0284C7', isAnomaly: false };
  }
  if (cat.includes('din') || merch.includes('hortons') || merch.includes('lcbo') || merch.includes('starbucks')) {
    return { icon: txn.icon || '☕', bg: '#FFFBEB', border: '#FDE68A', color: '#D97706', isAnomaly: false };
  }
  if (cat.includes('trans') || merch.includes('uber') || merch.includes('presto')) {
    return { icon: txn.icon || '🚇', bg: '#F5F3FF', border: '#DDD6FE', color: '#7C3AED', isAnomaly: false };
  }
  if (cat.includes('sub') || merch.includes('netflix') || merch.includes('spotify')) {
    return { icon: txn.icon || '🎬', bg: '#FDF2F8', border: '#FBCFE8', color: '#DB2777', isAnomaly: false };
  }
  return { icon: txn.icon || '💳', bg: '#F8FAFC', border: '#E2E8F0', color: '#0056B3', isAnomaly: false };
}

// ── CES Recent Transactions Interactive Ledger Widget (Light Mode) ───────────
export function RecentTransactionsWidget({ payload = {}, onAction }) {
  const [filter, setFilter] = useState('all'); // 'all' | 'debits' | 'credits' | 'flagged'
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const transactions = useMemo(() => {
    const rawList =
      Array.isArray(payload?.transactions) && payload.transactions.length > 0
        ? payload.transactions
        : DEFAULT_CES_TRANSACTIONS;

    return rawList.map((t, idx) => {
      const rawAmt = Number(t.amount ?? 0);
      const isCredit =
        String(t.type || '').toLowerCase() === 'credit' ||
        (rawAmt > 0 && String(t.type || '').toLowerCase() !== 'debit');
      const signedAmount = isCredit ? Math.abs(rawAmt) : -Math.abs(rawAmt);
      const visuals = inferTxnVisuals({ ...t, amount: signedAmount });
      return {
        id: String(t.id || `ces-txn-${idx}`),
        date: t.date || 'Aug 2026',
        merchant: t.merchant || t.description || 'Merchant Transaction',
        category: t.category || (isCredit ? 'Deposit' : 'Purchase'),
        amount: signedAmount,
        isCredit,
        status: t.status || (visuals.isAnomaly ? 'Disputed / Unusual' : 'Posted'),
        ...visuals,
      };
    });
  }, [payload]);

  const computedInflow = useMemo(() => {
    if (payload?.total_inflow != null) return Number(payload.total_inflow);
    return transactions.filter((t) => t.isCredit).reduce((s, t) => s + t.amount, 0);
  }, [payload, transactions]);

  const computedOutflow = useMemo(() => {
    if (payload?.total_outflow != null) return Math.abs(Number(payload.total_outflow));
    return transactions.filter((t) => !t.isCredit).reduce((s, t) => s + Math.abs(t.amount), 0);
  }, [payload, transactions]);

  const flaggedCount = useMemo(
    () => transactions.filter((t) => t.isAnomaly).length,
    [transactions],
  );

  const filteredTxns = useMemo(() => {
    return transactions.filter((t) => {
      if (filter === 'debits' && t.isCredit) return false;
      if (filter === 'credits' && !t.isCredit) return false;
      if (filter === 'flagged' && !t.isAnomaly) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return (
          t.merchant.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          t.date.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [transactions, filter, search]);

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid #CBD5E1',
        borderTop: '4px solid #002147',
        borderRadius: 18,
        padding: 15,
        boxShadow: '0 10px 28px rgba(0, 33, 71, 0.08)',
        color: '#0F172A',
        width: '100%',
        marginTop: 6,
        marginBottom: 6,
      }}
    >
      
      {/* Header Banner */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <div>
          <span
            style={{
              display: 'inline-block',
              padding: '3px 9px',
              borderRadius: 999,
              background: '#EFF6FF',
              color: '#0056B3',
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            📋 ACN Live Activity · {payload?.account_label || 'Chequing & Savings'}
          </span>
          <h4 style={{ margin: '5px 0 0', fontSize: 16, fontWeight: 800, color: '#002147' }}>
            {payload?.headline || 'Recent Account Activity'}
          </h4>
        </div>
        <span
          style={{
            padding: '4px 9px',
            borderRadius: 999,
            background: '#F1F5F9',
            color: '#334155',
            fontSize: 10.5,
            fontWeight: 800,
            whiteSpace: 'nowrap',
          }}
        >
          {transactions.length} Transactions
        </span>
      </div>

      {/* Inflow vs Outflow Summary Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            background: '#ECFDF5',
            border: '1px solid #A7F3D0',
            borderRadius: 12,
            padding: '8px 10px',
          }}
        >
          <div style={{ fontSize: 9.5, fontWeight: 700, color: '#047857', textTransform: 'uppercase' }}>
            Total Inflow
          </div>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#065F46', marginTop: 2 }}>
            +${computedInflow.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div
          style={{
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: 12,
            padding: '8px 10px',
          }}
        >
          <div style={{ fontSize: 9.5, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
            Total Outflow
          </div>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#0F172A', marginTop: 2 }}>
            -${computedOutflow.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div
          style={{
            background: flaggedCount > 0 ? '#FEF2F2' : '#F0F9FF',
            border: flaggedCount > 0 ? '1px solid #FECACA' : '1px solid #BAE6FD',
            borderRadius: 12,
            padding: '8px 10px',
          }}
        >
          <div
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              color: flaggedCount > 0 ? '#DC2626' : '#0284C7',
              textTransform: 'uppercase',
            }}
          >
            Security Scan
          </div>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 900,
              color: flaggedCount > 0 ? '#991B1B' : '#0369A1',
              marginTop: 3,
            }}
          >
            {flaggedCount > 0 ? `⚠️ ${flaggedCount} Flagged` : '✓ All Verified'}
          </div>
        </div>
      </div>

      {/* Filter Pills + Search */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: `All (${transactions.length})` },
            { id: 'debits', label: 'Purchases' },
            { id: 'credits', label: 'Deposits' },
            ...(flaggedCount > 0 ? [{ id: 'flagged', label: `⚠️ Flagged (${flaggedCount})` }] : []),
          ].map((tab) => {
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                style={{
                  padding: '5px 10px',
                  borderRadius: 999,
                  border: active ? '1.5px solid #002147' : '1px solid #E2E8F0',
                  background: active ? '#002147' : '#F8FAFC',
                  color: active ? '#FFFFFF' : '#475569',
                  fontSize: 10.5,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search merchant or category…"
          style={{
            flex: '1 1 130px',
            maxWidth: 190,
            padding: '5px 9px',
            borderRadius: 8,
            border: '1px solid #CBD5E1',
            background: '#F8FAFC',
            fontSize: 11,
            color: '#0F172A',
            outline: 'none',
          }}
        />
      </div>

      {/* Transactions List */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          maxHeight: 330,
          overflowY: 'auto',
          paddingRight: 2,
        }}
      >
        {filteredTxns.map((txn) => {
          const isExpanded = expandedId === txn.id;
          const absAmt = Math.abs(txn.amount).toLocaleString('en-CA', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          return (
            <div
              key={txn.id}
              style={{
                borderRadius: 12,
                border: txn.isAnomaly ? '1.5px solid #FCA5A5' : '1px solid #E2E8F0',
                background: txn.isAnomaly ? '#FFFDFD' : '#FFFFFF',
                padding: '9px 11px',
                transition: 'all 0.15s ease',
              }}
            >
              <div
                onClick={() => setExpandedId(isExpanded ? null : txn.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      background: txn.bg,
                      border: `1px solid ${txn.border}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 16,
                      flexShrink: 0,
                    }}
                  >
                    {txn.icon}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: 12.5,
                          fontWeight: 800,
                          color: '#0F172A',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {txn.merchant}
                      </span>
                      {txn.isAnomaly && (
                        <span
                          style={{
                            padding: '1.5px 6px',
                            borderRadius: 999,
                            background: '#FEF2F2',
                            border: '1px solid #FECACA',
                            color: '#DC2626',
                            fontSize: 9,
                            fontWeight: 800,
                          }}
                        >
                          ⚠️ {txn.status}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 10.5, color: '#64748B', marginTop: 1 }}>
                      {txn.date} · <span style={{ fontWeight: 700, color: '#475569' }}>{txn.category}</span>
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 900,
                      color: txn.isCredit ? '#059669' : txn.isAnomaly ? '#DC2626' : '#0F172A',
                    }}
                  >
                    {txn.isCredit ? `+CAD $${absAmt}` : `-CAD $${absAmt}`}
                  </div>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: '#94A3B8' }}>
                    {txn.isAnomaly ? 'Tap to review ▾' : '✓ Posted'}
                  </div>
                </div>
              </div>

              {/* Contextual Action Row (Always shown for anomalies, or when row clicked) */}
              {(txn.isAnomaly || isExpanded) && onAction && (
                <div
                  style={{
                    marginTop: 8,
                    paddingTop: 8,
                    borderTop: '1px dashed #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ fontSize: 10.5, color: txn.isAnomaly ? '#B91C1C' : '#475569', fontWeight: 600 }}>
                    {txn.isAnomaly
                      ? 'Out-of-pattern online charge flagged by ACN Security.'
                      : `Category: ${txn.category} · Status: ${txn.status}`}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {txn.isAnomaly ? (
                      <button
                        type="button"
                        onClick={() =>
                          onAction(`I want to dispute the unusual $${absAmt} charge at ${txn.merchant}`)
                        }
                        style={{
                          padding: '5px 10px',
                          borderRadius: 7,
                          border: 'none',
                          background: '#DC2626',
                          color: '#FFFFFF',
                          fontSize: 10.5,
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        🚨 Review / Dispute Charge →
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onAction('Analyze my spending')}
                        style={{
                          padding: '4px 9px',
                          borderRadius: 7,
                          border: '1px solid #CBD5E1',
                          background: '#F8FAFC',
                          color: '#002147',
                          fontSize: 10,
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        📊 View {txn.category} Trend →
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Quick Actions */}
      {onAction && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 10,
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
          }}
        >
          <button
            type="button"
            onClick={() => onAction('Analyze my spending')}
            style={{
              flex: '1 1 140px',
              padding: '8px 12px',
              borderRadius: 9,
              border: 'none',
              background: '#002147',
              color: '#FFFFFF',
              fontSize: 11,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            📊 Analyze Spending Breakdown →
          </button>
          {flaggedCount > 0 && (
            <button
              type="button"
              onClick={() => onAction('I want to dispute the unusual $249.99 charge at Unknown Online Vendor')}
              style={{
                padding: '8px 11px',
                borderRadius: 9,
                border: '1px solid #FECACA',
                background: '#FEF2F2',
                color: '#DC2626',
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              🚨 Dispute Flagged ($249.99)
            </button>
          )}
        </div>
      )}
    </div>
  );
}


