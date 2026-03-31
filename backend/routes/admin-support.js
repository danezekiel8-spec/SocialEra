const express = require('express');

function createAdminSupportRoutes({
  ADMIN_CONFIGURED,
  CHECKOUT_ENABLED,
  SUPPORT_CONFIGURED,
  SUPPORT_ACCESS_CODE,
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
  ADMIN_SESSION_TTL_MS,
  SUPPORT_SESSION_TTL_MS,
  activeTokens,
  supportTokens,
  createToken,
  pruneExpiredSessions,
  createSessionRecord,
  getSessionToken,
  appendSessionCookie,
  clearSessionCookie,
  ADMIN_SESSION_COOKIE_NAME,
  SUPPORT_SESSION_COOKIE_NAME,
  ADMIN_SESSION_COOKIE_PATH,
  SUPPORT_SESSION_COOKIE_PATH,
  getValidSession,
  requireSupportAuth,
  readSupportWorkspace,
  writeSupportWorkspace
}) {
  const router = express.Router();
  const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
  const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 8;
  const LOGIN_RATE_LIMIT_BLOCK_MS = 15 * 60 * 1000;
  const loginRateLimitStore = new Map();

  function getClientAddress(req) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return forwarded || String(req.ip || req.socket?.remoteAddress || 'unknown').trim() || 'unknown';
  }

  function getRateLimitEntryKey(scope, req) {
    return `${String(scope || 'default').trim()}:${getClientAddress(req)}`;
  }

  function pruneLoginRateLimitEntry(key, now = Date.now()) {
    const entry = loginRateLimitStore.get(key);

    if (!entry) {
      return null;
    }

    if (entry.blockedUntil && entry.blockedUntil > now) {
      return entry;
    }

    if (now - entry.windowStartedAt >= LOGIN_RATE_LIMIT_WINDOW_MS) {
      loginRateLimitStore.delete(key);
      return null;
    }

    return entry;
  }

  function getRateLimitRetryAfterMs(scope, req) {
    const key = getRateLimitEntryKey(scope, req);
    const entry = pruneLoginRateLimitEntry(key);

    if (!entry || !entry.blockedUntil) {
      return 0;
    }

    return Math.max(0, entry.blockedUntil - Date.now());
  }

  function noteRateLimitFailure(scope, req) {
    const key = getRateLimitEntryKey(scope, req);
    const now = Date.now();
    const existing = pruneLoginRateLimitEntry(key, now);

    if (!existing) {
      loginRateLimitStore.set(key, {
        windowStartedAt: now,
        attempts: 1,
        blockedUntil: 0
      });
      return;
    }

    const attempts = Number(existing.attempts || 0) + 1;
    const blockedUntil = attempts >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS
      ? now + LOGIN_RATE_LIMIT_BLOCK_MS
      : 0;

    loginRateLimitStore.set(key, {
      windowStartedAt: existing.windowStartedAt || now,
      attempts,
      blockedUntil
    });
  }

  function clearRateLimit(scope, req) {
    loginRateLimitStore.delete(getRateLimitEntryKey(scope, req));
  }

  router.get('/storefront-config', (req, res) => {
    res.json({
      adminConfigured: ADMIN_CONFIGURED,
      checkoutEnabled: CHECKOUT_ENABLED,
      supportConfigured: SUPPORT_CONFIGURED
    });
  });

  router.post('/support/login', (req, res) => {
    try {
      if (!SUPPORT_CONFIGURED) {
        return res.status(503).json({
          error: 'Support access is disabled until SUPPORT_ACCESS_CODE is configured on the server.'
        });
      }

      const retryAfterMs = getRateLimitRetryAfterMs('support-login', req);

      if (retryAfterMs > 0) {
        res.setHeader('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
        return res.status(429).json({
          error: 'Too many support login attempts. Please wait a few minutes and try again.'
        });
      }

      const repName = String(req.body.repName || '').trim();
      const accessCode = String(req.body.accessCode || '').trim();

      if (!repName) {
        return res.status(400).json({ error: 'Representative name is required' });
      }

      if (accessCode !== SUPPORT_ACCESS_CODE) {
        noteRateLimitFailure('support-login', req);
        return res.status(401).json({ error: 'Invalid support access code' });
      }

      const token = createToken();
      pruneExpiredSessions(supportTokens);
      const session = createSessionRecord({
        name: repName,
        type: 'support'
      }, SUPPORT_SESSION_TTL_MS);
      supportTokens.set(token, session);
      clearRateLimit('support-login', req);
      appendSessionCookie(res, req, {
        name: SUPPORT_SESSION_COOKIE_NAME,
        token,
        ttlMs: SUPPORT_SESSION_TTL_MS,
        path: SUPPORT_SESSION_COOKIE_PATH
      });

      return res.json({
        message: 'Support login successful',
        rep: {
          name: repName
        },
        expiresAt: session.expiresAt
      });
    } catch (error) {
      console.error('Support login error:', error);
      return res.status(500).json({ error: 'Support login failed' });
    }
  });

  router.get('/support/verify', requireSupportAuth, (req, res) => {
    res.json({
      valid: true,
      rep: {
        name: req.supportRep.name
      },
      expiresAt: req.supportRep.expiresAt
    });
  });

  router.post('/support/logout', requireSupportAuth, (req, res) => {
    try {
      const token = getSessionToken(req, SUPPORT_SESSION_COOKIE_NAME);

      if (token) {
        supportTokens.delete(token);
      }

      clearSessionCookie(res, req, {
        name: SUPPORT_SESSION_COOKIE_NAME,
        path: SUPPORT_SESSION_COOKIE_PATH
      });

      return res.json({ message: 'Support logout successful' });
    } catch (error) {
      console.error('Support logout error:', error);
      return res.status(500).json({ error: 'Support logout failed' });
    }
  });

  router.get('/support/workspace', requireSupportAuth, (req, res) => {
    try {
      return res.json(readSupportWorkspace());
    } catch (error) {
      console.error('Support workspace read error:', error);
      return res.status(500).json({ error: 'Failed to load support workspace' });
    }
  });

  router.put('/support/workspace/:threadId', requireSupportAuth, (req, res) => {
    try {
      const threadId = String(req.params.threadId || '').trim();

      if (!threadId) {
        return res.status(400).json({ error: 'Thread ID is required' });
      }

      const workspace = readSupportWorkspace();
      const existing = workspace.threads[threadId] || {};
      const nextEntry = {
        assignedRep: String(req.body.assignedRep ?? existing.assignedRep ?? '').trim(),
        status: String(req.body.status ?? existing.status ?? 'open').trim() || 'open',
        notes: String(req.body.notes ?? existing.notes ?? '').trim(),
        customerEmail: String(req.body.customerEmail ?? existing.customerEmail ?? '').trim(),
        subject: String(req.body.subject ?? existing.subject ?? '').trim(),
        updatedAt: new Date().toISOString(),
        updatedBy: req.supportRep.name
      };

      workspace.threads[threadId] = nextEntry;
      writeSupportWorkspace(workspace);

      return res.json({
        threadId,
        entry: nextEntry
      });
    } catch (error) {
      console.error('Support workspace update error:', error);
      return res.status(500).json({ error: 'Failed to update support workspace' });
    }
  });

  router.post('/admin/login', (req, res) => {
    try {
      if (!ADMIN_CONFIGURED) {
        return res.status(503).json({
          error: 'Admin access is disabled until ADMIN_USERNAME and ADMIN_PASSWORD are configured on the server.'
        });
      }

      const retryAfterMs = getRateLimitRetryAfterMs('admin-login', req);

      if (retryAfterMs > 0) {
        res.setHeader('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
        return res.status(429).json({
          error: 'Too many admin login attempts. Please wait a few minutes and try again.'
        });
      }

      const username = String(req.body.username || '').trim();
      const password = String(req.body.password || '');

      if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
        noteRateLimitFailure('admin-login', req);
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      const token = createToken();
      pruneExpiredSessions(activeTokens);
      const session = createSessionRecord({
        username: ADMIN_USERNAME,
        type: 'admin'
      }, ADMIN_SESSION_TTL_MS);
      activeTokens.set(token, session);
      clearRateLimit('admin-login', req);
      appendSessionCookie(res, req, {
        name: ADMIN_SESSION_COOKIE_NAME,
        token,
        ttlMs: ADMIN_SESSION_TTL_MS,
        path: ADMIN_SESSION_COOKIE_PATH
      });

      return res.json({
        message: 'Login successful',
        admin: {
          username: ADMIN_USERNAME
        },
        expiresAt: session.expiresAt
      });
    } catch (error) {
      console.error('Login error:', error);
      return res.status(500).json({ error: 'Login failed' });
    }
  });

  router.get('/admin/verify', (req, res) => {
    try {
      if (!ADMIN_CONFIGURED) {
        return res.status(503).json({
          error: 'Admin access is disabled until server credentials are configured.'
        });
      }

      const token = getSessionToken(req, ADMIN_SESSION_COOKIE_NAME);
      const session = getValidSession(activeTokens, token);

      if (!session) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      return res.json({
        valid: true,
        admin: {
          username: ADMIN_USERNAME
        },
        expiresAt: session.expiresAt
      });
    } catch (error) {
      console.error('Verify error:', error);
      return res.status(500).json({ error: 'Verification failed' });
    }
  });

  router.post('/admin/logout', (req, res) => {
    try {
      const token = getSessionToken(req, ADMIN_SESSION_COOKIE_NAME);

      if (token && activeTokens.has(token)) {
        activeTokens.delete(token);
      }

      clearSessionCookie(res, req, {
        name: ADMIN_SESSION_COOKIE_NAME,
        path: ADMIN_SESSION_COOKIE_PATH
      });

      return res.json({ message: 'Logged out successfully' });
    } catch (error) {
      console.error('Logout error:', error);
      return res.status(500).json({ error: 'Logout failed' });
    }
  });

  return router;
}

module.exports = createAdminSupportRoutes;
