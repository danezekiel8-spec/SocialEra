const express = require('express');

const ALLOWED_THEMES = new Set([
  'socialera',
  'editorial',
  'coast',
  'midnight',
  'terracotta',
  'moss',
  'sunroom'
]);
const ALLOWED_PAGES = ['home', 'shop', 'videos', 'upload', 'profile', 'inbox'];
const MAX_BACKGROUND_BYTES = 5 * 1024 * 1024;

function createDefaultSettings() {
  return {
    theme: 'socialera',
    backgroundUrl: '',
    backgroundMode: 'all',
    selectedPages: [...ALLOWED_PAGES],
    backgroundEnabled: false
  };
}

function normalizePageList(values, { allowEmpty = false } = {}) {
  const pages = Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim().toLowerCase())
      .filter((value) => ALLOWED_PAGES.includes(value))
  ));

  if (pages.length || allowEmpty) {
    return pages;
  }

  return [...ALLOWED_PAGES];
}

function normalizeSettings(input = {}, fallback = createDefaultSettings()) {
  const selectedPagesProvided = Boolean(
    input
    && (
      Object.prototype.hasOwnProperty.call(input, 'selectedPages')
      || Object.prototype.hasOwnProperty.call(input, 'selected_pages')
    )
  );
  const rawTheme = String(
    input && Object.prototype.hasOwnProperty.call(input, 'theme')
      ? input.theme
      : fallback.theme
  ).trim().toLowerCase();
  const theme = ALLOWED_THEMES.has(rawTheme) ? rawTheme : fallback.theme || 'socialera';
  const backgroundUrl = String(
    input && (
      input.backgroundUrl
      || input.background_url
      || input.backgroundImageUrl
      || input.background_image_url
      || ''
    ) || fallback.backgroundUrl || ''
  ).trim();
  const backgroundMode = String(
    input && (input.backgroundMode || input.background_mode || '')
      || fallback.backgroundMode
      || 'all'
  ).trim().toLowerCase() === 'selected' ? 'selected' : 'all';
  const selectedPages = normalizePageList(
    input && (input.selectedPages || input.selected_pages),
    { allowEmpty: selectedPagesProvided }
  );
  const backgroundEnabled = Boolean(
    backgroundUrl
    && (
      input && Object.prototype.hasOwnProperty.call(input, 'backgroundEnabled')
        ? input.backgroundEnabled
        : fallback.backgroundEnabled
    )
  );

  return {
    theme,
    backgroundUrl,
    backgroundMode,
    selectedPages: backgroundMode === 'all' ? [...ALLOWED_PAGES] : selectedPages,
    backgroundEnabled
  };
}

function estimateDataUrlBytes(value) {
  const dataUrl = String(value || '').trim();

  if (!dataUrl.startsWith('data:')) {
    return 0;
  }

  const [, body = ''] = dataUrl.split(',', 2);

  if (!body) {
    return 0;
  }

  const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((body.length * 3) / 4) - padding);
}

function isImageDataUrl(value) {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(String(value || '').trim());
}

function isImageReference(value) {
  const text = String(value || '').trim();

  if (!text) {
    return false;
  }

  if (isImageDataUrl(text)) {
    return true;
  }

  if (text.startsWith('/')) {
    return true;
  }

  if (/^https?:\/\//i.test(text)) {
    return true;
  }

  return false;
}

