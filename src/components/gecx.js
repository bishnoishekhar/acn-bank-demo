const DEPLOYMENT = 'projects/483471568825/locations/us/apps/27be6c70-74dc-4e50-a3e8-25b032e7c965/deployments/7cbb68f9-147f-4698-be02-e7ea5fa5d1a3';

let _initDone = false;
let _onResponse = null;
let _onRateLimited = null;

export function setResponseHandler(fn) {
  _onResponse = fn;
}

// Called whenever a runSession call comes back 429 (Google Cloud quota
// exhausted for this project). Lets the UI show a clear message instead of
// silently stalling until the typing-indicator timeout clears with nothing.
export function setRateLimitHandler(fn) {
  _onRateLimited = fn;
}

/* ── Clear GECX-owned session storage ─────────────────────────────────────────
   Our app only writes keys that start with 'acn_'. Everything else in
   sessionStorage belongs to the GECX SDK (session ID, token, etc.).
   Clearing those keys forces the SDK to start a brand-new session on the next
   registerContext() call and fire the enableWelcomeEvent runSession.

   We also sweep localStorage for common GECX key patterns in case the SDK
   persists the session there on some browsers / SDK versions.
── */
export function clearGecxSession() {
  try {
    const ssRemoved = Object.keys(sessionStorage).filter(k => !k.startsWith('acn_'));
    ssRemoved.forEach(k => sessionStorage.removeItem(k));
    if (ssRemoved.length) console.log('[ACN] cleared GECX sessionStorage keys:', ssRemoved);
  } catch (e) { /* ignore — storage may be restricted */ }

  // Also sweep localStorage for GECX keys (sdk version-dependent)
  try {
    const lsRemoved = Object.keys(localStorage).filter(k =>
      !k.startsWith('acn_') && (
        k.startsWith('ce_')   || k.startsWith('goog_') ||
        k.startsWith('df-')   || k.startsWith('chat-') ||
        k.includes('session') || k.includes('Session')
      )
    );
    lsRemoved.forEach(k => localStorage.removeItem(k));
    if (lsRemoved.length) console.log('[ACN] cleared GECX localStorage keys:', lsRemoved);
  } catch (e) { /* ignore */ }
}

/* ── Rotate the SDK session ID ─────────────────────────────────────────────────
   The GECX / Dialogflow CX Messenger SDK honours the `session-id` attribute on
   the <chat-messenger> element. Setting it to a fresh random value forces the SDK
   to create a brand-new CES session even when it has a prior session ID cached in
   memory — which is the case after a within-tab sign-out.

   Called by the ChatPanel resetSignal effect so that clearing sessionStorage (done
   separately) is reinforced by an in-memory session rotate. The next open will then
   call initGecx() / registerContext() and the welcome event fires on the new session.
── */
export function rotateGecxSessionId() {
  try {
    const el = document.querySelector('chat-messenger');
    if (!el) return;
    const newId = 'acn-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    el.setAttribute('session-id', newId);
    console.log('[ACN] rotated GECX session-id →', newId);
  } catch (e) { /* ignore */ }
}

/* ── CES session variables (frontend → agent bridge) ───────────────────────────
   The GECX SDK exposes `setVariables()` on the <chat-messenger> element. What it
   stores is appended to EVERY CES request as an extra input:

       { config: {...}, inputs: [ { text: "..." }, { variables: {...} } ] }

   On the wire `variables` is a google.protobuf.Struct — a plain JSON object of
   name → value. CES receives those as session variables (they must also be
   declared in app.json variableDeclarations to be readable by agents).

   This is how the web page tells the agent who is signed in, so a header
   sign-in lets the chatbot skip its own authentication, and a chat sign-in is
   reflected back into the page. One source of truth, no hidden system messages.

   Applied on both the welcome event and every subsequent turn.
── */
let _cesVars = {};

function applyCesVariables() {
  const el = document.querySelector('chat-messenger');
  if (!el || typeof el.setVariables !== 'function') return false;
  try {
    el.setVariables({ ..._cesVars });
    return true;
  } catch (e) {
    // presenter not attached yet — caller retries
    return false;
  }
}

/* Merge variables into the CES session and flush them to the SDK.
   Retries briefly because the element is upgraded asynchronously by the SDK. */
export function setCesVariables(vars) {
  _cesVars = { ..._cesVars, ...vars };
  console.log('[ACN] CES variables →', Object.keys(_cesVars).join(', '));
  if (applyCesVariables()) return;
  let tries = 0;
  const t = setInterval(() => {
    if (applyCesVariables() || ++tries > 40) clearInterval(t);
  }, 100);
}

