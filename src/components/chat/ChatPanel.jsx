import { useState, useEffect, useRef, useCallback } from 'react';
import QRCode from 'qrcode';
import {
  initGecx,
  gecxSend,
  resumeGecxAfterSignIn,
  resetGecx,
  setResponseHandler,
  setRateLimitHandler,
  clearGecxDone,
  softResetGecx,
  clearGecxSession,
  setAuthenticatedCustomerVariables,
} from '../gecx';
import {
  connectBidiWhenReady,
  disconnectBidi,
  setBidiHandlers,
  resetBidiBridge,
  sendVoiceText,
  isBidiActive,
} from '../gecxBidi';
import { useAuth } from '../../context/AuthContext';
import ComboCard      from '../ComboCard';
import AcnFormWidget  from '../AcnFormWidget';
import AccountCarousel from '../AccountCarousel';
import InsightCard    from '../Insightcard';
import AmountInput    from '../AmountInput';
import CardActivationWidget from '../CardActivationWidget';
import EppCarousel        from '../EppCarousel';
import EppPlans           from '../EppPlans';
import MortgageCalculator from '../MortgageCalculator';
import MortgageAffordability from '../MortgageAffordability';
import MortgageRateShelf  from '../MortgageRateShelf';
import MortgageRateTable  from '../MortgageRateTable';
import MortgageNudge      from '../MortgageNudge';
import MortgageKyc        from '../MortgageKyc';
import LoanPreapproval    from '../LoanPreapproval';
import MobileHandoff      from '../MobileHandoff';
import { CardCarousel, CardCompare } from '../CardWidgets';
import TripBookingRecommendationsWidget from '../TripBookingRecommendationsWidget';
import {
  SpendingMiniWidgetsGrid,
  InvestmentCardWidget,
  ContextualProactiveAlert,
  RecentTransactionsWidget,
} from '../FinancialInsightsWidgets';
import {
  fetchP2PContacts,
  fetchCustomerBills,
  fetchCustomerBeneficiaries,
  fetchCustomerTransactions,
  fetchCustomerAccounts,
} from '../../firebase';

