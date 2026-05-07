const express = require('express');
const cors = require('cors');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createJsonFileStore } = require('./lib/json-file-store');
const { createProductDataSource } = require('./lib/product-data-source');
const { createSocialPostPersistenceAdapter } = require('./lib/social-post-persistence-adapter');
const { createUsappPersistenceAdapter } = require('./lib/usapp-persistence-adapter');
const {
  SOCIAL_IMAGE_POOL,
  normalizeSocialPost,
  flattenRecentComments,
  countNestedComments,
  findCommentById
} = require('./lib/social-helpers');
const {
  normalizeMessageAttachment,
  normalizeMessageContact,
  normalizeMessageEntry,
  normalizeMemberProfile,
  normalizeMemberThread,
  normalizeMessageThread,
  createMessageThread,
  ensureWelcomeInboxThread,
  upsertMemberProfile,
  getMemberProfile,
  createMemberThread,
  serializeMemberThreadForActor,
  buildAutoReply,
  toggleMessageReaction,
  createMessageContactHelpers
} = require('./lib/message-helpers');
const createAdminSupportRoutes = require('./routes/admin-support');
const createAppearanceRoutes = require('./routes/storefront-appearance');
const createProductRoutes = require('./routes/storefront-products');
const createMessageRoutes = require('./routes/storefront-messages');
const createSocialRoutes = require('./routes/storefront-social');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    const separatorIndex = trimmed.indexOf('=');

    if (separatorIndex === -1) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

loadEnvFile(path.join(__dirname, '.env'));

const app = express();
const PORT = Number(process.env.PORT || 5001);
const HOST = String(process.env.HOST || '').trim();
const PRODUCTS_FILE = path.join(__dirname, 'products.json');
const SUPPORT_WORKSPACE_FILE = path.join(__dirname, 'support-workspace.json');
const SOCIAL_POSTS_FILE = path.join(__dirname, 'social-posts.json');
const SOCIAL_MESSAGES_FILE = path.join(__dirname, 'social-messages.json');
const APPEARANCE_SETTINGS_FILE = path.join(__dirname, 'appearance-settings.json');
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const DEFAULT_SUPABASE_URL = 'https://kfunqpatayfkscilhncx.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ByM_npvMJj4LM_WVntb_aw_qwFPgoMj';
const usappPersistence = createUsappPersistenceAdapter();
const SUPABASE_MEMBER_DIRECTORY_CACHE_MS = 30 * 1000;

const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || '').trim();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '');
const CHECKOUT_ENABLED = String(process.env.CHECKOUT_ENABLED || '').trim().toLowerCase() === 'true';
const ADMIN_CONFIGURED = Boolean(ADMIN_USERNAME && ADMIN_PASSWORD);
const SUPPORT_ACCESS_CODE = String(process.env.SUPPORT_ACCESS_CODE || '').trim();
const SUPPORT_CONFIGURED = Boolean(SUPPORT_ACCESS_CODE);
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SUPPORT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const ADMIN_SESSION_COOKIE_NAME = 'socialera_admin_session';
const SUPPORT_SESSION_COOKIE_NAME = 'socialera_support_session';
const ADMIN_SESSION_COOKIE_PATH = '/api';
const SUPPORT_SESSION_COOKIE_PATH = '/api/support';
const PUBLIC_AUTH_ORIGIN = String(process.env.SOCIALERA_PUBLIC_AUTH_ORIGIN || '').trim().replace(/\/+$/, '');
const EXTRA_ALLOWED_CORS_ORIGINS = String(process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => String(origin || '').trim().replace(/\/+$/, ''))
  .filter(Boolean);

const activeTokens = new Map();
const supportTokens = new Map();
let productsStore = null;
let supportWorkspaceStore = null;
let socialPostsStore = null;
let socialMessagesStore = null;
let appearanceSettingsStore = null;
let productDataSource = null;
let socialPostPersistence = null;
const messageEvents = new EventEmitter();
messageEvents.setMaxListeners(0);
let cachedSupabaseMemberDirectory = {
  fetchedAt: 0,
  members: []
};

