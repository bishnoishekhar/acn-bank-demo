const DEPLOYMENT = 'projects/483471568825/locations/us/apps/27be6c70-74dc-4e50-a3e8-25b032e7c965/deployments/7cbb68f9-147f-4698-be02-e7ea5fa5d1a3';

let _initDone = false;
let _onResponse = null;

export function setResponseHandler(fn) {
  _onResponse = fn;
}

/* ── Clear GECX-owned session storage ─────────────────────────────────────────
   Our app only writes keys that start with 'acn_'. Everything else in
   sessionStorage belongs to the GECX SDK (session ID, token, etc.).
   Clearing those keys forces the SDK to start a brand-new session on the next
   registerContext() call and fire the enableWelcomeEvent runSession.
── */
export function clearGecxSession() {
  try {
    const removed = Object.keys(sessionStorage).filter(k => !k.startsWith('acn_'));
    removed.forEach(k => sessionStorage.removeItem(k));
    if (removed.length) console.log('[ACN] cleared GECX session keys:', removed);
  } catch (e) {
    // ignore — storage may be restricted in some environments
  }
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
