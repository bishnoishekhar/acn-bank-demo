import { useState } from 'react';

const tabs = [
  { key: 'flights', label: 'Flights', values: ['flightOptions', 'flight_options'] },
  { key: 'stays', label: 'Stays', values: ['stayOptions', 'stay_options'] },
  { key: 'resorts', label: 'Ski resorts', values: ['resortOptions', 'resort_options'] },
];

const fallbackHeroImage = 'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=900&q=80';

// Option-specific mappings for this Italy ski itinerary, checked before the broad category fallback.
const specificImageMap = [
  {
    pattern: /val gardena|gardena|sellaronda/i,
    stays: 'https://images.unsplash.com/photo-1517840901100-8179e982acb7?auto=format&fit=crop&w=800&q=80', // snowy alpine chalet exterior
    resorts: 'https://images.unsplash.com/photo-1518135714426-c18f5ffb6f4d?auto=format&fit=crop&w=800&q=80', // snow-covered Dolomites village
  },
  {
    pattern: /cortina/i,
    stays: 'https://images.unsplash.com/photo-1518602164578-cd0074062767?auto=format&fit=crop&w=800&q=80', // cozy alpine wood lodge
    resorts: 'https://images.unsplash.com/photo-1486911278844-a81c5267e227?auto=format&fit=crop&w=800&q=80', // snowy Dolomites mountainside
  },
  {
    pattern: /bormio/i,
    stays: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=800&q=80', // mountain lodge deck with alpine view
    resorts: 'https://images.unsplash.com/photo-1483347756197-71ef80e95f73?auto=format&fit=crop&w=800&q=80', // snowy alpine valley and peaks
  },
  {
    pattern: /venice|vce/i,
    flights: 'https://images.unsplash.com/photo-1514890547357-a9ee288728e0?auto=format&fit=crop&w=800&q=80', // Venice canal gondolas
  },
  {
    pattern: /bolzano|bzo|innsbruck|inn/i,
    flights: 'https://images.unsplash.com/photo-1439066615861-d1af74d74000?auto=format&fit=crop&w=800&q=80', // South Tyrol / Innsbruck alpine valley
  },
  {
    pattern: /milan|mxp|lin/i,
    flights: 'https://images.unsplash.com/photo-1513581166391-887a96ddeafd?auto=format&fit=crop&w=800&q=80', // Milan city skyline / architecture
  },
];

// Last-resort, category-level fallbacks used only when no specific mapping matches.
const fallbackImages = {
  flights: [
    'https://images.unsplash.com/photo-1517400508447-f8dd518b86db?auto=format&fit=crop&w=800&q=80', // aircraft wing in flight
    'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=800&q=80', // aircraft over alpine terrain
    'https://images.unsplash.com/photo-1513581166391-887a96ddeafd?auto=format&fit=crop&w=800&q=80', // European city gateway
  ],
  stays: [
    'https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=800&q=80', // alpine hotel exterior
    'https://images.unsplash.com/photo-1517840901100-8179e982acb7?auto=format&fit=crop&w=800&q=80', // snowy chalet
    'https://images.unsplash.com/photo-1518602164578-cd0074062767?auto=format&fit=crop&w=800&q=80', // alpine lodge interior
  ],
  resorts: [
    'https://images.unsplash.com/photo-1551524559-8af4e6624178?auto=format&fit=crop&w=800&q=80', // snowy ski slope
    'https://images.unsplash.com/photo-1486911278844-a81c5267e227?auto=format&fit=crop&w=800&q=80', // snowy Dolomites mountainside
    'https://images.unsplash.com/photo-1483347756197-71ef80e95f73?auto=format&fit=crop&w=800&q=80', // snowy alpine valley and peaks
  ],
};

function text(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  const result = String(value).trim();
  return result || fallback;
}