function createAppearanceRoutes({
  readAppearanceSettings,
  writeAppearanceSettings,
  resolveAuthenticatedAppUser
}) {
  const router = express.Router();

  async function requireAppUser(req, res, next) {
    try {
      const user = await resolveAuthenticatedAppUser(req);

      if (!user || !user.id) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      req.appUser = user;
      next();
    } catch (error) {
      console.error('Could not resolve app user for appearance settings:', error);
      return res.status(401).json({ error: 'Authentication required' });
    }
  }

  function readUserSettings(userId) {
    const data = readAppearanceSettings();
    const users = data && data.users && typeof data.users === 'object' ? data.users : {};
    return normalizeSettings(users[userId] || {}, createDefaultSettings());
  }

  function saveUserSettings(userId, settings) {
    const data = readAppearanceSettings();

    if (!data.users || typeof data.users !== 'object') {
      data.users = {};
    }

    data.users[userId] = normalizeSettings(settings, data.users[userId] || createDefaultSettings());
    writeAppearanceSettings(data);
    return data.users[userId];
  }

  router.get('/appearance-settings', requireAppUser, (req, res) => {
    try {
      return res.json({
        settings: readUserSettings(String(req.appUser.id || '').trim())
      });
    } catch (error) {
      console.error('Error loading appearance settings:', error);
      return res.status(500).json({ error: 'Failed to load appearance settings' });
    }
  });

  router.post('/appearance-settings/background', requireAppUser, (req, res) => {
    try {
      const dataUrl = String(req.body.dataUrl || '').trim();

      if (!dataUrl || !isImageDataUrl(dataUrl)) {
        return res.status(400).json({ error: 'A valid image upload is required' });
      }

      if (estimateDataUrlBytes(dataUrl) > MAX_BACKGROUND_BYTES) {
        return res.status(400).json({ error: 'Background image must be 5MB or smaller' });
      }

      const current = readUserSettings(String(req.appUser.id || '').trim());
      const next = saveUserSettings(String(req.appUser.id || '').trim(), {
        ...current,
        backgroundUrl: dataUrl,
        backgroundEnabled: true
      });

      return res.status(201).json({
        backgroundUrl: next.backgroundUrl
      });
    } catch (error) {
      console.error('Error uploading appearance background:', error);
      return res.status(500).json({ error: 'Failed to upload background image' });
    }
  });

  router.delete('/appearance-settings/background', requireAppUser, (req, res) => {
    try {
      const current = readUserSettings(String(req.appUser.id || '').trim());

      saveUserSettings(String(req.appUser.id || '').trim(), {
        ...current,
        backgroundUrl: '',
        backgroundEnabled: false
      });

      return res.status(204).end();
    } catch (error) {
      console.error('Error removing appearance background:', error);
      return res.status(500).json({ error: 'Failed to remove background image' });
    }
  });

  router.put('/appearance-settings', requireAppUser, (req, res) => {
    try {
      const requestedTheme = String(req.body.theme || '').trim().toLowerCase();
      const requestedMode = String(req.body.backgroundMode || '').trim().toLowerCase();
      const selectedPagesInput = Array.isArray(req.body.selectedPages) ? req.body.selectedPages : [];
      const backgroundUrl = String(req.body.backgroundUrl || '').trim();

      if (requestedTheme && !ALLOWED_THEMES.has(requestedTheme)) {
        return res.status(400).json({ error: 'Invalid theme selection' });
      }

      if (requestedMode && !['all', 'selected'].includes(requestedMode)) {
        return res.status(400).json({ error: 'Invalid background mode' });
      }

      if (requestedMode === 'selected' && selectedPagesInput.some((value) => !ALLOWED_PAGES.includes(String(value || '').trim().toLowerCase()))) {
        return res.status(400).json({ error: 'Invalid page targets' });
      }

      if (requestedMode === 'selected' && !selectedPagesInput.length) {
        return res.status(400).json({ error: 'Choose at least one page target' });
      }

      if (backgroundUrl && !isImageReference(backgroundUrl)) {
        return res.status(400).json({ error: 'Background image is invalid' });
      }

      if (backgroundUrl && isImageDataUrl(backgroundUrl) && estimateDataUrlBytes(backgroundUrl) > MAX_BACKGROUND_BYTES) {
        return res.status(400).json({ error: 'Background image must be 5MB or smaller' });
      }

      const current = readUserSettings(String(req.appUser.id || '').trim());
      const settings = saveUserSettings(String(req.appUser.id || '').trim(), {
        ...current,
        theme: req.body.theme,
        backgroundUrl,
        backgroundMode: req.body.backgroundMode,
        selectedPages: req.body.selectedPages,
        backgroundEnabled: req.body.backgroundEnabled
      });

      return res.status(201).json({ settings });
    } catch (error) {
      console.error('Error saving appearance settings:', error);
      return res.status(500).json({ error: 'Failed to save appearance settings' });
    }
  });

  return router;
}

module.exports = createAppearanceRoutes;
