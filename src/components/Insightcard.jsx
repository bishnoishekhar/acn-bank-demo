import { useState } from 'react';
import { SpendingMiniWidgetsGrid } from './FinancialInsightsWidgets';

const INSIGHT_CONFIG = {
  bill_automation:     { icon: '⚡', label: 'Upcoming Utility Bill', accent: '#D97706', headerBg: '#FFFBEB', pillBg: '#FEF3C7', border: '#FDE68A' },
  bill_due:            { icon: '⚡', label: 'Upcoming Utility Bill', accent: '#D97706', headerBg: '#FFFBEB', pillBg: '#FEF3C7', border: '#FDE68A' },
  savings_opportunity: { icon: '💰', label: 'Savings Opportunity',   accent: '#059669', headerBg: '#ECFDF5', pillBg: '#D1FAE5', border: '#A7F3D0' },
  spending_spike:      { icon: '📊', label: 'Spending & Category Trend', accent: '#0284C7', headerBg: '#F0F9FF', pillBg: '#E0F2FE', border: '#BAE6FD' },
  anomaly:             { icon: '🚨', label: 'Unusual Transaction',   accent: '#DC2626', headerBg: '#FEF2F2', pillBg: '#FEE2E2', border: '#FECACA' },
  credit_score:        { icon: '📈', label: 'Credit Score',          accent: '#6D28D9', headerBg: '#F5F3FF', pillBg: '#EDE9FE', border: '#DDD6FE' },
  cash_flow:           { icon: '💡', label: 'Smart Insight',         accent: '#0056B3', headerBg: '#EFF6FF', pillBg: '#DBEAFE', border: '#BFDBFE' },
  offer:               { icon: '🎁', label: 'Pre-Approved Offer',    accent: '#7C3AED', headerBg: '#F5F3FF', pillBg: '#EDE9FE', border: '#DDD6FE' },
};

export default function InsightCard({ payload, onCta }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || !payload) return null;

  const type = payload.insight_type || 'cash_flow';
  const cfg = INSIGHT_CONFIG[type] || INSIGHT_CONFIG.cash_flow;

  const showSpendingDashboard =
    type === 'spending_spike' ||
    type === 'cash_flow' ||
    /spending|category|trend/i.test(`${payload.headline || ''} ${payload.body || ''}`);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
      <div
        style={{
          background: '#FFFFFF',
          border: `1.5px solid ${cfg.border}`,
          borderTop: `4px solid ${cfg.accent}`,
          borderRadius: '10px 16px 16px 16px',
          fontSize: 13,
          width: '100%',
          alignSelf: 'flex-start',
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.07)',
          marginTop: 4,
          marginBottom: 4,
          overflow: 'hidden',
        }}
      >
        {/* Header (Light Mode) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            background: cfg.headerBg,
            borderBottom: `1px solid ${cfg.border}`,
          }}
        >
          <span style={{ fontSize: 15 }}>{cfg.icon}</span>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              color: cfg.accent,
              flex: 1,
            }}
          >
            {cfg.label}
          </span>
          {payload.dismissible && (
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Dismiss insight"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#64748B',
                fontSize: 16,
                lineHeight: 1,
                padding: '0 2px',
                fontFamily: 'inherit',
              }}
            >
              ×
            </button>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: '12px 14px 6px' }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 800,
              color: '#0F172A',
              lineHeight: 1.4,
              marginBottom: 5,
            }}
          >
            {payload.headline}
          </div>
          {(payload.detail || payload.body) && (
            <div
              style={{
                fontSize: 12.5,
                color: '#475569',
                lineHeight: 1.55,
              }}
            >
              {payload.detail || payload.body}
            </div>
          )}
        </div>

        {/* Metrics */}
        {payload.metrics?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 14px' }}>
            {payload.metrics.map((m, i) => {
              const isKV = !m.label && typeof m === 'object';
              const [label, value] = isKV ? Object.entries(m)[0] : [m.label, m.value];
              return (
                <div
                  key={i}
                  style={{
                    flex: '1 1 85px',
                    background: cfg.headerBg,
                    border: `1px solid ${cfg.border}`,
                    borderRadius: 9,
                    padding: '6px 9px',
                  }}
                >
                  <div
                    style={{
                      fontSize: 9.5,
                      fontWeight: 800,
                      color: cfg.accent,
                      marginBottom: 2,
                      textTransform: 'uppercase',
                    }}
                  >
                    {label}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#0F172A' }}>
                    {value}
                    {m.trend === 'up' && (
                      <span style={{ color: '#DC2626', fontSize: 10, marginLeft: 3 }}>↑</span>
                    )}
                    {m.trend === 'down' && (
                      <span style={{ color: '#059669', fontSize: 10, marginLeft: 3 }}>↓</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Actions */}
        {(payload.cta_label || payload.secondary_cta_label) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px 13px' }}>
            {payload.cta_label && (
              <button
                type="button"
                onClick={() => onCta && onCta(payload.cta_value || payload.cta_label)}
                style={{
                  flex: 1,
                  fontSize: 12,
                  fontWeight: 800,
                  fontFamily: 'inherit',
                  padding: '9px 14px',
                  borderRadius: 9,
                  background: cfg.accent,
                  color: '#FFFFFF',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'center',
                  boxShadow: '0 2px 8px rgba(15, 23, 42, 0.12)',
                }}
              >
                {payload.cta_label} →
              </button>
            )}
            {payload.secondary_cta_label && (
              <button
                type="button"
                onClick={() =>
                  onCta && onCta(payload.secondary_cta_value || payload.secondary_cta_label)
                }
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  color: '#0F172A',
                  background: '#F8FAFC',
                  border: '1px solid #CBD5E1',
                  borderRadius: 9,
                  cursor: 'pointer',
                  padding: '8px 11px',
                  whiteSpace: 'nowrap',
                }}
              >
                {payload.secondary_cta_label}
              </button>
            )}
          </div>
        )}
      </div>

      {/* When analyzing spending / trend, show the interactive Donut Pie Chart + Mini-2x2 Widgets */}
      {showSpendingDashboard && (
        <SpendingMiniWidgetsGrid mode="chat" payload={payload} onAction={onCta} />
      )}
    </div>
  );
}
