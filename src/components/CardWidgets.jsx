// ─────────────────────────────────────────────────────────────────────────────
//  Renderers for the CES card widgets.
//
//  CES emits two widget types from the Credit Cards agent:
//    card_comparison → widgetType PRODUCT_CAROUSEL   { productDetails: [...] }
//    card_check      → widgetType PRODUCT_COMPARISON { productDetails, features }
//
//  This app replaces the GECX default renderer with its own chat surface, so
//  without these both payloads were being dropped as "unrecognized payload".
//
//  The catalogue has no product photography, so cards are drawn with CSS using
//  a hash of the product id for a stable accent — the same card always gets the
//  same colour across turns.
// ─────────────────────────────────────────────────────────────────────────────

const ACCENTS = [
  ['#1a1f36', '#2f3d6b'],
  ['#0b3d5c', '#1f7a9c'],
  ['#0f4d3a', '#1f9068'],
  ['#3b3355', '#6f5f9e'],
  ['#4a2c2a', '#96574f'],
  ['#1c3b57', '#4a7fa8'],
];

function accentFor(id = '') {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

const isPreApproved = (p) => /pre-?approved/i.test(p.subtitle || '');

function MiniCard({ product }) {
  const [a, b] = accentFor(product.productId || product.title);
  return (
    <div
      className="cw-art"
      style={{ background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)` }}
      aria-hidden="true"
    >
      <span className="cw-art-bank">ACN Bank</span>
      <span className="cw-art-chip" />
      <span className="cw-art-dots">•••• 0000</span>
    </div>
  );
}

/* ── PRODUCT_CAROUSEL ─────────────────────────────────────────────────────── */
export function CardCarousel({ payload, onCta }) {
  const products = payload?.productDetails ?? [];
  if (!products.length) return null;

  return (
    <div className="cw-carousel">
      {payload.title && <div className="cw-title">{payload.title}</div>}
      <div className="cw-scroll">
        {products.map((p) => (
          <div key={p.productId || p.title} className={`cw-card${isPreApproved(p) ? ' pre' : ''}`}>
            {isPreApproved(p) && <span className="cw-pre-tag">Pre-approved</span>}
            <MiniCard product={p} />
            <div className="cw-card-name">{p.title}</div>
            {p.price && <div className="cw-card-price">{p.price}</div>}
            {p.subtitle && <div className="cw-card-sub">{p.subtitle}</div>}
            <div className="cw-card-actions">
              <button
                className="cw-btn-ghost"
                onClick={() => onCta?.(`Tell me more about the ${p.title}`)}
              >
                Details
              </button>
              <button
                className="cw-btn"
                onClick={() => onCta?.(`I want to apply for the ${p.title}`)}
              >
                Apply
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── PRODUCT_COMPARISON ───────────────────────────────────────────────────── */
export function CardCompare({ payload, onCta }) {
  const products = payload?.productDetails ?? [];
  const features = payload?.features ?? [];
  if (!products.length) return null;

  // Renders whichever of text / anchor a spec actually uses.
  const specContent = (spec) => {
    if (!spec) return '—';
    if (spec.text) return spec.text;
    if (spec.anchor?.target) {
      return (
        <a href={spec.anchor.target} target="_blank" rel="noreferrer noopener">
          {spec.anchor.displayText || 'More'}
        </a>
      );
    }
    if (spec.image?.rawUrl) {
      return <img src={spec.image.rawUrl} alt={spec.image.altText || ''} className="cw-spec-img" />;
    }
    return '—';
  };

  return (
    <div className="cw-compare">
      <div className="cw-title">{payload.title || 'Card comparison'}</div>

      <div className="cw-table-wrap">
        <table className="cw-table">
          <thead>
            <tr>
              <th className="cw-th-label" scope="col"><span className="cw-sr">Feature</span></th>
              {products.map((p) => (
                <th key={p.productId || p.title} scope="col">
                  <div className="cw-th-card">
                    {isPreApproved(p) && <span className="cw-pre-tag inline">Pre-approved</span>}
                    <MiniCard product={p} />
                    <div className="cw-th-name">{p.title}</div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {features.map((f) => (
              <tr key={f.label}>
                <th className="cw-td-label" scope="row">{f.label}</th>
                {products.map((p, i) => (
                  <td key={(p.productId || p.title) + f.label}>
                    {specContent((f.productSpecs ?? [])[i])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="cw-compare-actions">
        {products.map((p) => (
          <button
            key={p.productId || p.title}
            className="cw-btn"
            onClick={() => onCta?.(`I want to apply for the ${p.title}`)}
          >
            Apply for {p.title.replace(/^ACN\s+/, '')}
          </button>
        ))}
      </div>
    </div>
  );
}
