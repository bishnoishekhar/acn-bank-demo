import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { CARD_CATALOG, CARD_CATEGORIES } from '../../data/cardCatalog';
import { fetchCardCatalog } from '../../firebase';

/* Maps a pre-approved offer id from financials/profile onto a catalogue card,
   so a signed-in customer sees their own offer flagged on the right product. */
const OFFER_TO_CARD = {
  OFFER_TRAVEL_CC: 'acn-travel-rewards-visa',
};

const FILTERS = [
  { id: 'all', label: 'All cards' },
  ...Object.entries(CARD_CATEGORIES).map(([id, { label }]) => ({ id, label })),
];

const fmtIncome = (v) =>
  v > 0 ? `CAD ${v.toLocaleString('en-CA')}` : 'No minimum';

/* ── Mini card art ─────────────────────────────────────────────────────────── */
function CardArt({ card }) {
  return (
    <div
      className="cs-art"
      style={{ background: `linear-gradient(135deg, ${card.accent} 0%, ${card.accent_2} 100%)` }}
      aria-hidden="true"
    >
      <div className="cs-art-sheen" />
      <div className="cs-art-top">
        <span className="cs-art-bank">ACN Bank</span>
        <span className="cs-art-tier">{card.tier}</span>
      </div>
      <div className="cs-art-chip" />
      <div className="cs-art-bottom">
        <span className="cs-art-dots">•••• •••• •••• ••••</span>
        <span className="cs-art-network">{card.network}</span>
      </div>
    </div>
  );
}

export default function CardsSection({ onOpenChat }) {
  const { isAuthenticated, customer } = useAuth();
  const [filter,  setFilter]  = useState('all');
  const [catalog, setCatalog] = useState(CARD_CATALOG);
  const [openId,  setOpenId]  = useState(null);   // which card has details expanded

  /* Prefer the Firestore catalogue so card data can be updated without a
     redeploy. The bundled module renders immediately and remains the fallback
     if the collection is missing or unreadable. */
  useEffect(() => {
    let alive = true;
    fetchCardCatalog().then((remote) => {
      if (alive && remote.length) setCatalog(remote);
    });
    return () => { alive = false; };
  }, []);

  const preApprovedCardIds = useMemo(() => {
    if (!isAuthenticated) return new Set();
    return new Set(
      (customer?.preApprovedOffers ?? [])
        .map((id) => OFFER_TO_CARD[id])
        .filter(Boolean),
    );
  }, [isAuthenticated, customer]);

  const visible = filter === 'all'
    ? catalog
    : catalog.filter((c) => c.category === filter);

  return (
    <section className="cards-section" id="cards">
      <p className="section-label">Credit cards · browse freely, no sign-in needed</p>

      <div className="cs-head">
        <h2 className="cs-title">Find a card that fits how you actually spend</h2>
        <p className="cs-sub">
          Compare fees, rates and rewards below — or ask the assistant to narrow it
          down for you. You only need to sign in when you decide to apply.
        </p>
      </div>

      {/* Category filter */}
      <div className="cs-filters" role="tablist" aria-label="Card categories">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            className={`cs-filter${filter === f.id ? ' active' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="cs-grid">
        {visible.map((card) => {
          const expanded    = openId === card.card_id;
          const preApproved = preApprovedCardIds.has(card.card_id);

          return (
            <article key={card.card_id} className={`cs-card${preApproved ? ' pre-approved' : ''}`}>
              {preApproved && (
                <div className="cs-badge">🎁 You're pre-approved</div>
              )}

              <CardArt card={card} />

              <h3 className="cs-name">{card.card_name}</h3>
              <p className="cs-tagline">{card.tagline}</p>

              <dl className="cs-specs">
                <div><dt>Annual fee</dt><dd>{card.annual_fee_display}</dd></div>
                <div><dt>Purchase APR</dt><dd>{card.apr_purchase}</dd></div>
                <div><dt>Foreign transactions</dt><dd>{card.foreign_tx_fee}</dd></div>
                <div><dt>Minimum income</dt><dd>{fmtIncome(card.min_income)}</dd></div>
              </dl>

              <p className="cs-reward">{card.top_rewards}</p>

              <div className="cs-chips">
                {(card.best_for ?? []).map((b) => (
                  <span key={b} className="cs-chip">{b}</span>
                ))}
              </div>

              <button
                className="cs-details-toggle"
                aria-expanded={expanded}
                onClick={() => setOpenId(expanded ? null : card.card_id)}
              >
                {expanded ? 'Hide details' : 'See rewards & perks'}
                <span className={`cs-caret${expanded ? ' open' : ''}`} aria-hidden="true">›</span>
              </button>

              {expanded && (
                <div className="cs-details">
                  <p className="cs-details-label">Welcome offer</p>
                  <p className="cs-details-text">{card.welcome_offer}</p>

                  <p className="cs-details-label">Rewards</p>
                  <ul className="cs-details-list">
                    {(card.rewards ?? []).map((r) => <li key={r}>{r}</li>)}
                  </ul>

                  <p className="cs-details-label">Perks</p>
                  <ul className="cs-details-list">
                    {(card.perks ?? []).map((p) => <li key={p}>{p}</li>)}
                  </ul>
                </div>
              )}

              <div className="cs-ctas">
                <button
                  className="cs-btn-ghost"
                  onClick={() => onOpenChat(`Tell me more about the ${card.card_name}`)}
                >
                  Ask the assistant
                </button>
                <button
                  className="cs-btn"
                  onClick={() => onOpenChat(`I want to apply for the ${card.card_name}`)}
                >
                  Apply
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="cs-footnote">
        <button
          className="cs-compare-all"
          onClick={() => onOpenChat('Compare your credit cards side by side')}
        >
          ⚖️ Compare these cards in chat
        </button>
        <span>Rates and fees are illustrative demo data.</span>
      </div>
    </section>
  );
}
