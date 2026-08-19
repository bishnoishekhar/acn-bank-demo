const INSIGHT_CONFIG = {
  bill_automation:     { icon: '⚙️', label: 'Bill Automation',      accent: '#C560FF', accentDim: 'rgba(197,96,255,.25)',  border: 'rgba(197,96,255,.3)' },
  savings_opportunity: { icon: '💰', label: 'Savings Opportunity',  accent: '#34D399', accentDim: 'rgba(52,211,153,.2)',   border: 'rgba(52,211,153,.3)' },
  spending_spike:      { icon: '📊', label: 'Spending Spike',       accent: '#FBBF24', accentDim: 'rgba(251,191,36,.2)',   border: 'rgba(251,191,36,.3)' },
  anomaly:             { icon: '🚨', label: 'Anomaly Detected',     accent: '#F87171', accentDim: 'rgba(248,113,113,.2)',  border: 'rgba(248,113,113,.3)' },
  credit_score:        { icon: '📊', label: 'Credit Score',         accent: '#C560FF', accentDim: 'rgba(197,96,255,.25)', border: 'rgba(197,96,255,.3)' },
  cash_flow:           { icon: '💡', label: 'Cash Flow',            accent: '#C560FF', accentDim: 'rgba(197,96,255,.25)', border: 'rgba(197,96,255,.3)' },
  offer:               { icon: '🎁', label: 'Pre-Approved Offer',   accent: '#A78BFA', accentDim: 'rgba(167,139,250,.2)', border: 'rgba(167,139,250,.3)' },
};

export default function InsightCard({ payload, onCta }) {
  const type = payload.insight_type || 'cash_flow';
  const cfg = INSIGHT_CONFIG[type] || INSIGHT_CONFIG.cash_flow;

  return (
    <div style={{
      background: 'rgba(255,255,255,.08)',
      border: `1px solid ${cfg.border}`,
      borderTop: `3px solid ${cfg.accent}`,
      borderRadius: '4px 14px 14px 14px',
      fontSize: 13,
      maxWidth: '86%',
      alignSelf: 'flex-start',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
    }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '10px 13px 8px',
        borderBottom: `1px solid ${cfg.border}`,
      }}>
        <span style={{ fontSize: 14 }}>{cfg.icon}</span>
        <span style={{
          fontSize: 10, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.07em',
          color: cfg.accent, flex: 1,
        }}>{cfg.label}</span>
        {payload.dismissible && (
          <button style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,.4)', fontSize: 16, lineHeight: 1, padding: '0 2px',
            fontFamily: 'inherit',
          }}>×</button>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '10px 13px 4px' }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.92)',
          lineHeight: 1.45, marginBottom: 5,
        }}>{payload.headline}</div>
        {payload.detail && (
          <div style={{
            fontSize: 12, color: 'rgba(240,232,255,.6)', lineHeight: 1.55,
          }}>{payload.detail}</div>
        )}
      </div>

      {/* Metrics */}
      {payload.metrics?.length > 0 && (
        <div style={{ display: 'flex', gap: 5, padding: '8px 13px' }}>
          {payload.metrics.map((m, i) => {
            const isKV = !m.label && typeof m === 'object';
            const [label, value] = isKV ? Object.entries(m)[0] : [m.label, m.value];
            return (
              <div key={i} style={{
                flex: 1, background: cfg.accentDim,
                border: `1px solid ${cfg.border}`, borderRadius: 8, padding: '6px 8px',
              }}>
                <div style={{ fontSize: 9, color: cfg.accent, marginBottom: 2, textTransform: 'uppercase' }}>{label}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.9)' }}>
                  {value}
                  {m.trend === 'up' && <span style={{ color: '#F87171', fontSize: 10, marginLeft: 2 }}>↑</span>}
                  {m.trend === 'down' && <span style={{ color: '#34D399', fontSize: 10, marginLeft: 2 }}>↓</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 13px 12px' }}>
        {payload.cta_label && (
          <button
            onClick={() => onCta && onCta(payload.cta_value)}
            style={{
              flex: 1, fontSize: 12, fontWeight: 600,
              fontFamily: 'inherit', padding: '8px 12px',
              borderRadius: 8, background: cfg.accent,
              color: '#fff', border: 'none', cursor: 'pointer',
              textAlign: 'center',
            }}
          >{payload.cta_label}</button>
        )}
        {payload.secondary_cta_label && (
          <button
            onClick={() => onCta && onCta(payload.secondary_cta_value)}
            style={{
              fontSize: 11, fontWeight: 500, fontFamily: 'inherit',
              color: 'rgba(240,232,255,.5)', background: 'none', border: 'none',
              cursor: 'pointer', padding: '4px 6px', whiteSpace: 'nowrap',
            }}
          >{payload.secondary_cta_label}</button>
        )}
      </div>
    </div>
  );
}
