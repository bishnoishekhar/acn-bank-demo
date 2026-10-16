/* ── GECX bidi voice bridge ────────────────────────────────────────────────────
   Live, open-mic voice against the CES deployment, spoken in the voice
   configured on the app (app.json audioProcessingConfig → Iapetus, en-CA)
   rather than the browser's Web Speech API.

   Three facts about CES drive everything in this file. Each one fails silently
   if you get it wrong, which is why they are written down.

   1. AUDIO ONLY EXISTS ON BIDI.
      Unary `runSession` REJECTS `outputAudioConfig` — you get a normal text
      reply and no audio, with no error. There is no way to make the
      request/response path speak. A live BidiRunSession stream is the only
      source of agent audio.

   2. THE SDK OWNS PLAYBACK, AND IT WORKS WHILE HIDDEN.
      Once the session is open the SDK decodes and plays the reply itself, even
      though our <chat-messenger> is parked off-screen. Do NOT also play audio
      here or every reply is doubled. (Relevant if you are ever tempted: GECX
      sends raw headerless 16-bit LE mono PCM at 24 kHz, which decodeAudioData
      rejects and `new Audio('data:audio/ogg;base64,…')` silently ignores.)

   3. BIDI IS A DIFFERENT TRANSPORT, AND THE FETCH INTERCEPTOR GOES BLIND.
      Bidi issues no `runSession` fetch and never dispatches
      `chat-messenger-response-received`. Everything it receives is funnelled
      into `messenger.addUtterance(...)`. So gecx.js's interceptor sees nothing
      during a voice session — that is how you end up with an agent that talks
      but renders no widgets.

      The one place both transports converge is the message-consumer registry:
          addUtterance(u) → this.bc.forEach(c => c.addMessages([u]))
      `registerMessageConsumer` is the SDK's public hook into it, so a consumer
      sees every utterance regardless of transport. That is the widget bridge.

   STARTING THE SESSION
   The supported way in is the SDK's own microphone button, not
   `presenter.toggleBidiSession(true)`. The button runs the full negotiation and
   is the path the SDK itself maintains. It lives inside nested shadow roots, so
   finding it needs a deep query, and it must not be clicked until the brokered
   access token has arrived — right after page load it is usually still in
   flight, and clicking early fails quietly.
── */

const TAG = '[ACN BIDI]';
const AUTH_WAIT_MS = 15000;

/* The consumer and the element it is registered against.

   The SDK keys consumers in a Map by object identity, so handing it a fresh
   object registers a SECOND consumer rather than replacing the first — and then
   every utterance is delivered twice, which shows up as the whole conversation
   duplicating itself bubble for bubble. connectBidi() runs on each reconnect and
   from the floating widget as well as the panel, so that is easy to hit.

   Tracking the element too means a genuine remount (sign-out, new session) still
   re-registers against the new element, while a reconnect against the same
   element does not. */
let _consumer = null;
let _consumerElement = null;
let _listenersInstalled = false;
let _listenersElement = null;
let _bidiActive = false;

// Utterances already forwarded, so a repeated addMessages for the same
// utteranceId cannot double-render a turn.
const _seenUtterances = new Set();

/* How the SDK builds a voice reply (chat-messenger.js, the bidi TEXT handler):
   the FIRST text chunk of a turn is addUtterance({utteranceId, text}); every
   LATER chunk of the same turn — for example the sentence spoken after a tool
   call such as the identity check — is updateUtterance() on the SAME utteranceId
   with the CUMULATIVE text. The id only changes after turnCompleted or a widget.

   So a reply is complete only once its updates have stopped. These track, per
   utteranceId, the text already shown and the latest cumulative text, so the
   remainder can be shown as soon as the stream goes quiet. */
const UPDATE_SETTLE_MS = 600;
const _shownText = new Map(); // utteranceId -> text already forwarded to the chat
const _latestText = new Map(); // utteranceId -> latest cumulative text from the SDK
const _settleTimers = new Map(); // utteranceId -> pending flush timer

