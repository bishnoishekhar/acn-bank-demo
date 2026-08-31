const DEPLOYMENT = 'projects/483471568825/locations/us/apps/27be6c70-74dc-4e50-a3e8-25b032e7c965/deployments/7cbb68f9-147f-4698-be02-e7ea5fa5d1a3';

const SIGN_IN_RESUME_MESSAGE =
  'I have signed in. Please continue with what I was doing.';

let _initDone = false;
let _onResponse = null;
let _onRateLimited = null;
let _authResumeInFlight = false;
let _variableRetryTimer = null;

export function setResponseHandler(fn) {
  _onResponse = fn;
}

// Called whenever a runSession call comes back 429 (Google Cloud quota
// exhausted for this project). Lets the UI show a clear message instead of
// silently stalling until the typing-indicator timeout clears with nothing.
export function setRateLimitHandler(fn) {
  _onRateLimited = fn;
}

/* Clear GECX-owned session storage.
   Our app only writes keys that start with "acn_". Everything else in
   sessionStorage belongs to the GECX SDK (session ID, token, etc.).
   Clearing those keys forces the SDK to start a brand-new session on the next
   registerContext() call and fire the enableWelcomeEvent runSession.

   We also sweep localStorage for common GECX key patterns in case the SDK
   persists the session there on some browsers or SDK versions.
*/
export function clearGecxSession() {
  try {
    const ssRemoved = Object.keys(sessionStorage).filter(
      (key) => !key.startsWith('acn_')
    );

    ssRemoved.forEach((key) => sessionStorage.removeItem(key));

    if (ssRemoved.length) {
      console.log(
        '[ACN] cleared GECX sessionStorage keys:',
        ssRemoved
      );
    }
  } catch (error) {
    // Ignore. Storage may be restricted.
  }

  try {
    const lsRemoved = Object.keys(localStorage).filter(
      (key) =>
        !key.startsWith('acn_') &&
        (key.startsWith('ce_') ||
          key.startsWith('goog_') ||
          key.startsWith('df-') ||
          key.startsWith('chat-') ||
          key.includes('session') ||
          key.includes('Session'))
    );

    lsRemoved.forEach((key) => localStorage.removeItem(key));

    if (lsRemoved.length) {
      console.log(
        '[ACN] cleared GECX localStorage keys:',
        lsRemoved
      );
    }
  } catch (error) {
    // Ignore. Storage may be restricted.
  }
}

/* Rotate the SDK session ID.
   The GECX / Dialogflow CX Messenger SDK honours the "session-id" attribute on
   the <chat-messenger> element. Setting it to a fresh random value forces the
   SDK to create a brand-new CES session even when it has a prior session ID
   cached in memory.
*/
export function rotateGecxSessionId() {
  try {
    const messenger = document.querySelector('chat-messenger');
    if (!messenger) return;

    const newId =
      'acn-' +
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2, 8);

    messenger.setAttribute('session-id', newId);
    console.log('[ACN] rotated GECX session-id:', newId);
  } catch (error) {
    // Ignore.
  }
}

/* CES session variables (frontend -> agent bridge).
   The GECX SDK exposes setVariables() on the <chat-messenger> element. The
   variables are appended to CES requests as session inputs.
*/
let _cesVars = {};

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function waitForTwoPaints() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'function') {
      setTimeout(resolve, 32);
      return;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

function getMessenger() {
  return document.querySelector('chat-messenger');
}

function applyCesVariables() {
  const messenger = getMessenger();

  if (
    !messenger ||
    typeof messenger.setVariables !== 'function'
  ) {
    return false;
  }

  try {
    messenger.setVariables({ ..._cesVars });
    return true;
  } catch (error) {
    // The presenter may not be attached yet. The caller can retry.
    return false;
  }
}

function scheduleCesVariableRetry() {
  if (_variableRetryTimer) {
    clearInterval(_variableRetryTimer);
  }

  let tries = 0;

  _variableRetryTimer = setInterval(() => {
    tries += 1;

    if (applyCesVariables() || tries > 40) {
      clearInterval(_variableRetryTimer);
      _variableRetryTimer = null;
    }
  }, 100);
}

async function waitForReadyMessenger(timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const messenger = getMessenger();

    if (
      messenger &&
      typeof messenger.setVariables === 'function' &&
      typeof messenger.sendRequest === 'function'
    ) {
      return messenger;
    }

    await sleep(50);
  }

  throw new Error(
    'GECX messenger did not become ready within the expected time.'
  );
}

/* Apply the latest variable snapshot and give the web component enough time
   to consume it before another runSession request starts. */
