// Renders acn-epp-carousel — the aspirational gadget grid for Easy Payment
// Plan. Framing rule: the product image, the name, and the "From CAD X/mo"
// figure are the headline. Retail price sits small under the name. Interest
// and total repayable are hidden here entirely — they live inside the plan
// selector's "Plan details" expander instead.
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

      <div style={{ padding: '8px', display: 'grid', gap: '8px' }}>
        {products.map((p, i) => (
          <button
            key={p.product_id || i}
            onClick={() => send(p.cta_value || `epp_select:${p.product_id}`)}
            style={{
              display: 'grid', gridTemplateColumns: '86px 1fr auto', gap: '12px', width: '100%',
              textAlign: 'left', background: '#fff', border: '1px solid #E2E6EA',
              borderRadius: '12px', padding: '10px 12px', cursor: 'pointer',
              alignItems: 'center',
            }}
          >
            {/* Product image — square, aspirational */}
            <div style={{
              width: '86px', height: '86px', borderRadius: '10px', overflow: 'hidden',
              background: '#F0F5FA', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {p.image_url ? (
                <img
                  src={p.image_url}
                  alt={p.product_name || ''}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              ) : (
                <span style={{ fontSize: '28px', opacity: 0.4 }}>📦</span>
              )}
            </div>

            {/* Name + tagline + retail (small) */}
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: '14px', fontWeight: 700, color: '#0B1F33',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {p.product_name || 'Product'}
              </div>
              {p.tagline && (
                <div style={{ fontSize: '11.5px', color: '#66788A', marginTop: '2px' }}>{p.tagline}</div>
              )}
              {p.retail_price_cad != null && (
                <div style={{ fontSize: '10.5px', color: '#9AAABD', marginTop: '4px' }}>
                  CAD {fmt(p.retail_price_cad)}
                </div>
              )}
            </div>

            {/* From $X/mo — the headline figure */}
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '10px', color: '#66788A', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                From
              </div>
              <div style={{ fontSize: '17px', fontWeight: 800, color: BRAND, lineHeight: 1.1 }}>
                ${fmt(p.from_monthly_cad || 0)}
              </div>
              <div style={{ fontSize: '10.5px', color: '#66788A', marginTop: '1px' }}>/mo</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