const SENTENCE_END = /[.!?…]["')\]]?\s*$/;

/* True from the moment we hand over the mic until the caller explicitly closes
   the session.

   This is deliberately NOT the same as _bidiActive. The SDK dispatches
   disconnect-bidi during normal startup — while the browser's microphone prompt
   is pending, and between a failed first attempt and the retry that succeeds.
   The console shows "disconnected, disconnected, connected" on a perfectly
   healthy session.

   Gating the bridge on _bidiActive therefore drops whatever the customer says
   inside those windows: they speak, and no bubble appears. Gating on intent
   instead keeps the bridge live across the gaps. */
let _sessionIntended = false;

let _onOutputs = null;
let _onUserTranscript = null;
let _onAgentText = null;
let _onStateChange = null;

// processOutputs dedupes on turnIndex, so bidi utterances need one or distinct
// turns collapse into each other.
let _turnIndex = 10000;

/* Text we sent on the customer's behalf that must not be drawn as their
   message — currently just the greeting kickoff.

   This is matched on CONTENT, with an expiry, and deliberately not a bare
   boolean. A boolean assumes CES always echoes the kickoff back as a user
   utterance; when it does not, the flag survives and eats the customer's
   first real sentence instead. That is exactly what happened — the opening
   "I want to loan a mortgage" never appeared, while the agent answered it. */
let _pendingSilentText = '';
let _pendingSilentUntil = 0;

/* ── Rejecting the agent's own voice ──────────────────────────────────────────
   On speakers (not headphones) the microphone hears the agent and the platform
   transcribes it as the customer. It arrives as a perfectly ordinary final user
   utterance — that is where stray bubbles like "around if I cannot" come from:
   a fragment of the agent's own sentence, fed back in.

   Browser echo cancellation is already on by default and does not fully handle
   loudspeaker playback, and barge-in makes it worse by design: any sound,
   including the agent's, is treated as the customer interrupting.

   So reject on CONTENT rather than by muting the mic while the agent talks.
   Muting would be simpler but would kill real barge-in, which is the thing that
   makes the conversation feel live. Matching text only drops audio that the
   agent demonstrably just said. */
const AGENT_ECHO_MEMORY = 3;
const AGENT_ECHO_WINDOW_MS = 6000;
const agentSpeech = []; // [{ text, at }]

function noteAgentSpeech(text) {
  if (!text?.trim()) return;
  agentSpeech.push({ text: normaliseForMatch(text), at: Date.now() });
  while (agentSpeech.length > AGENT_ECHO_MEMORY) agentSpeech.shift();
}

function normaliseForMatch(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isAgentEcho(text) {
  const candidate = normaliseForMatch(text);
  if (!candidate) return false;

  // Long utterances are the customer talking. Echo fragments are short, and a
  // genuine long sentence that happens to quote the agent is still worth
  // showing.
  const words = candidate.split(' ');
  if (words.length > 12) return false;

  const now = Date.now();
  return agentSpeech.some(({ text: spoken, at }) => {
    if (now - at > AGENT_ECHO_WINDOW_MS) return false;
    if (spoken.includes(candidate)) return true;
    // Partial capture: most of the fragment's words appear in what the agent
    // just said, in a run of at least three (so "yes" or "ok" stay through).
    if (words.length < 3) return false;
    const matched = words.filter((w) => spoken.includes(w)).length;
    return matched / words.length >= 0.8;
  });
}

function isSilentEcho(text) {
  if (!_pendingSilentText) return false;
  if (Date.now() > _pendingSilentUntil) {
    // Never echoed. Stop waiting, so the next real utterance is safe.
    _pendingSilentText = '';
    return false;
  }
  const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  if (norm(text) === norm(_pendingSilentText)) {
    _pendingSilentText = '';
    return true;
  }
  // Something the customer actually said arrived first — the kickoff is not
  // coming back. Clear and let this through.
  _pendingSilentText = '';
  return false;
}

export function isBidiActive() {
  return _bidiActive;
}

export function setBidiHandlers({ onOutputs, onUserTranscript, onAgentText, onStateChange } = {}) {
  if (onOutputs) _onOutputs = onOutputs;
  if (onUserTranscript) _onUserTranscript = onUserTranscript;
  if (onAgentText) _onAgentText = onAgentText;
  if (onStateChange) _onStateChange = onStateChange;
}

function messengerElement() {
  return document.querySelector('chat-messenger');
}

/* Depth-first search across light DOM and nested shadow roots.

   <chat-messenger>'s own shadow root holds only a wrapper and a <slot>; the
   container and its buttons are slotted light-DOM children, each with their own
   shadow root. Both trees have to be walked. */
function deepQuery(root, selector) {
  const direct = root.querySelector?.(selector);
  if (direct) return direct;

  if (root.shadowRoot) {
    const inShadow = deepQuery(root.shadowRoot, selector);
    if (inShadow) return inShadow;
  }

  const descendants = root.querySelectorAll?.('*') || [];
  for (const node of descendants) {
    if (node.shadowRoot) {
      const found = deepQuery(node.shadowRoot, selector);
      if (found) return found;
    }
  }
  return null;
}

/* The voice session needs the brokered token. Clicking the mic before it lands
   fails without an error, so wait for it (bounded). */
function whenAuthorised() {
  const ready = () => Boolean(window.chatSdk?.getContext?.()?.state?.accessToken);
  if (ready()) return Promise.resolve();

  return new Promise((resolve) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (ready() || Date.now() - started > AUTH_WAIT_MS) {
        clearInterval(timer);
        resolve();
      }
    }, 200);
  });
}

