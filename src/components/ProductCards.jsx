// Renders acn-product-cards: a generic, scrollable row of information cards.
//
// One component for everything that is "a few things to compare or check":
//   account products and GIC terms  (variant "rates")   big rate / fee, key terms, an action
//   account and investment summary  (variant "summary") big balance, contribution room, an action
//   application status tracker      (variant "status")  status badge, reference, next step
//   trip readiness checklist        (variant "checklist") tick / cross rows
//   "what would you like to explore" shelf (variant "shelf")
//
// Payload (all strings are plain text; nothing is rendered as HTML):
//   { title, subtitle?, variant?, footnote?,
//     items: [{ title, badge?, tone?, headline?, headline_label?, description?,
//               details?: [{ label, value?, done? }], cta_label?, cta_value? }] }
//   tone: positive | info | warning | negative   (colours the badge and the card's top edge)
// A button click sends cta_value to the agent as if the customer had typed it.

const BRAND = '#0056B3';
const MUTED = '#66788A';
const INK = '#0F2A43';
const LINE = '#E2E6EA';

const TONES = {
  positive: { color: '#059669', bg: '#ECFDF5' },
  info: { color: BRAND, bg: '#EFF6FF' },
  warning: { color: '#D97706', bg: '#FFFBEB' },
  negative: { color: '#DC2626', bg: '#FEF2F2' },
};

const str = (v) => (v === null || v === undefined ? '' : String(v));

function Detail({ d }) {
  const label = str(d?.label);
  if (!label) return null;
  const hasDone = typeof d.done === 'boolean';
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, fontSize: 12, padding: '4px 0', borderTop: `1px solid ${LINE}` }}>
      <span style={{ color: hasDone ? INK : MUTED, display: 'flex', gap: 6 }}>
        {hasDone && (
          <span aria-hidden="true" style={{ color: d.done ? '#059669' : '#D97706', fontWeight: 700 }}>{d.done ? '✓' : '○'}</span>
        )}
        {label}
      </span>
      {str(d.value) && <span style={{ color: INK, fontWeight: 600, textAlign: 'right' }}>{str(d.value)}</span>}
    </div>
  );
}

export default function ProductCards({ payload, onCta }) {
  const { title, subtitle, footnote } = payload || {};
  const items = Array.isArray(payload?.items) ? payload.items.filter((i) => i && str(i.title)).slice(0, 8) : [];
  if (!items.length) return null;
  const send = (v) => v && onCta && onCta(v);
  const anyBadge = items.some((i) => str(i.badge));   // keep titles level across the row

  return (
    <div style={{
      background: '#fff', borderRadius: 16, border: `1px solid ${LINE}`, maxWidth: '95%', width: 'max-content',
      minWidth: 280, boxShadow: '0 4px 16px rgba(0,0,0,0.06)', padding: '14px 0 12px', overflow: 'hidden',
    }}>
      {(str(title) || str(subtitle)) && (
        <div style={{ padding: '0 16px 10px' }}>
          {str(title) && <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>{str(title)}</div>}
          {str(subtitle) && <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{str(subtitle)}</div>}
        </div>
      )}

      <div
        role="list"
        style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '2px 16px 6px', scrollSnapType: 'x proximity' }}
      >
        {items.map((item, i) => {
          const tone = TONES[item.tone] || TONES.info;
          const details = Array.isArray(item.details) ? item.details.slice(0, 7) : [];
          const canAct = str(item.cta_label) && str(item.cta_value);
          return (
            <div
              key={`${str(item.title)}-${i}`}
              role="listitem"
              style={{
                flex: '0 0 210px', scrollSnapAlign: 'start', display: 'flex', flexDirection: 'column',
                border: `1px solid ${LINE}`, borderTop: `3px solid ${item.tone ? tone.color : BRAND}`,
                borderRadius: 12, padding: '12px 12px 10px', background: '#fff',
              }}
            >
              {!str(item.badge) && anyBadge && <span aria-hidden="true" style={{ height: 22, marginBottom: 8 }} />}
              {str(item.badge) && (
                <span style={{
                  alignSelf: 'flex-start', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
                  color: tone.color, background: tone.bg, padding: '3px 8px', borderRadius: 6, marginBottom: 8,
                }}>{str(item.badge)}</span>
              )}
              <div style={{ fontSize: 14, fontWeight: 700, color: INK, lineHeight: 1.3 }}>{str(item.title)}</div>
              {str(item.headline) && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: BRAND, lineHeight: 1.1 }}>{str(item.headline)}</div>
                  {str(item.headline_label) && <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{str(item.headline_label)}</div>}
                </div>
              )}
              {str(item.description) && <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.45, marginTop: 8 }}>{str(item.description)}</div>}
              {details.length > 0 && <div style={{ marginTop: 8 }}>{details.map((d, j) => <Detail key={j} d={d} />)}</div>}
              {canAct && (
                <div style={{ marginTop: 'auto', paddingTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => send(str(item.cta_value))}
                    style={{
                      width: '100%', background: BRAND, color: '#fff', border: 'none', borderRadius: 8,
                      padding: '9px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >{str(item.cta_label)}</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {str(footnote) && <div style={{ fontSize: 11, color: MUTED, padding: '6px 16px 0' }}>{str(footnote)}</div>}
    </div>
  );
}