async function flushCesVariables({ settleMs = 100 } = {}) {
  const messenger = await waitForReadyMessenger();

  const result = messenger.setVariables({ ..._cesVars });

  // Compatible whether setVariables returns void or a Promise.
  if (result && typeof result.then === 'function') {
    await result;
  }

  await waitForTwoPaints();
  await sleep(settleMs);

  return messenger;
}

/* Merge variables into the CES session and flush them to the SDK.
   Retries briefly because the element is upgraded asynchronously by the SDK. */
export function setCesVariables(vars) {
  if (!vars || typeof vars !== 'object') {
    console.warn(
      '[ACN] ignoring invalid CES variables payload:',
      vars
    );
    return;
  }

  _cesVars = {
    ..._cesVars,
    ...vars,
  };

  console.log('[ACN] CES variables updated:', {
    auth_mode: _cesVars.auth_mode,
    authentication_status: _cesVars.authentication_status,
    auth_level: _cesVars.auth_level,
    customerId: _cesVars.customerId,
  });

  if (!applyCesVariables()) {
    scheduleCesVariableRetry();
  }
}

function firstPresentValue(...values) {
  return values.find(
    (value) =>
      value !== undefined &&
      value !== null &&
      value !== ''
  );
}

function addIfPresent(target, key, ...values) {
  const value = firstPresentValue(...values);

  if (value !== undefined) {
    target[key] = value;
  }
}

/* Build the trusted authenticated snapshot from the customer object returned
   by the login operation. Do not build this object from React state
   immediately after calling setState(). */
export function buildAuthenticatedCesVariables(customer) {
  const customerId = String(
    firstPresentValue(
      customer?.customerId,
      customer?.customer_id
    ) || ''
  ).trim();

  if (!customerId) {
    throw new Error(
      'Cannot build authenticated CES variables without customerId.'
    );
  }

  const variables = {
    auth_mode: 'authenticated',
    authentication_status: true,
    auth_level: 2,
    is_existing_customer: true,
    customerId,
    customer_id:
      firstPresentValue(
        customer?.customer_id,
        customerId
      ) || customerId,
    web_channel: true,
  };

  addIfPresent(
    variables,
    'pref_name',
    customer?.pref_name,
    customer?.preferred_name,
    customer?.first_name
  );

  addIfPresent(
    variables,
    'customer_name',
    customer?.customer_name,
    customer?.full_name,
    customer?.name
  );

  addIfPresent(
    variables,
    'customer_global_status',
    customer?.customer_global_status,
    customer?.global_status,
    'active'
  );

  addIfPresent(
    variables,
    'annual_income',
    customer?.annual_income
  );

  addIfPresent(
    variables,
    'credit_score_value',
    customer?.credit_score_value,
    customer?.credit_score
  );

  addIfPresent(
    variables,
    'spending_persona',
    customer?.spending_persona
  );

  addIfPresent(
    variables,
    'kyc_expires_at',
    customer?.kyc_expires_at
  );

  addIfPresent(
    variables,
    'email',
    customer?.email,
    customer?.email_address
  );

  addIfPresent(
    variables,
    'mobile_number',
    customer?.mobile_number,
    customer?.mobileNumber,
    customer?.phone_number,
    customer?.phoneNumber
  );

  return variables;
}

/* Store an authenticated customer snapshot without sending a conversational
   turn. Use this for a normal header sign-in or before the chat is opened. */
export function setAuthenticatedCustomerVariables(customer) {
  const variables = buildAuthenticatedCesVariables(customer);
  setCesVariables(variables);
  return variables;
}

/* Atomically store the authenticated customer, flush the variables to the
   messenger, and only then send the continuation turn.

   Use this after a sign-in initiated from an open chat conversation.
   
   Returns: true if the continuation was successfully dispatched, false otherwise.
   The caller must not leave uncaught promise errors. */
export async function resumeGecxAfterSignIn(customer) {
  if (_authResumeInFlight) {
    console.warn(
      '[ACN] ignoring duplicate sign-in resume request.'
    );
    return false;
  }

  _authResumeInFlight = true;

  try {
    if (!customer) {
      console.error('[ACN] resumeGecxAfterSignIn called without customer object');
      return false;
    }

    const authVariables =
      buildAuthenticatedCesVariables(customer);

    _cesVars = {
      ..._cesVars,
      ...authVariables,
    };

    console.log('[ACN] CES authenticated snapshot ready:', {
      auth_mode: _cesVars.auth_mode,
      authentication_status: _cesVars.authentication_status,
      auth_level: _cesVars.auth_level,
      customerId: _cesVars.customerId,
    });

    const messenger = await flushCesVariables();

    const result = messenger.sendRequest(
      'query',
      SIGN_IN_RESUME_MESSAGE
    );

    if (result && typeof result.then === 'function') {
      await result;
    }

    return true;
  } catch (error) {
    console.error('[ACN] resumeGecxAfterSignIn error:', error);
    return false;
  } finally {
    _authResumeInFlight = false;
  }
}

