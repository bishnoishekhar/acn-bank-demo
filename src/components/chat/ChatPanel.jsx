import { useState, useEffect, useRef, useCallback } from 'react';
import { initGecx, resetGecx, gecxSend, setResponseHandler, clearGecxDone, softResetGecx, clearGecxSession } from '../gecx';
import { useAuth } from '../../context/AuthContext';
import ComboCard      from '../ComboCard';
import AcnFormWidget  from '../AcnFormWidget';
import AccountCarousel from '../AccountCarousel';
import InsightCard    from '../InsightCard';
import AmountInput    from '../AmountInput';
import InlineAuthCard from '../auth/InlineAuthCard';

// ── Module-level helpers ───────────────────────────────────────────────────────

function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/```[a-z]*\n[\s\S]*?\n```/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#{1,3}\s+/gm, '')
    .trim();
}

function BotText({ text }) {
  const lines = text.split('\n').filter(Boolean);
  if (lines.length <= 1) return <>{text}</>;
  return (
    <>
      {lines.map((line, i) => (
        <span key={i} style={{ display: 'block', marginBottom: i < lines.length - 1 ? '6px' : 0 }}>
          {line}
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

// Hoisted so both processOutputs and the acn-session-data handler can share them.
function resolvePayloadName(p) {
  if (!p || typeof p !== 'object') return null;
  if (p.name) return p.name;
  if (p.type === 'quick_actions') return 'quick_actions';
  if (Array.isArray(p.actions) && p.actions.length > 0 && p.actions[0]?.utterance !== undefined)
    return 'quick_actions';
  if (p.insight_type != null || p.headline != null) return 'acn-insight-card';
  if (Array.isArray(p.payments) || Array.isArray(p.payees)) return 'acn-payment-carousel';
  if (Array.isArray(p.fields) && p.fields.length > 0) return 'acn-form-input';
  if (p.receipt_id != null || p.reference_number != null) return 'acn-payment-receipt';
  if (p.min_amount != null || p.max_amount != null) return 'acn-amount-input';
  return null;
}

function isKnownPayload(p) {
  const n = resolvePayloadName(p);
  return (
    n === 'quick_actions'       || n === 'acn-form-input'      ||
    n === 'acn-payment-carousel'|| n === 'acn-payee-selector'  ||
    n === 'acn-payment-receipt' || n === 'acn-insight-card'    ||
    n === 'acn-amount-input'
  );
}

// Phrases that signal the CES agent needs the user to authenticate (Feature 3).
const AUTH_TRIGGER_PHRASES = [
  'verify your identity', 'please sign in', 'authentication required',
  'need to verify',       'sign in to continue', 'authenticate yourself',
  'to access your account', 'please log in',
];

// ── Static data ───────────────────────────────────────────────────────────────

const CANADIAN_BILLERS = [
  { id: 'rogers',       name: 'Rogers',                  sub: 'Telecommunications', emoji: '📡' },
  { id: 'bell',         name: 'Bell Canada',             sub: 'Telecommunications', emoji: '🔔' },
  { id: 'telus',        name: 'TELUS',                   sub: 'Telecommunications', emoji: '📱' },
  { id: 'hydro-one',    name: 'Hydro One',               sub: 'Bill Payment',       emoji: '⚡' },
  { id: 'toronto-h',   name: 'Toronto Hydro',           sub: 'Bill Payment',       emoji: '💡' },
  { id: 'enbridge',     name: 'Enbridge Gas',            sub: 'Bill Payment',       emoji: '🔥' },
  { id: 'cra',          name: 'Canada Revenue Agency',   sub: 'Government',         emoji: '🏛️' },
  { id: 'shaw',         name: 'Shaw / Freedom',          sub: 'Internet & TV',      emoji: '📺' },
];

const AI_SUGGESTIONS = [
  { label: '💰 Check balance',       utterance: 'Check my balance' },
  { label: '💸 Send money',          utterance: 'Transfer money' },
  { label: '📊 Recent transactions', utterance: 'Show my recent transactions' },
  { label: '💳 Apply for a card',    utterance: 'I want to apply for a credit card' },
  { label: '🔔 Report fraud',        utterance: 'Report a fraudulent transaction' },
  { label: '💡 What can you do?',    utterance: 'What can you help me with?' },
];

// ── ChatPanel ─────────────────────────────────────────────────────────────────

export default function ChatPanel({ isOpen, onClose, onReset, onExposeReset, intent, onRequestSignIn, resetSignal = 0 }) {
  const { authState, customerName } = useAuth();

  const [messages,     setMessages]     = useState([]);
  const [inputVal,     setInputVal]     = useState('');
  const [activeForm,   setActiveForm]   = useState(null);
  const [voiceActive,  setVoiceActive]  = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const [activeMenu,   setActiveMenu]   = useState(null); // 'plus' | 'contact' | 'ai'
  const [contactTab,   setContactTab]   = useState('recipients');

  // ── sessionStarted as a REF (not state) ───────────────────────────────────
  // Must be a ref so the resetSignal watcher (Effect A) and the isOpen effect
  // (Effect B) share the same mutable value within the same render cycle.
  // If it were useState, the isOpen effect would read the PRE-update value even
  // after Effect A called setSessionStarted(false), causing it to skip initGecx.
  const sessionStartedRef = useRef(false);

  const msgsRef        = useRef(null);
  const inputRef       = useRef(null);
  const recognitionRef = useRef(null);
  const galleryInputRef = useRef(null);
  const cameraInputRef  = useRef(null);
  const fileInputRef    = useRef(null);
  const respondingTimer = useRef(null);
  const finalTimer      = useRef(null);
  const pendingHeading  = useRef(null);
  const pendingSubtitle = useRef(null);
  const comboCreated    = useRef(false);
  const lastProcessed   = useRef({ time: 0, sig: '' });

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

  // ── Message helpers ────────────────────────────────────────────────────────
  const addBot = useCallback((text) => {
    const clean = stripMarkdown(text);
    if (!clean) return;
    const lines = clean.split('\n').filter(Boolean);
    if (!pendingHeading.current) {
      pendingHeading.current  = lines[0];
      if (lines.length > 1) pendingSubtitle.current = lines.slice(1).join(' ');
    }
    setMessages((prev) => [...prev, { type: 'bot', text: clean, id: uid() }]);
  }, []);

  const addUser = useCallback((text) => {
    setMessages((prev) => [...prev, { type: 'user', text, id: uid() }]);
  }, []);

  const showTyping = useCallback(() => {
    pendingHeading.current  = null;
    pendingSubtitle.current = null;
    comboCreated.current    = false;
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
  }, []);

  const removeTyping = useCallback(() => {
    if (respondingTimer.current) clearTimeout(respondingTimer.current);
    if (finalTimer.current)      clearTimeout(finalTimer.current);
    setIsResponding(false);
    setMessages((prev) => prev.filter((m) => m.type !== 'typing'));
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
  const showCombo = useCallback((actions, summary, forcedHeading, forcedSubtitle) => {
    const pending    = pendingHeading.current;
    const pendingSub = pendingSubtitle.current;
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
        return [...prev, { type: 'combo', heading: forcedHeading, subtitle: forcedSubtitle, actions, id: uid(), compact: isFH(forcedHeading) }];
      }
      if (!pending) {
        const last = prev[prev.length - 1];
        if (last?.type === 'combo') {
          const merged = { ...last, actions: mergeActions(last.actions, actions) };
          if (!merged.heading && summary) merged.heading = summary;
          return [...prev.slice(0, -1), merged];
        }
      }
      if (pending) {
        const li = [...prev].reverse().findIndex(
          (m) => m.type === 'bot' && m.text.startsWith(pending),
        );
        if (li !== -1) {
          const ri = prev.length - 1 - li;
          return [
            ...prev.filter((_, i) => i !== ri),
            { type: 'combo', heading: pending, subtitle: pendingSub, actions, id: uid(), compact: isFH(pending) },
          ];
        }
        return [...prev, { type: 'combo', heading: pending, subtitle: pendingSub, actions, id: uid(), compact: isFH(pending) }];
      }
      const li = [...prev].reverse().findIndex((m) => m.type === 'bot');
      if (li !== -1) {
        const ri     = prev.length - 1 - li;
        const h      = prev[ri].text;
        const hLines = h.split('\n').filter(Boolean);
        return [
          ...prev.filter((_, i) => i !== ri),
          { type: 'combo', heading: hLines[0], subtitle: hLines.slice(1).join(' ') || undefined, actions, id: uid(), compact: isFH(hLines[0]) },
        ];
      }
      return [...prev, { type: 'combo', heading: summary || undefined, actions, id: uid(), compact: false }];
    });
  }, []);

  // ── processOutputs ─────────────────────────────────────────────────────────
  const processOutputs = useCallback((outputs) => {
    const now = Date.now();
    const sig = JSON.stringify(outputs);
    if (now - lastProcessed.current.time < 800 && sig === lastProcessed.current.sig) return;
    lastProcessed.current = { time: now, sig };

    const hasVisible = outputs.some((o) => {
      if (o.payload) return isKnownPayload(o.payload);
      if (!o.text) return false;
      const t = o.text;
      if (t.includes('narration_checkpoint')) return false;
      if (t.includes('tool_code:'))
        return t.includes('default_api.quick_actions') || t.includes('quick_actions(');
      return stripMarkdown(t).length > 0;
    });
    if (!hasVisible) return;

    const hasFinalWidget = outputs.some((o) => o.payload && isKnownPayload(o.payload));
    const hasOnlyText    = outputs.every((o) => o.text && !o.payload);

    if (hasFinalWidget || hasOnlyText) removeTyping();
    else if (outputs.length > 0) clearTypingBubble();

    // Feature 3: detect auth-trigger phrases and show inline auth card
    if (authState === 'guest') {
      const needsAuth = outputs.some(
        (o) => o.text && AUTH_TRIGGER_PHRASES.some((ph) => o.text.toLowerCase().includes(ph)),
      );
      if (needsAuth) {
        setMessages((prev) => [
          ...prev.filter((m) => m.type !== 'typing'),
          { type: 'auth-prompt', id: uid() },
        ]);
        setIsResponding(false);
        return;
      }
    }

    // Pass 1: text outputs
    outputs.forEach((output) => {
      if (!output.text) return;
      const text = output.text;

      const tc = parseToolCode(text);
      if (tc) {
        const sl = extractSayLines(text);
        if (sl.length >= 2) {
          comboCreated.current = true;
          setMessages((prev) => [
            ...prev,
            { type: 'combo', heading: sl[0], subtitle: sl[1], actions: tc.actions, id: uid(), compact: isFH(sl[0]) },
          ]);
        } else if (sl.length === 1) {
          comboCreated.current = true;
          setMessages((prev) => [
            ...prev,
            { type: 'combo', heading: sl[0], actions: tc.actions, id: uid(), compact: isFH(sl[0]) },
          ]);
        } else {
          showCombo(tc.actions, tc.summary);
        }
        return;
      }

      if (text.includes('quick_actions') && text.includes('content:') && text.includes('utterance:')) {
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
      addBot(text);
    });

    // Pass 2: payload widgets
    outputs.forEach((output) => {
      if (!output.payload) return;
      const p     = output.payload;
      const pname = resolvePayloadName(p);

      if (pname === 'quick_actions' && p.actions) showCombo(p.actions, p.summary);

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

      if (pname === 'acn-amount-input')
        setMessages((prev) => [...prev, { type: 'amount', payload: p, id: uid() }]);

      if (pname === 'acn-payment-receipt')
        setMessages((prev) => [...prev, { type: 'receipt', payload: p, id: uid() }]);
    });
  }, [authState, removeTyping, clearTypingBubble, addBot, showCombo, parseToolCode, extractSayLines]);

  const processOutputsRef = useRef(processOutputs);
  useEffect(() => { processOutputsRef.current = processOutputs; }, [processOutputs]);

  // ── On mount: ensure _initDone is false (guards against hot-reload in dev). ─
  useEffect(() => { clearGecxDone(); }, []);

  // ── External reset signal (e.g. sign-out from App) ─────────────────────────
  // resetSignal increments → wipe React state + soft-reset GECX session.
  // We keep <chat-messenger> in the DOM (never remount) so the SDK binding
  // to the web component element stays intact.
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
    if (respondingTimer.current) clearTimeout(respondingTimer.current);
    if (finalTimer.current)      clearTimeout(finalTimer.current);

    // Kill the old CES session token; _initDone → false so the next open
    // triggers a fresh initGecx() / registerContext() as a guest.
    softResetGecx();
  }, [resetSignal]);

  // ── GECX native event handler ──────────────────────────────────────────────
  useEffect(() => {
    setResponseHandler((outs) => processOutputsRef.current(outs));
  }, []);

  // ── acn-session-data (full session replay from the index.html interceptor) ─
  useEffect(() => {
    const handler = (e) => {
      const data = e.detail;
      console.log('[ACN] acn-session-data fired, messages:', data?.messages?.length ?? 'none');
      if (!data?.messages) return;
      const outputs = [];

      const lastUserIdx = data.messages.reduce(
        (acc, msg, i) => (msg.role === 'user' ? i : acc), -1,
      );
      const turnMessages = data.messages.slice(lastUserIdx + 1);

      // Pass 1: build tool registry and widget order
      const toolMeta         = {};
      const widgetOrder      = [];
      const quickActionQueue = [];

      for (const msg of turnMessages) {
        if (msg.role === 'user') continue;
        for (const chunk of msg.chunks || []) {
          const tc = chunk.toolCall;
          const tr = chunk.toolResponse;
          if (tc?.id) {
            if (!toolMeta[tc.id]) toolMeta[tc.id] = {};
            if (tc.displayName)    toolMeta[tc.id].name    = tc.displayName;
            if (tc.args?.summary)  toolMeta[tc.id].summary = tc.args.summary;
            if (tc.args?.payload) {
              toolMeta[tc.id].argsPayload = tc.args.payload;
              widgetOrder.push(tc.id);
            } else if (tc.args?.actions) {
              quickActionQueue.push({
                actions: tc.args.actions,
                summary: tc.args.summary,
                name:    tc.displayName,
              });
            }
          }
          if (tr?.id) {
            if (!toolMeta[tr.id]) toolMeta[tr.id] = {};
            if (tr.displayName)       toolMeta[tr.id].name    = tr.displayName;
            if (tr.response?.summary) toolMeta[tr.id].summary = tr.response.summary;
          }
        }
      }

      // Pass 2: text and annotated chunk.payloads in document order
      let payloadIdx = 0;
      for (const msg of turnMessages) {
        if (msg.role === 'user') continue;
        for (const chunk of msg.chunks || []) {
          if (chunk.text) outputs.push({ text: chunk.text });
          if (chunk.payload) {
            if (!isKnownPayload(chunk.payload)) continue;
            const meta      = toolMeta[widgetOrder[payloadIdx]];
            const withName  = meta?.name ? { ...chunk.payload, name: meta.name } : chunk.payload;
            const annotated = meta?.summary && !withName.summary
              ? { ...withName, summary: meta.summary }
              : withName;
            outputs.push({ payload: annotated });
            payloadIdx++;
          }
        }
      }

      // Pass 3: widgetOrder entries whose tool returned no chunk.payload
      for (let i = payloadIdx; i < widgetOrder.length; i++) {
        const meta = toolMeta[widgetOrder[i]];
        if (meta?.argsPayload) {
          const withName  = meta?.name ? { ...meta.argsPayload, name: meta.name } : meta.argsPayload;
          const annotated = meta.summary && !withName.summary
            ? { ...withName, summary: meta.summary }
            : withName;
          outputs.push({ payload: annotated });
        }
      }

      // Pass 4: quick_actions (args-only, never in chunk.payloads)
      for (const qa of quickActionQueue) {
        outputs.push({
          payload: qa.name
            ? { actions: qa.actions, summary: qa.summary, name: qa.name }
            : { actions: qa.actions, summary: qa.summary },
        });
      }

      if (outputs.length) {
        // Always let acn-session-data override a partial earlier GECX native event
        lastProcessed.current = { time: 0, sig: '' };
        processOutputsRef.current(outputs);
      }
    };

    window.addEventListener('acn-session-data', handler);
    return () => window.removeEventListener('acn-session-data', handler);
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // ── Open / intent effect ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    // Always init GECX on first open (idempotent — guarded by _initDone flag).
    // Previously this was skipped when `intent` was set, causing gecxSend() to
    // fire into an uninitialised session and produce no response.
    if (!sessionStartedRef.current) {
      sessionStartedRef.current = true;
      showTyping();   // show typing indicator while welcome / first response loads

      // ── Clear GECX session cache then register ──────────────────────────
      // The GECX SDK stores a session token in sessionStorage. On a page reload
      // (or after a prior guest session) it finds that token and silently skips
      // the welcome runSession, leaving the chat blank.
      //
      // clearGecxSession() removes all sessionStorage keys not owned by our app
      // (everything except 'acn_*'). With no cached token, the SDK fires a fresh
      // runSession welcome on registerContext(). No delay needed — this is a
      // synchronous sessionStorage operation.
      clearGecxSession();
      initGecx();
    }

    if (intent) {
      // Send the intent as a user message after a short delay so GECX has time
      // to complete its initial session setup (runSession welcome round-trip).
      setTimeout(() => { addUser(intent); showTyping(); gecxSend(intent); }, 1100);
    }

    setTimeout(() => inputRef.current?.focus(), 300);
  }, [isOpen]); // eslint-disable-line

  // ── Interaction handlers ───────────────────────────────────────────────────
  const handleTileSelect = useCallback((action, comboId) => {
    if (action.isSignIn) { onRequestSignIn?.(); return; }
    setMessages((prev) => prev.filter((m) => m.id !== comboId));
    addUser(action.content || action.utterance);
    showTyping();
    gecxSend(action.utterance || action.content);
    setTimeout(() => {
      if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
    }, 50);
  }, [addUser, showTyping, onRequestSignIn]);

  const handleFormSubmit = useCallback((value, displayText) => {
    setActiveForm(null);
    addUser(displayText || value.split(':').slice(1).join(':') || value);
    showTyping();
    gecxSend(value);
  }, [addUser, showTyping]);

  const sendMessage = useCallback(() => {
    const text = inputVal.trim();
    if (!text || isResponding) return;
    setInputVal('');
    addUser(text);
    showTyping();
    gecxSend(text);
  }, [inputVal, addUser, showTyping, isResponding]);

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

  const toggleVoice = useCallback(() => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      alert('Voice input not supported in this browser.');
      return;
    }
    if (voiceActive) { recognitionRef.current?.stop(); setVoiceActive(false); return; }
    const SR  = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang           = 'en-CA';
    rec.interimResults = false;
    rec.onresult = (e) => { setInputVal(e.results[0][0].transcript); setTimeout(sendMessage, 100); };
    rec.onend    = ()  => setVoiceActive(false);
    rec.start();
    recognitionRef.current = rec;
    setVoiceActive(true);
  }, [voiceActive, sendMessage]);

  const handleFileUpload = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    addUser('📎 ' + file.name);
    showTyping();
    gecxSend('I am uploading a file: ' + file.name);
    e.target.value = '';
  }, [addUser, showTyping]);

  const closeMenu  = useCallback(() => setActiveMenu(null), []);
  const toggleMenu = useCallback((menu) => setActiveMenu((prev) => prev === menu ? null : menu), []);

  // Auth success from inline card — clear prompt, send re-auth message to CES
  const handleAuthSuccess = useCallback((authPromptId, result) => {
    setMessages((prev) => [
      ...prev.filter((m) => m.id !== authPromptId),
      { type: 'bot', text: `Welcome, ${result.firstName}! Let me pull up your accounts now.`, id: uid() },
    ]);
    showTyping();
    // TODO (GAP #3): Replace with the proper CES session-handoff mechanism once known
    gecxSend('I am now authenticated as customer ' + result.customerId);
  }, [showTyping]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* GECX bridge — always in DOM, off-screen with real dimensions.
          IMPORTANT: do NOT use visibility:hidden + height/width:0 here.
          The GECX SDK checks element size before firing runSession; a
          zero-size / hidden element prevents the welcome event from firing.
          Instead we park it far off-screen so it has real layout dimensions
          but is never visible to the user. */}
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
          id="gecx-messenger"
          url-allowlist="*"
          language-code="en"
          max-query-length="-1"
          style={{ display: 'block', width: '400px', height: '600px' }}
        >
          <chat-messenger-container chat-title="ACN Bank AI">
            <chat-reset-session-button slot="titlebar-actions" title-text="New conversation" />
          </chat-messenger-container>
        </chat-messenger>
      </div>

      {/* Side panel — no internal header; controls live in the top nav */}
      <aside className={`chat-panel${isOpen ? ' open' : ''}`} aria-label="ACN Bank AI assistant">

        {/* ── Messages ── */}
        <div className="cp-messages" ref={msgsRef} role="log" aria-live="polite" aria-label="Chat messages">
          {/* Top spacer: absorbs empty space to center content when few messages exist.
              Shrinks to 0 automatically when the list overflows (scroll mode). */}
          <div className="cp-spacer" aria-hidden="true" />
          {messages.map((msg, idx) => {
            const consBot = msg.type === 'bot' && messages[idx - 1]?.type === 'bot';

            if (msg.type === 'bot') return (
              <div key={msg.id} className={`cp-bot-bubble acn-msg-enter${consBot ? ' consecutive' : ''}`}>
                <BotText text={msg.text} />
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

            // Feature 3: inline auth prompt
            if (msg.type === 'auth-prompt') return (
              <InlineAuthCard
                key={msg.id}
                onSuccess={(result) => handleAuthSuccess(msg.id, result)}
                onDismiss={() => setMessages((prev) => prev.filter((m) => m.id !== msg.id))}
              />
            );

            if (msg.type === 'carousel') return (
              <div key={msg.id} className="acn-msg-enter" data-combo="true">
                <AccountCarousel
                  payload={msg.payload}
                  onCta={(v) => { showTyping(); gecxSend(v); }}
                />
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

            if (msg.type === 'amount') return (
              <div key={msg.id} className="acn-msg-enter" data-combo="true">
                <AmountInput
                  payload={msg.payload}
                  onSubmit={(v) => { addUser(v); showTyping(); gecxSend(v); }}
                />
              </div>
            );

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
          {/* Bottom spacer: mirrors the top spacer so content stays vertically centered */}
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

            {/* ── @ menu: Recipients + Billers ── */}
            {activeMenu === 'contact' && (
              <div className="cp-menu-contact">
                <div className="cp-menu-tabs">
                  <button className={`cp-menu-tab${contactTab === 'recipients' ? ' active' : ''}`}
                          onClick={() => setContactTab('recipients')}>Recipients</button>
                  <button className={`cp-menu-tab${contactTab === 'billers' ? ' active' : ''}`}
                          onClick={() => setContactTab('billers')}>Billers</button>
                </div>

                {contactTab === 'recipients' && (
                  <div className="cp-menu-empty">
                    <span className="cp-menu-empty-icon">👥</span>
                    <p>Contact list coming soon</p>
                  </div>
                )}

                {contactTab === 'billers' && (
                  <div className="cp-menu-billers">
                    <div className="cp-menu-section-label">Popular billers in Canada</div>
                    {CANADIAN_BILLERS.map((b) => (
                      <button key={b.id} className="cp-menu-biller-row"
                              onClick={() => { addUser(`Pay ${b.name}`); showTyping(); gecxSend(`I want to pay my ${b.name} bill`); closeMenu(); }}>
                        <div className="cp-menu-biller-avatar">{b.emoji}</div>
                        <div>
                          <div className="cp-menu-biller-name">{b.name}</div>
                          <div className="cp-menu-biller-sub">{b.sub}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── AI suggestions ── */}
            {activeMenu === 'ai' && (
              <div className="cp-menu-ai">
                <div className="cp-menu-section-label">Quick actions</div>
                <div className="cp-ai-pills">
                  {AI_SUGGESTIONS.map((s, i) => (
                    <button key={i} className="cp-ai-pill"
                            onClick={() => { addUser(s.label); showTyping(); gecxSend(s.utterance); closeMenu(); }}>
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

          <input
            ref={inputRef}
            className="cp-text-input"
            type="text"
            placeholder="Type a message…"
            autoComplete="off"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            onFocus={closeMenu}
            disabled={isResponding}
            aria-label="Message input"
          />

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