function ChatQrCard({ payload = {}, customer = null }) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const custId =
    payload.customerId ||
    payload.customer_id ||
    customer?.customerId ||
    'CUST_DOC_1988';
  const dispName =
    payload.displayName ||
    payload.display_name ||
    customer?.legalName ||
    customer?.prefName ||
    'ACN Customer';
  const rawAmt = Number(payload.amount || 0);
  const reference = payload.reference || payload.request_id || '';

  const base64Envelope =
    payload.qrPayloadBase64 ||
    btoa(
      JSON.stringify({
        type: 'ACN_QR_PAY',
        v: '1',
        customer_id: custId,
        display_name: dispName,
        ...(rawAmt > 0 ? { amount: Number(rawAmt.toFixed(2)) } : {}),
        ...(reference ? { reference } : {}),
      }),
    );

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(base64Envelope, {
      width: 210,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#002147', light: '#FFFFFFFF' },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [base64Envelope]);

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid #CBD5E1',
        borderRadius: 16,
        padding: '16px 16px 14px',
        maxWidth: 300,
        boxShadow: '0 8px 24px rgba(0, 33, 71, 0.10)',
        textAlign: 'center',
        marginTop: 4,
        marginBottom: 4,
      }}
    >
      <div
        style={{
          display: 'inline-block',
          padding: '3px 10px',
          borderRadius: 999,
          background: '#E6F2F5',
          color: '#002147',
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        ACN QR Pay · Receive
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, color: '#0B1F33', marginTop: 8 }}>
        {dispName}
      </div>
      <div style={{ fontSize: 11, color: '#64748B', marginBottom: 10 }}>
        {rawAmt > 0 ? `Requesting CAD $${rawAmt.toFixed(2)}` : 'Open amount · Scan with ACN Mobile App'}
      </div>
      {qrDataUrl && (
        <div
          style={{
            background: '#F8FAFC',
            padding: 10,
            borderRadius: 12,
            border: '1px dashed #CBD5E1',
            display: 'inline-block',
          }}
        >
          <img
            src={qrDataUrl}
            alt="ACN QR Pay code"
            style={{ width: 185, height: 185, display: 'block' }}
          />
        </div>
      )}
      {reference && (
        <div style={{ fontSize: 10, color: '#64748B', marginTop: 6 }}>
          Ref: <code>{reference}</code>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(base64Envelope);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            } catch {
              // ignore
            }
          }}
          style={{
            flex: 1,
            padding: '7px 10px',
            borderRadius: 8,
            border: '1px solid #CBD5E1',
            background: '#F8FAFC',
            color: '#002147',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {copied ? 'Copied ✓' : 'Copy QR'}
        </button>
        {qrDataUrl && (
          <a
            href={qrDataUrl}
            download={`acn-qr-${custId}.png`}
            style={{
              flex: 1,
              padding: '7px 10px',
              borderRadius: 8,
              background: '#002147',
              color: '#FFFFFF',
              fontSize: 11,
              fontWeight: 700,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            Save PNG
          </a>
        )}
      </div>
    </div>
  );
}

// ── Module-level helpers ───────────────────────────────────────────────────────

// CES has no reliable grounding for "today's date" — it hallucinates plausible
// but wrong timestamps (wrong month, wrong year). The receipt widget fires the
// moment a transfer/payment actually completes, so we stamp it with the real
// browser clock instead of trusting whatever date string CES sent.
// Produces e.g. "19 August 2026, 11:38 pm".
function formatFriendlyDate(d = new Date()) {
  const day = d.getDate();
  const month = d.toLocaleString('en-US', { month: 'long' });
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12 || 12;
  return `${day} ${month} ${year}, ${hours}:${minutes} ${ampm}`;
}

// For display: strips code blocks/headings but keeps **bold** so BotText can render <strong>.
function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/```[a-z]*\n[\s\S]*?\n```/g, '')
    .replace(/(?<!\*)\*(?!\*)([^*\n]+)(?<!\*)\*(?!\*)/g, '$1') // italic only, not bold
    .replace(/^#{1,3}\s+/gm, '')
    .trim();
}

// For TTS and combo headings: strips ALL markdown so speech sounds natural.
function stripMarkdownForTTS(text) {
  if (!text) return '';
  return text
    .replace(/```[a-z]*\n[\s\S]*?\n```/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#{1,3}\s+/gm, '')
    .trim();
}

/* Clean text for natural ElevenLabs speech synthesis.
   - Remove ALL markdown
   - Remove emojis (including skin-tone variants)
   - Strip URLs but keep link labels: "[label](url)" -> "label"
   - Normalize whitespace (multiple spaces/newlines -> single space)
   - Normalize banking amounts (e.g., "CAD $1234.56" -> "one thousand two hundred thirty four dollars and fifty six cents")
   - Normalize dates (e.g., "August 19, 2026" stays readable)
   - Normalize phone numbers (spaces/dashes removed)
   - Normalize percentages ("15.5%" -> "fifteen point five percent")
   - Normalize account identifiers (spelled out letter-by-letter)
*/
function cleanTextForTTS(text) {
  if (!text) return '';

  let clean = text;

  // 1. Strip all markdown (including bold, italic, code blocks, headings)
  clean = clean
    .replace(/```[\s\S]*?```/g, '')  // code blocks
    .replace(/`([^`]+)`/g, '$1')      // inline code
    .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
    .replace(/\*([^*]+)\*/g, '$1')     // italic
    .replace(/^#+\s+/gm, '');          // headings

  // 2. Remove markdown links but keep labels: "[text](url)" -> "text"
  clean = clean.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // 3. Remove ALL emojis and related symbols
  // Unicode ranges: Emoticons, Symbols, Pictographs, Variation Selectors, etc.
  clean = clean.replace(
    /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|[\u{200D}]/gu,
    ' '
  );

  // 4. Normalize whitespace
  clean = clean
    .replace(/\n+/g, ' ')           // newlines to space
    .replace(/\s+/g, ' ')           // multiple spaces to single
    .trim();

  // 5. Normalize phone numbers: "+1 (416) 555-0199" -> "+14165550199"
  //    (Spoken aloud naturally by ElevenLabs: "plus one four one six...")
  clean = clean.replace(/\+?1\s*\(?(\d{3})\)?\s*[-.\s]?(\d{3})[-.\s]?(\d{4})/g, '+1$1$2$3');

  // 6. Normalize account/reference IDs that contain dashes/underscores
  //    "CUST_001" -> "CUST 001", "ACC-1234" -> "ACC 1234"
  //    This makes them easier to parse when spelled aloud
  clean = clean.replace(/([A-Z]{3,})[-_](\d+)/g, '$1 $2');

  // 7. Normalize percentages: "15.5%" stays as-is for natural reading
  //    Already handled by English TTS engine

  // 8. Currency amounts are left as-is: "CAD $1234.56"
  //    ElevenLabs reads these naturally in English

  return clean;
}

function normalizeForTTS(text) {
  if (!text) return '';

  let speech = text;
  const amountPattern = '[0-9][0-9,]*(?:\\.[0-9]{1,2})?';
  const toNumber = (amount) => Number(amount.replace(/,/g, ''));
  const formatExactCad = (amount) => {
    const value = toNumber(amount);
    const whole = Math.trunc(value);
    const cents = Math.round((value - whole) * 100);
    if (!cents) return `${whole.toLocaleString('en-US')} Canadian dollars`;
    return `${whole.toLocaleString('en-US')} dollars and ${String(cents).padStart(2, '0')} cents Canadian`;
  };

  // Ranges are estimates, so round each endpoint for speech.
  speech = speech.replace(
    new RegExp(`(?:\\broughly\\s+)?\\bCAD\\s+\\$?(${amountPattern})\\s*[-–—]\\s*\\$?(${amountPattern})`, 'gi'),
    (_match, lower, upper) => `roughly ${Math.round(toNumber(lower)).toLocaleString('en-US')} to ${Math.round(toNumber(upper)).toLocaleString('en-US')} Canadian dollars`
  );

  speech = speech.replace(
    new RegExp(`\\bCAD\\s+\\$?(${amountPattern})`, 'gi'),
    (_match, amount) => formatExactCad(amount)
  );

  speech = speech
    .replace(/\s*\/\s*year\b/gi, ' per year')
    .replace(/(\d+(?:\.\d+)?)%/g, '$1 percent')
    .replace(/\b(\d+(?:\.\d+)?)x(?=\s+[A-Za-z])/g, '$1 times');

  return speech;
}

function BotText({ text }) {
  // Render **bold** segments inside a line as <strong> elements.
  function parseBold(str) {
    const parts = str.split(/(\*\*[^*\n]+\*\*)/g);
    if (parts.length === 1) return str;
    return parts.map((part, i) => {
      const m = part.match(/^\*\*([^*\n]+)\*\*$/);
      return m ? <strong key={i}>{m[1]}</strong> : part;
    });
  }

  const lines = text.split('\n').filter(Boolean);
  if (lines.length <= 1) return <>{parseBold(text)}</>;
  return (
    <>
      {lines.map((line, i) => (
        <span key={i} style={{ display: 'block', marginBottom: i < lines.length - 1 ? '6px' : 0 }}>
          {parseBold(line)}
        </span>
      ))}
    </>
  );
}

let _idCounter = 0;
const uid = () => ++_idCounter;

const stripEmoji = (h) =>
  h ? h.replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{27FF}\u{FE00}-\u{FE0F}\s]+/gu, '') : '';

const isFH = (h) => {
  if (!h) return false;
  const l = stripEmoji(h).toLowerCase();
  return (
    l.startsWith('please type')      || l.startsWith('please enter') ||
    l.startsWith('type your')        || l.startsWith('enter your')   ||
    l.startsWith('or identify')      || l.startsWith('or choose')    ||
    l.startsWith('or use a')         || l.startsWith('choose a different')
  );
};

// Normalize whichever runtime shape reaches us: direct widget payloads or the
// CX envelope { summary, payload }. We unwrap once here so downstream logic
// never treats the summary wrapper as a second payload layer.
function normalizeWidgetPayload(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = [raw.payload, raw.customPayload, raw.data?.payload, raw.data, raw.json]
    .find((value) => value && typeof value === 'object' && !Array.isArray(value)) || raw;
  if (!candidate || typeof candidate !== 'object') return null;

  const normalized = { ...candidate };
  if (raw.summary && !normalized.summary) normalized.summary = raw.summary;
  if (raw.name && !normalized.name) normalized.name = raw.name;
  if (raw.type && !normalized.type) normalized.type = raw.type;
  return normalized;
}

function stableOutputValue(value) {
  if (Array.isArray(value)) return value.map(stableOutputValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableOutputValue(value[key]);
    return result;
  }, {});
}

function normalizeResponseOutputs(outputs = []) {
  const seen = new Set();
  return outputs.filter((output) => {
    if (!output || typeof output !== 'object') return false;
    const payload = normalizeWidgetPayload(output);
    const payloadName = resolvePayloadName(payload);
    const hasCustomerText = typeof output.text === 'string' && stripMarkdown(output.text).trim();
    if ((output.turnCompleted === true || output.type === 'turnCompleted') && !hasCustomerText && !payloadName) return false;

    const turnIndex = output.turnIndex ?? output.payload?.turnIndex ?? 'unknown';
    let signature;
    if (output.text && !output.payload) {
      const text = stripMarkdown(String(output.text)).replace(/\s+/g, ' ').trim();
      if (!text) return false;
      signature = `${turnIndex}:text:${text}`;
    } else if (payloadName || Object.keys(output).some((key) => key !== 'turnIndex')) {
      signature = `${turnIndex}:${payloadName || 'structured'}:${JSON.stringify(stableOutputValue(payload))}`;
    } else {
      return false;
    }

    if (seen.has(signature)) {
      if (import.meta.env.DEV) console.debug('[ACN] duplicate output suppressed', { turnIndex, type: output.payload ? 'payload' : 'text' });
      return false;
    }
    seen.add(signature);
    return true;
  });
}

// Hoisted so both processOutputs and the acn-session-data handler can share them.
function safeHttpsUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function normalizeActionIdentity(action = {}) {
  const actionType = String(action.actionType || action.action_type || (action.url ? 'OPEN_URL' : 'SEND_UTTERANCE')).toUpperCase();
  if (actionType === 'OPEN_URL') {
    const url = safeHttpsUrl(action.url);
    return url ? `${actionType}:${url}` : '';
  }
  const utterance = String(action.utterance || action.value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  return utterance ? `SEND_UTTERANCE:${utterance}` : '';
}

function resolvePayloadName(p) {
  const normalized = normalizeWidgetPayload(p);
  if (!normalized || typeof normalized !== 'object') return null;
  const explicitName = String(normalized.name || normalized.type || '').toLowerCase();
  const aliases = {
    trip_booking_recommendations: 'trip_booking_recommendations',
    'trip-booking-recommendations': 'trip_booking_recommendations',
    booking_recommendations: 'trip_booking_recommendations',
    booking_shortlist: 'trip_booking_recommendations',
    // ACN_Bank_CES_Demo (new agent) emits snake_case widget names.
    // Route them to the existing acn-* renderers. Field-level deltas are
    // handled per-widget — see widget components / the CES PRD.
    card_carousel:        'acn-card-carousel',
    card_widget:          'acn-card-compare',
    mortgage_rate_shelf:  'acn-mortgage-rate-shelf',
    mortgage_rate_table:  'acn-mortgage-rate-table',
    mortgage_calculator:  'acn-mortgage-calculator',
    mortgage_kyc:         'acn-mortgage-kyc',
    loan_preapproval:     'acn-loan-preapproval',
    epp_carousel:         'acn-epp-carousel',
    epp_plans:            'acn-epp-plans',
    mobile_handoff:       'acn-mobile-handoff',
    // Widgets the new agent emits under its own names. Without these three the
    // payload falls through resolvePayloadName (which short-circuits on any
    // present `name`) and is dropped silently.
    mortgage_affordability:   'acn-mortgage-affordability',
    mortgage_nudge:           'acn-mortgage-nudge',
    // The pre-approval form arrives under its RECIPE name (the instruction's
    // mortgage_preapproval_form), not under the tool name acn-form-input.
    // resolvePayloadName short-circuits on any present `name` two lines below,
    // so without this alias the payload never reaches the
    // `fields -> acn-form-input` heuristic further down: isKnownPayload rejects
    // it and it is dropped with no error. The agent then says "fill in the form
    // above" about a form the customer cannot see.
    mortgage_preapproval_form: 'acn-form-input',
    'acn-nudge-card':         'acn-mortgage-nudge',
    'acn-credit-card-widget': 'acn-card-carousel',
    qr_widget:                'acn-qr-widget',
    'acn-qr-widget':          'acn-qr-widget',
    'acn-spending-dashboard': 'acn-spending-dashboard',
    spending_dashboard:       'acn-spending-dashboard',
    'acn-investment-card':    'acn-investment-card',
    investment_card:          'acn-investment-card',
    investments_summary:      'acn-investment-card',
    'acn-proactive-alert':    'acn-proactive-alert',
    proactive_alert:          'acn-proactive-alert',
    'acn-transactions-widget': 'acn-transactions-widget',
    transactions_widget:      'acn-transactions-widget',
  };
  if (aliases[explicitName]) return aliases[explicitName];
  if (normalized.name) return normalized.name;
  if (normalized.type === 'quick_actions') return 'quick_actions';
  if (Array.isArray(normalized.actions) && normalized.actions.length > 0 && normalized.actions[0]?.utterance !== undefined)
    return 'quick_actions';
  if (
    normalized.displayRegion === 'dashboard_banner' && normalized.independentFromCardApplication === true &&
    normalized.title && normalized.subtitle && normalized.action
  ) return 'travel_protection_banner';
  if (['travel_protection_banner', 'travel-protection-banner', 'protection_banner'].includes(explicitName))
    return 'travel_protection_banner';
  if (
    Array.isArray(normalized.flightOptions) || Array.isArray(normalized.flight_options) ||
    Array.isArray(normalized.stayOptions) || Array.isArray(normalized.stay_options) ||
    Array.isArray(normalized.resortOptions) || Array.isArray(normalized.resort_options)
  ) return 'trip_booking_recommendations';
  if (['card_activation', 'acn-card-activation', 'acn-activation-card', 'activation'].includes(normalized.type) ||
      ['card_activation', 'acn-card-activation', 'acn-activation-card', 'activation'].includes(normalized.name)) return 'acn-card-activation';
  if (
    normalized.status === 'ready_for_activation' &&
    normalized.action &&
    (normalized.action.url || normalized.action.label || normalized.action.actionType)
  ) return 'acn-card-activation';
  if (normalized.cardId && normalized.action && (normalized.action.url || normalized.action.label || normalized.action.actionType))
    return 'acn-card-activation';
  if (normalized.web_activation_url || normalized.deep_link || normalized.activationUrl || normalized.activation_url)
    return 'acn-card-activation';
  if (normalized.qrPayloadBase64 || normalized.qr_code_url || normalized.type === 'ACN_QR_PAY')
    return 'acn-qr-widget';
  if (Array.isArray(normalized.transactions) && normalized.transactions.length > 0)
    return 'acn-transactions-widget';
  if (Array.isArray(normalized.categories) || normalized.total_spend != null || normalized.saving_rate != null)
    return 'acn-spending-dashboard';
  if (normalized.current_month_amt != null && normalized.last_month_amt != null)
    return 'acn-proactive-alert';
  if (Array.isArray(normalized.rates) && (normalized.principal != null || normalized.cdic_notice != null))
    return 'acn-investment-card';
  // CES card widgets: card_check (PRODUCT_COMPARISON) carries a features array
  // alongside productDetails; card_comparison (PRODUCT_CAROUSEL) does not.
  if (Array.isArray(normalized.productDetails) && normalized.productDetails.length > 0)
    return Array.isArray(normalized.features) && normalized.features.length > 0
      ? 'acn-card-compare'
      : 'acn-card-carousel';
  if (normalized.insight_type != null || normalized.headline != null) return 'acn-insight-card';
  if (Array.isArray(normalized.payments) || Array.isArray(normalized.payees)) return 'acn-payment-carousel';
  if (Array.isArray(normalized.contacts)) return 'acn-contact-selector';
  if (Array.isArray(normalized.fields) && normalized.fields.length > 0) return 'acn-form-input';
  if (normalized.receipt_id != null || normalized.reference_number != null ||
      normalized.confirmation_number != null || normalized.confirmation_id != null ||
      normalized.transaction_id != null) return 'acn-payment-receipt';
  if (normalized.min_amount != null || normalized.max_amount != null) return 'acn-amount-input';
  return null;
}

function isKnownPayload(p) {
  const n = resolvePayloadName(p);
  return (
    n === 'quick_actions'         || n === 'acn-form-input'      ||
    n === 'acn-payment-carousel'  || n === 'acn-payee-selector'  ||
    n === 'acn-payment-receipt'   || n === 'acn-insight-card'    ||
    n === 'acn-spending-dashboard' || n === 'acn-investment-card' ||
    n === 'acn-proactive-alert'   || n === 'acn-transactions-widget' ||
    n === 'acn-amount-input'      || n === 'acn-contact-selector' ||
    n === 'acn-card-carousel'     || n === 'acn-card-compare'    ||
    n === 'acn-card-activation'   || n === 'trip_booking_recommendations' || n === 'travel_protection_banner' ||
    n === 'acn-epp-carousel'      || n === 'acn-epp-plans'       ||
    n === 'acn-mortgage-calculator' || n === 'acn-mortgage-kyc'  ||
    n === 'acn-mortgage-affordability' || n === 'acn-mortgage-rate-shelf' ||
    n === 'acn-mortgage-rate-table' ||
    n === 'acn-mortgage-nudge'    ||
    n === 'acn-loan-preapproval'  || n === 'acn-mobile-handoff'  ||
    n === 'acn-qr-widget'
  );
}

function filterDuplicateQuickActions(actions = [], widgetActions = []) {
  const widgetIdentities = new Set(widgetActions.map(normalizeActionIdentity).filter(Boolean));
  return actions.filter((action) => {
    const identity = normalizeActionIdentity(action);
    return !identity || !widgetIdentities.has(identity);
  });
}

function tripBookingSignature(payload, turnIndex = 'unknown') {
  const ids = (payload?.flightOptions || payload?.flight_options || []).map((option) => option?.id || '').join('|');
  const stays = (payload?.stayOptions || payload?.stay_options || []).map((option) => option?.id || '').join('|');
  const resorts = (payload?.resortOptions || payload?.resort_options || []).map((option) => option?.id || '').join('|');
  return `${turnIndex}:trip_booking_recommendations:${payload?.title || ''}:${ids}:${stays}:${resorts}`;
}

// ── Static data ───────────────────────────────────────────────────────────────

export const CANADIAN_BILLERS = [
  { id: 'enbridge',    name: 'Enbridge Gas',                  sub: 'Natural Gas Utility · Ontario',     category: 'Utilities', emoji: '🔥', presets: [95, 150, 187.40] },
  { id: 'hydro-one',   name: 'Hydro One',                     sub: 'Electricity Utility · Ontario',     category: 'Utilities', emoji: '⚡', presets: [120, 175, 224.30] },
  { id: 'toronto-h',   name: 'Toronto Hydro',                 sub: 'Municipal Electricity · Toronto',   category: 'Utilities', emoji: '💡', presets: [85, 118.40, 160] },
  { id: 'bc-hydro',    name: 'BC Hydro',                      sub: 'Electricity Utility · BC',          category: 'Utilities', emoji: '🌊', presets: [75, 110, 145] },
  { id: 'hydro-qc',    name: 'Hydro-Québec',                  sub: 'Electricity Utility · Québec',      category: 'Utilities', emoji: '⚡', presets: [90, 130, 180] },
  { id: 'epcor',       name: 'EPCOR Utilities',               sub: 'Water & Power · Alberta',           category: 'Utilities', emoji: '💧', presets: [110, 155, 210] },
  { id: 'rogers',      name: 'Rogers',                        sub: 'Wireless & Ignite Internet',        category: 'Telecom',   emoji: '📡', presets: [85, 115, 142.75] },
  { id: 'bell',        name: 'Bell Canada',                   sub: 'Fibe Internet & Mobility',          category: 'Telecom',   emoji: '🔔', presets: [90, 125, 165] },
  { id: 'telus',       name: 'TELUS',                         sub: 'Mobility & PureFibre',              category: 'Telecom',   emoji: '📱', presets: [80, 110, 145] },
  { id: 'shaw',        name: 'Shaw / Freedom Mobile',         sub: 'Internet, TV & Wireless',           category: 'Telecom',   emoji: '📺', presets: [65, 95, 130] },
  { id: 'waterloo-tx', name: 'City of Waterloo Property Tax', sub: 'Municipal Property Tax · Ontario',  category: 'Tax & Gov', emoji: '🏙️', presets: [450, 920, 1842] },
  { id: 'cra',         name: 'Canada Revenue Agency',         sub: 'Federal Tax & Instalments',         category: 'Tax & Gov', emoji: '🏛️', presets: [250, 500, 1000] },
];

/* Sentinel utterance the CES auth gate emits to ask the page to open the
   sign-in modal. Kept in one place because both the agent instructions and this
   file must agree on the exact string. See Identity/auth-gate steps in CES. */
export const SIGN_IN_SENTINEL = '__ACN_SIGN_IN__';

/* Tags any quick action that should open the sign-in modal instead of being
   sent to CES as a normal utterance. */
const markSignInActions = (actions = []) =>
  actions.map((a) =>
    (a.utterance || '').trim() === SIGN_IN_SENTINEL ? { ...a, isSignIn: true } : a,
  );

// Suggestions differ by auth state — offering "check my balance" to a guest just
// walks them into an auth wall, so guests get the things they can actually do.
const GUEST_SUGGESTIONS = [
  { label: '💳 Explore credit cards', utterance: 'Show me your credit cards' },
  { label: '⚖️ Compare cards',        utterance: 'Compare your credit cards' },
  { label: '✈️ Best card for travel', utterance: 'Which card is best for travel?' },
  { label: '📝 Apply for a card',     utterance: 'I want to apply for a credit card' },
  { label: '🔐 Sign in',              utterance: SIGN_IN_SENTINEL },
  { label: '💡 What can you do?',     utterance: 'How can you help me with?' },
];

const CUSTOMER_SUGGESTIONS = [
  { label: '💡 Spending & bill insights', utterance: 'Analyze my spending' },
  { label: '🧾 Pay upcoming utility bill', utterance: 'Check my upcoming bills and help me pay them' },
  { label: '📈 GIC & investment rates',   utterance: 'Check GIC rates' },
  { label: '💰 Check balance',            utterance: 'Check my balance' },
  { label: '▦ Receive via QR Pay',       utterance: 'Generate a QR code so someone can pay me' },
  { label: '💸 Send money',               utterance: 'Transfer money' },
  { label: '📊 Recent transactions',      utterance: 'Show my recent transactions' },
  { label: '🎁 My offers',                utterance: 'Show my pre-approved offers' },
];

export function computeDaysUntil(isoDate) {
  if (!isoDate) return null;
  const target = new Date(`${String(isoDate).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// ── ChatPanel ─────────────────────────────────────────────────────────────────

export default function ChatPanel({ isOpen, onClose, onReset, onExposeReset, onExposeResume, intent, onRequestSignIn, resetSignal = 0, onMessagesChange, onExposeSend, onTravelProtectionBanner }) {
  const { customer, customerId, isAuthenticated, customerName, signInFromChat } = useAuth();
  const AI_SUGGESTIONS = isAuthenticated ? CUSTOMER_SUGGESTIONS : GUEST_SUGGESTIONS;

  const [messages,        setMessages]        = useState([]);
  const [inputVal,        setInputVal]        = useState('');
  const [activeForm,      setActiveForm]      = useState(null);
  const [voiceActive,     setVoiceActive]     = useState(false);
  const [voiceMode,       setVoiceMode]       = useState(false);  // voice conversation mode (STT + TTS loop)
  const [ttsPlaying,      setTTSPlaying]      = useState(false);  // TTS audio currently playing
  const [ttsEnabled,      setTTSEnabled]      = useState(true);   // bot speaks every response (default on, user can mute)
  const [isResponding,    setIsResponding]    = useState(false);
  const [activeMenu,      setActiveMenu]      = useState(null); // 'plus' | 'contact' | 'ai'
  const [contactTab,      setContactTab]      = useState('billers');
  const [p2pContacts,     setP2pContacts]     = useState([]);   // Firebase P2P contacts
  const [customerBills,   setCustomerBills]   = useState([]);   // Saved Firestore bills
  const [beneficiaries,   setBeneficiaries]   = useState([]);   // Saved Interac/bank payees
  const [proactiveInsights, setProactiveInsights] = useState([]); // Live banking insights
  const [contactsLoading, setContactsLoading] = useState(false);
  const [billerSearch,    setBillerSearch]    = useState('');
  const [billerCategory,  setBillerCategory]  = useState('All');
  const [selectedBillerId, setSelectedBillerId] = useState(null);
  const [customBillerAmt, setCustomBillerAmt] = useState('');

  // ── GECX element key ──────────────────────────────────────────────────────
  // Incrementing this forces React to unmount + remount <chat-messenger>.
  // The remount triggers the SDK's connectedCallback which re-reads sessionStorage.
  // Since clearGecxSession() is always called first (storage is empty at that
  // point), the SDK generates a FRESH session ID — the only reliable way to
  // escape a stale authenticated CES session without access to the SDK internals.
  const [messengerKey, setMessengerKey] = useState(0);

  // ── sessionStarted as a REF (not state) ───────────────────────────────────
  // Must be a ref so the resetSignal watcher (Effect A) and the isOpen effect
  // (Effect B) share the same mutable value within the same render cycle.
  // If it were useState, the isOpen effect would read the PRE-update value even
  // after Effect A called setSessionStarted(false), causing it to skip initGecx.
  const sessionStartedRef = useRef(false);

  const msgsRef        = useRef(null);
  const inputRef       = useRef(null);
  const galleryInputRef = useRef(null);
  const cameraInputRef  = useRef(null);
  const fileInputRef    = useRef(null);
  const respondingTimer = useRef(null);
  const finalTimer      = useRef(null);
  const pendingHeading  = useRef(null);
  const pendingSubtitle = useRef(null);
  const comboCreated    = useRef(false);
  const lastProcessed   = useRef({ time: 0, sig: '' });
  // Visible-content signatures already rendered for the CURRENT turn, so the
  // unary and bidi transports cannot both render the same agent line.
  const seenOutputSigs  = useRef(new Set());
  // Voice conversation refs — readable from async callbacks without stale closures
  const voiceModeRef   = useRef(false);   // mirrors voiceMode state
  const ttsEnabledRef  = useRef(true);    // mirrors ttsEnabled state (auto-speak bot responses)
  const ttsAudioRef    = useRef(null);    // current TTS Audio element, so we can stop it on mute
  const ttsQueueRef    = useRef('');      // accumulates bot text per turn for TTS playback
  const ttsFlushTimer  = useRef(null);    // debounce timer — plays queue once streaming quiets down
  const sendMessageRef = useRef(null);    // updated after sendMessage is defined
  const playTTSRef     = useRef(null);    // updated after playTTS is defined
  const startVoiceRef  = useRef(null);    // legacy hook; bidi holds the mic open, so it is a no-op
  const authResumeInFlightRef = useRef(false); // prevents duplicate post-login resume turns
  const bidiAutoStartedRef    = useRef(false); // guards one bidi auto-connect per session
  const bidiGreetedRef        = useRef(false); // guards one spoken greeting per session

  // ── GECX audio cleanup ─────────────────────────────────────────────────────
  // Defined up here because showTyping (barge-in), the mute toggle and unmount
  // all need it, and they are declared before the playback code below.
  // ttsAudioRef holds the <audio> element currently playing a GECX-synthesised
  // reply, or null.
  const stopGecxAudio = useCallback(() => {
    const audio = ttsAudioRef.current;
    if (!audio) return;
    try {
      audio.pause();
      audio.src = '';
    } catch (err) {
      console.error('[ACN TTS] stop error:', err);
    }
    ttsAudioRef.current = null;
    setTTSPlaying(false);
  }, []);

  // ── Scroll ─────────────────────────────────────────────────────────────────
  const scrollToBottom = useCallback(() => {
    const snap = () => {
      if (!msgsRef.current) return;
      const combo = msgsRef.current.querySelector('[data-combo="true"]:last-child');
      if (combo) {
        const cb = combo.offsetTop + combo.offsetHeight;
        const vb = msgsRef.current.scrollTop + msgsRef.current.clientHeight;
        if (cb > vb) msgsRef.current.scrollTop = cb - msgsRef.current.clientHeight + 16;
      } else {
        msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
      }
    };
    snap();
    requestAnimationFrame(snap);
    setTimeout(snap, 50);
    setTimeout(snap, 200);
    setTimeout(snap, 400);
  }, []);

  // ── TTS flush — debounced so streaming chunks batch into one utterance ────
  // processOutputs calls removeTyping BEFORE addBot fills the queue, so we
  // can't play TTS from removeTyping directly. Instead every addBot bumps a
  // 400ms timer; once the bot stops emitting, the whole queue is spoken once.
  const scheduleTTSFlush = useCallback(() => {
    if (ttsFlushTimer.current) clearTimeout(ttsFlushTimer.current);
    ttsFlushTimer.current = setTimeout(() => {
      ttsFlushTimer.current = null;
      const shouldSpeak = voiceModeRef.current || ttsEnabledRef.current;
      if (!shouldSpeak) { ttsQueueRef.current = ''; return; }
      const ttsText = ttsQueueRef.current.trim();
      if (!ttsText) return;
      ttsQueueRef.current = '';
      playTTSRef.current?.(ttsText);
    }, 400);
  }, []);

  // ── Message helpers ────────────────────────────────────────────────────────
  const addBot = useCallback((text) => {
    const display = stripMarkdown(text);         // keeps **bold** for <strong> rendering
    if (!display) return;
    const ttsText = stripMarkdownForTTS(text);   // fully clean for TTS + combo headings
    const lines   = display.split('\n').filter(Boolean);
    if (!pendingHeading.current) {
      pendingHeading.current  = stripMarkdownForTTS(lines[0]);   // clean title in combo
      if (lines.length > 1) {
        pendingSubtitle.current = stripMarkdownForTTS(lines.slice(1).join(' '));
      }
    }
    setMessages((prev) => [...prev, { type: 'bot', text: display, id: uid() }]);
    // Accumulate TTS text per bot turn (played when streaming quiets down).
    // Queue whenever the bot should audibly respond — either voice-conversation
    // mode is on, or the user has left the "bot speaks" toggle enabled.
    if (voiceModeRef.current || ttsEnabledRef.current) {
      ttsQueueRef.current += (ttsQueueRef.current ? ' ' : '') + ttsText;
      scheduleTTSFlush();
    }
  }, [scheduleTTSFlush]);

  const lastUserQueryRef = useRef('');

  const addUser = useCallback((text) => {
    lastUserQueryRef.current = String(text || '');
    setMessages((prev) => [...prev, { type: 'user', text, id: uid() }]);
  }, []);

  const showTyping = useCallback(() => {
    seenOutputSigs.current.clear();   // new turn: the previous turn's lines may legitimately repeat
    pendingHeading.current  = null;
    pendingSubtitle.current = null;
    comboCreated.current    = false;
    ttsQueueRef.current     = '';   // fresh queue for the upcoming bot turn
    if (ttsFlushTimer.current) {    // cancel any pending flush from the previous turn
      clearTimeout(ttsFlushTimer.current);
      ttsFlushTimer.current = null;
    }
    // Cancel any active speech when a new response starts (user interrupted).
    // In a bidi session the SDK handles barge-in on its own stream; this covers
    // the unary path.
    stopGecxAudio();
    setIsResponding(true);
    setMessages((prev) => [
      ...prev.filter((m) => m.type !== 'typing'),
      { type: 'typing', id: uid() },
    ]);
    if (respondingTimer.current) clearTimeout(respondingTimer.current);
    respondingTimer.current = setTimeout(() => {
      setIsResponding(false);
      setMessages((prev) => prev.filter((m) => m.type !== 'typing'));
    }, 12000);
  }, [stopGecxAudio]);

  const removeTyping = useCallback(() => {
    if (respondingTimer.current) clearTimeout(respondingTimer.current);
    if (finalTimer.current)      clearTimeout(finalTimer.current);
    setIsResponding(false);
    setMessages((prev) => prev.filter((m) => m.type !== 'typing'));
    // TTS playback is driven from addBot's debounced flush — not from here.
    // processOutputs calls removeTyping *before* addBot, so the queue would
    // still be empty at this point. See scheduleTTSFlush above.
  }, []);

  const clearTypingBubble = useCallback(() => {
    setMessages((prev) => prev.filter((m) => m.type !== 'typing'));
    setTimeout(() => {
      setMessages((prev) => {
        if (!prev.some((m) => m.type === 'typing'))
          return [...prev, { type: 'typing', id: uid() }];
        return prev;
      });
    }, 300);
    if (finalTimer.current) clearTimeout(finalTimer.current);
    finalTimer.current = setTimeout(() => {
      setIsResponding(false);
      setMessages((prev) => prev.filter((m) => m.type !== 'typing'));
    }, 10000);
  }, []);

  // ── Tool-code parser (legacy text format) ─────────────────────────────────
  const parseToolCode = useCallback((text) => {
    if (!text.includes('tool_code') && !text.includes('default_api.quick_actions')) return null;
    try {
      const actions = [];
      const fv = (str, key) => {
        const QK = "['\"]" + key + "['\"]";
        let m;
        m = str.match(new RegExp(QK + '\\s*[:=]\\s*"([^"]*)"'));  if (m) return m[1];
        m = str.match(new RegExp(QK + "\\s*[:=]\\s*'([^']*)'"));  if (m) return m[1];
        m = str.match(new RegExp('\\b' + key + "\\s*=\\s*'([^']*)'"));  if (m) return m[1];
        m = str.match(new RegExp('\\b' + key + '\\s*=\\s*"([^"]*)"')); if (m) return m[1];
        return null;
      };
      const marked = text.replace(/\{(\s*['"]?content['"]?\s*[:=])/g, '\x00{$1');
      const parts  = marked.split(/QuickActionsPayloadActions\s*\(|\x00/);
      parts.forEach((part) => {
        const c = fv(part, 'content');
        const u = fv(part, 'utterance');
        const d = fv(part, 'description');
        if (c && u) actions.push({ content: c.trim(), description: d?.trim() || '', utterance: u.trim() });
      });
      const sum = fv(text, 'summary');
      return actions.length > 0
        ? { actions, summary: sum?.trim() || 'What can I help you with?' }
        : null;
    } catch { return null; }
  }, []);

  const extractSayLines = useCallback((text) => {
    const lines = [];
    const re = /Say:\s*["`'](.*?)["`'](?=\s*(?:Say:|tool_code:|$))/gs;
    let m;
    while ((m = re.exec(text)) !== null) lines.push(m[1].trim());
    return lines;
  }, []);

  // ── showCombo ──────────────────────────────────────────────────────────────
  const showCombo = useCallback((rawActions, summary, forcedHeading, forcedSubtitle) => {
    const actions = markSignInActions(rawActions);
    const pending = pendingHeading.current;
    pendingHeading.current  = null;
    pendingSubtitle.current = null;
    comboCreated.current    = true;

    const mergeActions = (existing, incoming) => {
      const key  = (a) => `${a.content || ''}|${a.utterance || ''}`;
      const seen = new Set(existing.map(key));
      return [...existing, ...incoming.filter((a) => !seen.has(key(a)))];
    };

    setMessages((prev) => {
      if (forcedHeading) {
        const cleanHeading = stripMarkdownForTTS(forcedHeading);
        const cleanSubtitle = stripMarkdownForTTS(forcedSubtitle || '') || undefined;
        return [...prev, {
          type: 'combo',
          heading: cleanHeading,
          subtitle: cleanSubtitle,
          actions,
          id: uid(),
          compact: isFH(cleanHeading),
        }];
      }

      // The normal text output for this agent turn is already visible and is
      // also the single source used by TTS. Keep it, then render only the
      // associated action tiles. Never duplicate quick_actions.summary.
      if (pending) {
        const last = prev[prev.length - 1];
        if (last?.type === 'combo' && !last.heading && !last.subtitle) {
          return [
            ...prev.slice(0, -1),
            { ...last, actions: mergeActions(last.actions, actions) },
          ];
        }
        return [...prev, { type: 'combo', actions, id: uid(), compact: false }];
      }

      const last = prev[prev.length - 1];
      if (last?.type === 'combo') {
        const merged = { ...last, actions: mergeActions(last.actions, actions) };
        if (!merged.heading && summary) {
          merged.heading = stripMarkdownForTTS(summary);
        }
        return [...prev.slice(0, -1), merged];
      }

      // True widget-only fallback: no normal text was emitted, so show the
      // summary once to keep the quick actions from becoming orphaned.
      const cleanSummary = stripMarkdownForTTS(summary || '') || undefined;
      return [...prev, {
        type: 'combo',
        heading: cleanSummary,
        actions,
        id: uid(),
        compact: cleanSummary ? isFH(cleanSummary) : false,
      }];
    });
  }, []);

  // ── processOutputs ─────────────────────────────────────────────────────────
  // CRITICAL FIX: Track which outputs have text added so we can create bot-widget
  // containers for widget-only outputs. This ensures even widget-only turns render
  // as visible bot messages, not as orphaned widgets.
  const processOutputs = useCallback((outputs) => {
    const now = Date.now();

    /* One agent turn can reach us TWICE: once through the fetch interceptor
       (unary) and once through gecxBidi's message consumer (voice). The
       platform transcript proves the agent only ever said it once -- the
       duplicate bubbles were ours.
       The old guard missed it on both counts: an 800 ms window is far shorter
       than the gap between the two transports, and JSON.stringify(outputs)
       differs whenever the two paths shape the object even slightly
       differently. So compare on what the customer would actually SEE, and
       remember it for the whole turn rather than for 800 ms. showTyping()
       clears the set when the next turn begins, which is what keeps a
       genuinely repeated line (the same pacing phrase on a later turn) from
       being swallowed. */
    const sig = normalizeResponseOutputs(outputs)
      .map((o) => {
        const p = normalizeWidgetPayload(o);
        return `${o?.text || ''}|${(p && resolvePayloadName(p)) || ''}`;
      })
      .join('||');

    if (seenOutputSigs.current.has(sig)) return;
    if (seenOutputSigs.current.size > 50) seenOutputSigs.current.clear();
    seenOutputSigs.current.add(sig);
    lastProcessed.current = { time: now, sig };
    outputs = normalizeResponseOutputs(outputs);

    const hasVisible = outputs.some((o) => {
      if (o.payload) return true; // any payload counts — unknown ones are logged below
      if (!o.text) return false;
      const t = o.text;
      if (t.includes('narration_checkpoint')) return false;
      if (t.includes('tool_code:'))
        return t.includes('default_api.quick_actions') || t.includes('quick_actions(');
      return stripMarkdown(t).length > 0;
    });
    if (!hasVisible) return;

    const hasFinalWidget = outputs.some((o) => o.payload);
    const hasOnlyText    = outputs.every((o) => o.text && !o.payload);

    if (hasFinalWidget || hasOnlyText) removeTyping();
    else if (outputs.length > 0) clearTypingBubble();

    // Track which outputs have had text processed, so we know if we need a bot-widget container
    const outputsWithText = new Set();

    // Pass 1: text outputs
    outputs.forEach((output) => {
      if (!output.text) return;
      const text = output.text;

      const tc = parseToolCode(text);
      if (tc) {
        outputsWithText.add(output);
        const sl = extractSayLines(text);
        if (sl.length >= 2) {
          comboCreated.current = true;
          setMessages((prev) => [
            ...prev,
            { type: 'combo', heading: sl[0], subtitle: sl[1], actions: markSignInActions(tc.actions), id: uid(), compact: isFH(sl[0]) },
          ]);
        } else if (sl.length === 1) {
          comboCreated.current = true;
          setMessages((prev) => [
            ...prev,
            { type: 'combo', heading: sl[0], actions: markSignInActions(tc.actions), id: uid(), compact: isFH(sl[0]) },
          ]);
        } else {
          showCombo(tc.actions, tc.summary);
        }
        return;
      }

      if (text.includes('quick_actions') && text.includes('content:') && text.includes('utterance:')) {
        outputsWithText.add(output);
        const acts = [];
        const re = /content:\s*["']?([^,}"'\n]+?)["']?,\s*description:\s*["']?([^,}"'\n]+?)["']?,\s*utterance:\s*["']?([^}"'\n\]]+?)["']?\s*\}/g;
        let m;
        while ((m = re.exec(text)) !== null)
          acts.push({ content: m[1].trim(), description: m[2].trim(), utterance: m[3].trim() });
        const sm = text.match(/summary:\s*["']?([^,}"'\]\n]+?)["']?\s*[,}]/);
        if (acts.length > 0) {
          showCombo(acts, sm ? sm[1].trim() : 'What can I help you with?');
          return;
        }
      }

      if (text.includes('narration_checkpoint') || text.includes('tool_code:')) return;
      
      outputsWithText.add(output);
      addBot(text);
    });

    // Pass 2: payload widgets — wrap widget-only outputs in bot-widget containers
    let needsBotWidgetWrapper = false;
    const widgetActions = outputs.flatMap((output) => {
      const payload = normalizeWidgetPayload(output);
      return resolvePayloadName(payload) === 'trip_booking_recommendations' && Array.isArray(payload?.actions) ? payload.actions : [];
    });
    outputs.forEach((output) => {
      const payloadValue = normalizeWidgetPayload(output);
      if (output?.text && !output?.payload && !output?.customPayload && !output?.data?.payload && !resolvePayloadName(payloadValue)) return;
      const p = normalizeWidgetPayload(payloadValue);
      if (!p) return;
      const pname = resolvePayloadName(p);
      if (!pname) { console.warn('[ACN] unrecognized payload — add handler:', JSON.stringify(p)); return; }

      // Quick actions already render their own action container. Only other
      // widget-only payloads need the lightweight bot-widget wrapper.
      if (
        pname !== 'quick_actions' &&
        pname !== 'trip_booking_recommendations' &&
        pname !== 'travel_protection_banner' &&
        !outputsWithText.has(output) &&
        !needsBotWidgetWrapper
      ) {
        needsBotWidgetWrapper = true;
        setMessages((prev) => [...prev, { type: 'bot-widget', id: uid() }]);
      }

      if (pname === 'quick_actions' && p.actions) {
        const unmatchedActions = filterDuplicateQuickActions(p.actions, widgetActions);
        if (unmatchedActions.length > 0) showCombo(unmatchedActions, p.summary);
      }

      if (pname === 'trip_booking_recommendations') {
        const turnIndex = output.turnIndex ?? p.turnIndex ?? 'unknown';
        const signature = tripBookingSignature(p, turnIndex);
        setMessages((prev) => {
          if (prev.some((message) => message.type === 'trip-booking-recommendations' && message.signature === signature)) return prev;
          return [...prev, { type: 'trip-booking-recommendations', payload: p, signature, id: uid() }];
        });
      }

      if (pname === 'travel_protection_banner') {
        onTravelProtectionBanner?.(p);
        return;
      }

      if (pname === 'acn-form-input' && p.fields) {
        setActiveForm({ payload: p, id: uid() });
        setMessages((prev) => prev.map((m) => (m.type === 'combo' ? { ...m, compact: true } : m)));
      }

      if (pname === 'acn-payment-carousel' || pname === 'acn-payee-selector') {
        setMessages((prev) => {
          const last = [...prev].reverse().find((m) => m.type === 'carousel');
          if (last && p.title && last.payload?.title === p.title) return prev;
          return [...prev, { type: 'carousel', payload: p, id: uid() }];
        });
      }

      if (pname === 'acn-insight-card') {
        setMessages((prev) => {
          const last = [...prev].reverse().find((m) => m.type === 'insight');
          if (last && p.headline && last.payload?.headline === p.headline) return prev;
          return [...prev, { type: 'insight', payload: p, id: uid() }];
        });
      }

      if (pname === 'acn-card-carousel' || pname === 'acn-card-compare') {
        const kind = pname === 'acn-card-compare' ? 'card-compare' : 'card-carousel';
        setMessages((prev) => {
          // CES sometimes re-emits the same widget within one turn; de-dupe on
          // the product set so the transcript does not stack identical tables.
          const sig  = (p.productDetails ?? []).map((d) => d.productId).join('|');
          const last = [...prev].reverse().find((m) => m.type === kind);
          if (last && (last.payload?.productDetails ?? []).map((d) => d.productId).join('|') === sig)
            return prev;
          return [...prev, { type: kind, payload: p, id: uid() }];
        });
      }

      if (pname === 'acn-card-activation') {
        setMessages((prev) => {
          const key = `${p.cardId || ''}|${p.action?.url || ''}`;
          const last = [...prev].reverse().find((m) => m.type === 'card-activation');
          if (last && `${last.payload?.cardId || ''}|${last.payload?.action?.url || ''}` === key) return prev;
          return [...prev, { type: 'card-activation', payload: p, id: uid() }];
        });
      }

      if (pname === 'acn-amount-input')
        setMessages((prev) => [...prev, { type: 'amount', payload: p, id: uid() }]);

      if (pname === 'acn-contact-selector')
        setMessages((prev) => [...prev, { type: 'p2p-contacts', payload: p, id: uid() }]);

      if (pname === 'acn-payment-receipt')
        setMessages((prev) => [
          ...prev,
          { type: 'receipt', payload: { ...p, date_or_frequency: formatFriendlyDate() }, id: uid() },
        ]);

      // ── Loans (EPP + Mortgage) ────────────────────────────────────────────
      if (pname === 'acn-epp-carousel')
        setMessages((prev) => [...prev, { type: 'epp-carousel', payload: p, id: uid() }]);

      if (pname === 'acn-epp-plans')
        setMessages((prev) => [...prev, { type: 'epp-plans', payload: p, id: uid() }]);

      if (pname === 'acn-mortgage-calculator')
        setMessages((prev) => [...prev, { type: 'mortgage-calculator', payload: p, id: uid() }]);

      if (pname === 'acn-mortgage-affordability')
        setMessages((prev) => [...prev, { type: 'mortgage-affordability', payload: p, id: uid() }]);

      if (pname === 'acn-mortgage-rate-shelf')
        setMessages((prev) => [...prev, { type: 'mortgage-rate-shelf', payload: p, id: uid() }]);

      if (pname === 'acn-mortgage-rate-table')
        setMessages((prev) => [...prev, { type: 'mortgage-rate-table', payload: p, id: uid() }]);

      // Nudges are the one loan widget that can legitimately repeat within a
      // journey, but never with the same suggestion set. De-dupe on the ids so
      // a re-emitted turn does not stack two identical cards.
      if (pname === 'acn-mortgage-nudge')
        setMessages((prev) => {
          const key = (p.suggestions || []).map((s) => s?.suggestion_id || '').join('|');
          const last = [...prev].reverse().find((m) => m.type === 'mortgage-nudge');
          if (last && (last.payload?.suggestions || []).map((s) => s?.suggestion_id || '').join('|') === key) {
            return prev;
          }
          return [...prev, { type: 'mortgage-nudge', payload: p, id: uid() }];
        });

      if (pname === 'acn-mortgage-kyc')
        setMessages((prev) => [...prev, { type: 'mortgage-kyc', payload: p, id: uid() }]);

      if (pname === 'acn-loan-preapproval')
        setMessages((prev) => [...prev, { type: 'loan-preapproval', payload: p, id: uid() }]);

      if (pname === 'acn-mobile-handoff')
        setMessages((prev) => [...prev, { type: 'mobile-handoff', payload: p, id: uid() }]);

      if (pname === 'acn-qr-widget')
        setMessages((prev) => [...prev, { type: 'qr-widget', payload: p, id: uid() }]);

      if (pname === 'acn-spending-dashboard')
        setMessages((prev) => {
          const last = [...prev].reverse().find((m) => m.type === 'spending-dashboard');
          if (last && p.headline && last.payload?.headline === p.headline) return prev;
          return [...prev, { type: 'spending-dashboard', payload: p, id: uid() }];
        });

      if (pname === 'acn-investment-card')
        setMessages((prev) => {
          const last = [...prev].reverse().find((m) => m.type === 'investment-card');
          if (last && p.headline && last.payload?.headline === p.headline) return prev;
          return [...prev, { type: 'investment-card', payload: p, id: uid() }];
        });

      if (pname === 'acn-proactive-alert')
        setMessages((prev) => {
          const last = [...prev].reverse().find((m) => m.type === 'contextual-alert');
          if (last && p.headline && last.payload?.headline === p.headline) return prev;
          return [...prev, { type: 'contextual-alert', payload: p, id: uid() }];
        });

      if (pname === 'acn-transactions-widget')
        setMessages((prev) => {
          const last = [...prev].reverse().find((m) => m.type === 'transactions-widget');
          if (last && p.headline && last.payload?.headline === p.headline && (last.payload?.transactions || []).length === (p.transactions || []).length) return prev;
          return [...prev, { type: 'transactions-widget', payload: p, id: uid() }];
        });
    });

    const combinedBotTextRaw = outputs.map((o) => String(o?.text || '')).join(' ');
    const combinedBotLower = combinedBotTextRaw.toLowerCase();

    // ── Chat -> Web Auto-Sign-In sync when agent confirms verification ──
    if (!isAuthenticatedRef.current) {
      const combinedBotText = combinedBotLower;
      const hasAuthWidget = outputs.some((o) => {
        const pn = resolvePayloadName(normalizeWidgetPayload(o));
        return (
          pn === 'acn-payment-carousel' ||
          pn === 'acn-insight-card' ||
          pn === 'acn-loan-preapproval' ||
          pn === 'acn-qr-widget'
        );
      });
      const verifiedMatch =
        combinedBotText.includes('verified') ||
        combinedBotText.includes('thank you, chander') ||
        combinedBotText.includes('thank you, intan') ||
        combinedBotText.includes('thank you, emiliano') ||
        combinedBotText.includes('thank you, sophie') ||
        combinedBotText.includes('welcome back') ||
        hasAuthWidget;

      if (verifiedMatch) {
        let inferredName = '';
        const nameRegex = /(?:thank you|hello|hi|welcome(?:\s+back)?),?\s+(chander|intan|emiliano|sophie|david|alex|marcus|elena)/i;
        const nm = combinedBotText.match(nameRegex);
        if (nm) inferredName = nm[1];
        attemptChatToWebSignInRef.current?.({
          phone: chatAuthPhoneRef.current,
          pin: chatAuthPinRef.current,
          customerName: inferredName,
        });
      }
    }
  }, [removeTyping, clearTypingBubble, addBot, showCombo, parseToolCode, extractSayLines, onTravelProtectionBanner]);

  const processOutputsRef = useRef(processOutputs);
  useEffect(() => { processOutputsRef.current = processOutputs; }, [processOutputs]);

  // ── Bidirectional Auth Refs & Chat -> Web Auto-Sign-In ─────────────────────
  const isAuthenticatedRef = useRef(isAuthenticated);
  const customerIdRef      = useRef(customerId);
  const customerNameRef    = useRef(customerName);
  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
    customerIdRef.current      = customerId;
    customerNameRef.current    = customerName;
  }, [isAuthenticated, customerId, customerName]);

  const chatAuthPhoneRef   = useRef('');
  const chatAuthPinRef     = useRef('');
  const chatSyncInFlightRef = useRef(false);

  const attemptChatToWebSignIn = useCallback(async ({ customerId: cid, phone, pin, customerName: cname } = {}) => {
    if (isAuthenticatedRef.current || chatSyncInFlightRef.current) return;
    if (!cid && !phone && !cname) return;
    chatSyncInFlightRef.current = true;
    try {
      const res = await signInFromChat({ customerId: cid, phone, pin, customerName: cname });
      if (res?.success && res.customer) {
        setAuthenticatedCustomerVariables(res.customer);
        console.log('[ACN] Chat -> Web auto sign-in synced:', res.customer.customerId, res.customer.prefName);
      }
    } catch (e) {
      console.warn('[ACN] Chat -> Web auto sign-in failed:', e);
    } finally {
      chatSyncInFlightRef.current = false;
    }
  }, [signInFromChat]);

  const attemptChatToWebSignInRef = useRef(attemptChatToWebSignIn);
  useEffect(() => { attemptChatToWebSignInRef.current = attemptChatToWebSignIn; }, [attemptChatToWebSignIn]);

  // Inspect user utterances in chat (typed or voice) for phone/account + 4-digit PIN
  // so logging in inside the chat immediately logs the user into the Web UI too.
  const captureChatAuthInput = useCallback((rawText) => {
    if (isAuthenticatedRef.current || !rawText) return;
    const digitsOnly = String(rawText).replace(/\D/g, '');
    // 10 or 11 digit phone / account number
    if (digitsOnly.length === 10 || (digitsOnly.length === 11 && digitsOnly.startsWith('1'))) {
      chatAuthPhoneRef.current = digitsOnly.slice(-10);
      return;
    }
    // 4-digit PIN (either standalone "2244" or "PIN is 2244")
    const pinMatch = String(rawText).match(/\b(\d{4})\b/);
    if (pinMatch && (digitsOnly.length === 4 || chatAuthPhoneRef.current)) {
      const pin4 = pinMatch[1];
      chatAuthPinRef.current = pin4;
      if (chatAuthPhoneRef.current) {
        attemptChatToWebSignInRef.current?.({
          phone: chatAuthPhoneRef.current,
          pin: pin4,
        });
      }
    }
  }, []);

  // ── On mount: ensure _initDone is false (guards against hot-reload in dev). ─
  useEffect(() => { clearGecxDone(); }, []);

  // ── Comprehensive cleanup on unmount ───────────────────────────────────────
  // Stops all timers, cancels TTS requests, pauses audio, revokes URLs, stops recording
  useEffect(() => {
    return () => {
      try {
        disconnectBidi();
        resetBidiBridge();
      } catch (err) {
        console.error('[ACN] bidi teardown error:', err);
      }

      try {
        const audio = ttsAudioRef.current;
        if (audio) {
          audio.pause();
          audio.src = '';
          ttsAudioRef.current = null;
        }
      } catch (err) {
        console.error('[ACN TTS] unmount audio stop error:', err);
      }

      if (respondingTimer.current) clearTimeout(respondingTimer.current);
      if (finalTimer.current) clearTimeout(finalTimer.current);
      if (ttsFlushTimer.current) clearTimeout(ttsFlushTimer.current);
    };
  }, []);

  // ── External reset signal (e.g. sign-in or sign-out from App) ──────────────
  const prevResetSignal = useRef(0);
  useEffect(() => {
    if (resetSignal === 0 || resetSignal === prevResetSignal.current) return;
    prevResetSignal.current = resetSignal;

    setMessages([]);
    setActiveForm(null);
    sessionStartedRef.current = false;  // ref — instantly visible to isOpen effect
    setInputVal('');
    setIsResponding(false);
    pendingHeading.current  = null;
    pendingSubtitle.current = null;
    comboCreated.current    = false;
    lastProcessed.current   = { time: 0, sig: '' };
    seenOutputSigs.current.clear();
    chatAuthPhoneRef.current = '';
    chatAuthPinRef.current   = '';
    if (respondingTimer.current) clearTimeout(respondingTimer.current);
    if (finalTimer.current)      clearTimeout(finalTimer.current);

    disconnectBidi();
    resetBidiBridge();
    bidiAutoStartedRef.current = false;
    bidiGreetedRef.current = false;
    stopGecxAudio();
    setVoiceMode(false);
    voiceModeRef.current = false;
    setVoiceActive(false);

    clearGecxSession();
    setMessengerKey((k) => k + 1);
    softResetGecx();
  }, [resetSignal, stopGecxAudio]);

  // ── GECX native event handler ──────────────────────────────────────────────
  useEffect(() => {
    setResponseHandler((outs) => processOutputsRef.current(outs));
  }, []);

  // ── Bidi session bridge ────────────────────────────────────────────────────
  useEffect(() => {
    setBidiHandlers({
      onOutputs: (outs) => processOutputsRef.current(outs),

      onUserTranscript: (text, isFinal) => {
        if (!isFinal || !text?.trim()) return;
        const clean = text.trim();
        captureChatAuthInput(clean);
        addUser(clean);
        showTyping();
      },

      onStateChange: ({ connected, connecting }) => {
        setVoiceActive(connected);

        if (connected) {
          stopGecxAudio();

          if (!bidiGreetedRef.current) {
            bidiGreetedRef.current = true;
            showTyping();
            const signedName = customerNameRef.current;
            const signedId   = customerIdRef.current;
            const openingPrompt =
              isAuthenticatedRef.current && signedName
                ? `Begin the session. The customer ${signedName} (customer_id=${signedId}) is already authenticated at L2 via the web app. Deliver your approved opening greeting addressing ${signedName} by name, including the PIPEDA privacy disclosure.`
                : 'Begin the session. Deliver your approved opening greeting exactly '
                  + 'as your instructions specify, including the PIPEDA privacy '
                  + 'disclosure.';
            sendVoiceText(openingPrompt, { silent: true });
          }
        }

        if (!connected && !connecting) {
          setVoiceMode(false);
          voiceModeRef.current = false;
        }
      },
    });
  }, [addUser, showTyping, stopGecxAudio, captureChatAuthInput]);

  // ── Rate-limit (429) handler ────────────────────────────────────────────────
  useEffect(() => {
    setRateLimitHandler(() => {
      removeTyping();
      addBot("I'm getting a lot of requests right now — please wait a few seconds and try again.");
    });
  }, [removeTyping, addBot]);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // ── Open / intent effect ───────────────────────────────────────────────────
  // Depends on [isOpen, messengerKey] and waits if a resetSignal remount is
  // scheduled in the current render cycle so initGecx() always binds to the
  // newly remounted <chat-messenger key={messengerKey}> element.
  useEffect(() => {
    if (!isOpen) return;
    if (resetSignal !== prevResetSignal.current) return;

    if (!sessionStartedRef.current) {
      sessionStartedRef.current = true;
      showTyping();

      clearGecxSession();
      initGecx();

      if (!bidiAutoStartedRef.current) {
        bidiAutoStartedRef.current = true;
        setVoiceMode(true);
        voiceModeRef.current = true;
        connectBidiWhenReady().then((ok) => {
          if (!ok) {
            setVoiceMode(false);
            voiceModeRef.current = false;
            setVoiceActive(false);
            console.warn('[ACN] voice session unavailable — continuing in text mode');

            if (!bidiGreetedRef.current) {
              bidiGreetedRef.current = true;
              removeTyping();
              const signedName = customerNameRef.current;
              if (isAuthenticatedRef.current && signedName) {
                addBot(
                  `Hello **${signedName}**, welcome back to ACN Bank! We're committed to protecting your privacy under PIPEDA. How can I help you today?`
                );
              } else {
                addBot(
                  "Hello and welcome to ACN Bank! We're committed to protecting "
                    + 'your privacy under PIPEDA. How can I help you today?'
                );
              }
            }
          }
        });
      }
    }

    if (intent) {
      setTimeout(() => { addUser(intent); showTyping(); gecxSend(intent); }, 1100);
    }

    setTimeout(() => inputRef.current?.focus(), 300);
  }, [isOpen, messengerKey]); // eslint-disable-line

  // ── Menu helpers (must be defined before handleTileSelect which references them) ──
  const closeMenu  = useCallback(() => setActiveMenu(null), []);
  const toggleMenu = useCallback((menu) => setActiveMenu((prev) => prev === menu ? null : menu), []);

  // ── Interaction handlers ───────────────────────────────────────────────────
  const handleTileSelect = useCallback((action, comboId) => {
    if (action.isSignIn) {
      setMessages((prev) => prev.filter((m) => m.id !== comboId));
      addUser(action.content || 'Sign in');
      onRequestSignIn?.();
      return;
    }

    const cta = action.utterance || action.content || '';
    if (cta.startsWith('select_p2p_contact:')) {
      const parts   = cta.split(':');
      const username = parts[2] || '';
      setMessages((prev) => prev.filter((m) => m.id !== comboId));
      const msg = username ? `Transfer money to ${username}` : 'Pay a contact';
      addUser(msg);
      showTyping();
      gecxSend(msg);
      closeMenu();
      return;
    }

    setMessages((prev) => prev.map((m) => {
      if (m.id !== comboId) return m;
      return m.heading ? { type: 'bot', text: m.heading, id: m.id } : null;
    }).filter(Boolean));
    addUser(action.content || action.utterance);
    showTyping();
    gecxSend(action.utterance || action.content);
    setTimeout(() => {
      if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
    }, 50);
  }, [addUser, showTyping, onRequestSignIn, closeMenu]);

  const handleFormSubmit = useCallback((value, displayText) => {
    setActiveForm(null);
    captureChatAuthInput(value);
    addUser(displayText || value.split(':').slice(1).join(':') || value);
    showTyping();
    gecxSend(value);
  }, [addUser, showTyping, captureChatAuthInput]);

  const sendMessage = useCallback((textOverride) => {
    const text = (typeof textOverride === 'string' ? textOverride : inputVal).trim();
    if (!text || isResponding) return;
    setInputVal('');
    captureChatAuthInput(text);
    addUser(text);
    showTyping();
    gecxSend(text);
  }, [inputVal, addUser, showTyping, isResponding, captureChatAuthInput]);
  // Keep sendMessageRef current so async callers can send without a stale closure.
  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);
  // Sync messages to parent (App) so FloatingChatWidget can mirror the conversation.
  useEffect(() => { onMessagesChange?.(messages); }, [messages, onMessagesChange]);
  // Expose sendMessage so FloatingChatWidget can send through this panel's session.
  useEffect(() => { onExposeSend?.(sendMessage); }, [sendMessage, onExposeSend]);

  const handleReset = useCallback(() => {
    setMessages([]);
    setActiveForm(null);
    sessionStartedRef.current = false;
    setInputVal('');
    setIsResponding(false);
    pendingHeading.current  = null;
    pendingSubtitle.current = null;
    comboCreated.current    = false;
    if (respondingTimer.current) clearTimeout(respondingTimer.current);
    if (finalTimer.current)      clearTimeout(finalTimer.current);
    resetGecx();
    setTimeout(() => showTyping(), 600);
    onReset?.();
  }, [showTyping, onReset]);

  // Expose handleReset to parent (App) so the nav reset button can call it
  useEffect(() => { onExposeReset?.(handleReset); }, [handleReset, onExposeReset]);

  /* ── Resume after an agent-gated sign-in ────────────────────────────────────
     Accepts the customer object directly from the login call (not from React state,
     which updates asynchronously). Applies authenticated variables, flushes to CES,
     then sends the continuation turn. */
  const handleResumeAfterSignIn = useCallback(async (customer) => {
    if (authResumeInFlightRef.current) return;
    authResumeInFlightRef.current = true;

    showTyping();

    try {
      const resumed = await resumeGecxAfterSignIn(customer);

      if (!resumed) {
        removeTyping();
        addBot(
          "You're signed in, but I couldn't resume the previous step automatically. Please send your request again."
        );
      }
    } finally {
      authResumeInFlightRef.current = false;
    }
  }, [showTyping, removeTyping, addBot]);

  useEffect(() => { onExposeResume?.(handleResumeAfterSignIn); },
    [handleResumeAfterSignIn, onExposeResume]);

  // ── Speech-to-text ─────────────────────────────────────────────────────────
  // There is no browser SpeechRecognition here any more. In a bidi session the
  // microphone is owned by the SDK: raw audio streams to CES, and the platform
  // returns the transcript as a user utterance, which gecxBidi's message
  // consumer forwards to handleBidiUserTranscript below. That keeps recognition
  // in the same engine that produces the agent's replies, instead of pairing a
  // browser recogniser with a server-side voice.
  //
  // startVoiceRef is retained because older call sites still reference it; with
  // bidi holding an open mic there is no per-turn pass to restart.
  useEffect(() => { startVoiceRef.current = () => {}; }, []);

  // ── Who speaks, and when ───────────────────────────────────────────────────
  // The agent is spoken by the voice configured on the CES app (app.json
  // audioProcessingConfig → Iapetus, en-CA, plus the persona director's note),
  // never by window.speechSynthesis. Browser voices ignore the persona and vary
  // per browser and OS, which is why that path was removed.
  //
  // There is no playback code here on purpose. Agent audio exists only inside a
  // live bidi session, and the SDK decodes and plays it itself — even with our
  // <chat-messenger> parked off-screen. Playing it here as well would double
  // every reply.
  //
  // Text turns are genuinely silent: CES rejects outputAudioConfig on unary
  // runSession, so there is no audio to play outside a voice session. If you
  // want a reply spoken, it has to go through the open session — see
  // sendVoiceText().
  //
  // stopGecxAudio() remains as the cleanup path for the mute button and
  // unmount; ttsAudioRef is now only ever populated if something else sets it.

  // The text-accumulation queue (addBot → scheduleTTSFlush) predates GECX
  // voice, when the browser synthesised from the transcript. Speech now arrives
  // as audio on its own channel, so the flush has nothing left to do. The queue
  // is kept because addBot still uses it to decide combo headings; this shim
  // just makes the speech half a no-op rather than threading a second removal
  // through every call site.
  const playTTS = useCallback(() => {}, []);
  useEffect(() => { playTTSRef.current = playTTS; }, [playTTS]);

  // ── Bot-speaks toggle (mute / unmute) ─────────────────────────────────────
  // Independent of the mic. When enabled, every bot response is spoken aloud
  // via the ElevenLabs TTS endpoint. Muting also stops any in-flight playback
  // so the user is not stuck listening to a response they wanted silenced.
  const toggleTTS = useCallback(() => {
    setTTSEnabled((prev) => {
      const next = !prev;
      ttsEnabledRef.current = next;
      if (!next) {
        // Muting mid-playback: stop the GECX audio and clear the queue.
        stopGecxAudio();

        if (ttsFlushTimer.current) {
          clearTimeout(ttsFlushTimer.current);
          ttsFlushTimer.current = null;
        }
        ttsQueueRef.current = '';
        setTTSPlaying(false);
      }
      return next;
    });
  }, [stopGecxAudio]);

  // ── Voice conversation toggle ──────────────────────────────────────────────
  // Opens or closes the live bidi session. The session holds the mic open for
  // its whole lifetime — there is no per-turn press-to-talk — and barge-in is
  // enabled, so the customer can cut the agent off mid-sentence.
  const toggleVoice = useCallback(() => {
    if (voiceMode) {
      setVoiceMode(false);
      voiceModeRef.current = false;
      setVoiceActive(false);
      ttsQueueRef.current = '';
      stopGecxAudio();
      disconnectBidi();
      return;
    }

    setVoiceMode(true);
    voiceModeRef.current = true;
    // Any unary audio still playing would collide with the live stream.
    stopGecxAudio();
    connectBidiWhenReady().then((ok) => {
      if (!ok) {
        setVoiceMode(false);
        voiceModeRef.current = false;
        setVoiceActive(false);
        addBot(
          "I couldn't start the voice session. Please allow microphone access and try again."
        );
      }
    });
  }, [voiceMode, stopGecxAudio, addBot]);

  const handleFileUpload = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    addUser('📎 ' + file.name);
    showTyping();
    gecxSend('I am uploading a file: ' + file.name);
    e.target.value = '';
  }, [addUser, showTyping]);

  // ── Load customer bills, beneficiaries, P2P contacts & proactive insights ──
  useEffect(() => {
    if (!isAuthenticated || !customerId) {
      setP2pContacts([]);
      setCustomerBills([]);
      setBeneficiaries([]);
      setProactiveInsights([]);
      return;
    }
    let cancelled = false;
    setContactsLoading(true);
    Promise.all([
      fetchP2PContacts(customerId),
      fetchCustomerBills(customerId),
      fetchCustomerBeneficiaries(customerId),
      fetchCustomerTransactions(customerId, 20),
      fetchCustomerAccounts(customerId),
    ])
      .then(([contacts, bills, benes, txns, accts]) => {
        if (cancelled) return;
        setP2pContacts(contacts || []);
        setCustomerBills(bills || []);
        setBeneficiaries(benes || []);
        setContactsLoading(false);

        // Build real-time banking insights from customer data
        const insights = [];
        const pendingBills = (bills || []).filter(
          (b) => String(b.status || 'pending').toLowerCase() !== 'paid',
        );
        if (pendingBills.length > 0) {
          const urgent = pendingBills[0];
          const days = computeDaysUntil(urgent.due_date);
          const amt = Number(urgent.amount || 0).toFixed(2);
          const dueLabel =
            days !== null && days <= 0
              ? 'due today'
              : days === 1
                ? 'due tomorrow'
                : days !== null && days <= 14
                  ? `due in ${days} days`
                  : `due ${urgent.due_date || 'soon'}`;
          insights.push({
            id: `bill-${urgent.id}`,
            type: 'bill_automation',
            badge: `⚡ Utility Bill ${dueLabel.toUpperCase()}`,
            title: `${urgent.payee_name}: CAD $${amt} is ${dueLabel}`,
            detail: `Account ${urgent.account_number || 'on file'} · Avoid late fees by paying now.`,
            ctaLabel: `Pay $${amt} now`,
            utterance: `Pay my ${urgent.payee_name} bill of $${amt} now`,
            accent: '#F59E0B',
          });
        }

        const anomalyTxn = (txns || []).find(
          (t) =>
            t.is_anomaly === true ||
            String(t.category || '').toLowerCase() === 'anomaly' ||
            String(t.merchant || t.description || '').toLowerCase().includes('unknown online'),
        );
        if (anomalyTxn) {
          const amt = Math.abs(Number(anomalyTxn.amount || 249.99)).toFixed(2);
          const merch = anomalyTxn.merchant || anomalyTxn.description || 'Unknown Online Vendor';
          insights.push({
            id: `anom-${anomalyTxn.id}`,
            type: 'anomaly',
            badge: '🚨 Odd Transaction Flagged',
            title: `Unusual charge: CAD $${amt} at ${merch}`,
            detail: anomalyTxn.anomaly_reason || 'Out-of-pattern late-night online card-not-present charge.',
            ctaLabel: 'Review & Dispute',
            utterance: `I want to dispute the unusual $${amt} charge at ${merch}`,
            accent: '#EF4444',
          });
        }

        insights.push({
          id: 'trend-mom',
          type: 'spending_spike',
          badge: '📊 Spending Trend',
          title: 'Dining & Entertainment up +36.2% vs. last month',
          detail: 'You spent CAD $588.69 across dining & entertainment this month compared to $432.10 last month.',
          ctaLabel: 'Analyze my spending',
          utterance: 'Show my spending insights and category breakdown',
          accent: '#38BDF8',
        });

        const cheq = (accts || []).find((a) => String(a.type || '').toLowerCase().includes('cheq'));
        if (cheq && Number(cheq.balance || 0) > 3500) {
          insights.push({
            id: 'yield-opt',
            type: 'savings_opportunity',
            badge: '💰 Idle Cash Insight',
            title: 'Earn 4.65% APY on surplus Chequing balance',
            detail: `Moving CAD $3,500 from Chequing to High-Interest Savings earns ~CAD $162.75/yr.`,
            ctaLabel: 'Transfer $3,500 to Savings',
            utterance: 'Transfer $3500 from my Chequing account to my Savings account',
            accent: '#10B981',
          });
        }

        setProactiveInsights(insights);
      })
      .catch(() => {
        if (!cancelled) setContactsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, customerId]);

  const showMyQrInChat = useCallback(() => {
    closeMenu();
    if (!isAuthenticated || !customer?.customerId) {
      onRequestSignIn?.();
      return;
    }
    setMessages((prev) => [
      ...prev,
      {
        type: 'bot',
        text: `Here is your **ACN QR Pay** code for **${customer.legalName || customer.prefName}**. Anyone signed into the ACN Bank mobile app can scan this QR code to transfer funds directly to your account.`,
        id: uid(),
      },
      {
        type: 'qr-widget',
        payload: {
          customerId: customer.customerId,
          displayName: customer.legalName || customer.prefName,
          amount: 0,
        },
        id: uid(),
      },
    ]);
  }, [closeMenu, isAuthenticated, customer, onRequestSignIn]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* GECX bridge — always in DOM, off-screen with real dimensions. */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: '-9999px',
          top: '-9999px',
          width: '400px',
          height: '600px',
          overflow: 'hidden',
          opacity: 0,
          pointerEvents: 'none',
          zIndex: -1,
        }}
      >
        <chat-messenger
          key={messengerKey}
          id="gecx-messenger"
          url-allowlist="*"
          language-code="en-CA"
          max-query-length="-1"
          barge-in-enabled="true"
          style={{ display: 'block', width: '400px', height: '600px' }}
        >
          <chat-messenger-container chat-title="ACN Bank AI" enable-audio-input="true">
            <chat-reset-session-button slot="titlebar-actions" title-text="New conversation" />
          </chat-messenger-container>
        </chat-messenger>
      </div>

      {/* Side panel — no internal header; controls live in the top nav */}
      <aside className={`chat-panel${isOpen ? ' open' : ''}`} aria-label="ACN Bank AI assistant">

        {/* ── Proactive Banking Insights Strip (Light Mode, when signed in) ── */}
        {isAuthenticated && proactiveInsights.length > 0 && (
          <div
            style={{
              padding: '10px 14px 9px',
              background: 'linear-gradient(180deg, #EFF6FF 0%, #F8FAFC 100%)',
              borderBottom: '1px solid #DBEAFE',
              display: 'flex',
              flexDirection: 'column',
              gap: 7,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: '#0056B3', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                ✦ Smart Banking Insights for {customerName}
              </span>
              <button
                type="button"
                onClick={showMyQrInChat}
                style={{
                  padding: '3px 9px',
                  borderRadius: 999,
                  border: '1px solid #93C5FD',
                  background: '#FFFFFF',
                  color: '#002147',
                  fontSize: 10,
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 1px 4px rgba(0, 33, 71, 0.06)',
                }}
              >
                ▦ My Receive QR
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
              {proactiveInsights.slice(0, 3).map((ins) => (
                <div
                  key={ins.id}
                  style={{
                    minWidth: 225,
                    maxWidth: 255,
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderLeft: `4px solid ${ins.accent}`,
                    borderRadius: 11,
                    padding: '8px 11px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 6,
                    flexShrink: 0,
                    boxShadow: '0 3px 10px rgba(15, 23, 42, 0.05)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 9.5, fontWeight: 800, color: ins.accent, letterSpacing: '0.04em' }}>
                      {ins.badge}
                    </div>
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: '#0F172A', lineHeight: 1.35, marginTop: 2 }}>
                      {ins.title}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      addUser(ins.ctaLabel);
                      showTyping();
                      gecxSend(ins.utterance);
                    }}
                    style={{
                      alignSelf: 'flex-start',
                      padding: '4px 10px',
                      borderRadius: 7,
                      border: 'none',
                      background: '#002147',
                      color: '#FFFFFF',
                      fontSize: 10,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {ins.ctaLabel} →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Messages ── */}
        <div className="cp-messages" ref={msgsRef} role="log" aria-live="polite" aria-label="Chat messages">
          <div className="cp-spacer" aria-hidden="true" />
          {messages.map((msg, idx) => {
            const consBot = msg.type === 'bot' && messages[idx - 1]?.type === 'bot';

            if (msg.type === 'bot') return (
              <div key={msg.id} className={`cp-bot-bubble acn-msg-enter${consBot ? ' consecutive' : ''}`}>
                <BotText text={msg.text} />
              </div>
            );

            if (msg.type === 'bot-widget') return (
              <div key={msg.id} className="cp-bot-widget acn-msg-enter" aria-label="Bot response" />
            );

            if (msg.type === 'trip-booking-recommendations') return (
              <div key={msg.id} className="acn-msg-enter" data-combo="true">
                <TripBookingRecommendationsWidget
                  payload={msg.payload}
                  onAction={(utterance) => { addUser(utterance); showTyping(); gecxSend(utterance); }}
                />
              </div>
            );

            if (msg.type === 'user') return (
              <div key={msg.id} className="cp-user-bubble acn-msg-enter">{msg.text}</div>
            );

            if (msg.type === 'typing') return (
              <div key={msg.id} className="cp-typing" aria-label="AI is typing">
                <span /><span /><span />
              </div>
            );

            if (msg.type === 'carousel') return (
              <div key={msg.id} className="acn-msg-enter" data-combo="true">
                <AccountCarousel
                  payload={msg.payload}
                  onCta={(v) => {
                    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
                    showTyping();
                    gecxSend(v);
                  }}
                />
              </div>
            );

            if (msg.type === 'card-carousel') return (
              <div key={msg.id} className="acn-msg-enter" data-combo="true">
                <CardCarousel
                  payload={msg.payload}
                  onCta={(v) => { addUser(v); showTyping(); gecxSend(v); }}
                />
              </div>
            );

            if (msg.type === 'card-compare') return (
              <div key={msg.id} className="acn-msg-enter" data-combo="true">
                <CardCompare
                  payload={msg.payload}
                  onCta={(v) => { addUser(v); showTyping(); gecxSend(v); }}
                />
              </div>
            );

            if (msg.type === 'card-activation') return (
              <div key={msg.id} className="acn-msg-enter acn-card-activation-message" data-combo="true">
                <CardActivationWidget payload={msg.payload} />
              </div>
            );

            if (msg.type === 'insight') return (
              <div key={msg.id} className="acn-msg-enter" data-combo="true">
                <InsightCard
                  payload={msg.payload}
                  onCta={(v) => { addUser(v); showTyping(); gecxSend(v); }}
                />
              </div>
            );

            if (msg.type === 'investment-card') return (
              <div key={msg.id} className="acn-msg-enter" data-combo="true">
                <InvestmentCardWidget
                  payload={msg.payload}
                  onAction={(v) => { addUser(v); showTyping(); gecxSend(v); }}
                />
              </div>
            );

            if (msg.type === 'spending-dashboard') return (
              <div key={msg.id} className="acn-msg-enter" data-combo="true">
                <SpendingMiniWidgetsGrid
                  mode="chat"
                  payload={msg.payload}
                  customerName={customerName}
                  bills={customerBills}
                  onAction={(v) => { addUser(v); showTyping(); gecxSend(v); }}
                />
              </div>
            );

            if (msg.type === 'contextual-alert') return (
              <div key={msg.id} className="acn-msg-enter" data-combo="true">
                <ContextualProactiveAlert
                  payload={msg.payload}
                  onAction={(v) => { addUser(v); showTyping(); gecxSend(v); }}
                />
              </div>
            );

            if (msg.type === 'transactions-widget') return (
              <div key={msg.id} className="acn-msg-enter" data-combo="true">
                <RecentTransactionsWidget
                  payload={msg.payload}
                  onAction={(v) => { addUser(v); showTyping(); gecxSend(v); }}
                />
              </div>
            );

            if (msg.type === 'qr-widget') return (
              <div key={msg.id} className="acn-msg-enter" data-combo="true">
                <ChatQrCard payload={msg.payload} customer={customer} />
              </div>
            );

            if (msg.type === 'amount') return (
              <div key={msg.id} className="acn-msg-enter" data-combo="true">
                <AmountInput
                  payload={msg.payload}
                  onSubmit={(v) => {
                    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
                    addUser(v);
                    showTyping();
                    gecxSend(v);
                  }}
                />
              </div>
            );

            // ── Loans (EPP + Mortgage) ────────────────────────────────────
            if (msg.type === 'epp-carousel') return (
              <div key={msg.id} className="acn-msg-enter" data-combo="true">
                <EppCarousel
                  payload={msg.payload}
                  onCta={(v) => {
                    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
                    showTyping();
                    gecxSend(v);
                  }}
                />
              </div>
            );

            if (msg.type === 'epp-plans') return (
              <div key={msg.id} className="acn-msg-enter" data-combo="true">
                <EppPlans
                  payload={msg.payload}
                  onCta={(v) => {
                    showTyping();
                    gecxSend(v);
                  }}
                />
              </div>
            );

            if (msg.type === 'mortgage-calculator') return (
              <div key={msg.id} className="acn-msg-enter" data-combo="true">
                <MortgageCalculator
                  payload={msg.payload}
                  onCta={(v) => {
                    showTyping();
                    gecxSend(v);
                  }}
                />
              </div>
            );

            if (msg.type === 'mortgage-affordability') return (
              <div key={msg.id} className="acn-msg-enter" data-combo="true">
                <MortgageAffordability
                  payload={msg.payload}
                  onCta={(v) => {
                    showTyping();
                    gecxSend(v);
                  }}
                />
              </div>
            );

            if (msg.type === 'mortgage-rate-shelf') return (
              <div key={msg.id} className="acn-msg-enter" data-combo="true">
                <MortgageRateShelf
                  payload={msg.payload}
                  onCta={(v) => {
                    showTyping();
                    gecxSend(v);
                  }}
                />
              </div>
            );

            if (msg.type === 'mortgage-rate-table') return (
              <div key={msg.id} className="acn-msg-enter" data-combo="true">
                <MortgageRateTable payload={msg.payload} />
              </div>
            );

            if (msg.type === 'mortgage-nudge') return (
              <div key={msg.id} className="acn-msg-enter" data-combo="true">
                <MortgageNudge
                  payload={msg.payload}
                  onCta={(v) => {
                    showTyping();
                    gecxSend(v);
                  }}
                />
              </div>
            );

            if (msg.type === 'mortgage-kyc') return (
              <div key={msg.id} className="acn-msg-enter" data-combo="true">
                <MortgageKyc
                  payload={msg.payload}
                  onCta={(v) => {
                    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
                    showTyping();
                    gecxSend(v);
                  }}
                />
              </div>
            );

            if (msg.type === 'loan-preapproval') return (
              <div key={msg.id} className="acn-msg-enter" data-combo="true">
                <LoanPreapproval
                  payload={msg.payload}
                  onCta={(v) => {
                    showTyping();
                    gecxSend(v);
                  }}
                />
              </div>
            );

            if (msg.type === 'mobile-handoff') return (
              <div key={msg.id} className="acn-msg-enter" data-combo="true">
                <MobileHandoff payload={msg.payload} />
              </div>
            );

            if (msg.type === 'p2p-contacts') {
              const contacts = msg.payload?.contacts || [];
              return (
                <div key={msg.id} className="acn-msg-enter acn-p2p-selector" data-combo="true">
                  {msg.payload?.title && <div className="acn-p2p-title">{msg.payload.title}</div>}
                  {msg.payload?.subtitle && <div className="acn-p2p-subtitle">{msg.payload.subtitle}</div>}
                  <div className="acn-p2p-list">
                    {contacts.map((c, i) => (
                      <button key={i} className="acn-p2p-row"
                              onClick={() => {
                                setMessages((prev) => prev.filter((m) => m.id !== msg.id));
                                addUser(`Transfer money to ${c.username}`);
                                showTyping();
                                gecxSend(c.cta_value || `Transfer money to ${c.username}`);
                              }}>
                        <div className="acn-p2p-avatar">{(c.display_name||'?').split(' ').map(w=>w[0]).slice(0,2).join('')}</div>
                        <div className="acn-p2p-info">
                          <div className="acn-p2p-name">{c.display_name}</div>
                          <div className="acn-p2p-username">{c.username}</div>
                        </div>
                        <div className="acn-p2p-arrow">›</div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            }

            if (msg.type === 'receipt') {
              const r   = msg.payload || {};
              const amt = Number(r.amount);
              return (
                <div key={msg.id} className="acn-msg-enter acn-receipt" data-combo="true">
                  <div className="acn-receipt-check">✓</div>
                  <div className="acn-receipt-title">{r.title || 'Done'}</div>
                  {r.payee_name && (
                    <div className="acn-receipt-row"><span>To</span><span>{r.payee_name}</span></div>
                  )}
                  {!Number.isNaN(amt) && amt > 0 && (
                    <div className="acn-receipt-row">
                      <span>Amount</span>
                      <span>
                        {(r.currency || 'CAD')}{' '}
                        {amt.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                  {r.date_or_frequency && (
                    <div className="acn-receipt-row"><span>Date</span><span>{r.date_or_frequency}</span></div>
                  )}
                  {r.receipt_id && <div className="acn-receipt-ref">Ref: {r.receipt_id}</div>}
                </div>
              );
            }

            if (msg.type === 'combo') return (
              <div key={msg.id} data-combo="true">
                <ComboCard
                  heading={msg.heading}
                  subtitle={msg.subtitle}
                  actions={msg.actions}
                  onSelect={(a) => handleTileSelect(a, msg.id)}
                  compact={msg.compact === true}
                />
              </div>
            );

            return null;
          })}
          <div className="cp-spacer" aria-hidden="true" />
        </div>

        {/* ── Active form (floats above input bar) ── */}
        {activeForm && (
          <div className="cp-form-area">
            <AcnFormWidget
              key={activeForm.id}
              payload={activeForm.payload}
              onSubmit={handleFormSubmit}
            />
          </div>
        )}

        {/* ── Pop-up menu sheet (slides up above input bar) ── */}
        {activeMenu && (
          <div className="cp-menu-sheet" role="dialog" aria-label="Input options">

            {/* ── Plus menu: Camera / Photo / File ── */}
            {activeMenu === 'plus' && (
              <div className="cp-menu-plus">
                <button className="cp-menu-item" onClick={() => { cameraInputRef.current.click(); closeMenu(); }}>
                  <span className="cp-menu-item-icon">📷</span>
                  <span>Camera</span>
                </button>
                <button className="cp-menu-item" onClick={() => { galleryInputRef.current.click(); closeMenu(); }}>
                  <span className="cp-menu-item-icon">🖼️</span>
                  <span>Photo</span>
                </button>
                <button className="cp-menu-item" onClick={() => { fileInputRef.current.click(); closeMenu(); }}>
                  <span className="cp-menu-item-icon">📄</span>
                  <span>File</span>
                </button>
              </div>
            )}

            {/* ── @ menu: Canada Utility Billers + Recipients Hub ── */}
            {activeMenu === 'contact' && (() => {
              const unpaidBills = customerBills.filter(
                (b) => !b.is_paid && String(b.status || '').toLowerCase() !== 'paid',
              );
              return (
              <div className="cp-menu-contact" style={{ maxHeight: 400, display: 'flex', flexDirection: 'column' }}>
                <div className="cp-menu-tabs">
                  <button
                    className={`cp-menu-tab${contactTab === 'billers' ? ' active' : ''}`}
                    onClick={() => setContactTab('billers')}
                  >
                    ⚡ Utility Billers {unpaidBills.length > 0 ? `(${unpaidBills.length} due)` : ''}
                  </button>
                  <button
                    className={`cp-menu-tab${contactTab === 'recipients' ? ' active' : ''}`}
                    onClick={() => setContactTab('recipients')}
                  >
                    👥 Payees & QR
                  </button>
                </div>

                {/* ── BILLERS TAB ── */}
                {contactTab === 'billers' && (
                  <div className="cp-menu-billers" style={{ overflowY: 'auto', paddingBottom: 8 }}>
                    {/* 1. Customer's Upcoming Unpaid Bills from Firestore (Tallies with header badge) */}
                    {isAuthenticated && unpaidBills.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div className="cp-menu-section-label" style={{ color: '#B45309', fontWeight: 800 }}>
                          ⚡ Your Upcoming Bills ({unpaidBills.length} due · CAD $
                          {unpaidBills.reduce((s, b) => s + Number(b.amount || 0), 0).toFixed(2)} total)
                        </div>
                        {unpaidBills.map((bill) => {
                          const amt = Number(bill.amount || bill.amount_due || 0).toFixed(2);
                          const billerTitle = bill.payee_name || bill.biller_name || 'Utility Bill';
                          const days = computeDaysUntil(bill.due_date);
                          const badgeText =
                            days !== null && days <= 3
                              ? `Due in ${Math.max(0, days)}d · Urgent`
                              : days !== null
                                ? `Due in ${days}d`
                                : `Due ${bill.due_date || 'soon'}`;
                          return (
                            <div
                              key={bill.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 10,
                                padding: '8px 12px',
                                margin: '4px 8px',
                                borderRadius: 10,
                                background: '#FFFBEB',
                                border: '1px solid #FDE68A',
                              }}
                            >
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: 13, fontWeight: 800, color: '#0F172A' }}>
                                    {billerTitle}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 800,
                                      padding: '2px 6px',
                                      borderRadius: 999,
                                      background: '#FEF3C7',
                                      color: '#B45309',
                                    }}
                                  >
                                    {badgeText}
                                  </span>
                                </div>
                                <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                                  {bill.category || 'Utility'} · Acct #{bill.account_number || 'On file'} · <strong>CAD ${amt}</strong>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const msg = `Pay my ${billerTitle} bill of $${amt} now`;
                                  addUser(msg);
                                  showTyping();
                                  gecxSend(msg);
                                  closeMenu();
                                }}
                                style={{
                                  padding: '6px 11px',
                                  borderRadius: 8,
                                  border: 'none',
                                  background: '#002147',
                                  color: '#FFFFFF',
                                  fontSize: 11,
                                  fontWeight: 800,
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Pay ${amt}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* 2. Search & Category Filter for Canadian Utility Billers Directory */}
                    <div style={{ padding: '4px 10px 6px' }}>
                      <input
                        type="text"
                        placeholder="Search Canadian utility, telecom & tax billers…"
                        value={billerSearch}
                        onChange={(e) => setBillerSearch(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: 8,
                          border: '1px solid #CBD5E1',
                          fontSize: 12,
                          marginBottom: 6,
                        }}
                      />
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {['All', 'Utilities', 'Telecom', 'Tax & Gov'].map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setBillerCategory(cat)}
                            style={{
                              padding: '3px 9px',
                              borderRadius: 999,
                              fontSize: 10,
                              fontWeight: 700,
                              cursor: 'pointer',
                              border: billerCategory === cat ? '1px solid #002147' : '1px solid #CBD5E1',
                              background: billerCategory === cat ? '#002147' : '#F8FAFC',
                              color: billerCategory === cat ? '#FFFFFF' : '#475569',
                            }}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="cp-menu-section-label">Canadian Billers Directory — Select & Pay</div>
                    {CANADIAN_BILLERS.filter((b) => {
                      const matchesCat = billerCategory === 'All' || b.category === billerCategory;
                      const q = billerSearch.trim().toLowerCase();
                      const matchesSearch =
                        !q ||
                        b.name.toLowerCase().includes(q) ||
                        b.sub.toLowerCase().includes(q) ||
                        b.category.toLowerCase().includes(q);
                      return matchesCat && matchesSearch;
                    }).map((b) => {
                      const isExpanded = selectedBillerId === b.id;
                      return (
                        <div
                          key={b.id}
                          style={{
                            borderBottom: '1px solid #F1F5F9',
                            paddingBottom: isExpanded ? 8 : 0,
                          }}
                        >
                          <button
                            type="button"
                            className="cp-menu-biller-row"
                            onClick={() => {
                              setSelectedBillerId(isExpanded ? null : b.id);
                              setCustomBillerAmt('');
                            }}
                            style={{ width: '100%', justifyContent: 'space-between' }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div className="cp-menu-biller-avatar">{b.emoji}</div>
                              <div>
                                <div className="cp-menu-biller-name">{b.name}</div>
                                <div className="cp-menu-biller-sub">{b.sub}</div>
                              </div>
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#002147' }}>
                              {isExpanded ? '▴' : 'Pay ›'}
                            </span>
                          </button>

                          {isExpanded && (
                            <div
                              style={{
                                padding: '6px 12px 4px 52px',
                                display: 'flex',
                                flexWrap: 'wrap',
                                alignItems: 'center',
                                gap: 6,
                              }}
                            >
                              {(b.presets || [50, 100, 150]).map((amt) => (
                                <button
                                  key={amt}
                                  type="button"
                                  onClick={() => {
                                    const msg = `Pay $${amt} to ${b.name}`;
                                    addUser(msg);
                                    showTyping();
                                    gecxSend(msg);
                                    closeMenu();
                                  }}
                                  style={{
                                    padding: '4px 9px',
                                    borderRadius: 999,
                                    border: '1px solid #002147',
                                    background: '#F0F9FF',
                                    color: '#002147',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Pay ${amt}
                                </button>
                              ))}
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <input
                                  type="number"
                                  min="1"
                                  step="0.01"
                                  placeholder="Custom $"
                                  value={customBillerAmt}
                                  onChange={(e) => setCustomBillerAmt(e.target.value)}
                                  style={{
                                    width: 78,
                                    padding: '4px 7px',
                                    borderRadius: 6,
                                    border: '1px solid #CBD5E1',
                                    fontSize: 11,
                                  }}
                                />
                                {Number(customBillerAmt) > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const amt = Number(customBillerAmt).toFixed(2);
                                      const msg = `Pay $${amt} to ${b.name}`;
                                      addUser(msg);
                                      showTyping();
                                      gecxSend(msg);
                                      closeMenu();
                                    }}
                                    style={{
                                      padding: '4px 9px',
                                      borderRadius: 6,
                                      border: 'none',
                                      background: '#002147',
                                      color: '#FFFFFF',
                                      fontSize: 11,
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Go
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── RECIPIENTS & QR TAB ── */}
                {contactTab === 'recipients' && !isAuthenticated && (
                  <div className="cp-menu-empty">
                    <span className="cp-menu-empty-icon">🔐</span>
                    <p>Sign in to see your saved recipients, P2P contacts & ACN QR Pay code</p>
                    <button className="cp-menu-signin" onClick={() => { closeMenu(); onRequestSignIn?.(); }}>
                      Sign in
                    </button>
                  </div>
                )}

                {contactTab === 'recipients' && isAuthenticated && (
                  <div className="cp-menu-billers" style={{ overflowY: 'auto', paddingBottom: 8 }}>
                    {/* Quick Receive via QR Pay button */}
                    <div style={{ padding: '6px 10px' }}>
                      <button
                        type="button"
                        onClick={showMyQrInChat}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: 10,
                          border: '1px solid #002147',
                          background: 'linear-gradient(135deg, #002147 0%, #0F3A6D 100%)',
                          color: '#FFFFFF',
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>▦ Show My ACN QR Pay Code (Receive Money)</span>
                        <span>→</span>
                      </button>
                    </div>

                    {/* Saved Interac / Bank Beneficiaries */}
                    {beneficiaries.length > 0 && (
                      <>
                        <div className="cp-menu-section-label">Saved Payees & Interac Recipients</div>
                        {beneficiaries.map((ben) => {
                          const bName = ben.name || ben.nickname || 'Payee';
                          const initials = bName.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');
                          return (
                            <div
                              key={ben.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '6px 12px',
                                borderBottom: '1px solid #F1F5F9',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                <div className="cp-menu-biller-avatar cp-contact-avatar">{initials || '👤'}</div>
                                <div>
                                  <div className="cp-menu-biller-name">{bName}</div>
                                  <div className="cp-menu-biller-sub">
                                    {ben.bank_name || ben.channel || 'Interac e-Transfer'}
                                    {ben.email ? ` · ${ben.email}` : ''}
                                  </div>
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 4 }}>
                                {[50, 100].map((amt) => (
                                  <button
                                    key={amt}
                                    type="button"
                                    onClick={() => {
                                      const msg = `Send $${amt} to ${bName}`;
                                      addUser(msg);
                                      showTyping();
                                      gecxSend(msg);
                                      closeMenu();
                                    }}
                                    style={{
                                      padding: '4px 8px',
                                      borderRadius: 999,
                                      border: '1px solid #CBD5E1',
                                      background: '#F8FAFC',
                                      color: '#0F172A',
                                      fontSize: 10,
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    ${amt}
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const msg = `Transfer money to ${bName}`;
                                    addUser(msg);
                                    showTyping();
                                    gecxSend(msg);
                                    closeMenu();
                                  }}
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: 999,
                                    border: 'none',
                                    background: '#002147',
                                    color: '#FFFFFF',
                                    fontSize: 10,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Send
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </>
                    )}

                    {/* ACN Bank P2P @Contacts */}
                    <div className="cp-menu-section-label">ACN Bank P2P @Contacts</div>
                    {contactsLoading && (
                      <div className="cp-menu-empty">
                        <span className="cp-menu-empty-icon">⏳</span>
                        <p>Loading contacts…</p>
                      </div>
                    )}
                    {!contactsLoading && p2pContacts.map((c) => (
                      <button
                        key={c.customer_id}
                        className="cp-menu-biller-row"
                        onClick={() => {
                          const msg = `Transfer money to ${c.username}`;
                          addUser(msg);
                          showTyping();
                          gecxSend(msg);
                          closeMenu();
                        }}
                      >
                        <div className="cp-menu-biller-avatar cp-contact-avatar">
                          {c.avatar_initials}
                        </div>
                        <div>
                          <div className="cp-menu-biller-name">{c.display_name}</div>
                          <div className="cp-menu-biller-sub">{c.username}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              );
            })()}

            {/* ── AI suggestions & Proactive Insights ── */}
            {activeMenu === 'ai' && (
              <div className="cp-menu-ai">
                {isAuthenticated && proactiveInsights.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div className="cp-menu-section-label">Personalized Financial Insights</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {proactiveInsights.map((ins) => (
                        <button
                          key={ins.id}
                          type="button"
                          onClick={() => {
                            closeMenu();
                            addUser(ins.ctaLabel);
                            showTyping();
                            gecxSend(ins.utterance);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                            padding: '8px 10px',
                            borderRadius: 10,
                            border: '1px solid #E2E8F0',
                            borderLeft: `3px solid ${ins.accent}`,
                            background: '#F8FAFC',
                            textAlign: 'left',
                            cursor: 'pointer',
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 800, color: '#0F172A' }}>{ins.title}</div>
                            <div style={{ fontSize: 10, color: '#64748B' }}>{ins.detail}</div>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#002147', whiteSpace: 'nowrap' }}>
                            {ins.ctaLabel} →
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="cp-menu-section-label">Quick actions</div>
                <div className="cp-ai-pills">
                  {AI_SUGGESTIONS.map((s, i) => (
                    <button key={i} className="cp-ai-pill"
                            onClick={() => {
                              closeMenu();
                              if (s.utterance === SIGN_IN_SENTINEL) {
                                addUser('Sign in');
                                onRequestSignIn?.();
                                return;
                              }
                              addUser(s.label); showTyping(); gecxSend(s.utterance);
                            }}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}

        {/* ── Input bar ── */}
        {/* Hidden file inputs */}
        <input ref={galleryInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} />
        <input ref={cameraInputRef}  type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileUpload} />
        <input ref={fileInputRef}    type="file" style={{ display: 'none' }} onChange={handleFileUpload} />

        <div className="cp-input-bar">

          {/* + Attach */}
          <button className={`cp-icon-input-btn${activeMenu === 'plus' ? ' active' : ''}`}
                  onClick={() => toggleMenu('plus')} title="Add attachment" aria-label="Add attachment">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>

          {/* Gallery */}
          <button className="cp-icon-input-btn" onClick={() => { galleryInputRef.current.click(); closeMenu(); }}
                  title="Gallery" aria-label="Choose from gallery">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </button>

          {/* @ Recipients / Billers */}
          <button className={`cp-icon-input-btn cp-icon-input-btn--at${activeMenu === 'contact' ? ' active' : ''}`}
                  onClick={() => toggleMenu('contact')} title="Recipients & Billers" aria-label="Recipients and Billers">
            @
          </button>

          {/* ✦ AI suggestions */}
          <button className={`cp-icon-input-btn${activeMenu === 'ai' ? ' active' : ''}`}
                  onClick={() => toggleMenu('ai')} title="AI Suggestions" aria-label="Show AI suggestions">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74L12 2z"/>
              <path d="M5 3l.9 2.7L8.6 6.5l-2.7.9L5 10l-.9-2.7L1.4 6.5l2.7-.9L5 3z" opacity=".6"/>
            </svg>
          </button>

          {/* 🔊 Bot-speaks toggle (mute / unmute ElevenLabs TTS on every reply) */}
          <button
            className={`cp-icon-input-btn cp-speaker-btn${ttsEnabled ? ' active' : ''}${ttsPlaying && ttsEnabled ? ' speaking' : ''}`}
            onClick={toggleTTS}
            title={ttsEnabled ? (ttsPlaying ? 'AI speaking… (click to mute)' : 'Bot speaks replies — click to mute') : 'Bot is muted — click to enable voice'}
            aria-label={ttsEnabled ? 'Mute bot voice' : 'Enable bot voice'}
            aria-pressed={ttsEnabled}
          >
            {ttsEnabled ? (
              /* Speaker on — with sound waves */
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
              </svg>
            ) : (
              /* Speaker muted — with slash */
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <line x1="23" y1="9"  x2="17" y2="15"/>
                <line x1="17" y1="9"  x2="23" y2="15"/>
              </svg>
            )}
          </button>

          <input
            ref={inputRef}
            className="cp-text-input"
            type="text"
            placeholder={voiceActive ? 'Listening…' : 'Type a message…'}
            autoComplete="off"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            onFocus={closeMenu}
            disabled={isResponding}
            aria-label="Message input"
          />

          {/* 🎙 Mic / voice conversation toggle */}
          <button
            className={`cp-icon-input-btn cp-mic-btn${voiceMode ? ` voice-mode${ttsPlaying ? ' speaking' : ''}` : ''}${voiceActive ? ' recording' : ''}`}
            onClick={toggleVoice}
            title={voiceMode ? (ttsPlaying ? 'AI speaking…' : voiceActive ? 'Listening… (click to stop)' : 'Voice mode on — click to stop') : 'Start voice conversation'}
            aria-label={voiceMode ? 'Stop voice conversation' : 'Start voice conversation'}
            disabled={isResponding && !voiceMode}
          >
            {ttsPlaying ? (
              /* Speaker wave icon while TTS plays */
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              </svg>
            ) : voiceActive ? (
              /* Stop / square icon while listening */
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <rect x="4" y="4" width="16" height="16" rx="2"/>
              </svg>
            ) : (
              /* Microphone icon */
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="2" width="6" height="12" rx="3"/>
                <path d="M5 10a7 7 0 0 0 14 0"/>
                <line x1="12" y1="19" x2="12" y2="22"/>
                <line x1="8"  y1="22" x2="16" y2="22"/>
              </svg>
            )}
          </button>

          <button
            className={`cp-send-btn${isResponding ? ' disabled' : ''}`}
            onClick={sendMessage}
            disabled={isResponding}
            aria-label="Send message"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff"
                 strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </aside>
    </>
  );
}
