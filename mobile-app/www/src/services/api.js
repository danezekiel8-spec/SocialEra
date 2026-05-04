function shouldBypassAuthForApiPath(pathname) {
  return /^\/messages(?:\/|$)/.test(String(pathname || '').trim());
}

export function parseRequestErrorText(value) {
  const raw = String(value || '').trim();

  if (!raw) {
    return '';
  }

  try {
    const parsed = JSON.parse(raw);

    if (parsed && typeof parsed === 'object') {
      return String(
        parsed.error
        || parsed.message
        || parsed.detail
        || raw
      ).trim();
    }
  } catch (error) {
    return raw;
  }

  return raw;
}

export function getRequestErrorMessage(error, fallback = 'Something went wrong.') {
  const status = Number(error && error.status ? error.status : 0);
  const directMessage = String(error && error.message ? error.message : '').trim();
  const parsedRawMessage = parseRequestErrorText(error && error.rawText ? error.rawText : '');

  if (status === 431) {
    return 'The browser sent too much local session data with this request. Refresh the app and try again.';
  }

  return parsedRawMessage || directMessage || fallback;
}

export function isAuthRequestError(error) {
  const status = Number(error && error.status ? error.status : 0);
  const message = getRequestErrorMessage(error, '').toLowerCase();

  return status === 401
    || /unauthorized/.test(message)
    || /authentication required/.test(message)
    || /sign in again/.test(message);
}

export function createApiService({
  fetchImpl = (...args) => fetch(...args),
  getApiBase,
  getAuthSession,
  getBackendOrigin
}) {
  const getNormalizedApiBase = () => String(
    typeof getApiBase === 'function' ? getApiBase() : '/api'
  ).trim() || '/api';

  const getActiveSession = () => {
    const session = typeof getAuthSession === 'function' ? getAuthSession() : null;
    return session && typeof session === 'object' ? session : null;
  };

  const readJsonResponse = async (response, fallbackMessage) => {
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      const error = new Error(parseRequestErrorText(errorText) || fallbackMessage(response.status));
      error.status = response.status;
      error.rawText = errorText;
      throw error;
    }

    if (response.status === 204) {
      return null;
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
  };

  async function fetchJson(pathname, options = {}) {
    const {
      headers: optionHeaders = {},
      credentials: requestCredentials = 'omit',
      cache: requestCache,
      omitAuth = false,
      allowMessageAuth = false,
      ...requestOptions
    } = options;
    const headers = {
      ...optionHeaders
    };
    const bypassAuth = shouldBypassAuthForApiPath(pathname) && !allowMessageAuth;
    const effectiveOmitAuth = omitAuth || bypassAuth;

    if (!('Content-Type' in headers) && !('content-type' in headers)) {
      headers['Content-Type'] = 'application/json';
    }

    if (bypassAuth) {
      delete headers.Authorization;
      delete headers.authorization;
    }

    const session = getActiveSession();

    if (!effectiveOmitAuth && !headers.Authorization && !headers.authorization && session && session.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }

    const method = String(requestOptions.method || 'GET').trim().toUpperCase() || 'GET';
    const cacheMode = requestCache || (method === 'GET' || method === 'HEAD' ? 'no-store' : undefined);
    const response = await fetchImpl(`${getNormalizedApiBase()}${pathname}`, {
      ...requestOptions,
      ...(cacheMode ? { cache: cacheMode } : {}),
      credentials: requestCredentials,
      headers
    });

    return readJsonResponse(response, (status) => `Request failed: ${status}`);
  }

  function fetchMessageJson(pathname, options = {}) {
    return fetchJson(pathname, {
      ...options,
      omitAuth: true
    });
  }

  async function fetchBackendJson(pathname, options = {}) {
    const backendOrigin = String(
      typeof getBackendOrigin === 'function' ? getBackendOrigin() : ''
    ).trim().replace(/\/+$/, '');

    if (!backendOrigin) {
      throw new Error('No backend origin configured for direct requests.');
    }

    const {
      headers: optionHeaders = {},
      credentials: requestCredentials = 'omit',
      omitAuth = false,
      ...requestOptions
    } = options;
    const headers = {
      ...optionHeaders
    };

    if (!('Content-Type' in headers) && !('content-type' in headers)) {
      headers['Content-Type'] = 'application/json';
    }

    const session = getActiveSession();

    if (!omitAuth && !headers.Authorization && !headers.authorization && session && session.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }

    const response = await fetchImpl(`${backendOrigin}/api${pathname}`, {
      ...requestOptions,
      credentials: requestCredentials,
      headers
    });

    return readJsonResponse(response, (status) => `Direct backend request failed: ${status}`);
  }

  function createApiUrl(pathname, { directBackend = false } = {}) {
    const backendOrigin = String(
      typeof getBackendOrigin === 'function' ? getBackendOrigin() : ''
    ).trim().replace(/\/+$/, '');
    const useDirectBackend = shouldUseDirectBackend(directBackend);
    const origin = useDirectBackend && backendOrigin
      ? backendOrigin
      : String(globalThis.location && globalThis.location.origin ? globalThis.location.origin : 'http://localhost').trim();
    const basePath = useDirectBackend && backendOrigin
      ? '/api'
      : getNormalizedApiBase().replace(/\/$/, '');

    return new URL(`${basePath}${pathname}`, origin).toString();
  }

  return {
    createApiUrl,
    fetchBackendJson,
    fetchJson,
    fetchMessageJson
  };
}
  const isLoopbackHostname = (hostname) => {
    const value = String(hostname || '').trim().toLowerCase();
    return value === 'localhost' || value === '127.0.0.1' || value === '::1';
  };

  const shouldUseDirectBackend = (directBackendRequested) => {
    if (!directBackendRequested) {
      return false;
    }

    const backendOrigin = String(
      typeof getBackendOrigin === 'function' ? getBackendOrigin() : ''
    ).trim().replace(/\/+$/, '');

    if (!backendOrigin) {
      return false;
    }

    try {
      const parsed = new URL(backendOrigin);
      return !isLoopbackHostname(parsed.hostname);
    } catch (error) {
      return false;
    }
  };