/* Wipe the variable store. Used on sign-out so a stale customerId can never
   leak into the next guest session. */
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
      // Best effort before registration. This helps when the user signed in
      // from the header before opening the chat.
      applyCesVariables();

      window.chatSdk.registerContext(
        window.chatSdk.prebuilts.ces.createContext({
          deploymentName: DEPLOYMENT,
          tokenBroker: {
            enableTokenBroker: true,
            enableRecaptcha: false,
          },
          enableWelcomeEvent: true,
        })
      );

      console.log('[ACN] GECX registered');

      // Re-apply after registration because the CES presenter may only be
      // attached from this point forward.
      applyCesVariables();

      Promise.resolve().then(() => {
        applyCesVariables();
      });

      setTimeout(() => {
        applyCesVariables();
      }, 50);
    } catch (error) {
      _initDone = false;
      console.error('[ACN] GECX init error:', error);
    }
  };

  if (window.chatSdk) {
    doRegister();
  } else {
    window.addEventListener(
      'chat-messenger-loaded',
      doRegister,
      { once: true }
    );
  }
}

export function resetGecx() {
  // Click the hidden GECX reset button to clear the session token.
  const resetButton = document.querySelector(
    'chat-reset-session-button'
  );

  if (resetButton) {
    resetButton.click();
  }

  // Try the messenger built-in reset.
  const messenger = getMessenger();

  if (
    messenger &&
    typeof messenger.resetSession === 'function'
  ) {
    messenger.resetSession();
  }

  // Re-register with a fresh session.
  _initDone = false;
  setTimeout(() => initGecx(), 500);
}

/* Send a normal message to GECX.
   Do not use this function for the immediate post-login continuation. Use
   resumeGecxAfterSignIn(customer) instead. */
export function gecxSend(text) {
  const messenger = getMessenger();

  if (
    messenger &&
    typeof messenger.sendRequest === 'function'
  ) {
    applyCesVariables();
    return messenger.sendRequest('query', text);
  }

  return undefined;
}

let _interceptorInstalled = false;

/* Fetch interceptor: catches runSession responses. */
/* Fetch interceptor: catches runSession responses.
   This is the CANONICAL response path. runSession returns { outputs: [...], turnCompleted, ... }
   directly in the response body. We extract outputs and pass to _onResponse.
*/
export function installFetchInterceptor() {
  if (_interceptorInstalled) return;

  _interceptorInstalled = true;

  const originalFetch = window.fetch;

  window.fetch = function (url, options) {
    const promise = originalFetch.apply(this, arguments);
    const urlString = url ? url.toString() : '';

    if (urlString.includes('runSession')) {
      promise
        .then((response) => {
          if (response.status === 429) {
            console.warn(
              '[ACN] runSession rate-limited (429). CES project quota exhausted.'
            );

            if (_onRateLimited) {
              _onRateLimited();
            }

            return;
          }

          response
            .clone()
            .json()
            .then((data) => {
              // CANONICAL PATH: runSession returns { outputs: [...] } directly
              if (_onResponse && data?.outputs) {
                _onResponse(data.outputs);
              }
            })
            .catch((error) => {
              console.warn('[ACN] runSession JSON parse error:', error);
            });
        })
        .catch((error) => {
          console.warn('[ACN] runSession fetch error:', error);
        });
    }

    return promise;
  };
}

/* Fallback event listeners — DISABLED to prevent duplicate response processing.
   These listeners (df-response-received, ces-response-received, chat-response-received)
   could deliver the same runSession responses as the canonical fetch interceptor path.
   To prevent duplicates, they are disabled.
   
   Re-enable only if a separate feature demonstrably requires these events.
*/
export function installEventListeners() {
  // DISABLED: Event listeners removed to prevent duplicate response processing
  // Original code:
  /*
  [
    'df-response-received',
    'ces-response-received',
    'chat-response-received',
  ].forEach((eventName) => {
    window.addEventListener(eventName, (event) => {
      if (_onResponse && event.detail?.outputs) {
        _onResponse(event.detail.outputs);
      }
    });
  });
  */
}

/* Bootstrap: install interceptors on page load only, not initGecx().
   The fetch interceptor (installFetchInterceptor) is the CANONICAL response path.
   It catches runSession calls and extracts data.outputs for processing.
*/
export function bootstrapGecx() {
  installFetchInterceptor();
  installEventListeners();

  // Do not call initGecx here. enableWelcomeEvent must fire after chat opens.
}

/* Soft reset: clear the init flag so the next open starts a fresh initGecx().
   It does not click the reset button. */
export function softResetGecx() {
  _initDone = false;
}

/* Kept for backward compatibility. */
export function clearGecxDone() {
  _initDone = false;
}