function utteranceText(utterance) {
  return (Array.isArray(utterance?.messages) ? utterance.messages : [])
    .filter((m) => m?.type === 'text' && typeof m.text === 'string')
    .map((m) => m.text)
    .join('');
}

/* Forward whatever has been appended to an utterance since we last showed it.
   Only a pure extension is forwarded; anything else (a rewrite) is left alone
   rather than risk drawing the same sentence twice. */
function flushUtteranceTail(id) {
  _settleTimers.delete(id);
  const shown = _shownText.get(id) ?? '';
  const latest = _latestText.get(id) ?? '';
  if (latest === shown) return;
  if (!latest.startsWith(shown)) {
    console.log(TAG, 'utterance update is not an extension of what was shown; ignored', id);
    return;
  }
  _shownText.set(id, latest);
  const tail = latest.slice(shown.length).trim();
  if (!tail) return;
  noteAgentSpeech(tail);
  _onOutputs?.([{ text: tail, turnIndex: _turnIndex++ }]);
}

function scheduleUtteranceFlush(id) {
  clearTimeout(_settleTimers.get(id));
  _settleTimers.set(id, setTimeout(() => flushUtteranceTail(id), UPDATE_SETTLE_MS));
}

/* Reshape one SDK utterance into the `outputs` array ChatPanel.processOutputs
   already understands:

     { type: 'text',       text }               -> { text, turnIndex }
     { type: 'customCard', richElements: [el] } -> { payload: el, turnIndex }

   normalizeWidgetPayload() in ChatPanel is permissive about the wrapper (it
   unwraps .payload / .customPayload / .data / .json, else falls through to the
   object itself), so handing it the richElement directly is enough. */
function utteranceToOutputs(utterance) {
  const messages = Array.isArray(utterance?.messages) ? utterance.messages : [];
  const turnIndex = _turnIndex++;
  const outputs = [];

  messages.forEach((message) => {
    if (!message || typeof message !== 'object') return;

    if (message.type === 'text' && typeof message.text === 'string') {
      if (message.text.trim()) outputs.push({ text: message.text, turnIndex });
      return;
    }

    if (message.type === 'customCard') {
      const elements = Array.isArray(message.richElements) ? message.richElements : [];
      elements.forEach((element) => {
        if (element && typeof element === 'object') {
          outputs.push({ payload: element, turnIndex });
        }
      });
    }
  });

  return outputs;
}

/* Register the widget bridge.

   SCOPE GUARD: the consumer deliberately ignores everything while bidi is not
   connected. In text mode gecx.js's fetch interceptor is already delivering the
   same outputs; if the consumer forwarded them too, every message and widget
   would render twice. Keeping it dormant outside bidi leaves the text path
   byte-for-byte unchanged. Do not "simplify" this by dropping the gate. */
