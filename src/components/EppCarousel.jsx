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

  // Category-specific emoji fallback used when a CDN image fails to load
  // (or when the catalog entry has no image_url yet). Keeps the card
  // visually meaningful even when Sony/Samsung/etc. block hotlinking.
  const emojiFor = (p) => ({
    smartphone: '📱', laptop: '💻', tablet: '📱',
    audio: '🎧', wearable: '⌚', console: '🎮', home: '🏠',
  }[p?.category] || '📦');

  // Soft category tints for the fallback so each product still feels
  // visually distinct — a wall of grey squares reads as broken.
  const tintFor = (p) => ({
    smartphone: 'linear-gradient(135deg, #DBEAFE 0%, #EFF6FF 100%)',
    laptop:     'linear-gradient(135deg, #E0E7FF 0%, #EEF2FF 100%)',
    tablet:     'linear-gradient(135deg, #DBEAFE 0%, #EFF6FF 100%)',
    audio:      'linear-gradient(135deg, #FCE7F3 0%, #FDF2F8 100%)',
    wearable:   'linear-gradient(135deg, #DCFCE7 0%, #F0FDF4 100%)',
    console:    'linear-gradient(135deg, #FEF3C7 0%, #FEFCE8 100%)',
    home:       'linear-gradient(135deg, #FED7AA 0%, #FFF7ED 100%)',
  }[p?.category] || '#F0F5FA');

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
            {/* Product image — square, aspirational. Real photo if the
                manufacturer CDN loads; otherwise a category-tinted card
                with a big emoji, keyed by product.category. */}
            <div style={{
              width: '100%', aspectRatio: '1 / 1', borderRadius: '10px', overflow: 'hidden',
              background: tintFor(p), display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: '8px', position: 'relative',
            }}>
              {p.image_url ? (
                <img
                  src={p.image_url}
                  alt={p.product_name || ''}
                  style={{
                    width: '100%', height: '100%', objectFit: 'contain',
                    padding: '6px',
                  }}
                  onError={(e) => {
                    // CDN hotlink blocked or URL stale — fall back to a
                    // category emoji + tint so the card still looks
                    // intentional. Clear the tag then inject the emoji.
                    const parent = e.currentTarget.parentElement;
                    e.currentTarget.remove();
                    parent.innerText = emojiFor(p);
                    parent.style.fontSize = '56px';
                    parent.style.opacity = '0.85';
                    parent.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.08))';
                  }}
                />
              ) : (
                <span style={{
                  fontSize: '56px', opacity: 0.85,
                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.08))',
                }}>{emojiFor(p)}</span>
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
