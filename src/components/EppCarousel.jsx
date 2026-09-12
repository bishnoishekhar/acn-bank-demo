// Renders acn-epp-carousel — the aspirational gadget grid for Easy Payment
// Plan. Framing rule: the product image, the name, and the "From CAD X/mo"
// figure are the headline. Retail price sits small under the name. Interest
// and total repayable are hidden here entirely — they live inside the plan
// selector's "Plan details" expander instead.
//
// Layout: 2-column grid of vertical cards (image on top, meta below). Keeps
// the carousel compact even with 8+ products.
export default function EppCarousel({ payload, onCta }) {
  const products = payload?.products || [];
  const title = payload?.title || 'Own it sooner';
  const subtitle = payload?.subtitle || 'Split the cost. Keep your rewards.';

  const BRAND = '#0056B3';

  const fmt = (amount) => {
    const n = Number(amount);
    if (Number.isNaN(n)) return String(amount ?? '');
    return n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const send = (v) => v && onCta && onCta(v);

  const wrap = {
    background: '#fff', borderRadius: '14px', border: '1px solid #E2E6EA',
    marginBottom: '4px', maxWidth: '86%', boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
  };

  return (
    <div style={wrap}>
      <div style={{ padding: '12px 14px 8px', borderBottom: '1px solid #E2E6EA' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0B1F33' }}>{title}</div>
        <div style={{ fontSize: '11px', color: '#66788A', marginTop: '2px' }}>{subtitle}</div>
      </div>

      <div style={{
        padding: '10px', display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px',
      }}>
        {products.map((p, i) => (
          <button
            key={p.product_id || i}
            onClick={() => send(p.cta_value || `epp_select:${p.product_id}`)}
            style={{
              display: 'flex', flexDirection: 'column', width: '100%',
              textAlign: 'left', background: '#fff', border: '1px solid #E2E6EA',
              borderRadius: '12px', padding: '10px', cursor: 'pointer',
              minWidth: 0,
            }}
          >
            {/* Product image — square, aspirational */}
            <div style={{
              width: '100%', aspectRatio: '1 / 1', borderRadius: '10px', overflow: 'hidden',
              background: '#F0F5FA', display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: '8px',
            }}>
              {p.image_url ? (
                <img
                  src={p.image_url}
                  alt={p.product_name || ''}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.parentElement.innerText = '📦';
                    e.currentTarget.parentElement.style.fontSize = '32px';
                    e.currentTarget.parentElement.style.opacity = '0.4';
                  }}
                />
              ) : (
                <span style={{ fontSize: '32px', opacity: 0.4 }}>📦</span>
              )}
            </div>

            {/* Name + retail (small) */}
            <div style={{ minWidth: 0, marginBottom: '6px' }}>
              <div style={{
                fontSize: '13px', fontWeight: 700, color: '#0B1F33',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {p.product_name || 'Product'}
              </div>
              {p.retail_price_cad != null && (
                <div style={{ fontSize: '10.5px', color: '#9AAABD', marginTop: '2px' }}>
                  CAD {fmt(p.retail_price_cad)}
                </div>
              )}
            </div>

            {/* From $X/mo — the headline figure, pinned to bottom */}
            <div style={{
              marginTop: 'auto', display: 'flex', alignItems: 'baseline', gap: '4px',
            }}>
              <span style={{
                fontSize: '9.5px', color: '#66788A',
                textTransform: 'uppercase', letterSpacing: '0.4px',
              }}>From</span>
              <span style={{ fontSize: '15px', fontWeight: 800, color: BRAND, lineHeight: 1 }}>
                ${fmt(p.from_monthly_cad || 0)}
              </span>
              <span style={{ fontSize: '10px', color: '#66788A' }}>/mo</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