export function installUtteranceBridge() {
  const messenger = messengerElement();
  if (!messenger || typeof messenger.registerMessageConsumer !== 'function') return false;

  // Already registered against THIS element — registering again would add a
  // second consumer and duplicate every message. See _consumer.
  if (_consumer && _consumerElement === messenger) return true;

  _consumer = {
    addMessages(utterances = []) {
      // Intent, not liveness — see _sessionIntended. Using _bidiActive here
      // silently swallowed speech during the SDK's startup reconnects.
      if (!_sessionIntended) return;

      utterances.forEach((utterance) => {
        if (!utterance) return;

        // Belt and braces against the duplicate-consumer failure above: even if
        // two consumers somehow end up registered, a given utterance is only
        // rendered once.
        const id = utterance.utteranceId;
        if (id) {
          if (_seenUtterances.has(id)) return;
          _seenUtterances.add(id);
          if (_seenUtterances.size > 200) {
            const oldest = _seenUtterances.values().next().value;
            _seenUtterances.delete(oldest);
            clearTimeout(_settleTimers.get(oldest));
            _settleTimers.delete(oldest);
            _shownText.delete(oldest);
            _latestText.delete(oldest);
          }
        }

        if (utterance.isBot === false) {
          // The customer's own speech, transcribed by the platform. ChatPanel
          // renders it as a user bubble; it must not go through processOutputs
          // or it would be treated as agent output.
          const text = (utterance.messages || [])
            .filter((m) => m?.type === 'text')
            .map((m) => m.text)
            .join(' ')
            .trim();
          if (!text) return;
          if (isSilentEcho(text)) return;
          if (isAgentEcho(text)) {
            console.log(TAG, 'dropped agent echo:', text);
            return;
          }
          _onUserTranscript?.(text, true);
          return;
        }

        const text = utteranceText(utterance);
        const textOnly = (utterance.messages || []).every((m) => m?.type === 'text');

        // A text-only first chunk that stops mid-sentence is still streaming:
        // hold it and show the whole sentence once the updates go quiet.
        if (id && textOnly && text && !SENTENCE_END.test(text)) {
          _shownText.set(id, '');
          _latestText.set(id, text);
          scheduleUtteranceFlush(id);
          return;
        }

        const outputs = utteranceToOutputs(utterance);

        // Everything the agent says goes into the echo memory, not just the
        // streaming events — a reply that arrives complete never fires
        // bidi-utterance-updated, and that is exactly the audio the speakers
        // are about to play.
        outputs.forEach((o) => {
          if (o.text) noteAgentSpeech(o.text);
        });

        if (id) {
          _shownText.set(id, text);
          _latestText.set(id, text);
        }
        if (outputs.length) _onOutputs?.(outputs);
      });
    },

    // Later chunks of a turn arrive here, on the SAME utteranceId, carrying the
    // cumulative text (see the note at UPDATE_SETTLE_MS). Ignoring them dropped
    // everything the agent said after its first chunk — typically the message
    // spoken after a tool call, e.g. "Verifying your PIN now." was shown and the
    // consent question that followed never was. They are not forwarded one by one
    // (that would draw a bubble per word); the new tail is shown once the stream
    // has been quiet for UPDATE_SETTLE_MS.
    updateMessages(utterances = []) {
      if (!_sessionIntended) return;

      utterances.forEach((utterance) => {
        const id = utterance?.utteranceId;
        if (!id || utterance.isBot === false) return;

        // Never saw it added (e.g. created before the bridge registered):
        // treat it as a new utterance.
        if (!_seenUtterances.has(id)) {
          _consumer?.addMessages([utterance]);
          return;
        }

        _latestText.set(id, utteranceText(utterance));
        scheduleUtteranceFlush(id);
      });
    },

    getRenderedMessages() {
      return [];
    },
  };

  messenger.registerMessageConsumer(_consumer);
  _consumerElement = messenger;
  console.log(TAG, 'widget bridge registered');
  return true;
}

function installBidiListeners() {
  const messenger = messengerElement();
  if (!messenger) return;

  // Same trap as the consumer: re-adding these on every reconnect would fire
  // each handler once per registration.
  if (_listenersInstalled && _listenersElement === messenger) return;
  _listenersElement = messenger;

  messenger.addEventListener('chat-messenger-connect-bidi', () => {
    _bidiActive = true;
    console.log(TAG, 'connected');
    _onStateChange?.({ connected: true, connecting: false });
  });

  messenger.addEventListener('chat-messenger-disconnect-bidi', () => {
    _bidiActive = false;
    console.log(TAG, 'disconnected');
    _onStateChange?.({ connected: false, connecting: false });
  });

  // Interim transcript of what the customer is saying right now.
  messenger.addEventListener('chat-messenger-bidi-transcript-updated', (event) => {
    const transcript = event?.detail?.transcript;
    if (typeof transcript === 'string' && transcript.trim()) {
      _onUserTranscript?.(transcript, false);
    }
  });

  // The agent's reply text as it streams. Audio is played by the SDK.
  // Remembered so the microphone can't feed it back to us as the customer —
  // see isAgentEcho.
  messenger.addEventListener('chat-messenger-bidi-utterance-updated', (event) => {
    const utterance = event?.detail?.utterance;
    if (typeof utterance === 'string' && utterance.trim()) {
      noteAgentSpeech(utterance);
      _onAgentText?.(utterance);
    }
  });

  _listenersInstalled = true;
}

