import { useState } from 'react';

const tabs = [
  { key: 'flights', label: 'Flights', values: ['flightOptions', 'flight_options'] },
  { key: 'stays', label: 'Stays', values: ['stayOptions', 'stay_options'] },
  { key: 'resorts', label: 'Ski resorts', values: ['resortOptions', 'resort_options'] },
];

const fallbackImages = {
  flights: [
    'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1542296332-2e4473faf563?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1529070538774-1843cb3265df?auto=format&fit=crop&w=900&q=80',
  ],
  stays: [
    'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=900&q=80',
  ],
  resorts: [
    'https://images.unsplash.com/photo-1551524559-8af4e6624178?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1486911278844-a81c5267e227?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1517825738774-7de9363ef735?auto=format&fit=crop&w=900&q=80',
  ],
};

function text(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  const result = String(value).trim();
  return result || fallback;
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function safeImageUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const source = value.trim();
  if (source.startsWith('/')) return `${import.meta.env.BASE_URL}${source.slice(1)}`;
  try {
    const url = new URL(source);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function safeHttpsUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function getOptionValue(option, camel, snake) {
  return option?.[camel] ?? option?.[snake];
}

function imageFor(option, category, index) {
  return option?.imageUrl || fallbackImages[category][index % fallbackImages[category].length];
}

function ImageWithFallback({ src, alt, className = '' }) {
  const [failed, setFailed] = useState(false);
  const safeSrc = safeImageUrl(src);
  if (!safeSrc || failed) return <div className={`${className} acn-trip-booking-image-fallback`} aria-hidden="true" />;
  return <img className={className} src={safeSrc} alt={alt || ''} onError={() => setFailed(true)} />;
}

function ExternalLink({ href, children }) {
  const safeHref = safeHttpsUrl(href);
  if (!safeHref) return null;
  return <a className="acn-trip-booking-link" href={safeHref} target="_blank" rel="noopener noreferrer">{children}<span aria-hidden="true">↗</span></a>;
}

function Price({ price }) {
  if (!price) return null;
  return <p className="acn-trip-booking-price">{text(price.label)}{price.livePriceChecked === false && <small> Illustrative only</small>}</p>;
}

function FlightCard({ option, index }) {
  return <article className="acn-trip-booking-card">
    <ImageWithFallback src={imageFor(option, 'flights', index)} alt="" className="acn-trip-booking-card__image" />
    <h4>{text(option?.title, 'Flight option')}</h4>
    {option?.airline && <p className="acn-trip-booking-muted">{option.airline}</p>}
    {option?.route && <p>{text(option.route.from)} → {text(option.route.to)}</p>}
    {option?.reason && <p>{option.reason}</p>}
    {option?.bestFor && <p className="acn-trip-booking-muted">{option.bestFor}</p>}
    <Price price={option?.price} />
    <ExternalLink href={option?.searchUrl ?? option?.search_url}>{text(option?.ctaLabel, 'Compare flights')}</ExternalLink>
  </article>;
}

function StayCard({ option, index }) {
  return <article className="acn-trip-booking-card">
    <ImageWithFallback src={imageFor(option, 'stays', index)} alt="" className="acn-trip-booking-card__image" />
    <h4>{text(option?.name, 'Stay option')}</h4>
    {option?.location && <p className="acn-trip-booking-muted">{option.location}</p>}
    {option?.reason && <p>{option.reason}</p>}
    {list(option?.highlights).length > 0 && <ul>{list(option.highlights).map((highlight, index) => <li key={`${highlight}-${index}`}>{highlight}</li>)}</ul>}
    <Price price={option?.price} />
    <ExternalLink href={option?.searchUrl ?? option?.search_url}>{text(option?.ctaLabel, 'Explore stays')}</ExternalLink>
  </article>;
}

function ResortCard({ option, index }) {
  return <article className="acn-trip-booking-card">
    <ImageWithFallback src={imageFor(option, 'resorts', index)} alt="" className="acn-trip-booking-card__image" />
    <h4>{text(option?.name, 'Ski resort')}</h4>
    {option?.location && <p className="acn-trip-booking-muted">{option.location}</p>}
    {option?.fitLabel && <p className="acn-trip-booking-eyebrow">{option.fitLabel}</p>}
    {option?.description && <p>{option.description}</p>}
    {list(option?.highlights).length > 0 && <ul>{list(option.highlights).map((highlight, index) => <li key={`${highlight}-${index}`}>{highlight}</li>)}</ul>}
    <ExternalLink href={option?.officialUrl ?? option?.official_url}>{'View resort'}</ExternalLink>
  </article>;
}

function WidgetAction({ action, onAction }) {
  if (action?.actionType === 'SEND_UTTERANCE' && action.utterance) {
    return <button type="button" className={`acn-trip-booking-action acn-trip-booking-action--${action.style || 'secondary'}`} onClick={() => onAction?.(action.utterance)}>{action.label}</button>;
  }
  if (action?.actionType === 'OPEN_URL') {
    const href = safeHttpsUrl(action.url);
    if (!href) return null;
    return <a className={`acn-trip-booking-action acn-trip-booking-action--${action.style || 'secondary'}`} href={href} target="_blank" rel="noopener noreferrer">{action.label}</a>;
  }
  return null;
}

export default function TripBookingRecommendationsWidget({ payload, onAction }) {
  const availableTabs = tabs.filter((tab) => tab.values.some((key) => list(payload?.[key]).length > 0));
  const initialKey = availableTabs.some((tab) => tab.key === payload?.initialTab) ? payload.initialTab : availableTabs[0]?.key;
  const [activeTab, setActiveTab] = useState(initialKey);
  const [visibleCount, setVisibleCount] = useState(3);
  if (!availableTabs.length) return null;
  const active = availableTabs.find((tab) => tab.key === activeTab) || availableTabs[0];
  const options = list(active.values.map((key) => payload?.[key]).find((value) => Array.isArray(value)));
  const visibleOptions = options.slice(0, visibleCount);
  const heroUrl = safeImageUrl(payload?.hero?.imageUrl);
  const disclosures = list(payload?.disclosures);
  const actions = list(payload?.actions);

  const switchTab = (key) => {
    setActiveTab(key);
    setVisibleCount(3);
  };

  return <section className="acn-trip-booking-widget" aria-label={text(payload?.title, 'Trip booking recommendations')}>
    <header className="acn-trip-booking-widget__header">
      {heroUrl && <ImageWithFallback src={payload.hero.imageUrl} alt="" className="acn-trip-booking-widget__hero" />}
      <div><h3>{text(payload?.title, 'Ideas for your trip')}</h3><p>{text(payload?.subtitle)}</p></div>
    </header>
    {payload?.tripContext && <p className="acn-trip-booking-widget__context">{[payload.tripContext.originCity, payload.tripContext.destinationCity || payload.tripContext.destinationCountry, payload.tripContext.departureMonth, payload.tripContext.travellerCount && `${payload.tripContext.travellerCount} travellers`].filter(Boolean).join(' · ')}</p>}
    <div className="acn-trip-booking-tabs" role="tablist" aria-label="Trip recommendations">
      {availableTabs.map((tab) => <button type="button" role="tab" aria-selected={active.key === tab.key} className={active.key === tab.key ? 'is-active' : ''} key={tab.key} onClick={() => switchTab(tab.key)}>{tab.label}</button>)}
    </div>
    <div className="acn-trip-booking-panel" role="tabpanel"><div className="acn-trip-booking-grid">{visibleOptions.map((option, index) => active.key === 'flights' ? <FlightCard key={option.id || index} option={option} index={index} /> : active.key === 'stays' ? <StayCard key={option.id || index} option={option} index={index} /> : <ResortCard key={option.id || index} option={option} index={index} />)}</div>{options.length > visibleCount && <button type="button" className="acn-trip-booking-show-more" onClick={() => setVisibleCount((count) => count + 3)}>Show more</button>}</div>
    {text(payload?.eligibleSpendNote) && <div className="acn-trip-booking-note"><span aria-hidden="true">i</span><p>{payload.eligibleSpendNote}</p></div>}
    {actions.length > 0 && <div className="acn-trip-booking-actions">{actions.map((action, index) => <WidgetAction key={`${action.label}-${index}`} action={action} onAction={onAction} />)}</div>}
    {disclosures.length > 0 && <details className="acn-trip-booking-disclosures"><summary>Important details</summary><ul>{disclosures.map((disclosure, index) => <li key={`${disclosure}-${index}`}>{disclosure}</li>)}</ul></details>}
  </section>;
}
