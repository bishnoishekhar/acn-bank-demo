import { useState } from 'react';

const INSIGHT_CONFIG = {
  bill_automation:     { icon: '⚡', label: 'Upcoming Utility Bill', accent: '#C560FF', accentDim: 'rgba(197,96,255,.18)',  border: 'rgba(197,96,255,.45)' },
  bill_due:            { icon: '⚡', label: 'Upcoming Utility Bill', accent: '#F59E0B', accentDim: 'rgba(245,158,11,.18)',  border: 'rgba(245,158,11,.45)' },
  savings_opportunity: { icon: '💰', label: 'Savings Opportunity',   accent: '#34D399', accentDim: 'rgba(52,211,153,.18)',  border: 'rgba(52,211,153,.45)' },
  spending_spike:      { icon: '📊', label: 'Spending Trend',        accent: '#FBBF24', accentDim: 'rgba(251,191,36,.18)',  border: 'rgba(251,191,36,.45)' },
  anomaly:             { icon: '🚨', label: 'Unusual Transaction',   accent: '#F87171', accentDim: 'rgba(248,113,113,.18)', border: 'rgba(248,113,113,.45)' },
  credit_score:        { icon: '📈', label: 'Credit Score',          accent: '#C560FF', accentDim: 'rgba(197,96,255,.18)',  border: 'rgba(197,96,255,.45)' },
  cash_flow:           { icon: '💡', label: 'Smart Insight',         accent: '#38BDF8', accentDim: 'rgba(56,189,248,.18)',  border: 'rgba(56,189,248,.45)' },
  offer:               { icon: '🎁', label: 'Pre-Approved Offer',    accent: '#A78BFA', accentDim: 'rgba(167,139,250,.18)', border: 'rgba(167,139,250,.45)' },
};

export default function InsightCard({ payload, onCta }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || !payload) return null;

  const type = payload.insight_type || 'cash_flow';
  const cfg = INSIGHT_CONFIG[type] || INSIGHT_CONFIG.cash_flow;

  return (
    <div style={{
      background: 'linear-gradient(145deg, #0F172A 0%, #1E293B 100%)',
      border: `1px solid ${cfg.border}`,
      borderTop: `3px solid ${cfg.accent}`,
      borderRadius: '6px 14px 14px 14px',
      fontSize: 13,
      maxWidth: '90%',
      alignSelf: 'flex-start',
      boxShadow: '0 8px 24px rgba(15, 23, 42, 0.16)',
      marginTop: 4,
      marginBottom: 4,
    }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '10px 13px 8px',
        borderBottom: '1px solid rgba(255,255,255,.10)',
      }}>
        <span style={{ fontSize: 14 }}>{cfg.icon}</span>
        <span style={{
          fontSize: 10, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.07em',
          color: cfg.accent, flex: 1,
        }}>{cfg.label}</span>
        {payload.dismissible && (
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss insight"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,.55)', fontSize: 16, lineHeight: 1, padding: '0 2px',
              fontFamily: 'inherit',
            }}
          >×</button>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '10px 13px 4px' }}>
        <div style={{
          fontSize: 13, fontWeight: 700, color: '#FFFFFF',
          lineHeight: 1.45, marginBottom: 5,
        }}>{payload.headline}</div>
        {(payload.detail || payload.body) && (
          <div style={{
            fontSize: 12, color: 'rgba(226,232,240,.85)', lineHeight: 1.55,
          }}>{payload.detail || payload.body}</div>
        )}
      </div>

      {/* Metrics */}
      {payload.metrics?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 13px' }}>
          {payload.metrics.map((m, i) => {
            const isKV = !m.label && typeof m === 'object';
            const [label, value] = isKV ? Object.entries(m)[0] : [m.label, m.value];
            return (
              <div key={i} style={{
                flex: '1 1 85px', background: cfg.accentDim,
                border: `1px solid ${cfg.border}`, borderRadius: 8, padding: '6px 8px',
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: cfg.accent, marginBottom: 2, textTransform: 'uppercase' }}>{label}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#FFFFFF' }}>
                  {value}
                  {m.trend === 'up' && <span style={{ color: '#F87171', fontSize: 10, marginLeft: 3 }}>↑</span>}
                  {m.trend === 'down' && <span style={{ color: '#34D399', fontSize: 10, marginLeft: 3 }}>↓</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Actions */}
      {(payload.cta_label || payload.secondary_cta_label) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 13px 12px' }}>
          {payload.cta_label && (
            <button
              type="button"
              onClick={() => onCta && onCta(payload.cta_value || payload.cta_label)}
              style={{
                flex: 1, fontSize: 12, fontWeight: 700,
                fontFamily: 'inherit', padding: '8px 12px',
                borderRadius: 8, background: cfg.accent,
                color: '#0F172A', border: 'none', cursor: 'pointer',
                textAlign: 'center',
              }}
            >{payload.cta_label}</button>
          )}
          {payload.secondary_cta_label && (
            <button
              type="button"
              onClick={() => onCta && onCta(payload.secondary_cta_value || payload.secondary_cta_label)}
              style={{
                fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                color: 'rgba(226,232,240,.8)', background: 'rgba(255,255,255,.08)',
                border: '1px solid rgba(255,255,255,.15)', borderRadius: 8,
                cursor: 'pointer', padding: '7px 10px', whiteSpace: 'nowrap',
              }}
            >{payload.secondary_cta_label}</button>
          )}
        </div>
      )}
    </div>
  );
}