/* Open the live voice session by handing the mic to the SDK.

   Resolves true once the click has been dispatched — not once the session is
   up. Connection is confirmed asynchronously by chat-messenger-connect-bidi,
   which is what flips _bidiActive and notifies onStateChange. */
export async function connectBidi() {
  const messenger = messengerElement();
  if (!messenger) {
    console.warn(TAG, 'messenger element not in DOM');
    return false;
  }

  installBidiListeners();
  installUtteranceBridge();

  // Read off the element when the session is created, so it must be set first.
  // Without it the agent talks over the customer instead of yielding.
  messenger.setAttribute('barge-in-enabled', 'true');

  const micButton =
    deepQuery(messenger, 'button.microphone') ||
    deepQuery(messenger, 'button[aria-label*="microphone" i]') ||
    deepQuery(messenger, 'button[aria-label*="voice" i]');

  if (!micButton) {
    console.warn(
      TAG,
      'microphone button not found — is enable-audio-input set on <chat-messenger-container>?'
    );
    return false;
  }

  // Set before the click: the SDK can dispatch connect/disconnect synchronously
  // from it, and the bridge must already be open when it does.
  _sessionIntended = true;
  _onStateChange?.({ connected: false, connecting: true });

  await whenAuthorised();
  micButton.click();
  return true;
}

/* True once the mic has been handed over, and until the session is explicitly
   closed. Use this — not isBidiActive() — to decide whether typed text should
   be routed into the voice session. */
export function isVoiceSessionOpen() {
  return _sessionIntended;
}

/* Close the session and release the microphone. */
export async function disconnectBidi() {
  _sessionIntended = false;
  try {
    await messengerElement()?.presenter?.toggleBidiSession?.(false);
  } catch {
    // already closed
  }
  _bidiActive = false;
  _onStateChange?.({ connected: false, connecting: false });
}

/* Send text into the open voice session so the reply comes back spoken.
   Used for the opening greeting, and for chips or typing while voice is on.
   `presenter.sendQuery` goes over the bidi stream; `sendRequest('query', …)`
   would go over the text endpoint and come back silent.

   `silent: true` is for text the customer did not actually say — the greeting
   kickoff. CES still echoes it back as a user utterance, so the bridge drops
   the next one rather than drawing a message bubble the customer never typed. */
export function sendVoiceText(text, { silent = false } = {}) {
  const presenter = messengerElement()?.presenter;
  if (typeof presenter?.sendQuery !== 'function') return false;
  if (silent) {
    _pendingSilentText = text;
    _pendingSilentUntil = Date.now() + 8000;
  }
  presenter.sendQuery(text)?.catch?.(() => {});
  return true;
}

/* Wait for the SDK to upgrade the custom element, then connect. registerContext
   resolves asynchronously, so connecting immediately after opening the chat
   would find no element to query. */
export async function connectBidiWhenReady({ timeoutMs = 10000 } = {}) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const messenger = messengerElement();
    if (messenger?.presenter) return connectBidi();
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  console.warn(TAG, 'messenger never became ready');
  return false;
}

/* Reset module state when <chat-messenger> is remounted (sign-out, new
   session). The consumer and listeners are bound to the old element. */
export function resetBidiBridge() {
  _consumer = null;
  _consumerElement = null;
  _listenersInstalled = false;
  _listenersElement = null;
  _bidiActive = false;
  _sessionIntended = false;
  _pendingSilentText = '';
  _pendingSilentUntil = 0;
  _seenUtterances.clear();
  _settleTimers.forEach((timer) => clearTimeout(timer));
  _settleTimers.clear();
  _shownText.clear();
  _latestText.clear();
  agentSpeech.length = 0;
}