function getPublicSupabaseConfig() {
  const supabaseUrl = String(
    process.env.SUPABASE_URL
    || process.env.SUPABASE_PROJECT_URL
    || DEFAULT_SUPABASE_URL
    || ''
  ).trim();
  const supabasePublishableKey = String(
    process.env.SUPABASE_PUBLISHABLE_KEY
    || process.env.SUPABASE_ANON_KEY
    || DEFAULT_SUPABASE_PUBLISHABLE_KEY
    || ''
  ).trim();
  let supabaseProjectRef = '';

  try {
    supabaseProjectRef = new URL(supabaseUrl).host.split('.')[0] || '';
  } catch (error) {
    supabaseProjectRef = '';
  }

  return {
    supabaseUrl,
    supabasePublishableKey,
    supabaseProjectRef,
    publicAuthOrigin: PUBLIC_AUTH_ORIGIN,
    supabaseConfigured: Boolean(supabaseUrl && supabasePublishableKey),
    supabaseSource: process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY
      ? 'env'
      : 'fallback'
  };
}


function getSupabaseStorageConfig() {
  const supabaseUrl = String(
    process.env.SUPABASE_URL
    || process.env.SUPABASE_PROJECT_URL
    || DEFAULT_SUPABASE_URL
    || ''
  ).trim().replace(/\/+$/, '');
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  return {
    supabaseUrl,
    serviceRoleKey,
    configured: Boolean(supabaseUrl && serviceRoleKey)
  };
}

function sanitizeUploadFileName(value) {
  const fallback = `upload-${Date.now()}`;
  const rawName = String(value || fallback).trim() || fallback;
  return rawName
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120) || fallback;
}

function getUploadExtension(fileName, mimeType) {
  const fromName = String(fileName || '').split('.').pop();

  if (fromName && fromName !== fileName && /^[a-zA-Z0-9]{1,12}$/.test(fromName)) {
    return fromName.toLowerCase();
  }

  const normalizedMime = String(mimeType || '').toLowerCase();

  if (normalizedMime.includes('png')) return 'png';
  if (normalizedMime.includes('webp')) return 'webp';
  if (normalizedMime.includes('gif')) return 'gif';
  if (normalizedMime.includes('jpeg') || normalizedMime.includes('jpg')) return 'jpg';
  if (normalizedMime.includes('mp4')) return 'mp4';
  if (normalizedMime.includes('quicktime')) return 'mov';
  if (normalizedMime.includes('webm')) return 'webm';

  return 'bin';
}

