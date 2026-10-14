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

let _consumerInstalled = false;
let _listenersInstalled = false;
let _bidiActive = false;

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
  if (_consumerInstalled) return true;

  const messenger = messengerElement();
  if (!messenger || typeof messenger.registerMessageConsumer !== 'function') return false;

  messenger.registerMessageConsumer({
    addMessages(utterances = []) {
      // Intent, not liveness — see _sessionIntended. Using _bidiActive here
      // silently swallowed speech during the SDK's startup reconnects.
      if (!_sessionIntended) return;

      utterances.forEach((utterance) => {
        if (!utterance) return;

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
          _onUserTranscript?.(text, true);
          return;
        }

        const outputs = utteranceToOutputs(utterance);
        if (outputs.length) _onOutputs?.(outputs);
      });
    },

    // Streaming text arrives as repeated updates on one utteranceId. Forwarding
    // partials would spam the list with duplicate bubbles; the final version
    // comes through addMessages.
    updateMessages() {},

    getRenderedMessages() {
      return [];
    },
  });

  _consumerInstalled = true;
  console.log(TAG, 'widget bridge registered');
  return true;
}

function installBidiListeners() {
  if (_listenersInstalled) return;

  const messenger = messengerElement();
  if (!messenger) return;

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
  messenger.addEventListener('chat-messenger-bidi-utterance-updated', (event) => {
    const utterance = event?.detail?.utterance;
    if (typeof utterance === 'string' && utterance.trim()) {
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
  _consumerInstalled = false;
  _listenersInstalled = false;
  _bidiActive = false;
  _sessionIntended = false;
  _pendingSilentText = '';
  _pendingSilentUntil = 0;
}