function truncateText(str, max = 85) {
  if (!str || typeof str !== 'string') return '';
  const clean = str.trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function safeImageUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const source = value.trim();
  if (source.startsWith('data:image/')) return source;
  if (source.startsWith('/')) return `${import.meta.env.BASE_URL}${source.slice(1)}`;
  try {
    const url = new URL(source);
    return (url.protocol === 'https:' || url.protocol === 'http:') ? url.href : '';
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

function primaryImageFor(option) {
  return option?.imageUrl || option?.image_url || '';
}

// Resolves only the semantic/Unsplash fallback, never the backend-provided imageUrl.
function fallbackImageFor(option, category, index) {
  const searchText = `${option?.title || ''} ${option?.name || ''} ${option?.location || ''} ${option?.airline || ''} ${option?.route?.to || ''} ${option?.fitLabel || ''}`;
  const matched = specificImageMap.find((item) => item.pattern.test(searchText));
  if (matched && matched[category]) {
    return matched[category];
  }

  const categoryList = fallbackImages[category] || fallbackImages.flights;
  return categoryList[index % categoryList.length];
}

function FallbackSvg({ category }) {
  if (category === 'flights') {
    return (
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="acn-trip-booking-fallback-icon">
        <path d="M42 24L28 14V6a4 4 0 00-8 0v8L6 24v4l14-4v10l-4 4v4l8-2 8 2v-4l-4-4V24l14 4v-4z" fill="#0056B3" opacity="0.8" />
      </svg>
    );
  }
  if (category === 'stays') {
    return (
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="acn-trip-booking-fallback-icon">
        <path d="M6 38V14h36v24H6zm4-4h28V18H10v16zm4-12h8v8h-8v-8zm12 0h8v8h-8v-8z" fill="#008080" opacity="0.8" />
      </svg>
    );
  }
  if (category === 'resorts') {
    return (
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="acn-trip-booking-fallback-icon">
        <path d="M24 6l16 28H8L24 6zm0 10l-8 14h16l-8-14zM10 42h28v-4H10v4z" fill="#002147" opacity="0.8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="acn-trip-booking-fallback-icon">
      <circle cx="24" cy="24" r="18" stroke="#0056B3" strokeWidth="3" opacity="0.8" />
      <path d="M18 24l12-8-4 12 4 4-12-8z" fill="#0056B3" />
    </svg>
  );
}

function ImageWithFallback({ src, fallbackSrc, alt, className = '', category = 'general' }) {
  const safePrimary = safeImageUrl(src);
  const safeFallback = safeImageUrl(fallbackSrc);
  const initialSrc = safePrimary || safeFallback;
  const [currentSrc, setCurrentSrc] = useState(initialSrc);
  const [exhausted, setExhausted] = useState(!initialSrc);

  if (!currentSrc || exhausted) {
    return (
      <div className={`${className} acn-trip-booking-image-fallback acn-trip-booking-image-fallback--${category}`} aria-hidden="true">
        <FallbackSvg category={category} />
      </div>
    );
  }

  const handleError = () => {
    if (currentSrc === safePrimary && safeFallback && safeFallback !== safePrimary) {
      setCurrentSrc(safeFallback);
    } else {
      setExhausted(true);
    }
  };

  return (
    <img
      className={className}
      src={currentSrc}
      alt={alt || ''}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={handleError}
    />
  );
}

function ExternalLink({ href, children }) {
  const safeHref = safeHttpsUrl(href);
  if (!safeHref) return null;
  return (
    <a className="acn-trip-booking-link" href={safeHref} target="_blank" rel="noopener noreferrer">
      <span>{children}</span>
      <span aria-hidden="true" className="acn-trip-booking-link-arrow">↗</span>
    </a>
  );
}

function Price({ price }) {
  if (!price) return null;
  const label = truncateText(text(price.label), 36);
  return (
    <p className="acn-trip-booking-price">
      {label}
      {price.livePriceChecked === false && <small>Illustrative only</small>}
    </p>
  );
}

function FlightCard({ option, index }) {
  const title = truncateText(text(option?.title, 'Flight option'), 38);
  const routeText = option?.route ? `${text(option.route.from)} → ${text(option.route.to)}` : null;
  const reasonText = truncateText(option?.reason, 85);
  const bestForText = truncateText(option?.bestFor, 32);

  return (
    <article className="acn-trip-booking-card">
      <ImageWithFallback
        src={primaryImageFor(option)}
        fallbackSrc={fallbackImageFor(option, 'flights', index)}
        alt={title}
        category="flights"
        className="acn-trip-booking-card__image"
      />
      <div className="acn-trip-booking-card__body">
        <h4>{title}</h4>
        {option?.airline && <p className="acn-trip-booking-muted">{truncateText(option.airline, 30)}</p>}
        {routeText && <p className="acn-trip-booking-route">{routeText}</p>}
        {reasonText && <p className="acn-trip-booking-desc">{reasonText}</p>}
        {bestForText && <p className="acn-trip-booking-muted">{bestForText}</p>}
      </div>
      <div className="acn-trip-booking-card__footer">
        <Price price={option?.price} />
        <ExternalLink href={option?.searchUrl ?? option?.search_url}>
          {truncateText(text(option?.ctaLabel, 'Compare routes'), 24)}
        </ExternalLink>
      </div>
    </article>
  );
}

function StayCard({ option, index }) {
  const title = truncateText(text(option?.name, 'Stay option'), 38);
  const locationText = truncateText(option?.location, 32);
  const reasonText = truncateText(option?.reason, 85);
  const highlights = list(option?.highlights).slice(0, 3);

  return (
    <article className="acn-trip-booking-card">
      <ImageWithFallback
        src={primaryImageFor(option)}
        fallbackSrc={fallbackImageFor(option, 'stays', index)}
        alt={title}
        category="stays"
        className="acn-trip-booking-card__image"
      />
      <div className="acn-trip-booking-card__body">
        <h4>{title}</h4>
        {locationText && <p className="acn-trip-booking-muted">{locationText}</p>}
        {reasonText && <p className="acn-trip-booking-desc">{reasonText}</p>}
        {highlights.length > 0 && (
          <ul className="acn-trip-booking-highlights">
            {highlights.map((highlight, hIdx) => (
              <li key={`${highlight}-${hIdx}`}>{truncateText(highlight, 34)}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="acn-trip-booking-card__footer">
        <Price price={option?.price} />
        <ExternalLink href={option?.searchUrl ?? option?.search_url}>
          {truncateText(text(option?.ctaLabel, 'Explore stays'), 24)}
        </ExternalLink>
      </div>
    </article>
  );
}

function ResortCard({ option, index }) {
  const title = truncateText(text(option?.name, 'Ski resort'), 38);
  const locationText = truncateText(option?.location, 32);
  const fitLabelText = truncateText(option?.fitLabel, 50);
  const descText = truncateText(option?.description, 85);
  const highlights = list(option?.highlights).slice(0, 3);

  return (
    <article className="acn-trip-booking-card">
      <ImageWithFallback
        src={primaryImageFor(option)}
        fallbackSrc={fallbackImageFor(option, 'resorts', index)}
        alt={title}
        category="resorts"
        className="acn-trip-booking-card__image"
      />
      <div className="acn-trip-booking-card__body">
        <h4>{title}</h4>
        {locationText && <p className="acn-trip-booking-muted">{locationText}</p>}
        {fitLabelText && <p className="acn-trip-booking-eyebrow">{fitLabelText}</p>}
        {descText && <p className="acn-trip-booking-desc">{descText}</p>}
        {highlights.length > 0 && (
          <ul className="acn-trip-booking-highlights">
            {highlights.map((highlight, hIdx) => (
              <li key={`${highlight}-${hIdx}`}>{truncateText(highlight, 34)}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="acn-trip-booking-card__footer">
        <ExternalLink href={option?.officialUrl ?? option?.official_url}>
          {'View resort'}
        </ExternalLink>
      </div>
    </article>
  );
}

function WidgetAction({ action, onAction }) {
  if (action?.actionType === 'SEND_UTTERANCE' && action.utterance) {
    return (
      <button
        type="button"
        className={`acn-trip-booking-action acn-trip-booking-action--${action.style || 'secondary'}`}
        onClick={() => onAction?.(action.utterance)}
      >
        {action.label}
      </button>
    );
  }
  if (action?.actionType === 'OPEN_URL') {
    const href = safeHttpsUrl(action.url);
    if (!href) return null;
    return (
      <a
        className={`acn-trip-booking-action acn-trip-booking-action--${action.style || 'secondary'}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
      >
        {action.label}
      </a>
    );
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

  const heroImageSrc = payload?.hero?.imageUrl || payload?.hero?.image_url || payload?.heroUrl || payload?.hero_url || '';
  const disclosures = list(payload?.disclosures);
  const actions = list(payload?.actions);

  const switchTab = (key) => {
    setActiveTab(key);
    setVisibleCount(3);
  };

  return (
    <section className="acn-trip-booking-widget" aria-label={text(payload?.title, 'Trip booking recommendations')}>
      <header className="acn-trip-booking-widget__header">
        <ImageWithFallback
          src={heroImageSrc}
          fallbackSrc={fallbackHeroImage}
          alt={text(payload?.title, 'Trip overview')}
          category="hero"
          className="acn-trip-booking-widget__hero"
        />
        <div>
          <h3>{text(payload?.title, 'Ideas for your trip')}</h3>
          <p>{text(payload?.subtitle)}</p>
        </div>
      </header>
      {payload?.tripContext && (
        <p className="acn-trip-booking-widget__context">
          {[
            payload.tripContext.originCity,
            payload.tripContext.destinationCity || payload.tripContext.destinationCountry,
            payload.tripContext.departureMonth,
            payload.tripContext.travellerCount && `${payload.tripContext.travellerCount} traveller${payload.tripContext.travellerCount > 1 ? 's' : ''}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      <div className="acn-trip-booking-tabs" role="tablist" aria-label="Trip recommendations">
        {availableTabs.map((tab) => (
          <button
            type="button"
            role="tab"
            aria-selected={active.key === tab.key}
            className={active.key === tab.key ? 'is-active' : ''}
            key={tab.key}
            onClick={() => switchTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="acn-trip-booking-panel" role="tabpanel">
        <div className="acn-trip-booking-grid">
          {visibleOptions.map((option, index) =>
            active.key === 'flights' ? (
              <FlightCard key={option.id || index} option={option} index={index} />
            ) : active.key === 'stays' ? (
              <StayCard key={option.id || index} option={option} index={index} />
            ) : (
              <ResortCard key={option.id || index} option={option} index={index} />
            )
          )}
        </div>
        {options.length > visibleCount && (
          <button type="button" className="acn-trip-booking-show-more" onClick={() => setVisibleCount((count) => count + 3)}>
            Show more
          </button>
        )}
      </div>
      {text(payload?.eligibleSpendNote) && (
        <div className="acn-trip-booking-note">
          <span aria-hidden="true">i</span>
          <p>{payload.eligibleSpendNote}</p>
        </div>
      )}
      {actions.length > 0 && (
        <div className="acn-trip-booking-actions">
          {actions.map((action, index) => (
            <WidgetAction key={`${action.label}-${index}`} action={action} onAction={onAction} />
          ))}
        </div>
      )}
      {disclosures.length > 0 && (
        <details className="acn-trip-booking-disclosures">
          <summary>Important details</summary>
          <ul>
            {disclosures.map((disclosure, index) => (
              <li key={`${disclosure}-${index}`}>{disclosure}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
