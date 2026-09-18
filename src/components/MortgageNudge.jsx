// Renders acn-mortgage-nudge — the soft-suggestion card.
//
// This is deliberately the quietest widget in the app. No filled primary
// button, no gradient, no big number. A suggestion should read as something
// offered, not something being sold: the accept and decline buttons are the
// same visual weight, and "Not now" is always present.
//
// Copy comes verbatim from mortgage_next_best_action, which is authoritative.
// We render title, body and evidence exactly as given and never reformat a
// figure, because the whole point is that every claim carries its own number.
import { useState } from 'react';

const BRAND = '#0056B3';
const MUTED = '#66788A';
const INK = '#0B1F33';

// Icon per suggestion kind. Kinds come from the tool; anything unknown falls
// back to the lightbulb rather than rendering nothing.
const KIND_ICONS = {
  down_payment: '🏦',
  closing_costs: '📄',
  rate_choice: '📊',
  rate_hold: '🔒',
  structure: '📐',
  prepayment: '⏱️',
  heloc: '🏠',
  refinance: '🔁',
  protection: '🛡️',
  recovery: '🧭',
};

export default function MortgageNudge({ payload, onCta }) {
  const suggestions = Array.isArray(payload?.suggestions) ? payload.suggestions : [];
  // Which cards this widget has already answered. Kept local so the bubble
  // stays in the transcript as a record of what was offered and what was said.
  const [answered, setAnswered] = useState({});

  if (suggestions.length === 0) return null;

  const answer = (suggestion, accepted) => {
    const value = accepted ? suggestion.cta_value : suggestion.decline_value;
    setAnswered((prev) => ({ ...prev, [suggestion.suggestion_id]: accepted ? 'accepted' : 'declined' }));
    if (value && onCta) onCta(value);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '380px', width: '100%' }}>
      {suggestions.map((s, i) => {
        const state = answered[s.suggestion_id];
        const evidence = Array.isArray(s.evidence) ? s.evidence : [];
        return (
          <div
            key={s.suggestion_id || i}
            style={{
              background: '#fff',
              border: '1px solid #DDE4ED',
              borderLeft: `3px solid ${state === 'declined' ? '#C9D2DD' : BRAND}`,
              borderRadius: '12px',
              padding: '14px 16px',
              boxShadow: '0 1px 8px rgba(0,0,0,0.05)',
              opacity: state === 'declined' ? 0.6 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {/* Header: a quiet "suggestion" label, not a headline offer. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px' }}>{KIND_ICONS[s.kind] || '💡'}</span>
              <span style={{
                fontSize: '10px', color: MUTED, textTransform: 'uppercase',
                letterSpacing: '0.7px', fontWeight: 700,
              }}>
                Worth a look
              </span>
            </div>

            <div style={{ fontSize: '13.5px', fontWeight: 700, color: INK, lineHeight: 1.35, marginBottom: '6px' }}>
              {s.title}
            </div>
            <div style={{ fontSize: '12.5px', color: '#4A5A6B', lineHeight: 1.55 }}>
              {s.body}
            </div>

            {/* Evidence chips — the numbers that justify the suggestion. */}
            {evidence.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '11px' }}>
                {evidence.map((e, j) => (
                  <span
                    key={j}
                    style={{
                      background: '#F2F6FB', borderRadius: '7px', padding: '5px 9px',
                      fontSize: '11px', color: MUTED, lineHeight: 1.3,
                    }}
                  >
                    {e.label}
                    {' '}
                    <b style={{ color: INK }}>{e.value}</b>
                  </span>
                ))}
              </div>
            )}

            {/* Both buttons are outlines. Neither is the obvious one to press. */}
            {!state ? (
              <div style={{ display: 'flex', gap: '8px', marginTop: '13px' }}>
                <button
                  onClick={() => answer(s, true)}
                  style={{
                    flex: 1, padding: '10px', borderRadius: '9px',
                    border: `1.5px solid ${BRAND}`, background: '#fff', color: BRAND,
                    fontSize: '12.5px', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {s.cta_label || 'Tell me more'}
                </button>
                <button
                  onClick={() => answer(s, false)}
                  style={{
                    padding: '10px 14px', borderRadius: '9px',
                    border: '1.5px solid #DDE4ED', background: '#fff', color: MUTED,
                    fontSize: '12.5px', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {s.decline_label || 'Not now'}
                </button>
              </div>
            ) : (
              <div style={{
                marginTop: '12px', fontSize: '11.5px', color: MUTED,
                display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                <span>{state === 'accepted' ? '✓' : '—'}</span>
                <span>
                  {state === 'accepted'
                    ? 'Noted. Nothing has been added or charged.'
                    : 'Set aside. I will not bring this one up again.'}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