/* Wipe the variable store — used on sign-out so a stale customerId can never
   leak into the next (guest) session. */
export function clearCesVariables() {
  _cesVars = {};
  applyCesVariables();
}

export function getCesVariables() {
  return { ..._cesVars };
}

export function initGecx() {
  if (_initDone) return;
  _initDone = true;
  const doRegister = () => {
    try {
      window.chatSdk.registerContext(
        window.chatSdk.prebuilts.ces.createContext({
          deploymentName: DEPLOYMENT,
          tokenBroker: { enableTokenBroker: true, enableRecaptcha: false },
          enableWelcomeEvent: true,
        })
      );
      console.log('[ACN] GECX registered');
      // Re-flush after registration: the presenter only exists from here on,
      // and the welcome-event runSession fires immediately after.
      applyCesVariables();
      setTimeout(applyCesVariables, 0);
    } catch (e) {
      console.error('[ACN] GECX init error:', e);
    }
  };
  if (window.chatSdk) {
    doRegister();
  } else {
    window.addEventListener('chat-messenger-loaded', doRegister);
  }
}

export function resetGecx() {
  // Click the hidden GECX reset button to clear session token
  const resetBtn = document.querySelector('chat-reset-session-button');
  if (resetBtn) resetBtn.click();
  // Try messenger built-in reset
  const messenger = document.querySelector('chat-messenger');
  if (messenger && typeof messenger.resetSession === 'function') messenger.resetSession();
  // Re-register with fresh session
  _initDone = false;
  setTimeout(() => initGecx(), 500);
}

/* ── Send message to GECX ── */
export function gecxSend(text) {
  const m = document.querySelector('chat-messenger');
  if (m && typeof m.sendRequest === 'function') {
    // Re-assert session variables first. clearGecxSession() wipes the SDK's
    // own sessionStorage (including its variable store), so this guarantees
    // every outgoing turn carries the current auth context.
    applyCesVariables();
    m.sendRequest('query', text);
  }
}

let _interceptorInstalled = false;

/* ── Fetch interceptor — catches runSession responses ── */
export function installFetchInterceptor() {
  if (_interceptorInstalled) return;
  _interceptorInstalled = true;
  const _orig = window.fetch;
  window.fetch = function (url, opts) {
    const p = _orig.apply(this, arguments);
    const urlStr = url ? url.toString() : '';
    if (urlStr.includes('runSession')) {
      console.log('[ACN] fetch interceptor caught runSession:', urlStr);
      p.then((r) => {
        if (r.status === 429) {
          console.warn('[ACN] runSession rate-limited (429) — CES project quota exhausted');
          if (_onRateLimited) _onRateLimited();
          return;
        }
        r.clone().json().then((data) => {
          console.log('[ACN] runSession response keys:', Object.keys(data || {}));
          if (_onResponse && data?.outputs) {
            console.log('[ACN] calling _onResponse with outputs:', data.outputs?.length);
            _onResponse(data.outputs);
          }
        }).catch((e) => { console.warn('[ACN] runSession JSON parse error:', e); });
      }).catch((e) => { console.warn('[ACN] runSession fetch error:', e); });
    }
    return p;
  };
}

/* ── Fallback event listeners ── */
export function installEventListeners() {
  ['df-response-received', 'ces-response-received', 'chat-response-received'].forEach((n) => {
    window.addEventListener(n, (e) => {
      if (_onResponse && e.detail?.outputs) {
        _onResponse(e.detail.outputs);
      }
    });
  });
}

/* ── Bootstrap — install interceptors on page load only, NOT initGecx ── */
export function bootstrapGecx() {
  installFetchInterceptor();
  installEventListeners();
  /* Do NOT call initGecx here — enableWelcomeEvent must fire AFTER chat opens */
}

/* ── Soft-reset: clears init flag so next open triggers a fresh initGecx().
   Does NOT click the reset button — that auto-starts a new GECX session which
   would conflict with the subsequent initGecx() call in the isOpen effect.
   The sessionStorage cleanup is handled by clearGecxSession() in the isOpen
   effect before initGecx() is called.
── */
export function softResetGecx() {
  _initDone = false;
}

/* Keep for backward-compat — a lighter flag-only reset used on mount. */
export function clearGecxDone() {
  _initDone = false;
}