function encodeStoragePath(storagePath) {
  return String(storagePath || '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function normalizeSupabaseDirectoryMember(user) {
  if (!user || typeof user !== 'object') {
    return null;
  }

  const id = String(user.id || user.user_id || '').trim();

  if (!id) {
    return null;
  }

  const metadata = user.user_metadata && typeof user.user_metadata === 'object'
    ? user.user_metadata
    : {};
  const email = String(user.email || '').trim();
  const emailBase = email.split('@')[0].trim() || 'socialera.member';
  const displayName = String(
    metadata.full_name
    || metadata.display_name
    || metadata.name
    || emailBase
    || 'SocialEra Member'
  ).trim() || 'SocialEra Member';
  const rawUserName = String(
    metadata.username
    || metadata.user_name
    || emailBase
    || 'socialera.member'
  ).trim().replace(/^@+/, '');
  const updatedAt = String(
    user.last_sign_in_at
    || user.updated_at
    || user.created_at
    || new Date().toISOString()
  ).trim();

  return normalizeMessageContact({
    actorId: `user-${id}`,
    nativeUserId: id,
    displayName,
    userName: `@${rawUserName || 'socialera.member'}`,
    photoUrl: String(
      metadata.avatar_url
      || metadata.picture
      || metadata.avatar
      || metadata.photo_url
      || metadata.photoUrl
      || ''
    ).trim(),
    role: 'member',
    intro: 'Start a direct message with this member.',
    provider: 'member',
    updatedAt,
    lastActiveAt: updatedAt
  });
}

async function loadSupabaseMemberDirectory({ force = false } = {}) {
  const now = Date.now();

  if (!force && cachedSupabaseMemberDirectory.fetchedAt && (now - cachedSupabaseMemberDirectory.fetchedAt) < SUPABASE_MEMBER_DIRECTORY_CACHE_MS) {
    return cachedSupabaseMemberDirectory.members;
  }

  const supabaseUrl = String(process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL || DEFAULT_SUPABASE_URL || '').trim();
  const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return cachedSupabaseMemberDirectory.members;
  }

  const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/admin/users?page=1&per_page=250`, {
    method: 'GET',
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`
    }
  });

  if (!response.ok) {
    const rawText = await response.text().catch(() => '');
    const error = new Error(parseRequestErrorText(rawText) || `Supabase member directory request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }

  const payload = await response.json().catch(() => null);
  const users = Array.isArray(payload && payload.users) ? payload.users : [];
  const members = users
    .map((user) => normalizeSupabaseDirectoryMember(user))
    .filter(Boolean);

  cachedSupabaseMemberDirectory = {
    fetchedAt: now,
    members
  };

  return members;
}

function isPrivateNetworkHostname(hostname) {
  return /^10\.\d+\.\d+\.\d+$/.test(hostname)
    || /^192\.168\.\d+\.\d+$/.test(hostname)
    || /^172\.(1[6-9]|2\d|3[0-1])\.\d+$/.test(hostname)
    || /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(hostname)
    || /^169\.254\.\d+\.\d+$/.test(hostname);
}

function isAllowedCorsOrigin(origin) {
  const normalizedOrigin = String(origin || '').trim().replace(/\/+$/, '');

  if (!normalizedOrigin) {
    return true;
  }

  if (EXTRA_ALLOWED_CORS_ORIGINS.includes(normalizedOrigin)) {
    return true;
  }

  let parsedOrigin = null;

  try {
    parsedOrigin = new URL(normalizedOrigin);
  } catch (error) {
    return false;
  }

  const hostname = String(parsedOrigin.hostname || '').trim().toLowerCase();

  if (!hostname) {
    return false;
  }

  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1'
    || isPrivateNetworkHostname(hostname);
}

app.use(cors({
  origin(origin, callback) {
    if (isAllowedCorsOrigin(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json({ limit: '100mb' }));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    checkoutEnabled: CHECKOUT_ENABLED,
    adminConfigured: ADMIN_CONFIGURED,
    supportConfigured: SUPPORT_CONFIGURED,
    productSource: getProductDataSource().getProductSourceStatus()
  });
});

app.get('/supabase.js', (req, res) => {
  const config = getPublicSupabaseConfig();
  const payload = `import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const config = ${JSON.stringify(config)};
window.SOCIALERA_SUPABASE_CONFIG = config;

if (config.supabaseConfigured && config.supabaseUrl && config.supabasePublishableKey) {
  window.supabase = createClient(config.supabaseUrl, config.supabasePublishableKey);
} else {
  window.supabase = null;
  console.warn('SocialEra Supabase runtime config is missing. Auth-enabled website features are unavailable until SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are configured.');
}

export { config };
export default window.supabase;
`;

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(payload);
});


app.post('/api/uploads/post-media', express.raw({
  type: '*/*',
  limit: '100mb'
}), async (req, res) => {
  try {
    const { supabaseUrl, serviceRoleKey, configured } = getSupabaseStorageConfig();

    if (!configured) {
      return res.status(500).json({
        error: 'Supabase Storage upload is not configured. Add SUPABASE_SERVICE_ROLE_KEY to backend/.env.'
      });
    }

    const fileBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);

    if (!fileBuffer.length) {
      return res.status(400).json({ error: 'No upload file received.' });
    }

    const originalName = sanitizeUploadFileName(req.headers['x-file-name'] || 'post-media');
    const mimeType = String(req.headers['content-type'] || 'application/octet-stream').trim() || 'application/octet-stream';
    const extension = getUploadExtension(originalName, mimeType);
    const actorId = sanitizeUploadFileName(req.headers['x-actor-id'] || 'guest');
    const storagePath = `posts/${actorId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const encodedPath = encodeStoragePath(storagePath);
    const uploadUrl = `${supabaseUrl}/storage/v1/object/post-media/${encodedPath}`;

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': mimeType,
        'x-upsert': 'false'
      },
      body: fileBuffer
    });

    if (!uploadResponse.ok) {
      const rawText = await uploadResponse.text().catch(() => '');
      const message = parseRequestErrorText(rawText) || `Supabase Storage upload failed (${uploadResponse.status})`;
      console.error('Supabase Storage upload failed:', message);
      return res.status(uploadResponse.status).json({ error: message });
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/post-media/${encodedPath}`;

    return res.json({
      url: publicUrl,
      publicUrl,
      path: storagePath,
      bucket: 'post-media'
    });
  } catch (error) {
    console.error('Backend upload route failed:', error);
    return res.status(500).json({
      error: String(error && error.message ? error.message : 'Upload failed')
    });
  }
});

app.use(express.static(FRONTEND_DIR));

function getProductsStore() {
  if (!productsStore) {
    productsStore = createJsonFileStore({
      filePath: PRODUCTS_FILE,
      defaultValue: [],
      label: 'products.json',
      readTransform: (parsed) => Array.isArray(parsed) ? parsed : [],
      writeTransform: (products) => Array.isArray(products) ? products : []
    });
  }

  return productsStore;
}

function readProducts() {
  return getProductsStore().read();
}

function writeProducts(products) {
  return getProductsStore().write(products);
}

function getProductDataSource() {
  if (!productDataSource) {
    productDataSource = createProductDataSource({
      readLocalProducts: readProducts,
      writeLocalProducts: writeProducts,
      normalizeProductInput
    });
  }

  return productDataSource;
}

function getSocialPostPersistence() {
  if (!socialPostPersistence) {
    socialPostPersistence = createSocialPostPersistenceAdapter();
  }

  return socialPostPersistence;
}

function getSupportWorkspaceStore() {
  if (!supportWorkspaceStore) {
    supportWorkspaceStore = createJsonFileStore({
      filePath: SUPPORT_WORKSPACE_FILE,
      defaultValue: { threads: {} },
      label: 'support-workspace.json',
      readTransform: (parsed) => parsed && typeof parsed === 'object'
        ? { threads: parsed.threads && typeof parsed.threads === 'object' ? parsed.threads : {} }
        : { threads: {} },
      writeTransform: (workspace) => ({
        threads: workspace && typeof workspace.threads === 'object' ? workspace.threads : {}
      })
    });
  }

  return supportWorkspaceStore;
}

function readSupportWorkspace() {
  return getSupportWorkspaceStore().read();
}

function writeSupportWorkspace(workspace) {
  return getSupportWorkspaceStore().write(workspace);
}

function readSocialPosts() {
  if (!socialPostsStore) {
    socialPostsStore = createJsonFileStore({
      filePath: SOCIAL_POSTS_FILE,
      defaultValue: [],
      label: 'social-posts.json',
      readTransform: (parsed) => Array.isArray(parsed) ? parsed.map(normalizeSocialPost) : [],
      writeTransform: (posts) => Array.isArray(posts) ? posts.map(normalizeSocialPost) : []
    });
  }

  return socialPostsStore.read();
}

function writeSocialPosts(posts) {
  if (!socialPostsStore) {
    readSocialPosts();
  }

  return socialPostsStore.write(posts);
}

function readSocialMessages() {
  if (!socialMessagesStore) {
    const normalizeMessageStateEntry = (entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const actorId = String(entry.actorId || '').trim();

      if (!actorId) {
        return null;
      }

      const mutedThreadIds = Array.from(new Set(
        (Array.isArray(entry.mutedThreadIds) ? entry.mutedThreadIds : [])
          .map((threadId) => String(threadId || '').trim())
          .filter(Boolean)
      ));
      const forcedUnreadThreadIds = Array.from(new Set(
        (Array.isArray(entry.forcedUnreadThreadIds) ? entry.forcedUnreadThreadIds : [])
          .map((threadId) => String(threadId || '').trim())
          .filter(Boolean)
      ));
      const threadReadState = Object.fromEntries(
        Object.entries(entry.threadReadState && typeof entry.threadReadState === 'object' ? entry.threadReadState : {})
          .map(([threadId, seenAt]) => [String(threadId || '').trim(), String(seenAt || '').trim()])
          .filter(([threadId, seenAt]) => threadId && seenAt)
      );

      return {
        actorId,
        notificationSeenAt: String(entry.notificationSeenAt || '').trim(),
        mutedThreadIds,
        forcedUnreadThreadIds,
        threadReadState,
        updatedAt: String(entry.updatedAt || new Date().toISOString())
      };
    };

    socialMessagesStore = createJsonFileStore({
      filePath: SOCIAL_MESSAGES_FILE,
      defaultValue: { threads: [], members: [], memberThreads: [], memberStates: [] },
      label: 'social-messages.json',
      readTransform: (parsed) => ({
        threads: Array.isArray(parsed && parsed.threads) ? parsed.threads.map(normalizeMessageThread) : [],
        members: Array.isArray(parsed && parsed.members)
          ? parsed.members.map((member) => normalizeMemberProfile(member)).filter((member) => member.actorId)
          : [],
        memberThreads: Array.isArray(parsed && parsed.memberThreads) ? parsed.memberThreads.map(normalizeMemberThread) : [],
        memberStates: Array.isArray(parsed && parsed.memberStates)
          ? parsed.memberStates.map(normalizeMessageStateEntry).filter((entry) => entry && entry.actorId)
          : []
      }),
      writeTransform: (data) => ({
        threads: Array.isArray(data && data.threads) ? data.threads.map(normalizeMessageThread) : [],
        members: Array.isArray(data && data.members)
          ? data.members.map((member) => normalizeMemberProfile(member)).filter((member) => member.actorId)
          : [],
        memberThreads: Array.isArray(data && data.memberThreads) ? data.memberThreads.map(normalizeMemberThread) : [],
        memberStates: Array.isArray(data && data.memberStates)
          ? data.memberStates.map(normalizeMessageStateEntry).filter((entry) => entry && entry.actorId)
          : []
      })
    });
  }

  return socialMessagesStore.read();
}

function writeSocialMessages(data) {
  if (!socialMessagesStore) {
    readSocialMessages();
  }

  return socialMessagesStore.write(data);
}

function readAppearanceSettings() {
  if (!appearanceSettingsStore) {
    appearanceSettingsStore = createJsonFileStore({
      filePath: APPEARANCE_SETTINGS_FILE,
      defaultValue: { users: {} },
      label: 'appearance-settings.json',
      readTransform: (parsed) => ({
        users: parsed && parsed.users && typeof parsed.users === 'object' ? parsed.users : {}
      }),
      writeTransform: (data) => ({
        users: data && data.users && typeof data.users === 'object' ? data.users : {}
      })
    });
  }

  return appearanceSettingsStore.read();
}

function writeAppearanceSettings(data) {
  if (!appearanceSettingsStore) {
    readAppearanceSettings();
  }

  return appearanceSettingsStore.write(data);
}

function emitMessageEvent(payload = {}) {
  const actorIds = Array.from(new Set(
    (Array.isArray(payload.actorIds) ? payload.actorIds : [])
      .map((actorId) => String(actorId || '').trim())
      .filter(Boolean)
  ));
  const {
    actorIds: _ignoredActorIds,
    kind,
    threadId,
    actorId,
    at,
    ...extra
  } = payload || {};

  messageEvents.emit('message-event', {
    id: crypto.randomUUID(),
    kind: String(kind || 'messages-updated').trim() || 'messages-updated',
    actorIds,
    threadId: String(threadId || '').trim(),
    actorId: String(actorId || '').trim(),
    at: String(at || '').trim() || new Date().toISOString(),
    ...extra
  });
}
const { buildMessageContacts, resolveMessageContact } = createMessageContactHelpers({
  readSocialMessages,
  listSocialContactSeeds: async () => {
    const persistence = getSocialPostPersistence();

    if (!persistence || typeof persistence.listMessageContactSeeds !== 'function') {
      return [];
    }

    return persistence.listMessageContactSeeds({ limit: 250 });
  },
  listMemberProfiles: async () => {
    if (!usappPersistence || typeof usappPersistence.listMemberProfiles !== 'function' || !usappPersistence.isConfigured()) {
      return [];
    }

    return usappPersistence.listMemberProfiles({ limit: 250 });
  }
});

function createToken() {
  return crypto.randomBytes(32).toString('hex');
}

function parseCookieHeader(cookieHeader) {
  return String(cookieHeader || '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((accumulator, entry) => {
      const separatorIndex = entry.indexOf('=');

      if (separatorIndex === -1) {
        return accumulator;
      }

      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();

      if (key) {
        accumulator[key] = value;
      }

      return accumulator;
    }, {});
}

function getCookieValue(req, cookieName) {
  const normalizedCookieName = String(cookieName || '').trim();

  if (!normalizedCookieName) {
    return '';
  }

  const cookies = parseCookieHeader(req && req.headers ? req.headers.cookie : '');
  const rawValue = cookies[normalizedCookieName];

  if (!rawValue) {
    return '';
  }

  try {
    return decodeURIComponent(rawValue);
  } catch (error) {
    return rawValue;
  }
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || '';

  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.slice(7).trim();
}

function getBodyAccessToken(req) {
  const token = req && req.body && typeof req.body === 'object'
    ? String(req.body.accessToken || req.body.access_token || '').trim()
    : '';

  return token || null;
}

function getAppAccessToken(req) {
  return getBearerToken(req) || getBodyAccessToken(req);
}

function parseRequestErrorText(value) {
  const raw = String(value || '').trim();

  if (!raw) {
    return '';
  }

  try {
    const parsed = JSON.parse(raw);

    if (parsed && typeof parsed === 'object') {
      return String(parsed.error || parsed.message || parsed.msg || raw).trim();
    }
  } catch (error) {
    return raw;
  }

  return raw;
}

function decodeBase64UrlJson(value) {
  const segment = String(value || '').trim();

  if (!segment) {
    return null;
  }

  try {
    const normalized = segment
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch (error) {
    return null;
  }
}

function getExpectedSupabaseIssuer(supabaseUrl) {
  return String(supabaseUrl || '').trim().replace(/\/+$/, '') + '/auth/v1';
}

function resolveAppUserFromJwtClaims(token, supabaseUrl) {
  const parts = String(token || '').trim().split('.');

  if (parts.length !== 3) {
    return null;
  }

  const payload = decodeBase64UrlJson(parts[1]);

  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const userId = String(payload.sub || payload.user_id || '').trim();
  const expiresAt = Number(payload.exp || 0);
  const issuer = String(payload.iss || '').trim().replace(/\/+$/, '');
  const expectedIssuer = getExpectedSupabaseIssuer(supabaseUrl);

  if (!userId || !expiresAt || expiresAt * 1000 < Date.now() - 30000) {
    return null;
  }

  if (expectedIssuer && issuer && issuer !== expectedIssuer) {
    return null;
  }

  return {
    id: userId,
    email: String(payload.email || '').trim(),
    user_metadata: payload.user_metadata && typeof payload.user_metadata === 'object'
      ? payload.user_metadata
      : {}
  };
}

function getSessionToken(req, cookieName) {
  return getBearerToken(req) || getCookieValue(req, cookieName) || null;
}

async function resolveAuthenticatedAppUser(req) {
  const token = getAppAccessToken(req);
  const {
    supabaseUrl,
    supabasePublishableKey
  } = getPublicSupabaseConfig();

  if (!token || !supabaseUrl || !supabasePublishableKey) {
    return null;
  }

  const tokenTooLargeForProxy = token.length > 7000;

  if (tokenTooLargeForProxy) {
    const claimsUser = resolveAppUserFromJwtClaims(token, supabaseUrl);

    if (claimsUser) {
      return claimsUser;
    }
  }

  const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: supabasePublishableKey,
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const rawText = await response.text().catch(() => '');
    const headerTooLarge = /header|cookie/i.test(rawText) && /too large/i.test(rawText);

    if (headerTooLarge) {
      const claimsUser = resolveAppUserFromJwtClaims(token, supabaseUrl);

      if (claimsUser) {
        return claimsUser;
      }
    }

    const message = parseRequestErrorText(rawText)
      || `Supabase rejected the app session (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const payload = await response.json().catch(() => null);

  if (!payload || !payload.id) {
    return null;
  }

  return {
    id: String(payload.id).trim(),
    email: String(payload.email || '').trim(),
    user_metadata: payload.user_metadata && typeof payload.user_metadata === 'object' ? payload.user_metadata : {}
  };
}

function isSecureRequest(req) {
  const forwardedProto = String(req && req.headers ? req.headers['x-forwarded-proto'] || '' : '').trim().toLowerCase();
  return Boolean((req && req.secure) || forwardedProto === 'https');
}

function appendSessionCookie(res, req, {
  name,
  token,
  ttlMs,
  path = '/'
}) {
  const cookieName = String(name || '').trim();
  const cookieToken = String(token || '').trim();

  if (!cookieName || !cookieToken) {
    return;
  }

  const cookieParts = [
    `${cookieName}=${encodeURIComponent(cookieToken)}`,
    `Max-Age=${Math.max(0, Math.floor(Number(ttlMs || 0) / 1000))}`,
    `Path=${path}`,
    'HttpOnly',
    'SameSite=Lax'
  ];

  if (isSecureRequest(req)) {
    cookieParts.push('Secure');
  }

  res.append('Set-Cookie', cookieParts.join('; '));
}

function clearSessionCookie(res, req, {
  name,
  path = '/'
}) {
  const cookieName = String(name || '').trim();

  if (!cookieName) {
    return;
  }

  const cookieParts = [
    `${cookieName}=`,
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    `Path=${path}`,
    'HttpOnly',
    'SameSite=Lax'
  ];

  if (isSecureRequest(req)) {
    cookieParts.push('Secure');
  }

  res.append('Set-Cookie', cookieParts.join('; '));
}

function createSessionRecord(payload = {}, ttlMs = 60 * 60 * 1000) {
  const loginAt = new Date().toISOString();
  return {
    ...payload,
    loginAt,
    expiresAt: new Date(Date.now() + ttlMs).toISOString()
  };
}

function getValidSession(store, token) {
  if (!token || !store.has(token)) {
    return null;
  }

  const session = store.get(token);
  const expiresAt = new Date(session && session.expiresAt || 0).getTime();

  if (!expiresAt || expiresAt <= Date.now()) {
    store.delete(token);
    return null;
  }

  return session;
}

function pruneExpiredSessions(store) {
  for (const [token, session] of store.entries()) {
    const expiresAt = new Date(session && session.expiresAt || 0).getTime();

    if (!expiresAt || expiresAt <= Date.now()) {
      store.delete(token);
    }
  }
}

function requireAdminAuth(req, res, next) {
  const token = getSessionToken(req, ADMIN_SESSION_COOKIE_NAME);
  const session = getValidSession(activeTokens, token);

  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  req.adminSession = session;
  next();
}

function requireSupportAuth(req, res, next) {
  const token = getSessionToken(req, SUPPORT_SESSION_COOKIE_NAME);
  const session = getValidSession(supportTokens, token);

  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  req.supportRep = session;
  next();
}

function normalizeFulfillmentType(value) {
  const allowed = ['inhouse', 'dropship'];
  const normalized = String(value || 'inhouse').trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : 'inhouse';
}

function normalizeSaleData(input, fallback = {}) {
  const saleEnabled = Boolean(input.saleEnabled ?? fallback.saleEnabled ?? false);
  const regularPrice = Number(input.price ?? fallback.price ?? 0);
  let salePrice = Number(input.salePrice ?? fallback.salePrice ?? 0);
  let saleLabel = String(input.saleLabel ?? fallback.saleLabel ?? 'Sale').trim();

  if (!saleLabel) {
    saleLabel = 'Sale';
  }

  if (!saleEnabled) {
    salePrice = 0;
  }

  if (saleEnabled && (!Number.isFinite(salePrice) || salePrice <= 0)) {
    salePrice = 0;
  }

  if (saleEnabled && Number.isFinite(regularPrice) && regularPrice > 0 && salePrice >= regularPrice) {
    salePrice = regularPrice;
  }

  return {
    saleEnabled,
    salePrice,
    saleLabel
  };
}

function normalizeProductInput(input, existingId = null, fallback = {}) {
  const base = {
    id: existingId,
    name: String(input.name ?? fallback.name ?? '').trim(),
    price: Number(input.price ?? fallback.price ?? 0),
    category: String(input.category ?? fallback.category ?? '').trim(),
    image: String(input.image ?? fallback.image ?? '').trim(),
    stock: Number(input.stock ?? fallback.stock ?? 0),
    featured: Boolean(input.featured ?? fallback.featured ?? false),
    description: String(input.description ?? fallback.description ?? '').trim(),
    fulfillmentType: normalizeFulfillmentType(input.fulfillmentType ?? fallback.fulfillmentType),
    supplierName: String(input.supplierName ?? fallback.supplierName ?? '').trim(),
    supplierSku: String(input.supplierSku ?? fallback.supplierSku ?? '').trim(),
    supplierCost: Number(input.supplierCost ?? fallback.supplierCost ?? 0),
    supplierLink: String(input.supplierLink ?? fallback.supplierLink ?? '').trim(),
    processingTime: String(input.processingTime ?? fallback.processingTime ?? '').trim(),
    shippingTime: String(input.shippingTime ?? fallback.shippingTime ?? '').trim()
  };

  return {
    ...base,
    ...normalizeSaleData(input, { ...fallback, price: base.price })
  };
}

app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

app.use('/api', createAdminSupportRoutes({
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
  getPublicSupabaseConfig,
  readSupportWorkspace,
  writeSupportWorkspace
}));

app.use('/api', createProductRoutes({
  productDataSource: getProductDataSource(),
  requireAdminAuth
}));

app.use('/api', createSocialRoutes({
  readSocialPosts,
  writeSocialPosts,
  socialPostPersistence: getSocialPostPersistence(),
  normalizeSocialPost,
  SOCIAL_IMAGE_POOL,
  findCommentById,
  countNestedComments,
  flattenRecentComments
}));

app.use('/api', createAppearanceRoutes({
  readAppearanceSettings,
  writeAppearanceSettings,
  resolveAuthenticatedAppUser
}));

app.use('/api', createMessageRoutes({
  buildMessageContacts,
  loadSupabaseMemberDirectory,
  readSocialMessages,
  upsertMemberProfile,
  usappPersistence,
  writeSocialMessages,
  normalizeMessageContact,
  serializeMemberThreadForActor,
  getMemberProfile,
  createMemberThread,
  normalizeMessageAttachment,
  normalizeMessageEntry,
  normalizeMemberProfile,
  toggleMessageReaction,
  ensureWelcomeInboxThread,
  resolveMessageContact,
  createMessageThread,
  buildAutoReply,
  normalizeMessageThread,
  messageEvents,
  emitMessageEvent
}));

const listenArgs = HOST ? [PORT, HOST] : [PORT];

app.listen(...listenArgs, () => {
  console.log(`SocialEra backend running at http://localhost:${PORT}`);

  if (!ADMIN_CONFIGURED) {
    console.warn('Admin access is disabled. Set ADMIN_USERNAME and ADMIN_PASSWORD before launch.');
  }

  if (!CHECKOUT_ENABLED) {
    console.warn('Checkout is disabled. Set CHECKOUT_ENABLED=true after a real payment or order workflow is ready.');
  }

});
