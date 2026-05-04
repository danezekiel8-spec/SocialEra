import {
  APP_THEMES,
  APP_THEME_IDS,
  APPEARANCE_PAGE_IDS,
  APPEARANCE_PAGE_OPTIONS,
  DEFAULT_UPLOAD_CHANNELS,
  FEED_RENDER_BATCH,
  GUEST_ACCESSIBLE_VIEWS,
  MAX_APPEARANCE_BACKGROUND_BYTES,
  MAX_APPEARANCE_BACKGROUND_DIMENSION,
  MAX_APPEARANCE_BACKGROUND_FILE_BYTES,
  MAX_PROFILE_PHOTO_BYTES,
  MAX_PROFILE_PHOTO_DIMENSION,
  MAX_VOICE_MESSAGE_BYTES,
  MESSAGE_COMPOSER_EMOJIS,
  MESSAGE_REACTION_EMOJIS,
  PRIMARY_SWIPE_VIEWS,
  STORAGE_KEYS,
  UPLOAD_STEPS,
  USAPP_LIVE_EFFECT_WINDOW_MS,
  USAPP_MESSAGE_LONG_PRESS_MS,
  USAPP_PREVIEW_REPLY_DELAY_MS
} from './src/config/constants.js';
import { createInitialState } from './src/state/store.js';
import {
  getMessageContactsSignature,
  getMessagingSignature,
  getNotificationSignature,
  getPostActivitySignature,
  getUnreadNotificationCount,
  normalizeView,
  shouldRenderMainViewForMessaging,
  titleCase
} from './src/state/selectors.js';
import { VIEW_META } from './src/config/view-meta.js';
import { detectAndroidChromeDevice, detectIOSDevice } from './src/platform/device.js';
import { createApiService, getRequestErrorMessage, isAuthRequestError } from './src/services/api.js';
import { createRuntimeSupabaseConfigService } from './src/services/runtime-supabase.js';
import { createSupabaseSessionService } from './src/services/auth-session.js';
import { createUsappMessageStateService } from './src/usapp/message-state.js';
import { createUsappIdentityService, createUsappNormalizationService } from './src/usapp/normalizers.js';
import {
  renderRefreshIcon,
  renderUsappBrandIcon,
  renderSettingsIcon,
  renderThreadSettingIcon,
  renderUsappAttachIcon,
  renderUsappBackIcon,
  renderUsappCloseIcon,
  renderUsappEmojiIcon,
  renderUsappMicIcon,
  renderUsappReplyIcon,
  renderUsappSearchIcon
} from './src/usapp/render-icons.js';
import { createUsappContactRenderService } from './src/usapp/render-contacts.js';
import { createUsappPresenceRenderService } from './src/usapp/render-presence.js';
import { createUsappThreadSettingsRenderService } from './src/usapp/render-thread-settings.js';
import { createUsappThreadRenderService } from './src/usapp/render-threads.js';
import { createUsappSessionService } from './src/usapp/session.js';
import { createAuthProfileController } from './src/controllers/auth-profile.js';
import { createSheetPanelController } from './src/controllers/sheet-panels.js';
import { createViewNavigationController } from './src/controllers/view-navigation.js';
import { createAuthViewRenderService } from './src/views/auth.js';
import { createBagViewRenderService } from './src/views/bag.js';
import { createDiscoverViewRenderService } from './src/views/discover.js';
import { createSearchViewRenderService } from './src/views/search.js';

const APP_CONFIG = window.SOCIALERA_APP_CONFIG || {};
let runtimeSupabaseUrl = '';
let runtimeSupabasePublishableKey = '';
let runtimePublicAuthOrigin = '';
const IOS_DEVICE = detectIOSDevice();
const ANDROID_CHROME_DEVICE = detectAndroidChromeDevice();
const ACTIVITY_POLL_INTERVAL_MS = IOS_DEVICE ? 10000 : 5000;
const MESSAGE_POLL_INTERVAL_MS = IOS_DEVICE ? 8000 : 5000;
const SPOTLIGHT_SLIDESHOW_INTERVAL_MS = IOS_DEVICE ? 5200 : 3200;
const initialGuestActorId = ensureActorId();
const initialGuestProfile = loadProfile();
const initialActiveView = normalizeStoredView(loadText(STORAGE_KEYS.activeView) || 'home');
const initialAppearanceSettings = loadCachedAppearanceSettings(initialGuestActorId, {
  themeFallback: loadTheme()
});

const state = createInitialState({
  apiBase: normalizeApiBase(APP_CONFIG.apiBase || '/api'),
  assetBase: String(APP_CONFIG.assetBase || '/').trim() || '/',
  appearanceSettings: initialAppearanceSettings,
  bag: loadBag(),
  createUploadDraft,
  feedRenderBatch: FEED_RENDER_BATCH,
  guestProfile: initialGuestProfile,
  initialActiveView,
  initialForcedUnreadThreadIds: loadForcedUnreadThreadIds(initialGuestActorId),
  initialGuestActorId,
  initialMessageReplyDecorations: loadMessageReplyDecorations(initialGuestActorId),
  initialMutedThreadIds: loadMutedThreadIds(initialGuestActorId),
  initialNotificationSeenAt: loadNotificationSeenAt(initialGuestActorId),
  initialSelectedThreadId: loadText(STORAGE_KEYS.selectedThread) || '',
  initialSharedPosts: loadSharedPosts(initialGuestActorId),
  initialTheme: initialAppearanceSettings.theme,
  iosOptimized: IOS_DEVICE,
  uploadSteps: UPLOAD_STEPS
});

const apiService = createApiService({
  fetchImpl: (...args) => fetch(...args),
  getApiBase: () => state.apiBase,
  getAuthSession: () => state.authSession,
  getBackendOrigin: () => String(APP_CONFIG.backendOrigin || '').trim().replace(/\/+$/, '')
});

const runtimeSupabaseConfigService = createRuntimeSupabaseConfigService({
  fetchImpl: (...args) => fetch(...args),
  getApiBase: () => state.apiBase,
  getRuntimeSupabaseUrl: () => runtimeSupabaseUrl,
  setRuntimeSupabaseConfig: ({ supabaseUrl, supabasePublishableKey, publicAuthOrigin }) => {
    runtimeSupabaseUrl = supabaseUrl;
    runtimeSupabasePublishableKey = supabasePublishableKey;
    runtimePublicAuthOrigin = String(publicAuthOrigin || '').trim().replace(/\/+$/, '');
  }
});

const supabaseSessionService = createSupabaseSessionService({
  forceReauth,
  getAuthSession: () => state.authSession,
  getAuthUser: () => state.authUser,
  getSupabaseClient: () => (
    supabaseClient && typeof supabaseClient.from === 'function'
      ? supabaseClient
      : null
  ),
  logger: console,
  setAuthSession: (session) => {
    state.authSession = session;
  },
  setAuthUser: (user) => {
    state.authUser = user;
  }
});

const usappIdentityService = createUsappIdentityService({
  getAuthUserId: () => (state.authUser && state.authUser.id ? String(state.authUser.id).trim() : ''),
  getActorId: () => state.actorId
});

const usappNormalizationService = createUsappNormalizationService({
  getCurrentAuthUserId: () => (state.authUser && state.authUser.id ? String(state.authUser.id).trim() : ''),
  getCurrentProfile: () => state.profile,
  getInitials,
  getMessageActorId: () => usappIdentityService.getMessageActorId(),
  getUserIdFromActorId: (actorId) => usappIdentityService.getUserIdFromActorId(actorId),
  getActorIdFromUserId: (userId) => usappIdentityService.getActorIdFromUserId(userId),
  isCurrentActorId: (actorId) => usappIdentityService.isCurrentActorId(actorId),
  normalizeUserName
});

const getActorIdFromUserId = (...args) => usappIdentityService.getActorIdFromUserId(...args);
const getUserIdFromActorId = (...args) => usappIdentityService.getUserIdFromActorId(...args);
const getMessageActorId = (...args) => usappIdentityService.getMessageActorId(...args);
const isCurrentActorId = (...args) => usappIdentityService.isCurrentActorId(...args);
const normalizeContact = (...args) => usappNormalizationService.normalizeContact(...args);
const normalizeContacts = (...args) => usappNormalizationService.normalizeContacts(...args);
const normalizeMessage = (...args) => usappNormalizationService.normalizeMessage(...args);
const normalizeMessageAttachmentInput = (...args) => usappNormalizationService.normalizeMessageAttachmentInput(...args);
const normalizeMessageReaction = (...args) => usappNormalizationService.normalizeMessageReaction(...args);
const normalizeSupabaseMessage = (...args) => usappNormalizationService.normalizeSupabaseMessage(...args);
const normalizeSupabaseMessageContact = (...args) => usappNormalizationService.normalizeSupabaseMessageContact(...args);
const normalizeSupabaseMessageThread = (...args) => usappNormalizationService.normalizeSupabaseMessageThread(...args);
const normalizeThread = (...args) => usappNormalizationService.normalizeThread(...args);
const normalizeThreads = (...args) => usappNormalizationService.normalizeThreads(...args);
const buildMessageContactKey = (...args) => usappNormalizationService.buildMessageContactKey(...args);
const mergeMessageContacts = (...args) => usappNormalizationService.mergeMessageContacts(...args);
const buildFallbackSupabaseThread = (...args) => usappNormalizationService.buildFallbackSupabaseThread(...args);

const usappMessageStateService = createUsappMessageStateService({
  apiService,
  buildProfileFromAuthUser,
  getAuthUser: () => state.authUser,
  getForcedUnreadThreadIds: () => state.forcedUnreadThreadIds,
  getMessageActorId: () => usappIdentityService.getMessageActorId(),
  getMutedThreadIds: () => state.mutedThreadIds,
  getNotificationSeenAt: () => state.notificationSeenAt,
  getThreadReadState: () => loadThreadReadState(),
  getThreads: () => state.threads,
  persistForcedUnreadThreadIds,
  persistMutedThreadIds,
  persistNotificationSeenAt,
  persistProfilePhotoOverride,
  persistThreadReadState,
  setForcedUnreadThreadIds: (value) => {
    state.forcedUnreadThreadIds = value;
  },
  setMutedThreadIds: (value) => {
    state.mutedThreadIds = value;
  },
  setNotificationSeenAt: (value) => {
    state.notificationSeenAt = value;
  },
  setProfile: (value) => {
    state.profile = value;
  },
  setThreads: (value) => {
    state.threads = value;
  },
  normalizeProfilePhotoValue,
  normalizeUserName,
  queueSyncFallback: (error) => {
    console.error('Could not sync shared message state:', error);
  }
});

const usappSessionService = createUsappSessionService({
  apiService,
  ensureSupabaseSessionState: (...args) => supabaseSessionService.ensureSupabaseSessionState(...args),
  getAuthUser: () => state.authUser,
  getMessageActorId: () => usappIdentityService.getMessageActorId(),
  hydrateMessageReplyDecorations,
  isMemberMessageContact,
  mergeMessageContacts: (...args) => usappNormalizationService.mergeMessageContacts(...args),
  normalizeContacts: (...args) => usappNormalizationService.normalizeContacts(...args),
  normalizeThreads: (...args) => usappNormalizationService.normalizeThreads(...args),
  onSessionReady: async (session) => {
    await syncAuthSession(session, {
      renderNow: false,
      refreshNow: false
    });
  }
});

const normalizeMessageStatePayload = (...args) => usappMessageStateService.normalizeMessageStatePayload(...args);
const buildMessageStateSnapshot = (...args) => usappMessageStateService.buildMessageStateSnapshot(...args);
const applyThreadReadStateToThreads = (...args) => usappMessageStateService.applyThreadReadStateToThreads(...args);
const applyRemoteMessageStatePayload = (...args) => usappMessageStateService.applyRemoteMessageStatePayload(...args);
const loadRemoteMessageState = (...args) => usappMessageStateService.loadRemoteMessageState(...args);
const syncRemoteMessageState = (...args) => usappMessageStateService.syncRemoteMessageState(...args);
const queueRemoteMessageStateSync = (...args) => usappMessageStateService.queueRemoteMessageStateSync(...args);
const ensureUsappMemberSession = (...args) => usappSessionService.ensureUsappMemberSession(...args);
const loadMessagingContacts = (...args) => usappSessionService.loadMessagingContacts(...args);
const loadMessagingThreads = (...args) => usappSessionService.loadMessagingThreads(...args);

const elements = {
  phoneShell: document.querySelector('.phone-shell'),
  topbar: document.querySelector('.topbar'),
  topbarActions: document.querySelector('.topbar-actions'),
  viewRoot: document.getElementById('view-root'),
  commentSheetRoot: document.getElementById('comment-sheet-root'),
  notificationSheetRoot: document.getElementById('notification-sheet-root'),
  usappSheetRoot: document.getElementById('usapp-sheet-root'),
  dockLayer: document.querySelector('.dock-layer'),
  refreshButton: document.getElementById('refresh-button'),
  notificationBadge: document.getElementById('notification-badge'),
  profileShortcut: document.getElementById('profile-shortcut'),
  messagesBadge: document.getElementById('messages-badge'),
  installButton: document.getElementById('install-button'),
  toast: document.getElementById('toast'),
  navButtons: Array.from(document.querySelectorAll('[data-nav-view]')),
  navBadges: Array.from(document.querySelectorAll('[data-badge-for]'))
};

let toastTimer = null;
let spotlightTimer = null;
let activityPollTimer = null;
let activityRefreshPromise = null;
let messagePollTimer = null;
let messageRefreshTimer = null;
let messageSearchSyncTimer = null;
let messageRefreshPromise = null;
let pendingMessageRefreshOptions = null;
let coreBackendRetryTimer = null;
let lastRenderedView = '';
let usappEventSource = null;
let usappEventReconnectTimer = null;
let lastUsappSheetMarkup = '';
let lastDockScrollTop = 0;
let liveNotificationSeeded = false;
let lastUnreadNotificationIds = new Set();
let supabaseClient = null;
let usappMessageGesture = null;
let usappPullGesture = null;
let voiceRecorder = null;
let voiceRecorderStream = null;
let voiceRecorderChunks = [];
let viewportVideoObserver = null;
let chromeMetricsFrame = 0;
let feedAutoExpandFrame = 0;
let authMetadataRepairPromise = null;
const viewportVideoVisibility = new WeakMap();
const swipeState = {
  tracking: false,
  startX: 0,
  startY: 0
};
const USAPP_PRESENCE_ONLINE_WINDOW_MS = 5 * 60 * 1000;
const USAPP_PULL_REFRESH_THRESHOLD_PX = 42;
const USAPP_PULL_REFRESH_MAX_PX = 96;

const usappPresenceRenderService = createUsappPresenceRenderService({
  escapeHtml,
  formatRelativeTime,
  isMemberMessageContact,
  onlineWindowMs: USAPP_PRESENCE_ONLINE_WINDOW_MS
});

const getUsappPresenceTimestamp = (...args) => usappPresenceRenderService.getUsappPresenceTimestamp(...args);
const isUsappContactOnline = (...args) => usappPresenceRenderService.isUsappContactOnline(...args);
const getUsappPresenceLabel = (...args) => usappPresenceRenderService.getUsappPresenceLabel(...args);
const renderUsappPresenceBadge = (...args) => usappPresenceRenderService.renderUsappPresenceBadge(...args);

const usappContactRenderService = createUsappContactRenderService({
  escapeHtml,
  getContactProvider,
  getMessageRoleLabel,
  getRoleSlug,
  renderAvatarMedia,
  renderEmptyCard,
  renderUsappPresenceBadge
});

const renderMessageContactChip = (...args) => usappContactRenderService.renderMessageContactChip(...args);

const usappThreadRenderService = createUsappThreadRenderService({
  escapeHtml,
  formatRelativeTime,
  getMessageRoleLabel: (...args) => getMessageRoleLabel(...args),
  getMessageThreadPreview: (...args) => getMessageThreadPreview(...args),
  getRoleSlug: (...args) => getRoleSlug(...args),
  getUsappThreadLiveClass: (...args) => getUsappThreadLiveClass(...args),
  isThreadMuted: (...args) => isThreadMuted(...args),
  isThreadUnread: (...args) => isThreadUnread(...args),
  renderAvatarMedia,
  renderEmptyCard,
  renderUsappPresenceBadge
});

const usappThreadSettingsRenderService = createUsappThreadSettingsRenderService({
  escapeHtml,
  isThreadMuted: (...args) => isThreadMuted(...args),
  isThreadUnread: (...args) => isThreadUnread(...args),
  renderThreadSettingIcon
});

const searchViewRenderService = createSearchViewRenderService({
  escapeHtml,
  getCatalogContext,
  renderCatalogResultsSection
});

const discoverViewRenderService = createDiscoverViewRenderService({
  escapeHtml,
  getBagCount,
  getCatalogContext,
  isSignedIn,
  renderCatalogResultsSection,
  renderCatalogSearchExperience,
  renderFilterChip
});

const authViewRenderService = createAuthViewRenderService({
  renderAuthCard
});

const bagViewRenderService = createBagViewRenderService({
  formatCompactNumber,
  formatCurrency,
  getBagCount,
  getBagItems,
  renderBagItem,
  renderEmptyCard
});

const viewNavigationController = createViewNavigationController({
  openUsappSheet,
  setActiveView
});

const authProfileController = createAuthProfileController({
  clearProfilePhoto,
  render,
  signOutAccount,
  state
});

const sheetPanelController = createSheetPanelController({
  clearCommentReply,
  closeCommentSheet,
  closeNotificationSheet,
  openCommentSheet,
  openNotificationPost,
  openNotificationThread,
  startCommentReply
});

window.addEventListener('error', (event) => {
  reportStartupError(event && event.error ? event.error : event);
});

window.addEventListener('unhandledrejection', (event) => {
  reportStartupError(event && event.reason ? event.reason : event);
});

try {
  init().catch((error) => {
    reportStartupError(error);
  });
} catch (error) {
  reportStartupError(error);
}

function reportStartupError(error) {
  const message = String(
    error && (error.stack || error.message)
      ? error.stack || error.message
      : error || 'Unknown startup error'
  ).trim();

  console.error('SocialEra app startup error:', error);

  if (!elements.viewRoot) {
    return;
  }

  elements.viewRoot.innerHTML = `
    <div class="view-shell" data-view="startup-error">
      <div class="section-stack">
        <section class="card connection-card">
          <div>
            <p class="section-label">App error</p>
            <h3>SocialEra could not finish loading.</h3>
            <p>Refresh once after this fix. If it still fails, this message will show the startup error instead of a blank screen.</p>
          </div>
          <pre class="helper-text" style="white-space: pre-wrap; word-break: break-word;">${escapeHtml(message)}</pre>
        </section>
      </div>
    </div>
  `;
}

async function init() {
  bindEvents();
  applyTheme();
  updateHeader();
  render();
  registerServiceWorker();
  await initSupabase();
  await refreshData();
}

async function initSupabase() {
  state.authReady = false;
  state.authAvailable = true;

  try {
    const runtimeSupabaseConfig = await runtimeSupabaseConfigService.loadRuntimeSupabaseConfig();

    if (!runtimeSupabaseConfig.supabaseConfigured) {
      throw new Error('Supabase runtime config is missing. Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to the backend environment.');
    }

    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm');

    supabaseClient = createClient(runtimeSupabaseConfig.supabaseUrl, runtimeSupabaseConfig.supabasePublishableKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    });

    window.supabase = supabaseClient;

    const { data, error } = await supabaseClient.auth.getSession();

    if (error) {
      throw error;
    }

    await syncAuthSession(data && data.session ? data.session : null, {
      renderNow: false,
      refreshNow: false
    });
    await maybeRepairOversizedAuthSession();

    supabaseClient.auth.onAuthStateChange((_event, session) => {
      syncAuthSession(session, {
        renderNow: true,
        refreshNow: state.ready
      }).catch(() => null);
    });
  } catch (error) {
    console.error(error);
    const message = String(error && error.message ? error.message : '').trim();
    const networkIssue = /failed to fetch|networkerror|network request failed|load failed|could not resolve/i.test(message);
    state.authAvailable = false;
    state.authMessage = {
      type: 'error',
      text: networkIssue
        ? 'Account login is unavailable because the configured Supabase project could not be reached. Guest mode still works.'
        : (message || 'Account login is unavailable right now. Guest mode still works.')
    };
  } finally {
    state.authReady = true;
    render();
  }
}

async function syncAuthSession(session, { renderNow = true, refreshNow = false } = {}) {
  const previousActorId = state.actorId;
  const nextUser = session && session.user ? session.user : null;

  state.authSession = session || null;
  state.authUser = nextUser;
  state.actorId = nextUser && nextUser.id ? String(nextUser.id) : state.deviceActorId;
  state.profile = nextUser ? buildProfileFromAuthUser(nextUser) : { ...state.guestProfile };
  state.sharedPosts = loadSharedPosts(state.actorId);
  state.notificationSeenAt = loadNotificationSeenAt(state.actorId);
  state.forcedUnreadThreadIds = loadForcedUnreadThreadIds(state.actorId);
  state.mutedThreadIds = loadMutedThreadIds(state.actorId);
  state.messageReplyDecorations = loadMessageReplyDecorations(state.actorId);
  state.activeNotificationPanel = false;
  state.appearanceSettings = loadCachedAppearanceSettings(state.actorId, {
    themeFallback: nextUser ? state.theme : loadTheme()
  });
  state.appearanceDraft = cloneAppearanceSettings(state.appearanceSettings);
  if (state.appearancePendingBackgroundUrl) {
    state.appearanceDraft = normalizeAppearanceSettings({
      ...state.appearanceDraft,
      backgroundUrl: state.appearancePendingBackgroundUrl,
      backgroundEnabled: true
    }, state.appearanceSettings);
  }
  state.theme = state.appearanceSettings.theme;
  resetLiveNotificationState();

  if (refreshNow && previousActorId !== state.actorId) {
    state.selectedThreadId = '';
    await refreshData({ quiet: true });
    return;
  }

  if (renderNow) {
    render();
  }

  syncUsappLiveStream();
  syncActivityAutoRefresh();

  if (nextUser) {
    window.setTimeout(() => {
      syncMessageProfile().catch((error) => {
        console.error('Could not refresh member presence after sign-in:', error);
      });
    }, 0);
  }
}

function bindEvents() {
  document.addEventListener('click', handleClick);
  document.addEventListener('submit', handleSubmit);
  document.addEventListener('input', handleInput);
  document.addEventListener('change', handleChange);
  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('focusin', handleFocusIn);
  document.addEventListener('focusout', handleFocusOut);
  document.addEventListener('pointerdown', handleUsappPointerDown);
  document.addEventListener('pointermove', handleUsappPointerMove, { passive: false });
  document.addEventListener('pointerup', handleUsappPointerUp);
  document.addEventListener('pointercancel', resetUsappGestures);
  document.addEventListener('touchstart', handleUsappTouchStart, { passive: true });
  document.addEventListener('touchmove', handleUsappTouchMove, { passive: false });
  document.addEventListener('touchend', handleUsappTouchEnd, { passive: true });
  document.addEventListener('touchcancel', resetUsappPullGesture, { passive: true });
  bindSwipeNavigation();
  elements.viewRoot.addEventListener('scroll', handleViewScroll, { passive: true });
  window.addEventListener('scroll', handleViewScroll, { passive: true });
  window.addEventListener('wheel', handleViewScroll, { passive: true });
  window.addEventListener('resize', scheduleChromeMetricsSync, { passive: true });
  window.addEventListener('resize', syncInstallButton, { passive: true });
  document.addEventListener('visibilitychange', handleVisibilityChange);

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleChromeMetricsSync);
    window.visualViewport.addEventListener('scroll', scheduleChromeMetricsSync);
    window.visualViewport.addEventListener('resize', syncInstallButton);
  }

  elements.refreshButton.addEventListener('click', toggleNotificationSheet);

  elements.profileShortcut.addEventListener('click', () => {
    viewNavigationController.handleProfileShortcutClick();
  });

  elements.installButton.addEventListener('click', async () => {
    await promptInstallApp();
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.installPrompt = event;
    syncInstallButton();
  });

  window.addEventListener('appinstalled', () => {
    state.installPrompt = null;
    syncInstallButton();
    showToast('SocialEra App installed.');
  });
}

async function promptInstallApp() {
  if (!state.installPrompt) {
    showToast('Install becomes available once the browser allows it.');
    return;
  }

  state.installPrompt.prompt();
  await state.installPrompt.userChoice.catch(() => null);
  state.installPrompt = null;
  syncInstallButton();
  render();
}

function handleViewScroll() {
  if (!elements.dockLayer) {
    return;
  }

  const currentScrollTop = getPrimaryScrollTop();

  if (currentScrollTop > lastDockScrollTop + 2) {
    elements.dockLayer.classList.add('scroll-hidden');
  } else if (currentScrollTop < lastDockScrollTop - 2 || currentScrollTop <= 4) {
    revealDockLayer();
  }

  lastDockScrollTop = currentScrollTop;
  scheduleFeedAutoExpandCheck();
}

function bindSwipeNavigation() {
  elements.viewRoot.addEventListener('touchstart', handleSwipeStart, { passive: true });
  elements.viewRoot.addEventListener('touchend', handleSwipeEnd, { passive: true });
  elements.viewRoot.addEventListener('touchcancel', resetSwipeState, { passive: true });
}

function handleSwipeStart(event) {
  if (event.touches.length !== 1 || shouldIgnoreSwipeTarget(event.target)) {
    resetSwipeState();
    return;
  }

  const touch = event.touches[0];
  swipeState.tracking = true;
  swipeState.startX = touch.clientX;
  swipeState.startY = touch.clientY;
}

function handleSwipeEnd(event) {
  if (!swipeState.tracking || event.changedTouches.length !== 1) {
    resetSwipeState();
    return;
  }

  const touch = event.changedTouches[0];
  const deltaX = touch.clientX - swipeState.startX;
  const deltaY = touch.clientY - swipeState.startY;
  resetSwipeState();

  if (!PRIMARY_SWIPE_VIEWS.includes(state.activeView)) {
    return;
  }

  if (Math.abs(deltaX) < 56 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.15) {
    return;
  }

  const nextView = getSwipeDestination(deltaX < 0 ? 'next' : 'previous');

  if (!nextView || nextView === state.activeView) {
    return;
  }

  setActiveView(nextView);
}

function shouldIgnoreSwipeTarget(target) {
  return Boolean(
    target instanceof Element
      && target.closest('button, input, textarea, select, label, a, summary, [role="button"], .chip-row, .thread-chip-row, .qty-controls, .spotlight-track')
  );
}

function getSwipeDestination(direction) {
  const index = PRIMARY_SWIPE_VIEWS.indexOf(state.activeView);

  if (index === -1) {
    return '';
  }

  if (direction === 'next') {
    return PRIMARY_SWIPE_VIEWS[Math.min(index + 1, PRIMARY_SWIPE_VIEWS.length - 1)];
  }

  return PRIMARY_SWIPE_VIEWS[Math.max(index - 1, 0)];
}

function resetSwipeState() {
  swipeState.tracking = false;
  swipeState.startX = 0;
  swipeState.startY = 0;
}

async function refreshData({ quiet = false } = {}) {
  if (!quiet) {
    state.loading = true;
    render();
  }

  const requests = await Promise.allSettled([
    refreshConnectedAccountProfile(),
    loadSocialFeedPosts(),
    apiService.fetchJson('/products', { omitAuth: true }),
    loadMessagingContacts(),
    loadMessagingThreads(),
    state.authUser ? loadRemoteMessageState() : Promise.resolve(null),
    state.authUser ? loadAppearanceSettings({ quiet: true, syncDraft: true }) : Promise.resolve(state.appearanceSettings)
  ]);

  const [, postsResult, productsResult, contactsResult, threadsResult, messageStateResult] = requests;
  const coreBackendAvailable = postsResult.status === 'fulfilled' && productsResult.status === 'fulfilled';

  const fetchedPosts = postsResult.status === 'fulfilled' ? postsResult.value : null;
  const shouldPreserveExistingPosts = Array.isArray(state.posts) && state.posts.length && (!Array.isArray(fetchedPosts) || !fetchedPosts.length);

  state.posts = shouldPreserveExistingPosts
    ? state.posts
    : mergePostCollections(
      Array.isArray(fetchedPosts) ? fetchedPosts : [],
      []
    );
  state.products = productsResult.status === 'fulfilled'
    ? normalizeProducts(productsResult.value)
    : buildFallbackProducts();
  state.contacts = contactsResult.status === 'fulfilled'
    ? contactsResult.value
    : [];
  state.threads = threadsResult.status === 'fulfilled'
    ? threadsResult.value
    : [];

  updateUsappLoadStatus({
    contactResult: contactsResult,
    threadResult: threadsResult
  });

  if (messageStateResult && messageStateResult.status === 'fulfilled' && messageStateResult.value) {
    applyRemoteMessageStatePayload(messageStateResult.value, {
      syncIfMissing: true
    });
  }

  if (coreBackendAvailable) {
    state.coreBackendFailureCount = 0;

    if (coreBackendRetryTimer) {
      window.clearTimeout(coreBackendRetryTimer);
      coreBackendRetryTimer = null;
    }
  } else {
    state.coreBackendFailureCount += 1;

    if (!quiet && state.coreBackendFailureCount === 1 && !coreBackendRetryTimer) {
      coreBackendRetryTimer = window.setTimeout(() => {
        coreBackendRetryTimer = null;
        refreshData({ quiet: true }).catch(() => null);
      }, 1400);
    }
  }

  state.offlineMode = !coreBackendAvailable;
  state.loading = false;
  state.ready = true;

  if (!state.selectedThreadId || !state.threads.some((thread) => thread.id === state.selectedThreadId)) {
    state.selectedThreadId = state.threads[0] ? state.threads[0].id : '';
    persistText(STORAGE_KEYS.selectedThread, state.selectedThreadId);
  }

  render();
  syncMessageAutoRefresh();
  primeLiveNotificationState();
  syncActivityAutoRefresh();

  if (!coreBackendAvailable && !quiet && state.coreBackendFailureCount > 1) {
    showToast('Preview mode is active while the backend is unavailable.');
  }
}

async function refreshConnectedAccountProfile() {
  const supabase = supabaseSessionService.getSupabaseClient();

  if (!supabase || !state.authUser) {
    return null;
  }

  const result = await supabase.auth.getUser();

  if (result.error) {
    throw result.error;
  }

  if (result.data && result.data.user) {
    let syncedProfile = null;

    try {
      syncedProfile = await loadSyncedAccountProfile(String(result.data.user.id || '').trim());
    } catch (error) {
      console.error('Could not load synced account profile:', error);
    }

    state.authUser = result.data.user;
    state.profile = buildProfileFromAuthUser(state.authUser, syncedProfile);
    persistProfilePhotoOverride('', state.actorId);
  }

  return state.authUser;
}

function pruneUsappLiveEffects(now = Date.now()) {
  state.liveMessageEffects = Object.fromEntries(
    Object.entries(state.liveMessageEffects || {}).filter(([, entry]) => entry && now - Number(entry.at || 0) < USAPP_LIVE_EFFECT_WINDOW_MS)
  );

  state.liveThreadEffects = Object.fromEntries(
    Object.entries(state.liveThreadEffects || {}).filter(([, entry]) => entry && now - Number(entry.at || 0) < USAPP_LIVE_EFFECT_WINDOW_MS)
  );
}

function markUsappThreadLive(threadId, type = 'incoming', at = Date.now()) {
  const id = String(threadId || '').trim();

  if (!id) {
    return;
  }

  pruneUsappLiveEffects(at);
  state.liveThreadEffects[id] = {
    type: type === 'outgoing' ? 'outgoing' : 'incoming',
    at
  };
}

function markUsappMessageLive(messageId, type = 'incoming', at = Date.now()) {
  const id = String(messageId || '').trim();

  if (!id) {
    return;
  }

  pruneUsappLiveEffects(at);
  state.liveMessageEffects[id] = {
    type: type === 'outgoing' ? 'outgoing' : 'incoming',
    at
  };
}

function getUsappThreadLiveClass(threadId) {
  if (state.iosOptimized) {
    return '';
  }

  const id = String(threadId || '').trim();

  if (!id) {
    return '';
  }

  pruneUsappLiveEffects();
  const entry = state.liveThreadEffects[id];

  if (!entry || state.usappAnimateIn) {
    return '';
  }

  return entry.type === 'outgoing' ? 'live-outgoing' : 'live-incoming';
}

function getUsappMessageLiveClass(messageId) {
  if (state.iosOptimized) {
    return '';
  }

  const id = String(messageId || '').trim();

  if (!id) {
    return '';
  }

  pruneUsappLiveEffects();
  const entry = state.liveMessageEffects[id];

  if (!entry || state.usappAnimateIn) {
    return '';
  }

  return entry.type === 'outgoing' ? 'live-outgoing' : 'live-incoming';
}

function markUsappLiveChanges(previousThreads = [], nextThreads = []) {
  const previousById = new Map((Array.isArray(previousThreads) ? previousThreads : []).map((thread) => [thread.id, thread]));
  let selectedThreadUpdated = false;

  (Array.isArray(nextThreads) ? nextThreads : []).forEach((thread) => {
    const previousThread = previousById.get(thread.id);
    const previousMessageIds = new Set(
      Array.isArray(previousThread && previousThread.messages)
        ? previousThread.messages.map((message) => message.id)
        : []
    );
    const newMessages = (Array.isArray(thread.messages) ? thread.messages : []).filter((message) => !previousMessageIds.has(message.id));

    if (!newMessages.length) {
      return;
    }

    const latestMessage = newMessages[newMessages.length - 1];
    const latestType = isCurrentActorId(latestMessage.senderActorId) ? 'outgoing' : 'incoming';
    markUsappThreadLive(thread.id, latestType);

    if (state.activeView === 'inbox' && state.messagePanelMode === 'thread' && state.selectedThreadId === thread.id) {
      newMessages.forEach((message) => {
        markUsappMessageLive(message.id, isCurrentActorId(message.senderActorId) ? 'outgoing' : 'incoming');
      });
      selectedThreadUpdated = true;
    }
  });

  return {
    selectedThreadUpdated
  };
}

function applyIncomingMemberMessageEvent(payload = {}) {
  const nativeThreadId = String(payload.threadId || '').trim();

  if (!nativeThreadId || !payload.message) {
    return false;
  }

  const thread = state.threads.find((entry) => (
    entry
    && entry.provider === 'member'
    && (
      String(entry.nativeId || '').trim() === nativeThreadId
      || String(entry.id || '').trim() === nativeThreadId
      || String(entry.id || '').trim() === `member:${nativeThreadId}`
    )
  ));

  if (!thread) {
    return false;
  }

  const nextMessage = normalizeMessage(payload.message, 'member', thread.contact || {});

  if (!nextMessage) {
    return false;
  }

  if (Array.isArray(thread.messages) && thread.messages.some((message) => message.id === nextMessage.id)) {
    return true;
  }

  const previousThreadSnapshot = {
    id: thread.id,
    messages: Array.isArray(thread.messages)
      ? thread.messages.map((message) => ({
          id: message.id,
          senderActorId: message.senderActorId
        }))
      : []
  };
  const nextThread = {
    ...thread,
    messages: [...(Array.isArray(thread.messages) ? thread.messages : []), nextMessage]
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()),
    updatedAt: String(payload.updatedAt || nextMessage.createdAt || thread.updatedAt || new Date().toISOString()).trim()
  };

  state.threads = [nextThread, ...state.threads.filter((entry) => entry.id !== nextThread.id)];
  const liveUpdate = markUsappLiveChanges([previousThreadSnapshot], [nextThread]);

  if (state.activeView === 'inbox' && state.messagePanelMode === 'thread' && state.selectedThreadId === nextThread.id) {
    markThreadRead(nextThread);
  }

  refreshMessagingUi({
    scrollToLatest: liveUpdate.selectedThreadUpdated && state.activeView === 'inbox' && state.messagePanelMode === 'thread',
    scrollBehavior: 'auto'
  });

  queueMessageRefresh({ delayMs: 600, includeContacts: false });
  return true;
}

function queueLocalPreviewReply(threadId, contact) {
  const normalizedThreadId = String(threadId || '').trim();

  if (!normalizedThreadId) {
    return;
  }

  window.setTimeout(() => {
    const thread = state.threads.find((entry) => entry.id === normalizedThreadId);

    if (!thread || thread.provider !== 'local') {
      return;
    }

    const incomingMessage = normalizeMessage({
      id: `local-incoming-${Date.now()}`,
      senderActorId: (contact && contact.actorId) || (thread.contact && thread.contact.actorId) || 'socialera-support',
      authorName: (contact && contact.displayName) || (thread.contact && thread.contact.displayName) || 'SocialEra Support',
      userName: (contact && contact.userName) || (thread.contact && thread.contact.userName) || '@socialera.support',
      avatar: (contact && contact.avatar) || (thread.contact && thread.contact.avatar) || 'SE',
      photoUrl: (contact && contact.photoUrl) || (thread.contact && thread.contact.photoUrl) || '',
      text: 'Preview mode is active, so this reply is local to the app for now.',
      attachments: [],
      reactions: [],
      createdAt: new Date().toISOString()
    }, 'local', contact || thread.contact || {});

    thread.messages.push(incomingMessage);
    thread.updatedAt = incomingMessage.createdAt;
    state.threads = [thread, ...state.threads.filter((entry) => entry.id !== thread.id)];
    markUsappThreadLive(thread.id, 'incoming');
    markUsappMessageLive(incomingMessage.id, 'incoming');
  const shouldScrollToLatest = state.activeView === 'inbox' && state.messagePanelMode === 'thread' && state.selectedThreadId === thread.id;

    if (shouldScrollToLatest) {
      markThreadRead(thread);
    }

    refreshMessagingUi({
      scrollToLatest: shouldScrollToLatest,
      scrollBehavior: 'auto'
    });
  }, USAPP_PREVIEW_REPLY_DELAY_MS);
}

async function refreshMessagingData({ includeContacts = false, renderNow = true } = {}) {
  if (messageRefreshPromise) {
    pendingMessageRefreshOptions = {
      includeContacts: Boolean((pendingMessageRefreshOptions && pendingMessageRefreshOptions.includeContacts) || includeContacts),
      renderNow: Boolean((pendingMessageRefreshOptions && pendingMessageRefreshOptions.renderNow) || renderNow)
    };
    return messageRefreshPromise;
  }

  const previousSelection = state.selectedThreadId;
  const previousThreads = Array.isArray(state.threads)
    ? state.threads.map((thread) => ({
        id: thread.id,
        messages: Array.isArray(thread.messages)
          ? thread.messages.map((message) => ({
              id: message.id,
              senderActorId: message.senderActorId
            }))
          : []
      }))
    : [];
  const previousSignature = getMessagingSignature(state.threads);
  const previousContactsSignature = getMessageContactsSignature(state.contacts);
  const previousMessageStatus = state.messageStatus;
  const previousMessageStatusType = state.messageStatusType;

  messageRefreshPromise = (async () => {
    const requests = [
      loadMessagingThreads()
    ];

    if (includeContacts) {
      requests.unshift(loadRemoteMessageState());
      requests.unshift(refreshConnectedAccountProfile());
      requests.unshift(loadMessagingContacts());
    }

    const results = await Promise.allSettled(requests);
    const contactResult = includeContacts ? results[0] : null;
    const profileResult = includeContacts ? results[1] : null;
    const remoteStateResult = includeContacts ? results[2] : null;
    const threadResult = includeContacts ? results[3] : results[0];

    if (contactResult && contactResult.status === 'fulfilled') {
      state.contacts = contactResult.value;
    }

    if (profileResult && profileResult.status === 'fulfilled') {
      updateHeader();
    }

    if (threadResult && threadResult.status === 'fulfilled') {
      state.threads = threadResult.value;
    }

    if (remoteStateResult && remoteStateResult.status === 'fulfilled' && remoteStateResult.value) {
      applyRemoteMessageStatePayload(remoteStateResult.value, {
        syncIfMissing: true
      });
    }

    if (previousSelection && state.threads.some((thread) => thread.id === previousSelection)) {
      state.selectedThreadId = previousSelection;
    } else if (!state.selectedThreadId || !state.threads.some((thread) => thread.id === state.selectedThreadId)) {
      state.selectedThreadId = state.threads[0] ? state.threads[0].id : '';
      persistText(STORAGE_KEYS.selectedThread, state.selectedThreadId);
    }

    if (threadResult && threadResult.status === 'rejected' && !state.threads.length) {
      state.threads = [];
    }

    if (contactResult && contactResult.status === 'rejected' && !state.contacts.length) {
      state.contacts = [];
    }

    updateUsappLoadStatus({
      contactResult,
      threadResult
    });

    const liveUpdate = threadResult && threadResult.status === 'fulfilled'
      ? markUsappLiveChanges(previousThreads, state.threads)
      : { selectedThreadUpdated: false };

    if (renderNow) {
    const nextSignature = getMessagingSignature(state.threads);
    const nextContactsSignature = getMessageContactsSignature(state.contacts);
    const threadsChanged = previousSignature !== nextSignature;
    const contactsChanged = previousContactsSignature !== nextContactsSignature;
    const statusChanged = previousMessageStatus !== state.messageStatus || previousMessageStatusType !== state.messageStatusType;

      if (threadsChanged || contactsChanged || statusChanged) {
        if (isUsappSearchFieldActive()) {
          updateHeader();
          updateNav();
          return;
        }

        refreshMessagingUi({
          scrollToLatest: liveUpdate.selectedThreadUpdated && state.activeView === 'inbox' && state.messagePanelMode === 'thread',
          scrollBehavior: 'auto'
        });
      } else {
        updateHeader();
        updateNav();
        if (state.activeNotificationPanel) {
          renderNotificationSheet();
        }
      }
    }
  })().finally(() => {
    const queuedRefreshOptions = pendingMessageRefreshOptions;
    messageRefreshPromise = null;

    if (!queuedRefreshOptions) {
      return;
    }

    pendingMessageRefreshOptions = null;
    refreshMessagingData(queuedRefreshOptions).catch((error) => {
      console.error('Queued Usapp refresh failed:', error);
    });
  });

  return messageRefreshPromise;
}

function stopMessageAutoRefresh() {
  if (messagePollTimer) {
    window.clearInterval(messagePollTimer);
    messagePollTimer = null;
  }

  if (messageRefreshTimer) {
    window.clearTimeout(messageRefreshTimer);
    messageRefreshTimer = null;
  }
}

function stopActivityAutoRefresh() {
  if (activityPollTimer) {
    window.clearInterval(activityPollTimer);
    activityPollTimer = null;
  }
}

function primeLiveNotificationState(items = getNotificationItems()) {
  const unreadIds = (Array.isArray(items) ? items : [])
    .filter((item) => item && item.unread)
    .map((item) => String(item.id || ''))
    .filter(Boolean);

  lastUnreadNotificationIds = new Set(unreadIds);
  liveNotificationSeeded = true;
}

function resetLiveNotificationState() {
  lastUnreadNotificationIds = new Set();
  liveNotificationSeeded = false;
}

function announceLiveNotificationItems(items = getNotificationItems()) {
  const unreadItems = (Array.isArray(items) ? items : []).filter((item) => item && item.unread);
  const unreadIds = unreadItems
    .map((item) => String(item.id || ''))
    .filter(Boolean);

  if (!liveNotificationSeeded) {
    lastUnreadNotificationIds = new Set(unreadIds);
    liveNotificationSeeded = true;
    return;
  }

  const freshItems = unreadItems.filter((item) => !lastUnreadNotificationIds.has(String(item.id || '')));
  lastUnreadNotificationIds = new Set(unreadIds);

  if (!freshItems.length) {
    return;
  }

  const primaryItem = freshItems[0];

  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    const title = freshItems.length === 1 ? primaryItem.title : 'SocialEra activity';
    const body = freshItems.length === 1
      ? primaryItem.text
      : `${freshItems.length} new updates across messages, comments, and likes.`;

    try {
      const notification = new Notification(title, {
        body,
        tag: freshItems.length === 1 ? String(primaryItem.id || 'socialera-live-item') : 'socialera-live-activity'
      });

      window.setTimeout(() => notification.close(), 4200);
    } catch (error) {
      showToast(freshItems.length === 1 ? primaryItem.title : `${freshItems.length} new notifications`);
    }

    return;
  }

  showToast(freshItems.length === 1 ? primaryItem.title : `${freshItems.length} new notifications`);
}

async function refreshLiveActivity({ includePosts = true, includeThreads = state.activeView !== 'inbox', announce = true } = {}) {
  if (!isSignedIn()) {
    stopActivityAutoRefresh();
    resetLiveNotificationState();
    updateHeader();
    updateNav();
    return null;
  }

  if (activityRefreshPromise) {
    return activityRefreshPromise;
  }

  const previousNotificationSignature = getNotificationSignature(getNotificationItems());
  const previousUnreadCount = getUnreadNotificationCount(getNotificationItems());
  const previousThreadSignature = getMessagingSignature(state.threads);
  const previousPostSignature = getPostActivitySignature(state.posts);
  const previousSelectedThreadId = state.selectedThreadId;

  activityRefreshPromise = (async () => {
    const refreshers = [];

    if (includePosts) {
      refreshers.push(
        loadSocialFeedPosts()
          .then((posts) => ({ key: 'posts', posts }))
          .catch((error) => ({ key: 'posts', error }))
      );
    }

    if (includeThreads) {
      refreshers.push(
        loadMessagingThreads()
          .then((threads) => ({ key: 'threads', threads }))
          .catch((error) => ({ key: 'threads', error }))
      );
    }

    const results = await Promise.all(refreshers);
    let shouldRenderPostsView = false;

    results.forEach((result) => {
      if (result.key === 'posts' && !result.error) {
        const useExistingPosts = Array.isArray(state.posts) && state.posts.length && (!Array.isArray(result.posts) || !result.posts.length);
        const nextPosts = useExistingPosts
          ? state.posts
          : mergePostCollections(Array.isArray(result.posts) ? result.posts : [], []);
        const postsChanged = previousPostSignature !== getPostActivitySignature(nextPosts);
        state.posts = nextPosts;

        if (postsChanged && (state.activeCommentPostId || state.activeView === 'home' || state.activeView === 'videos' || state.activeView === 'post')) {
          shouldRenderPostsView = true;
        }
      }

      if (result.key === 'threads' && !result.error) {
        state.threads = result.threads;

        if (previousSelectedThreadId && state.threads.some((thread) => thread.id === previousSelectedThreadId)) {
          state.selectedThreadId = previousSelectedThreadId;
        } else if (!state.selectedThreadId || !state.threads.some((thread) => thread.id === state.selectedThreadId)) {
          state.selectedThreadId = state.threads[0] ? state.threads[0].id : '';
          persistText(STORAGE_KEYS.selectedThread, state.selectedThreadId);
        }
      }
    });

    const nextNotificationItems = getNotificationItems();
    const nextNotificationSignature = getNotificationSignature(nextNotificationItems);
    const nextUnreadCount = nextNotificationItems.filter((item) => item.unread).length;
    const threadsChanged = previousThreadSignature !== getMessagingSignature(state.threads);
    const notificationsChanged = previousNotificationSignature !== nextNotificationSignature
      || previousUnreadCount !== nextUnreadCount;

    if (announce) {
      announceLiveNotificationItems(nextNotificationItems);
    } else {
      primeLiveNotificationState(nextNotificationItems);
    }

    if (shouldRenderPostsView) {
      render();
      return;
    }

    if (threadsChanged && state.activeView === 'inbox') {
      if (isUsappSearchFieldActive()) {
        updateHeader();
        updateNav();
        return;
      }

      refreshMessagingUi({
        renderMainView: false,
        renderUsapp: true,
        renderNotifications: state.activeNotificationPanel
      });
      return;
    }

    if (notificationsChanged) {
      updateHeader();
      updateNav();

      if (state.activeNotificationPanel) {
        renderNotificationSheet();
      }

      if (state.activeCommentPostId) {
        renderCommentSheet();
      }
    }

  })().finally(() => {
    activityRefreshPromise = null;
  });

  return activityRefreshPromise;
}

function startActivityAutoRefresh() {
  stopActivityAutoRefresh();

  if (!isSignedIn()) {
    return;
  }

  activityPollTimer = window.setInterval(() => {
    refreshLiveActivity({
      includePosts: true,
      includeThreads: state.activeView !== 'inbox',
      announce: true
    }).catch((error) => {
      console.error('Live activity refresh failed:', error);
    });
  }, ACTIVITY_POLL_INTERVAL_MS);
}

function syncActivityAutoRefresh() {
  if (!isSignedIn()) {
    stopActivityAutoRefresh();
    resetLiveNotificationState();
    return;
  }

  startActivityAutoRefresh();
}

function queueMessageRefresh({ delayMs = 1200, includeContacts = false } = {}) {
  if (messageRefreshTimer) {
    window.clearTimeout(messageRefreshTimer);
  }

  messageRefreshTimer = window.setTimeout(() => {
    messageRefreshTimer = null;

    if (document.hidden || state.activeView !== 'inbox' || state.messageBusy || isUsappSearchFieldActive()) {
      return;
    }

    refreshMessagingData({ includeContacts, renderNow: true }).catch((error) => {
      console.error('Usapp live refresh failed:', error);
    });
  }, delayMs);
}

function startMessageAutoRefresh() {
  stopMessageAutoRefresh();

  if (document.hidden || state.activeView !== 'inbox') {
    return;
  }

  const intervalMs = state.messagePanelMode === 'thread'
    ? Math.min(Math.max(MESSAGE_POLL_INTERVAL_MS, 2200), 3000)
    : state.usappLiveConnected
      ? Math.max(MESSAGE_POLL_INTERVAL_MS * 4, 20000)
      : MESSAGE_POLL_INTERVAL_MS;

  messagePollTimer = window.setInterval(() => {
    if (!state.messageBusy && !isUsappSearchFieldActive()) {
      refreshMessagingData({ includeContacts: false, renderNow: true }).catch((error) => {
        console.error('Usapp poll refresh failed:', error);
      });
    }
  }, intervalMs);
}

function syncMessageAutoRefresh() {
  if (document.hidden || state.activeView !== 'inbox') {
    stopMessageAutoRefresh();
    return;
  }

  startMessageAutoRefresh();
}

function stopUsappLiveStream({ clearReconnect = true } = {}) {
  if (usappEventSource) {
    usappEventSource.close();
    usappEventSource = null;
  }

  if (clearReconnect && usappEventReconnectTimer) {
    window.clearTimeout(usappEventReconnectTimer);
    usappEventReconnectTimer = null;
  }

  state.usappLiveConnected = false;
}

function scheduleUsappLiveReconnect() {
  if (usappEventReconnectTimer || !state.authUser) {
    return;
  }

  usappEventReconnectTimer = window.setTimeout(() => {
    usappEventReconnectTimer = null;
    syncUsappLiveStream();
  }, 1800);
}

async function handleUsappLiveEvent(payload = {}) {
  const kind = String(payload.kind || '').trim();

  if (!kind || kind === 'connected' || !state.authUser) {
    return;
  }

  if (kind === 'thread-state-sync') {
    const remoteState = await loadRemoteMessageState().catch((error) => {
      console.error('Could not refresh shared message state from live stream:', error);
      return null;
    });

    if (remoteState) {
      applyRemoteMessageStatePayload(remoteState, {
        syncIfMissing: false
      });
    }
  }

  if (kind === 'member-message-sent' && applyIncomingMemberMessageEvent(payload)) {
    if (state.activeView !== 'inbox') {
      announceLiveNotificationItems();
    }
    return;
  }

  await refreshMessagingData({
    includeContacts: kind === 'profile-sync' || kind === 'member-thread-opened',
    renderNow: true
  }).catch((error) => {
    console.error('Could not apply Usapp live update:', error);
  });

  if (state.activeView !== 'inbox') {
    announceLiveNotificationItems();
  }
}

function syncUsappLiveStream() {
  const canStream = Boolean(
    state.authUser
    && typeof window !== 'undefined'
    && typeof window.EventSource === 'function'
  );

  if (!canStream) {
    stopUsappLiveStream();
    return;
  }

  const streamUrl = apiService.createApiUrl(`/messages/events?actorId=${encodeURIComponent(getMessageActorId())}`);

  if (usappEventSource && usappEventSource.url === streamUrl) {
    return;
  }

  stopUsappLiveStream({ clearReconnect: true });

  try {
    usappEventSource = new window.EventSource(streamUrl);
  } catch (error) {
    console.error('Could not start Usapp live stream:', error);
    scheduleUsappLiveReconnect();
    return;
  }

  usappEventSource.onopen = () => {
    state.usappLiveConnected = true;
    syncMessageAutoRefresh();
  };

  usappEventSource.onmessage = (event) => {
    let payload = null;

    try {
      payload = JSON.parse(String(event.data || '{}'));
    } catch (error) {
      return;
    }

    handleUsappLiveEvent(payload).catch((error) => {
      console.error('Could not process Usapp live event:', error);
    });
  };

  usappEventSource.onerror = () => {
    stopUsappLiveStream({ clearReconnect: false });
    syncMessageAutoRefresh();
    scheduleUsappLiveReconnect();
  };
}

function render() {
  applyTheme();
  syncActiveThreadReadState();

  if (state.loading && !state.ready) {
    syncDockVisibility(state.activeView);
    updateHeader();
    updateNav();
    revealDockLayer();
    scheduleChromeMetricsSync();
    elements.viewRoot.innerHTML = renderLoadingShell();
    renderCommentSheet();
    renderNotificationSheet();
    renderUsappSheet();
    return;
  }

  const resolvedView = (() => {
    const normalizedView = normalizeView(state.activeView);

    if (!isSignedIn()) {
      return canAccessViewWithoutAuth(normalizedView) ? normalizedView : 'auth';
    }

    if (normalizedView === 'auth') {
      return resolveAuthRedirectView();
    }

    return normalizedView in VIEW_META ? normalizedView : 'home';
  })();

  if (state.activeView !== resolvedView) {
    state.activeView = resolvedView;

    if (resolvedView !== 'post') {
      persistText(STORAGE_KEYS.activeView, resolvedView);
    }
  }

  const view = resolvedView in VIEW_META ? resolvedView : 'home';
  syncDockVisibility(view);
  updateHeader();
  updateNav();
  revealDockLayer();
  scheduleChromeMetricsSync();

  if (lastRenderedView) {
    rememberViewScroll(lastRenderedView);
  }
  const shouldAnimateView = Boolean(state.ready && lastRenderedView !== view);
  const content = {
    auth: renderAuthView,
    home: renderHomeView,
    videos: renderVideosView,
    shop: renderDiscoverView,
    upload: renderUploadView,
    search: renderSearchView,
    bag: renderBagView,
    inbox: renderInboxView,
    post: renderPostDetailView,
    profile: renderProfileView,
    settings: renderSettingsView
  }[view]();

  elements.viewRoot.innerHTML = `
    <div class="view-shell ${shouldAnimateView ? 'view-enter' : ''}" data-view="${escapeHtml(view)}">
      <div class="section-stack">${content}</div>
    </div>
  `;

  syncSpotlightSlideshow();

  lastRenderedView = view;
  restoreViewScroll(view);
  renderUsappSheet();
  renderCommentSheet();
  renderNotificationSheet();
  syncViewportVideoPlayback();
  scheduleFeedAutoExpandCheck();
}

function scheduleChromeMetricsSync() {
  if (chromeMetricsFrame) {
    window.cancelAnimationFrame(chromeMetricsFrame);
  }

  chromeMetricsFrame = window.requestAnimationFrame(() => {
    chromeMetricsFrame = 0;
    syncChromeMetrics();
  });
}

function syncChromeMetrics() {
  const root = document.documentElement;
  const topbar = elements.topbar;
  const dockLayer = elements.dockLayer;

  if (!root || !topbar || !dockLayer) {
    return;
  }

  const topbarHeight = Math.ceil(topbar.getBoundingClientRect().height || 0);
  const dockHeight = Math.ceil(dockLayer.getBoundingClientRect().height || 0);
  const dockHidden = dockLayer.classList.contains('is-hidden');
  const viewportHeight = Math.max(
    0,
    Math.round((window.visualViewport && window.visualViewport.height) || window.innerHeight || 0)
  );
  const topbarOffset = Math.max(56, topbarHeight + 12);
  const dockClearance = dockHidden ? 20 : Math.max(92, dockHeight + 18);

  root.style.setProperty('--app-visible-height', `${viewportHeight}px`);
  root.style.setProperty('--app-topbar-offset', `${topbarOffset}px`);
  root.style.setProperty('--app-dock-clearance', `${dockClearance}px`);
}

function refreshMessagingUi({
  renderMainView = shouldRenderMainViewForMessaging(state.activeView, normalizeView),
  renderUsapp = false,
  renderNotifications = state.activeNotificationPanel,
  scrollToLatest = false,
  scrollBehavior = 'auto',
  focusSearch = false,
  searchSelectionStart = null,
  searchSelectionEnd = null,
  preserveThreadScroll = state.messagePanelMode === 'thread' && !scrollToLatest
} = {}) {
  const threadScrollSnapshot = preserveThreadScroll ? getUsappThreadScrollSnapshot() : null;

  if (renderMainView) {
    render();
  } else {
    updateHeader();
    updateNav();

    if (renderUsapp || (elements.usappSheetRoot && elements.usappSheetRoot.innerHTML)) {
      renderUsappSheet();
    }

    if (renderNotifications || (elements.notificationSheetRoot && elements.notificationSheetRoot.innerHTML)) {
      renderNotificationSheet();
    }
  }

  if (scrollToLatest && state.messagePanelMode === 'thread') {
    scrollUsappThreadToLatest({ behavior: scrollBehavior });
  } else if (threadScrollSnapshot) {
    restoreUsappThreadScroll(threadScrollSnapshot);
  }

  if (focusSearch && state.messageSearchOpen) {
    window.setTimeout(() => {
      const searchField = queryUsappElement('[data-message-search]');

      if (searchField) {
        searchField.focus();
        if (Number.isInteger(searchSelectionStart) && Number.isInteger(searchSelectionEnd) && typeof searchField.setSelectionRange === 'function') {
          searchField.setSelectionRange(searchSelectionStart, searchSelectionEnd);
        }
      }
    }, 20);
  }
}

function isUsappMessageGestureTarget(target) {
  if (!target || !(target instanceof Element)) {
    return false;
  }

  return Boolean(target.closest('[data-message-bubble]'))
    && !target.closest('a, button, input, textarea, audio, .usapp-reaction-picker, .usapp-reaction-pill, .message-attachment');
}

function getUsappPullRefreshElements() {
  const list = queryUsappElement('[data-usapp-thread-list]');
  const indicator = queryUsappElement('[data-usapp-pull-indicator]');
  const section = list ? list.closest('.usapp-section-threads') : null;

  return {
    indicator,
    list,
    section
  };
}

function syncUsappPullRefreshUi({ offset = 0, stateName = 'idle' } = {}) {
  const { indicator, list, section } = getUsappPullRefreshElements();

  if (!indicator || !list || !section) {
    return;
  }

  const nextOffset = Math.max(0, Math.min(Number(offset) || 0, USAPP_PULL_REFRESH_MAX_PX));
  const visible = nextOffset > 0 || stateName === 'refreshing';
  const nextHeight = stateName === 'refreshing'
    ? Math.max(34, nextOffset || USAPP_PULL_REFRESH_THRESHOLD_PX - 8)
    : nextOffset;
  const label = stateName === 'refreshing'
    ? 'Refreshing...'
    : nextOffset >= USAPP_PULL_REFRESH_THRESHOLD_PX
      ? 'Release to refresh'
      : 'Pull to refresh';

  indicator.classList.toggle('is-visible', visible);
  indicator.classList.toggle('is-ready', stateName === 'ready');
  indicator.classList.toggle('is-refreshing', stateName === 'refreshing');
  indicator.style.height = visible ? `${nextHeight}px` : '0px';
  indicator.textContent = label;

  list.classList.toggle('is-pulling', visible);
  list.classList.toggle('is-refreshing', stateName === 'refreshing');
  list.style.transform = visible ? `translateY(${nextHeight}px)` : '';
  section.classList.toggle('is-pulling', visible);
}

function resetUsappPullGesture() {
  if (usappPullGesture && usappPullGesture.list) {
    usappPullGesture.list.style.removeProperty('touch-action');
  }
  usappPullGesture = null;
  syncUsappPullRefreshUi();
}

function resetUsappMessageGesture() {
  if (!usappMessageGesture) {
    return;
  }

  if (usappMessageGesture.longPressTimer) {
    window.clearTimeout(usappMessageGesture.longPressTimer);
  }

  if (usappMessageGesture.row && usappMessageGesture.row.isConnected) {
    usappMessageGesture.row.style.removeProperty('--usapp-swipe-offset');
    usappMessageGesture.row.classList.remove('reply-swiping');
  }

  usappMessageGesture = null;
}

function resetUsappGestures() {
  resetUsappMessageGesture();
  resetUsappPullGesture();
}

function shouldStartUsappPullRefresh(target) {
  if (
    state.activeView !== 'inbox'
    || state.messagePanelMode !== 'inbox'
    || state.messageSearchOpen
    || messageRefreshPromise
    || !(target instanceof Element)
  ) {
    return null;
  }

  const list = target.closest('[data-usapp-thread-list]');

  if (!list || Number(list.scrollTop || 0) > 0) {
    return null;
  }

  return list;
}

function handleUsappTouchStart(event) {
  if (!event.touches || event.touches.length !== 1) {
    return;
  }

  const touch = event.touches[0];
  const list = shouldStartUsappPullRefresh(event.target);

  if (!list) {
    return;
  }

  usappPullGesture = {
    list,
    pointerId: 'touch',
    startX: touch.clientX,
    startY: touch.clientY,
    pullOffset: 0
  };
  list.style.touchAction = 'none';
  syncUsappPullRefreshUi();
}

function handleUsappTouchMove(event) {
  if (!usappPullGesture || usappPullGesture.pointerId !== 'touch' || !event.touches || !event.touches.length) {
    return;
  }

  const touch = event.touches[0];
  const deltaX = touch.clientX - usappPullGesture.startX;
  const deltaY = touch.clientY - usappPullGesture.startY;

  if (deltaY <= 0 || Math.abs(deltaX) > Math.abs(deltaY) + 10) {
    resetUsappPullGesture();
    return;
  }

  if (!usappPullGesture.list || Number(usappPullGesture.list.scrollTop || 0) > 0) {
    resetUsappPullGesture();
    return;
  }

  const nextOffset = Math.max(0, Math.min(deltaY * 0.78, USAPP_PULL_REFRESH_MAX_PX));

  if (nextOffset > 0) {
    event.preventDefault();
    usappPullGesture.pullOffset = nextOffset;
    syncUsappPullRefreshUi({
      offset: nextOffset,
      stateName: nextOffset >= USAPP_PULL_REFRESH_THRESHOLD_PX ? 'ready' : 'pulling'
    });
  }
}

function handleUsappTouchEnd() {
  if (!usappPullGesture || usappPullGesture.pointerId !== 'touch') {
    return;
  }

  const shouldRefresh = usappPullGesture.pullOffset >= USAPP_PULL_REFRESH_THRESHOLD_PX;

  if (shouldRefresh) {
    syncUsappPullRefreshUi({
      offset: usappPullGesture.pullOffset,
      stateName: 'refreshing'
    });
    usappPullGesture = null;
    refreshMessagingData({ includeContacts: true, renderNow: true })
      .catch((error) => {
        console.error('Usapp touch pull refresh failed:', error);
      })
      .finally(() => {
        resetUsappPullGesture();
      });
    return;
  }

  resetUsappPullGesture();
}

function setMessageReplyTarget(messageId, { refresh = true } = {}) {
  const thread = getSelectedThread();

  if (!thread || !messageId || !Array.isArray(thread.messages) || !thread.messages.some((message) => message.id === messageId)) {
    return;
  }

  state.messageReplyToMessageId = messageId;
  state.messageReplyThreadId = thread.id;
  state.reactionPickerMessageId = '';
  state.reactionRevealMessageId = '';

  if (refresh) {
    refreshMessagingUi();
    window.setTimeout(() => {
      const input = queryUsappElement('[data-message-input]');

      if (input) {
        input.focus();
      }
    }, 20);
  }
}

function clearMessageReplyTarget({ refresh = true } = {}) {
  state.messageReplyToMessageId = '';
  state.messageReplyThreadId = '';

  if (refresh) {
    refreshMessagingUi();
  }
}

function isThreadMuted(threadId) {
  return Array.isArray(state.mutedThreadIds) && state.mutedThreadIds.includes(String(threadId || ''));
}

function toggleThreadMuted(threadId) {
  const normalizedThreadId = String(threadId || '').trim();

  if (!normalizedThreadId) {
    return;
  }

  const thread = state.threads.find((entry) => entry.id === normalizedThreadId) || null;
  const nextMutedThreadIds = new Set((state.mutedThreadIds || []).map(String));
  const shouldMute = !nextMutedThreadIds.has(normalizedThreadId);

  if (!shouldMute) {
    nextMutedThreadIds.delete(normalizedThreadId);
  } else {
    nextMutedThreadIds.add(normalizedThreadId);
  }

  state.mutedThreadIds = Array.from(nextMutedThreadIds);
  persistMutedThreadIds(state.mutedThreadIds);
  queueRemoteMessageStateSync();

  if (shouldMute && thread) {
    markThreadRead(thread);
  }
}

function getReplyDecorationThreadKey(thread) {
  if (!thread) {
    return '';
  }

  return `${String(thread.provider || 'local').trim()}:${String(thread.nativeId || thread.id || '').trim()}`;
}

function persistMessageReplyDecoration(thread, message) {
  const threadKey = getReplyDecorationThreadKey(thread);
  const messageKey = String(message && (message.nativeId || message.id) || '').trim();

  if (!threadKey || !messageKey || !message || !message.replyPreviewText) {
    return;
  }

  const nextDecorations = {
    ...(state.messageReplyDecorations || {}),
    [threadKey]: {
      ...((state.messageReplyDecorations && state.messageReplyDecorations[threadKey]) || {}),
      [messageKey]: {
        replyToMessageId: String(message.replyToMessageId || '').trim(),
        replyPreviewAuthor: String(message.replyPreviewAuthor || '').trim(),
        replyPreviewText: String(message.replyPreviewText || '').trim()
      }
    }
  };

  state.messageReplyDecorations = nextDecorations;
  persistMessageReplyDecorations(nextDecorations);
}

function applyStoredReplyDecorationsToThread(thread) {
  if (!thread || !Array.isArray(thread.messages) || !thread.messages.length) {
    return thread;
  }

  const threadKey = getReplyDecorationThreadKey(thread);
  const threadDecorations = threadKey && state.messageReplyDecorations
    ? state.messageReplyDecorations[threadKey]
    : null;

  if (!threadDecorations || typeof threadDecorations !== 'object') {
    return thread;
  }

  const nextMessages = thread.messages.map((message) => {
    const messageKey = String(message.nativeId || message.id || '').trim();
    const decoration = messageKey ? threadDecorations[messageKey] : null;

    if (!decoration || message.replyPreviewText) {
      return message;
    }

    return {
      ...message,
      replyToMessageId: String(decoration.replyToMessageId || '').trim(),
      replyPreviewAuthor: String(decoration.replyPreviewAuthor || '').trim(),
      replyPreviewText: String(decoration.replyPreviewText || '').trim()
    };
  });

  return {
    ...thread,
    messages: nextMessages
  };
}

function hydrateMessageReplyDecorations(threads) {
  return (Array.isArray(threads) ? threads : []).map((thread) => applyStoredReplyDecorationsToThread(thread));
}

function resetVoiceRecorder() {
  if (voiceRecorderStream) {
    voiceRecorderStream.getTracks().forEach((track) => track.stop());
  }

  voiceRecorder = null;
  voiceRecorderStream = null;
  voiceRecorderChunks = [];
}

async function startVoiceRecording() {
  if (state.pendingMessageAttachment) {
    showToast('Remove the current attachment first.');
    return;
  }

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function' || typeof MediaRecorder === 'undefined') {
    showToast('Voice messages are not available in this browser.');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    const supportedMimeType = mimeTypes.find((mimeType) => !MediaRecorder.isTypeSupported || MediaRecorder.isTypeSupported(mimeType)) || '';
    voiceRecorderChunks = [];
    voiceRecorderStream = stream;
    voiceRecorder = supportedMimeType
      ? new MediaRecorder(stream, { mimeType: supportedMimeType })
      : new MediaRecorder(stream);

    voiceRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size) {
        voiceRecorderChunks.push(event.data);
      }
    };

    voiceRecorder.onstop = async () => {
      const recorderMimeType = voiceRecorder && voiceRecorder.mimeType ? voiceRecorder.mimeType : supportedMimeType || 'audio/webm';
      const blob = new Blob(voiceRecorderChunks, { type: recorderMimeType });

      resetVoiceRecorder();

      if (!blob.size) {
        refreshMessagingUi();
        return;
      }

      if (blob.size > MAX_VOICE_MESSAGE_BYTES) {
        refreshMessagingUi();
        showToast('Keep voice notes under 4MB.');
        return;
      }

      const extension = recorderMimeType.includes('mp4')
        ? 'm4a'
        : recorderMimeType.includes('ogg')
          ? 'ogg'
          : 'webm';
      const file = new File([blob], `voice-note-${Date.now()}.${extension}`, {
        type: recorderMimeType
      });
      const dataUrl = await readFileAsDataUrl(file);

      state.pendingMessageAttachment = normalizeMessageAttachmentInput({
        name: 'Voice note',
        type: recorderMimeType,
        size: file.size,
        kind: 'audio',
        dataUrl
      });
      refreshMessagingUi();
      showToast('Voice note ready to send.');
    };

    voiceRecorder.start();
    state.messageRecording = true;
    state.composerEmojiOpen = false;
    refreshMessagingUi();
    showToast('Recording voice note...');
  } catch (error) {
    resetVoiceRecorder();
    state.messageRecording = false;
    refreshMessagingUi();
    showToast('Microphone access was not available.');
  }
}

async function stopVoiceRecording() {
  if (!voiceRecorder) {
    state.messageRecording = false;
    refreshMessagingUi();
    return;
  }

  state.messageRecording = false;
  refreshMessagingUi();
  voiceRecorder.stop();
}

async function toggleVoiceRecording() {
  if (state.messageRecording) {
    await stopVoiceRecording();
    return;
  }

  await startVoiceRecording();
}

function handleUsappPointerDown(event) {
  if (event.pointerType !== 'touch') {
    const list = shouldStartUsappPullRefresh(event.target);

    if (list) {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

      list.style.touchAction = 'none';
      usappPullGesture = {
        list,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        pullOffset: 0
      };
      syncUsappPullRefreshUi();
    }
  }

  if (!isUsappMessageGestureTarget(event.target)) {
    return;
  }

  if (event.pointerType === 'mouse' && event.button !== 0) {
    return;
  }

  const row = event.target.closest('[data-message-bubble]');
  const messageId = row ? String(row.dataset.messageBubble || '').trim() : '';

  if (!row || !messageId) {
    return;
  }

  resetUsappMessageGesture();

  const gesture = {
    pointerId: event.pointerId,
    messageId,
    row,
    startX: event.clientX,
    startY: event.clientY,
    swipeOffset: 0,
    swiping: false,
    longPressTimer: null
  };

  gesture.longPressTimer = window.setTimeout(() => {
    if (!usappMessageGesture || usappMessageGesture.messageId !== messageId || usappMessageGesture.swiping) {
      return;
    }

    state.reactionRevealMessageId = messageId;
    state.reactionPickerMessageId = messageId;
    refreshMessagingUi();

    if (navigator.vibrate) {
      navigator.vibrate(8);
    }

    usappMessageGesture = null;
  }, USAPP_MESSAGE_LONG_PRESS_MS);

  usappMessageGesture = gesture;
}

function handleUsappPointerMove(event) {
  if (usappPullGesture && event.pointerId === usappPullGesture.pointerId) {
    const deltaX = event.clientX - usappPullGesture.startX;
    const deltaY = event.clientY - usappPullGesture.startY;

    if (deltaY <= 0 || Math.abs(deltaX) > Math.abs(deltaY) + 10) {
      resetUsappPullGesture();
      return;
    }

    if (!usappPullGesture.list || Number(usappPullGesture.list.scrollTop || 0) > 0) {
      resetUsappPullGesture();
      return;
    }

    const nextOffset = Math.max(0, Math.min(deltaY * 0.78, USAPP_PULL_REFRESH_MAX_PX));

    if (nextOffset > 0) {
      event.preventDefault();
      usappPullGesture.pullOffset = nextOffset;
      syncUsappPullRefreshUi({
        offset: nextOffset,
        stateName: nextOffset >= USAPP_PULL_REFRESH_THRESHOLD_PX ? 'ready' : 'pulling'
      });
      return;
    }
  }

  if (!usappMessageGesture || event.pointerId !== usappMessageGesture.pointerId) {
    return;
  }

  const deltaX = event.clientX - usappMessageGesture.startX;
  const deltaY = event.clientY - usappMessageGesture.startY;

  if (!usappMessageGesture.swiping && Math.abs(deltaY) > 12 && Math.abs(deltaY) > Math.abs(deltaX)) {
    resetUsappMessageGesture();
    return;
  }

  if (!usappMessageGesture.swiping && deltaX > 14 && Math.abs(deltaX) > Math.abs(deltaY) + 4) {
    if (usappMessageGesture.longPressTimer) {
      window.clearTimeout(usappMessageGesture.longPressTimer);
      usappMessageGesture.longPressTimer = null;
    }

    usappMessageGesture.swiping = true;
    usappMessageGesture.row.classList.add('reply-swiping');
  }

  if (!usappMessageGesture.swiping) {
    return;
  }

  event.preventDefault();

  const swipeOffset = Math.max(0, Math.min(deltaX, 84));
  usappMessageGesture.swipeOffset = swipeOffset;
  usappMessageGesture.row.style.setProperty('--usapp-swipe-offset', `${swipeOffset}px`);
}

function handleUsappPointerUp(event) {
  if (usappPullGesture && event.pointerId === usappPullGesture.pointerId) {
    const shouldRefresh = usappPullGesture.pullOffset >= USAPP_PULL_REFRESH_THRESHOLD_PX;

    if (shouldRefresh) {
      syncUsappPullRefreshUi({
        offset: usappPullGesture.pullOffset,
        stateName: 'refreshing'
      });
      usappPullGesture = null;
      refreshMessagingData({ includeContacts: true, renderNow: true })
        .catch((error) => {
          console.error('Usapp pull refresh failed:', error);
        })
        .finally(() => {
          resetUsappPullGesture();
        });
      return;
    }

    resetUsappPullGesture();
    return;
  }

  if (!usappMessageGesture || event.pointerId !== usappMessageGesture.pointerId) {
    return;
  }

  const gesture = usappMessageGesture;
  const shouldReply = gesture.swiping && gesture.swipeOffset >= 54;

  resetUsappMessageGesture();

  if (shouldReply) {
    setMessageReplyTarget(gesture.messageId);
  }
}

function handleVisibilityChange() {
  if (document.hidden) {
    resetUsappGestures();
    if (state.messageRecording) {
      stopVoiceRecording().catch(() => null);
    }
    pauseAllSmartVideos();
    stopSpotlightSlideshow();
    syncUsappLiveStream();
    syncMessageAutoRefresh();
    syncActivityAutoRefresh();
    return;
  }

  syncSpotlightSlideshow();
  syncUsappLiveStream();
  syncMessageAutoRefresh();
  syncActivityAutoRefresh();
  syncViewportVideoPlayback();
  refreshLiveActivity({
    includePosts: true,
    includeThreads: state.activeView !== 'inbox',
    announce: false
  }).catch(() => null);
}

function handleKeyDown(event) {
  const messageSearchField = event.target.closest('[data-message-search]');

  if (messageSearchField && event.key === 'Enter') {
    event.preventDefault();
    clearUsappSearchUiSyncTimer();
    state.messageSearchPendingSync = false;
    syncUsappSearchUi();
    return;
  }

  const searchField = event.target.closest('input[name="discoverQuery"]');

  if (searchField && event.key === 'Enter') {
    event.preventDefault();
    const value = String(searchField.value || '').trim();

    if (value) {
      saveRecentSearch(value);

      if (normalizeView(state.activeView) === 'search') {
        state.searchViewQuery = value;
      } else {
        state.searchQuery = value;
      }

      if (!syncCatalogSearchUi()) {
        render();
      }
    }

    return;
  }

  if (event.key === 'Escape' && state.activeCommentPostId) {
    closeCommentSheet();
    return;
  }

  if (event.key === 'Escape' && state.activeNotificationPanel) {
    closeNotificationSheet();
    return;
  }

  if (event.key === 'Escape' && state.activeView === 'inbox' && state.messagePanelMode === 'thread') {
    state.messagePanelMode = 'inbox';
    state.threadSettingsOpen = false;
    clearMessageReplyTarget({ refresh: false });
    state.composerEmojiOpen = false;
    state.reactionPickerMessageId = '';
    state.reactionRevealMessageId = '';
    refreshMessagingUi();
    return;
  }

  if (event.key === 'Escape' && state.activeView === 'inbox' && state.messageSearchOpen) {
    state.messageSearchOpen = false;
    setUsappSearchFocusState(false);
    clearUsappSearchUiSyncTimer();
    state.messageSearchPendingSync = false;
    state.messageSearchQuery = '';
    refreshMessagingUi();
    return;
  }

  if (event.key === 'Escape' && state.activeView === 'inbox') {
    closeUsappSheet();
  }
}

function revealDockLayer() {
  if (!elements.dockLayer) {
    return;
  }

  elements.dockLayer.classList.remove('scroll-hidden');
  lastDockScrollTop = getPrimaryScrollTop();
}

function syncDockVisibility(view = state.activeView) {
  if (!elements.dockLayer) {
    return;
  }

  const hideDock = normalizeView(view) === 'auth';
  elements.dockLayer.classList.toggle('is-hidden', hideDock);

  if (hideDock) {
    elements.dockLayer.classList.remove('scroll-hidden');
    lastDockScrollTop = 0;
  }
}

function getScrollSnapshot() {
  return {
    viewRootTop: elements.viewRoot ? elements.viewRoot.scrollTop : 0,
    windowTop: window.scrollY || window.pageYOffset || 0
  };
}

function getPrimaryScrollTop() {
  const snapshot = getScrollSnapshot();
  return Math.max(snapshot.viewRootTop, snapshot.windowTop);
}

function renderLoadingShell() {
  return `
    <div class="section-stack skeleton">
      <div class="card hero-card">
        <div class="hero-content">
          <div class="skeleton-line short"></div>
          <div class="skeleton-line long"></div>
          <div class="hero-metrics">
            <div class="hero-metric">
              <div class="skeleton-line short"></div>
              <div class="skeleton-line long"></div>
            </div>
            <div class="hero-metric">
              <div class="skeleton-line short"></div>
              <div class="skeleton-line long"></div>
            </div>
            <div class="hero-metric">
              <div class="skeleton-line short"></div>
              <div class="skeleton-line long"></div>
            </div>
          </div>
        </div>
      </div>
      <div class="chip-row">
        <div class="skeleton-chip"></div>
        <div class="skeleton-chip"></div>
        <div class="skeleton-chip"></div>
      </div>
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
    </div>
  `;
}

function renderHomeView() {
  const posts = getFilteredPosts();
  const spotlightPosts = getSpotlightPosts(posts);
  const { items: feedPosts, hasMore } = getVisibleFeedPosts('home', posts);
  const feedMarkup = renderPostCardList(feedPosts, 'home');

  return `
    ${renderSpotlightFolder(spotlightPosts)}

    <section class="post-list">
      ${feedMarkup || renderEmptyCard('No feed cards yet', '')}
    </section>
    ${renderFeedContinuation('home', hasMore)}
  `;
}

function renderSpotlightFolder(posts) {
  const previewIndex = getSpotlightPreviewIndex(posts);
  const previewPost = posts[previewIndex];
  const isExpanded = state.spotlightExpanded;

  return `
    <section class="spotlight-folder ${isExpanded ? 'is-open' : ''}" aria-label="Spotlight folder">
      <button
        class="spotlight-folder-toggle"
        type="button"
        data-toggle-spotlight
        aria-expanded="${isExpanded ? 'true' : 'false'}"
        aria-controls="spotlight-panel"
      >
        <div class="spotlight-folder-cover">
          <div class="spotlight-folder-media ${previewPost ? '' : 'is-empty'}" data-spotlight-preview-media>
            ${previewPost ? renderSpotlightPreviewMedia(previewPost) : ''}
          </div>
          <div class="spotlight-folder-copy">
            <h2 class="spotlight-folder-title">Spotlight</h2>
          </div>
        </div>
      </button>

      ${isExpanded ? `
        <div id="spotlight-panel" class="spotlight-carousel spotlight-folder-panel">
          <div class="spotlight-track">
            ${posts.length
              ? posts.map((post, index) => renderSpotlightCard(post, index)).join('')
              : renderEmptyCard('No spotlight cards', '')}
          </div>
        </div>
      ` : ''}
    </section>
  `;
}

function getSpotlightPosts(sourcePosts = getFilteredPosts()) {
  const posts = sourcePosts.length ? sourcePosts : state.posts;
  return [...posts]
    .sort((left, right) => {
      const likeDelta = getSpotlightLikeCount(right) - getSpotlightLikeCount(left);

      if (likeDelta !== 0) {
        return likeDelta;
      }

      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    })
    .slice(0, 10);
}

function getSpotlightLikeCount(post) {
  const explicitLikes = Math.max(0, Number(post && post.likes ? post.likes : 0));
  const actorLikes = Array.isArray(post && post.likeActorIds) ? post.likeActorIds.length : 0;
  return Math.max(explicitLikes, actorLikes);
}

function getSpotlightPreviewIndex(posts) {
  if (!posts.length) {
    state.spotlightPreviewIndex = 0;
    return 0;
  }

  state.spotlightPreviewIndex %= posts.length;
  return state.spotlightPreviewIndex;
}

function syncSpotlightSlideshow() {
  stopSpotlightSlideshow();

  if (document.hidden || state.activeView !== 'home' || state.spotlightExpanded) {
    return;
  }

  const posts = getSpotlightPosts();
  if (posts.length <= 1) {
    return;
  }

  spotlightTimer = window.setInterval(() => {
    advanceSpotlightSlideshow();
  }, SPOTLIGHT_SLIDESHOW_INTERVAL_MS);
}

function stopSpotlightSlideshow() {
  if (spotlightTimer) {
    window.clearInterval(spotlightTimer);
    spotlightTimer = null;
  }
}

function advanceSpotlightSlideshow() {
  if (document.hidden || state.activeView !== 'home' || state.spotlightExpanded) {
    stopSpotlightSlideshow();
    return;
  }

  const posts = getSpotlightPosts();
  if (posts.length <= 1) {
    stopSpotlightSlideshow();
    return;
  }

  state.spotlightPreviewIndex = (state.spotlightPreviewIndex + 1) % posts.length;
  updateSpotlightPreview(posts);
}

function updateSpotlightPreview(posts = getSpotlightPosts()) {
  const previewPost = posts[getSpotlightPreviewIndex(posts)];
  const mediaSlot = elements.viewRoot.querySelector('[data-spotlight-preview-media]');

  if (!previewPost || !mediaSlot) {
    return;
  }

  mediaSlot.innerHTML = renderSpotlightPreviewMedia(previewPost);

  if (!state.iosOptimized) {
    mediaSlot.classList.remove('slideshow-refresh');
    void mediaSlot.offsetWidth;
    mediaSlot.classList.add('slideshow-refresh');
  }
}

function renderSpotlightCard(post, index) {
  return `
    <article
      class="card hero-card hero-card-compact spotlight-card"
      data-post-id="${escapeHtml(post.id)}"
      data-open-post="${escapeHtml(post.id)}"
      style="--spotlight-order: ${escapeHtml(String(index))};"
    >
      <div class="hero-content hero-content-compact spotlight-content">
        <div class="hero-preview-shell spotlight-media-shell">
          <div class="hero-preview spotlight-preview">
            ${renderMedia(post, 'hero')}
          </div>
          <div class="spotlight-overlay">
            <div class="spotlight-topline">
              <span class="spotlight-counter">${escapeHtml(String(index + 1))}</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderPostDetailView() {
  const post = getSelectedPost();
  const returnView = getPostReturnView();

  if (!post) {
    return `
      <section class="card empty-card">
        <h3>Post unavailable</h3>
        <p>That spotlight card is not available right now.</p>
        <div class="summary-actions">
          <button class="ghost-button" type="button" data-open-view="${escapeHtml(returnView)}">Back</button>
        </div>
      </section>
    `;
  }

  const liked = hasActor(post.likeActorIds);
  const commentsOpen = state.activeCommentPostId === post.id;
  const shareCount = getPostShareCount(post.id);
  const hasMedia = hasPostMedia(post);
  const suggestions = findSuggestedProducts(post, { limit: 4 });
  const postKindLabel = getPostKindLabel(post);
  const relatedPosts = state.posts
    .filter((entry) => entry.id !== post.id && entry.channel === post.channel)
    .slice(0, 4);
  const tagLine = (post.tags || []).slice(0, 4).map((tag) => `#${tag}`).join('  ');

  return `
    <section class="post-detail-stage">
      <section class="card post-detail-topbar">
        <button class="ghost-button post-detail-back" type="button" data-open-view="${escapeHtml(returnView)}">Back</button>
        <div class="post-detail-route">
          <p class="section-label">Post</p>
          <h3>${escapeHtml(post.captionTitle)}</h3>
          <p>${escapeHtml(titleCase(post.channel))} · ${escapeHtml(formatRelativeTime(post.createdAt))}</p>
        </div>
      </section>

      <article class="card post-detail-card">
        ${hasMedia ? `
          <div class="post-detail-media-shell">
            <div class="post-detail-media">
              ${renderMedia(post, 'detail')}
            </div>

            <div class="post-detail-media-overlay">
              <div class="post-detail-identity">
                ${renderAvatarShell(post)}
                <div class="post-detail-identity-copy">
                  <strong>${escapeHtml(post.displayName)}</strong>
                  <span>${escapeHtml(post.userName)}</span>
                </div>
              </div>

              <div class="post-detail-media-meta">
                <span class="post-detail-meta-chip">${escapeHtml(postKindLabel)}</span>
                <span class="post-detail-meta-chip">${escapeHtml(formatRelativeTime(post.createdAt))}</span>
              </div>
            </div>
          </div>
        ` : `
          <div class="post-detail-text-shell">
            <div class="post-detail-identity">
              ${renderAvatarShell(post)}
              <div class="post-detail-identity-copy">
                <strong>${escapeHtml(post.displayName)}</strong>
                <span>${escapeHtml(post.userName)}</span>
              </div>
            </div>

            <div class="post-detail-media-meta">
              <span class="post-detail-meta-chip">${escapeHtml(postKindLabel)}</span>
              <span class="post-detail-meta-chip">${escapeHtml(formatRelativeTime(post.createdAt))}</span>
            </div>
          </div>
        `}

        <div class="post-detail-content">
          <div class="post-detail-copy">
            <h2 class="post-detail-title">${escapeHtml(post.captionTitle)}</h2>
            <p class="post-detail-caption">${escapeHtml(post.captionText)}</p>
            ${tagLine ? `<p class="post-detail-tags">${escapeHtml(tagLine)}</p>` : ''}
          </div>

          <div class="post-detail-actions">
            <div class="metric-row post-detail-action-row">
              ${renderPostMetricButton({
                icon: 'heart',
                label: liked ? 'Liked' : 'Like',
                active: liked,
                count: formatCompactNumber(post.likes),
                attributes: `data-toggle-like="${escapeHtml(post.id)}"`
              })}
              ${renderPostMetricButton({
                icon: 'chat',
                label: 'Comment',
                active: commentsOpen,
                count: formatCompactNumber(getPostCommentCount(post)),
                attributes: `data-open-comments="${escapeHtml(post.id)}"`
              })}
              ${renderPostMetricButton({
                icon: 'share',
                label: 'Share',
                active: shareCount > 0,
                count: formatCompactNumber(shareCount),
                attributes: `data-share-post="${escapeHtml(post.id)}"`
              })}
            </div>

            <div class="post-detail-stats">
              <div class="post-detail-stat">
                <strong>${formatCompactNumber(post.likes)}</strong>
                <span>Likes</span>
              </div>
              <div class="post-detail-stat">
                <strong>${formatCompactNumber(post.commentsCount)}</strong>
                <span>Comments</span>
              </div>
              <div class="post-detail-stat">
                <strong>${formatCompactNumber(shareCount)}</strong>
                <span>Shares</span>
              </div>
            </div>
          </div>

          ${suggestions.length ? `
            <section class="post-detail-commerce">
              <div class="section-header">
                <div>
                  <p class="section-label">${suggestions.length > 1 ? 'Linked pieces' : 'Linked piece'}</p>
                  <h3 class="section-title">Shop from this post</h3>
                </div>
                <button class="ghost-button" type="button" data-open-view="shop">Open shop</button>
              </div>
              ${renderSuggestionList(suggestions)}
            </section>
          ` : ''}
        </div>
      </article>

      ${relatedPosts.length ? `
        <section class="card post-detail-related">
          <div class="section-header">
            <div>
              <p class="section-label">Continue</p>
              <h3 class="section-title">More from ${escapeHtml(titleCase(post.channel))}</h3>
            </div>
            <p class="section-note">${escapeHtml(post.displayName)} keeps this mood going.</p>
          </div>
          <div class="post-detail-related-grid">
            ${relatedPosts.map(renderPostPeekCard).join('')}
          </div>
        </section>
      ` : ''}
    </section>
  `;
}

function renderPostPeekCard(post) {
  return `
    <button class="post-peek-card" type="button" data-open-post="${escapeHtml(post.id)}">
      <div class="post-peek-media">
        ${renderMedia(post, 'peek')}
      </div>
      <div class="post-peek-copy">
        <strong>${escapeHtml(post.captionTitle)}</strong>
        <span>${escapeHtml(post.userName)} · ${escapeHtml(formatRelativeTime(post.createdAt))}</span>
      </div>
    </button>
  `;
}

function renderVideosView() {
  const videoPosts = state.posts.filter((post) => post.mediaType === 'video');
  const sourcePosts = videoPosts.length ? videoPosts : state.posts;
  const { items: showcase, hasMore } = getVisibleFeedPosts('videos', sourcePosts);
  const showcaseMarkup = renderPostCardList(showcase, 'videos');

  return `
    <section class="card hero-card">
      <div class="hero-content">
        <div>
          <p class="hero-label">Videos</p>
          <h2 class="hero-title">Motion-first SocialEra</h2>
          <p class="hero-text">This tab is shaped like a floating-dock video stream, ready for creator clips, drop teasers, and shoppable motion.</p>
        </div>

        <div class="hero-metrics">
          <div class="hero-metric">
            <strong>${formatCompactNumber(videoPosts.length || showcase.length)}</strong>
            <span>Video-ready cards</span>
          </div>
          <div class="hero-metric">
            <strong>${formatCompactNumber(state.posts.length)}</strong>
            <span>Posts available</span>
          </div>
          <div class="hero-metric">
            <strong>${formatCompactNumber(state.products.length)}</strong>
            <span>Shoppable items</span>
          </div>
        </div>

        <div class="hero-actions">
          <button class="primary-button" type="button" data-open-view="shop">Shop the drop</button>
          <button class="ghost-button" type="button" data-open-view="upload">Open composer</button>
        </div>
      </div>
    </section>

    <section class="post-list">
      ${showcaseMarkup || renderEmptyCard('No videos yet', 'Once video posts are added, this tab can become the app\'s main vertical media stream.')}
    </section>
    ${renderFeedContinuation('videos', hasMore)}
  `;
}

function renderFeedContinuation(view, hasMore) {
  if (!hasMore) {
    return '';
  }

  return `
    <section class="feed-continuation auto" data-feed-autoload="${escapeHtml(view)}" aria-hidden="true">
      <span class="feed-autoload-marker"></span>
    </section>
  `;
}

function renderPostCardList(posts, surface = 'feed') {
  return (Array.isArray(posts) ? posts : []).map((post, index) => {
    try {
      return renderPostCard(post);
    } catch (error) {
      console.error('Skipping malformed rendered post card:', {
        surface,
        index,
        postId: post && post.id ? post.id : '',
        error
      });
      return '';
    }
  }).join('');
}

function renderDiscoverView() {
  return discoverViewRenderService.renderDiscoverView(state.products);
}

function renderSearchView() {
  return searchViewRenderService.renderSearchView();
}

function renderCatalogResultsSection(view) {
  const normalizedView = normalizeView(view) === 'search' ? 'search' : 'shop';

  if (normalizedView === 'search') {
    const payload = getCatalogSearchPayload(String(state.searchViewQuery || ''), {
      includeRecentWhenEmpty: true
    });

    return `
      <section class="card app-search-experience" data-catalog-results="search">
        <div class="section-header app-search-head">
          <div>
            <p class="section-label">${escapeHtml(payload.kicker)}</p>
            <h3 class="section-title">${escapeHtml(payload.title)}</h3>
          </div>
          ${payload.note ? `<p class="section-note">${escapeHtml(payload.note)}</p>` : ''}
        </div>

        ${payload.sections.length ? `
          <div class="app-search-sections">
            ${payload.sections.map((section) => renderCatalogSearchSection(section)).join('')}
          </div>
        ` : renderEmptyCard('No search activity yet', 'Start typing to search members, products, and posts.')}
      </section>
    `;
  }

  const catalogContext = getCatalogContext(normalizedView);
  const products = getFilteredProducts({ view: normalizedView });
  const title = normalizedView === 'search'
    ? `${products.length} matches`
    : `${products.length} products in view`;
  const note = normalizedView === 'search'
    ? (catalogContext.query ? `Searching for "${escapeHtml(catalogContext.query)}"` : 'Start typing to narrow the catalog.')
    : (catalogContext.query ? `Filtered by "${escapeHtml(catalogContext.query)}"` : 'Pulling from the shared backend.');
  const emptyTitle = normalizedView === 'search' ? 'No search results' : 'Nothing matched that search';
  const emptyNote = normalizedView === 'search'
    ? 'Try a different keyword or switch the category chips.'
    : 'Try a broader keyword or swap back to all categories.';

  return `
    <section class="discover-stack" data-catalog-results="${escapeHtml(normalizedView)}">
      <div class="section-header">
        <div>
          <p class="section-label">${escapeHtml(normalizedView === 'search' ? 'Results' : 'Catalog')}</p>
          <h3 class="section-title">${title}</h3>
        </div>
        <p class="section-note">${note}</p>
      </div>

      <div class="product-grid">
        ${products.length ? products.map((product) => renderProductCard(product)).join('') : renderEmptyCard(emptyTitle, emptyNote)}
      </div>
    </section>
  `;
}

function renderCatalogSearchExperience({
  view = state.activeView,
  includeRecentWhenEmpty = false
} = {}) {
  const catalogContext = getCatalogContext(view);
  const payload = getCatalogSearchPayload(catalogContext.query, {
    includeRecentWhenEmpty
  });

  if (!payload.sections.length) {
    return '';
  }

  return `
    <section class="card app-search-experience">
      <div class="section-header app-search-head">
        <div>
          <p class="section-label">${escapeHtml(payload.kicker)}</p>
          <h3 class="section-title">${escapeHtml(payload.title)}</h3>
        </div>
        ${payload.note ? `<p class="section-note">${escapeHtml(payload.note)}</p>` : ''}
      </div>

      <div class="app-search-sections">
        ${payload.sections.map((section) => renderCatalogSearchSection(section)).join('')}
      </div>
    </section>
  `;
}

function syncCatalogSearchUi() {
  const normalizedView = normalizeView(state.activeView);

  if (!elements.viewRoot || (normalizedView !== 'shop' && normalizedView !== 'search')) {
    return false;
  }

  const resultsSection = elements.viewRoot.querySelector(`[data-catalog-results="${normalizedView}"]`);

  if (!resultsSection) {
    return false;
  }

  if (normalizedView === 'shop') {
    const experienceSlot = elements.viewRoot.querySelector('[data-catalog-search-experience="shop"]');

    if (!experienceSlot) {
      return false;
    }

    experienceSlot.innerHTML = renderCatalogSearchExperience({
      view: normalizedView,
      includeRecentWhenEmpty: false
    });
  }

  resultsSection.outerHTML = renderCatalogResultsSection(normalizedView);
  return true;
}

function syncUsappSearchUi() {
  if (!elements.viewRoot || normalizeView(state.activeView) !== 'inbox' || state.messagePanelMode !== 'inbox') {
    return false;
  }

  const threadList = elements.viewRoot.querySelector('[data-usapp-thread-list]');
  const contactRow = elements.viewRoot.querySelector('[data-usapp-contact-row]');

  if (!threadList || !contactRow) {
    return false;
  }

  const selectedThread = getSelectedThread();
  threadList.innerHTML = renderUsappThreadListContent();
  contactRow.innerHTML = renderUsappContactRowContent(selectedThread);
  return true;
}

function queueUsappSearchUiSync({ delayMs = 90 } = {}) {
  if (messageSearchSyncTimer) {
    window.clearTimeout(messageSearchSyncTimer);
  }

  messageSearchSyncTimer = window.setTimeout(() => {
    messageSearchSyncTimer = null;
    syncUsappSearchUi();
  }, delayMs);
}

function setUsappSearchFocusState(isFocused) {
  state.messageSearchFocused = Boolean(isFocused)
    && normalizeView(state.activeView) === 'inbox'
    && state.messagePanelMode === 'inbox'
    && state.messageSearchOpen;
}

function shouldDeferUsappSearchWhileTyping() {
  return ANDROID_CHROME_DEVICE && isUsappSearchFieldActive();
}

function isUsappSearchFieldActive() {
  const active = document.activeElement;

  return state.messageSearchFocused || Boolean(
    active
    && active instanceof HTMLElement
    && active.matches('[data-message-search]')
    && normalizeView(state.activeView) === 'inbox'
    && state.messagePanelMode === 'inbox'
  );
}

function handleFocusIn(event) {
  if (event.target instanceof HTMLElement && event.target.matches('[data-message-search]')) {
    setUsappSearchFocusState(true);
  }
}

function handleFocusOut(event) {
  if (!(event.target instanceof HTMLElement) || !event.target.matches('[data-message-search]')) {
    return;
  }

  window.setTimeout(() => {
    const active = document.activeElement;
    const stillFocused = Boolean(active instanceof HTMLElement && active.matches('[data-message-search]'));
    setUsappSearchFocusState(stillFocused);

    if (!stillFocused && state.messageSearchPendingSync) {
      state.messageSearchPendingSync = false;
      syncUsappSearchUi();
    }
  }, 0);
}

function clearUsappSearchUiSyncTimer() {
  if (!messageSearchSyncTimer) {
    return;
  }

  window.clearTimeout(messageSearchSyncTimer);
  messageSearchSyncTimer = null;
}

function renderCatalogSearchSection(section) {
  if (!section || !Array.isArray(section.items) || !section.items.length) {
    return '';
  }

  return `
    <section class="app-search-section">
      <div class="app-search-section-title">${escapeHtml(section.title)}</div>
      <div class="app-search-result-list">
        ${section.items.map((item) => renderCatalogSearchResult(item)).join('')}
      </div>
    </section>
  `;
}

function renderCatalogSearchResult(item) {
  const attrs = [
    `data-app-search-kind="${escapeHtml(item.kind)}"`,
    item.id ? `data-app-search-id="${escapeHtml(String(item.id))}"` : '',
    item.actorId ? `data-app-search-actor-id="${escapeHtml(String(item.actorId))}"` : '',
    item.postId ? `data-app-search-post-id="${escapeHtml(String(item.postId))}"` : '',
    item.label ? `data-app-search-label="${escapeHtml(String(item.label))}"` : '',
    item.query ? `data-app-search-query="${escapeHtml(String(item.query))}"` : '',
    item.url ? `data-app-search-url="${escapeHtml(String(item.url))}"` : ''
  ].filter(Boolean).join(' ');

  const visual = item.kind === 'product'
    ? `
      <span class="app-search-result-thumb is-product" aria-hidden="true">
        ${renderProductMedia(item.product)}
      </span>
    `
    : item.photoUrl
      ? `
        <span class="app-search-result-thumb ${item.kind === 'web-link' ? 'is-web' : ''}" aria-hidden="true">
          <img src="${escapeHtml(resolveMediaUrl(item.photoUrl))}" alt="">
        </span>
      `
      : `
        <span class="app-search-result-thumb ${item.kind === 'web-link' ? 'is-web' : ''}" aria-hidden="true">
          ${escapeHtml(item.avatar || getInitials(item.displayName || item.label || item.provider || 'SE'))}
        </span>
      `;

  return `
    <button class="app-search-result" type="button" ${attrs}>
      ${visual}
      <span class="app-search-result-copy">
        <span class="app-search-result-meta">
          <span class="app-search-result-kicker">${escapeHtml(item.kicker)}</span>
          ${item.tag ? `<span class="app-search-result-tag">${escapeHtml(item.tag)}</span>` : ''}
        </span>
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.subtitle)}</span>
      </span>
    </button>
  `;
}

function getCatalogSearchPayload(query, { includeRecentWhenEmpty = false } = {}) {
  const trimmedQuery = String(query || '').trim();
  const normalizedQuery = normalizeSearchText(trimmedQuery);

  if (!normalizedQuery) {
    const recent = includeRecentWhenEmpty ? getRecentSearches() : [];

    return {
      kicker: 'Search memory',
      title: recent.length ? 'Pick up a recent search' : 'Start typing to search SocialEra',
      note: recent.length ? 'Products, posts, profiles, and web shortcuts mirror the website search flow.' : 'Search works best with product names, creators, post titles, or mood words.',
      sections: recent.length ? [{
        title: 'Recent searches',
        items: recent.map((term) => ({
          kind: 'recent',
          label: term,
          query: term,
          kicker: 'Recent',
          tag: 'Search again',
          title: term,
          subtitle: 'Bring this search back into the app.',
          avatar: '↺'
        }))
      }] : []
    };
  }

  const productMatches = getCatalogProductSearchResults(normalizedQuery);
  const postMatches = getCatalogPostSearchResults(normalizedQuery);
  const profileMatches = getCatalogProfileSearchResults(normalizedQuery);

  if (!productMatches.length && !postMatches.length && !profileMatches.length) {
    const webFallbacks = buildWebSearchFallbacks(trimmedQuery);

    return {
      kicker: 'Search the web',
      title: 'No SocialEra matches yet',
      note: 'These shortcuts come from the website search fallback behavior.',
      sections: [{
        title: 'Web shortcuts',
        items: webFallbacks
      }]
    };
  }

  const sections = [];

  if (productMatches.length) {
    sections.push({
      title: 'Products',
      items: productMatches.map((product) => ({
        kind: 'product',
        id: product.id,
        label: product.name,
        kicker: 'Product',
        tag: formatCurrency(product.price),
        title: product.name,
        subtitle: product.category ? titleCase(product.category) : 'Shop item',
        product
      }))
    });
  }

  if (postMatches.length) {
    sections.push({
      title: 'Posts',
      items: postMatches.map((post) => ({
        kind: 'post',
        id: post.id,
        label: post.captionTitle || post.displayName,
        kicker: 'Post',
        tag: post.displayName || 'SocialEra Member',
        title: post.captionTitle || 'Untitled post',
        subtitle: post.displayName || 'SocialEra Member',
        avatar: post.avatar || getInitials(post.displayName),
        displayName: post.displayName
      }))
    });
  }

  if (profileMatches.length) {
    sections.push({
      title: 'Members',
      items: profileMatches.map((profile) => ({
        kind: 'profile',
        actorId: profile.actorId,
        postId: profile.postId,
        label: profile.displayName || profile.userName,
        kicker: 'Member',
        tag: `${profile.postCount} post${profile.postCount === 1 ? '' : 's'}`,
        title: profile.displayName,
        subtitle: profile.userName || 'SocialEra profile',
        avatar: profile.avatar || getInitials(profile.displayName),
        photoUrl: profile.photoUrl || '',
        displayName: profile.displayName
      }))
    });
  }

  return {
    kicker: 'Search results',
    title: `Matches for "${trimmedQuery}"`,
    note: 'This app search now mirrors the website logic across products, posts, profiles, and web fallback.',
    sections
  };
}

function normalizeSearchText(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function getRecentSearches(actorId = state.actorId) {
  const stored = loadJson(getActorStorageKey(STORAGE_KEYS.recentSearches, actorId));
  return Array.isArray(stored) ? stored.map((entry) => String(entry || '').trim()).filter(Boolean).slice(0, 5) : [];
}

function saveRecentSearch(term, actorId = state.actorId) {
  const value = String(term || '').trim();

  if (!value) {
    return;
  }

  const deduped = [
    value,
    ...getRecentSearches(actorId).filter((entry) => normalizeSearchText(entry) !== normalizeSearchText(value))
  ].slice(0, 5);

  persistJson(getActorStorageKey(STORAGE_KEYS.recentSearches, actorId), deduped);
}

function getCatalogProductSearchResults(query) {
  return state.products.filter((product) => {
    const haystack = [
      normalizeSearchText(product.name),
      normalizeSearchText(product.description),
      normalizeSearchText(product.category)
    ].join(' ');

    return haystack.includes(query);
  }).slice(0, 4);
}

function getCatalogPostSearchResults(query) {
  return state.posts.filter((post) => {
    const haystack = [
      normalizeSearchText(post.captionTitle),
      normalizeSearchText(post.captionText),
      normalizeSearchText(post.displayName),
      normalizeSearchText(post.userName),
      ...(Array.isArray(post.tags) ? post.tags.map((tag) => normalizeSearchText(tag)) : [])
    ].join(' ');

    return haystack.includes(query);
  }).slice(0, 3);
}

function getCatalogProfileSearchResults(query) {
  const seen = new Map();

  state.contacts
    .filter((contact) => isMemberMessageContact(contact))
    .forEach((contact) => {
      const key = String(contact.actorId || contact.nativeUserId || contact.userName || contact.displayName || '').trim().toLowerCase();

      if (!key || seen.has(key)) {
        return;
      }

      seen.set(key, {
        actorId: contact.actorId,
        displayName: contact.displayName,
        userName: contact.userName,
        avatar: contact.avatar,
        photoUrl: contact.photoUrl || '',
        postId: '',
        postCount: 0,
        createdAt: ''
      });
    });

  state.posts.forEach((post) => {
    const key = String(post.actorId || `${normalizeSearchText(post.userName)}::${normalizeSearchText(post.displayName)}`).trim().toLowerCase();

    if (!seen.has(key)) {
      seen.set(key, {
        actorId: post.actorId || '',
        displayName: post.displayName,
        userName: post.userName,
        avatar: post.avatar,
        photoUrl: post.photoUrl || '',
        postId: post.id,
        postCount: 0,
        createdAt: post.createdAt
      });
    }

    const entry = seen.get(key);
    entry.postCount += 1;
    entry.actorId = entry.actorId || post.actorId || '';
    entry.displayName = entry.displayName || post.displayName;
    entry.userName = entry.userName || post.userName;
    entry.avatar = entry.avatar || post.avatar;
    entry.photoUrl = entry.photoUrl || post.photoUrl || '';

    if (!entry.createdAt || new Date(post.createdAt).getTime() > new Date(entry.createdAt).getTime()) {
      entry.postId = post.id;
      entry.createdAt = post.createdAt;
      entry.photoUrl = post.photoUrl || entry.photoUrl || '';
    }
  });

  return [...seen.values()].filter((profile) => {
    const haystack = `${normalizeSearchText(profile.displayName)} ${normalizeSearchText(profile.userName)}`;
    return haystack.includes(query);
  }).slice(0, 3);
}

function buildWebSearchFallbacks(query) {
  return [
    {
      kind: 'web-link',
      label: query,
      query,
      url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      kicker: 'Web',
      tag: 'Google',
      title: 'Google',
      subtitle: `Find "${query}" on Google`,
      avatar: '↗'
    },
    {
      kind: 'web-link',
      label: query,
      query,
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
      kicker: 'Web',
      tag: 'YouTube',
      title: 'YouTube',
      subtitle: `Find "${query}" on YouTube`,
      avatar: '↗'
    },
    {
      kind: 'web-link',
      label: query,
      query,
      url: `https://www.amazon.com/s?k=${encodeURIComponent(query)}`,
      kicker: 'Web',
      tag: 'Amazon',
      title: 'Amazon',
      subtitle: `Find "${query}" on Amazon`,
      avatar: '↗'
    },
    {
      kind: 'web-link',
      label: query,
      query,
      url: `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`,
      kicker: 'Web',
      tag: 'TikTok',
      title: 'TikTok',
      subtitle: `Find "${query}" on TikTok`,
      avatar: '↗'
    },
    {
      kind: 'web-link',
      label: query,
      query,
      url: `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`,
      kicker: 'Web',
      tag: 'Pinterest',
      title: 'Pinterest',
      subtitle: `Find "${query}" on Pinterest`,
      avatar: '↗'
    }
  ];
}

function handleCatalogSearchResult(dataset = {}) {
  const kind = String(dataset.appSearchKind || '').trim();
  const label = String(dataset.appSearchLabel || dataset.appSearchQuery || '').trim();

  if (label) {
    saveRecentSearch(label);
  }

  if (kind === 'recent') {
    state.searchViewQuery = label;
    if (!syncCatalogSearchUi()) {
      render();
    }
    return;
  }

  if (kind === 'product') {
    state.searchViewQuery = label;
    state.searchQuery = label;
    state.discoverFilter = 'all';
    setActiveView('shop');
    return;
  }

  if (kind === 'post' && dataset.appSearchId) {
    openPost(dataset.appSearchId);
    return;
  }

  if (kind === 'profile') {
    if (dataset.appSearchActorId) {
      ensureThread(dataset.appSearchActorId);
      return;
    }

    if (dataset.appSearchPostId) {
      openPost(dataset.appSearchPostId);
      return;
    }

    return;
  }

  if (kind === 'web-link' && dataset.appSearchUrl) {
    window.open(dataset.appSearchUrl, '_blank', 'noopener');
  }
}

function renderUploadView() {
  const draft = state.uploadDraft;
  const previewPost = buildUploadPreviewPost();
  const previewCollapsed = isCompactUploadPreviewViewport() && !state.uploadPreviewOpen;
  const selectionCount = draft.linkedProductIds.length;
  const hasMedia = Boolean(draft.mediaUrl);
  const canPublish = canPublishUploadDraft(draft);
  const pickerProducts = getUploadPickerProducts();
  const typedTags = getTypedUploadTags(draft);
  const selectedProducts = state.products.filter((product) => draft.linkedProductIds.includes(String(product.id)));
  const titleCount = draft.title.trim().length;
  const captionCount = draft.text.trim().length;
  const promoCount = String(draft.promotedText || '').trim().length;
  const fileLabel = draft.mediaName || (hasMedia && draft.mediaSource === 'url' ? 'Media added via URL.' : 'No file selected yet.');

  return `
    <section class="upload-modal-stage">
      <section class="card upload-modal-card">
        <div class="upload-modal-head">
          <div class="upload-modal-copy">
            <p class="section-label">Composer</p>
            <h2>Post to the SocialEra feed</h2>
            
          </div>
        </div>

        <form class="upload-form upload-modal-form" data-upload-form="true">
          <section class="upload-modal-field full">
            <label for="upload-media-input">Upload photo or video</label>
            <div class="upload-modal-upload">
              <input id="upload-media-input" class="upload-file-input" type="file" accept="image/*,video/*" data-upload-file="true">
              <div class="upload-modal-upload-shell">
                <label class="upload-modal-upload-trigger" for="upload-media-input">
                  <span class="upload-modal-upload-copy">
                    
                   
                  </span>
                  <span class="upload-modal-upload-badge">Browse</span>
                </label>
                <div id="upload-file-name" class="upload-modal-file-name" data-upload-media-note>${escapeHtml(fileLabel)}</div>
                <div class="upload-modal-preview-shell ${hasMedia ? 'has-media' : ''}" data-upload-inline-media>
                  ${renderUploadModalPreviewMedia(previewPost, hasMedia)}
                </div>
                <div class="upload-type-toggle chip-row">
                  ${['image', 'video'].map((mediaType) => `
                    <button
                      class="chip ${draft.mediaType === mediaType ? 'active' : ''}"
                      type="button"
                      data-upload-media-type="${escapeHtml(mediaType)}"
                    >
                      ${escapeHtml(mediaType === 'image' ? 'Photo' : 'Video')}
                    </button>
                  `).join('')}
                  <button class="ghost-button upload-inline-clear" type="button" data-clear-upload-media="true">Clear</button>
                </div>
              </div>
            </div>
          </section>

          <section class="upload-modal-field full">
            <div class="upload-modal-field-head">
              <label for="upload-title-input">Post title</label>
              <span class="upload-modal-counter" data-upload-title-count>${titleCount}/90</span>
            </div>
            <input
              id="upload-title-input"
              class="text-field"
              type="text"
              name="title"
              maxlength="90"
             
              value="${escapeHtml(draft.title)}"
              data-upload-field="title"
            >
          </section>

          <section class="upload-modal-field full">
            <div class="upload-modal-field-head">
              <label for="upload-caption-input">Caption</label>
              <span class="upload-modal-counter" data-upload-caption-count>${captionCount}/340</span>
            </div>
            <textarea
              id="upload-caption-input"
              class="textarea"
              name="text"
              maxlength="340"
              
              data-upload-field="text"
            >${escapeHtml(draft.text)}</textarea>
          </section>

          <section class="upload-modal-field full">
            <label class="upload-modal-checkbox">
              <input type="checkbox" data-upload-promote-toggle="true" ${draft.promoteEnabled ? 'checked' : ''}>
              <span>Promote a product or offer with this post</span>
            </label>
          </section>

          <section class="upload-modal-field ${draft.promoteEnabled ? '' : 'hidden'}" data-upload-promote-field="title">
            <label for="upload-promoted-title">Promoted item</label>
            <input
              id="upload-promoted-title"
              class="text-field"
              type="text"
              name="promotedTitle"
              maxlength="70"
              placeholder="SocialEra Watch Drop"
              value="${escapeHtml(draft.promotedTitle)}"
              data-upload-field="promotedTitle"
            >
          </section>

          <section class="upload-modal-field ${draft.promoteEnabled ? '' : 'hidden'}" data-upload-promote-field="price">
            <label for="upload-promoted-price">Price</label>
            <input
              id="upload-promoted-price"
              class="text-field"
              type="text"
              name="promotedPrice"
              maxlength="24"
              placeholder="$129.00"
              value="${escapeHtml(draft.promotedPrice)}"
              data-upload-field="promotedPrice"
            >
          </section>

          <section class="upload-modal-field full ${draft.promoteEnabled ? '' : 'hidden'}" data-upload-promote-field="text">
            <div class="upload-modal-field-head">
              <label for="upload-promoted-text">Promo note</label>
              <span class="upload-modal-counter" data-upload-promoted-count>${promoCount}/180</span>
            </div>
            <textarea
              id="upload-promoted-text"
              class="textarea"
              name="promotedText"
              maxlength="180"
              placeholder="Short promo copy that should appear in the match layer."
              data-upload-field="promotedText"
            >${escapeHtml(draft.promotedText)}</textarea>
          </section>

          <section class="upload-modal-field full">
            <div class="upload-modal-field-head">
              <label for="upload-tags-input">Tags</label>
              <span class="upload-modal-counter" data-upload-tags-count>${typedTags.length} ${typedTags.length === 1 ? 'tag' : 'tags'}</span>
            </div>
            <input
              id="upload-tags-input"
              class="text-field"
              type="text"
              name="tagText"
              maxlength="120"
              placeholder="watch, bag, accessories"
              value="${escapeHtml(draft.tagText)}"
              data-upload-field="tagText"
            >
            <div class="upload-modal-helper">Use a few short tags so SocialEra can place the post better in the feed.</div>
          </section>

          <section class="upload-modal-field full">
            <div class="upload-modal-field-head">
              <label>Shop Match</label>
              <span class="upload-modal-counter" data-upload-selection-count>${selectionCount} ${selectionCount === 1 ? 'item selected' : 'items selected'}</span>
            </div>
            <div class="upload-product-grid">
              ${pickerProducts.length ? pickerProducts.map(renderUploadProductOption).join('') : renderEmptyCard('No products yet', 'Products from the shared catalog will show here for tagging.')}
            </div>
            ${selectedProducts.length ? `
              <div class="upload-selected-products">
                ${selectedProducts.map((product) => `
                  <button
                    class="upload-selected-product"
                    type="button"
                    data-upload-product="${escapeHtml(String(product.id))}"
                    aria-label="Remove ${escapeHtml(product.name)} from this post"
                  >
                    <span>${escapeHtml(product.name)}</span>
                    <strong>Remove</strong>
                  </button>
                `).join('')}
              </div>
            ` : ''}
          </section>

          <div class="upload-modal-actions">
            <button class="ghost-button" type="button" data-reset-upload="true">Reset</button>
            <button class="primary-button" type="submit" ${canPublish ? '' : 'disabled'}>Publish Post</button>
          </div>
          <div class="upload-modal-status ${canPublish ? 'success' : 'error'}" data-upload-review-copy>
            ${escapeHtml(getUploadPublishMessage(draft))}
          </div>
        </form>
      </section>

      <section class="card upload-preview-card upload-modal-preview-card ${previewCollapsed ? 'is-collapsed' : ''}">
        <div class="upload-preview-head">
          <div class="upload-preview-copy">
          <p class="section-label">Live preview</p>
          <h3 class="section-title">This is how it lands</h3>
          <p class="helper-text">The app preview stays live while you type, just like the website composer updates its modal state before publish.</p>
          </div>
          <button
            class="ghost-button upload-preview-toggle"
            type="button"
            data-upload-preview-toggle="true"
            aria-expanded="${previewCollapsed ? 'false' : 'true'}"
          >
            ${escapeHtml(previewCollapsed ? 'Show preview' : 'Hide preview')}
          </button>
        </div>
        <div id="upload-preview-canvas" class="upload-preview-canvas" data-upload-preview>
          ${renderPostCard(previewPost)}
        </div>
      </section>
    </section>
  `;
}

function isCompactUploadPreviewViewport() {
  return window.matchMedia('(max-width: 719px)').matches;
}

function renderUploadModalPreviewMedia(previewPost, hasMedia) {
  if (!hasMedia) {
    return `
      <div class="upload-modal-empty">
        <strong>Choose media for your post</strong>
        <span>Drop in a photo or video to make the post feel alive in the feed.</span>
      </div>
    `;
  }

  return renderMedia(previewPost, 'hero');
}

function renderUploadProductOption(product) {
  const selected = state.uploadDraft.linkedProductIds.includes(String(product.id));

  return `
    <button
      class="upload-product-option ${selected ? 'active' : ''}"
      type="button"
      data-upload-product="${escapeHtml(String(product.id))}"
    >
      <span class="upload-product-thumb">
        ${renderProductMedia(product)}
      </span>
      <span class="upload-product-copy">
        <strong>${escapeHtml(product.name)}</strong>
        <span>${formatCurrency(product.price)}</span>
      </span>
    </button>
  `;
}

function renderUploadHeroMedia(previewPost, hasMedia) {
  if (!hasMedia) {
    return `
      <div class="upload-hero-empty" aria-hidden="true">
        <span class="upload-hero-glow upload-hero-glow-one"></span>
        <span class="upload-hero-glow upload-hero-glow-two"></span>
        <span class="upload-hero-grid"></span>
      </div>
    `;
  }

  return renderMedia(previewPost, 'hero');
}

function getUploadPickerProducts() {
  const featured = state.products.filter((product) => product.featured);
  const source = featured.length ? featured : state.products;
  return source.slice(0, 6);
}

function canPublishUploadDraft(draft = state.uploadDraft) {
  const hasMedia = Boolean(String(draft && draft.mediaUrl || '').trim());
  const hasCopy = Boolean(
    String(draft && draft.title || '').trim()
    || String(draft && draft.text || '').trim()
  );

  return Boolean(
    draft
    && (hasMedia || hasCopy)
  );
}

function getUploadPublishMessage(draft = state.uploadDraft) {
  if (!String(draft.title || '').trim()) {
    return 'Add a post title before publishing.';
  }

  if (!String(draft.text || '').trim()) {
    return 'Add a caption before publishing.';
  }

  if (draft.promoteEnabled && !String(draft.promotedTitle || '').trim()) {
    return 'Add the promoted item title before publishing.';
  }

  return 'Ready to publish this post to Home and Spotlight.';
}

function getUploadChannelOptions() {
  const dynamicChannels = Array.from(new Set(state.posts.map((post) => String(post.channel || '').trim()).filter(Boolean)));
  const combined = [...dynamicChannels, ...DEFAULT_UPLOAD_CHANNELS];
  return Array.from(new Set(combined)).slice(0, 6);
}

function buildUploadPreviewPost() {
  const hasCopy = Boolean(String(state.uploadDraft.title || '').trim() || String(state.uploadDraft.text || '').trim());

  return normalizePost({
    id: 'upload-preview',
    channel: state.uploadDraft.channel || DEFAULT_UPLOAD_CHANNELS[0],
    userName: state.profile.userName,
    displayName: state.profile.displayName,
    avatar: state.profile.avatar,
    photoUrl: state.profile.photoUrl,
    mediaType: state.uploadDraft.mediaType,
    mediaUrl: state.uploadDraft.mediaUrl,
    captionTitle: state.uploadDraft.title || (hasCopy ? 'Untitled SocialEra post' : 'Next SocialEra post'),
    captionText: state.uploadDraft.text || (state.uploadDraft.mediaUrl ? 'Write a caption to preview how this card will appear in Home and Spotlight.' : 'This is how a text-only post will land in Home and Spotlight.'),
    tags: getUploadTags(state.uploadDraft),
    linkedProductIds: state.uploadDraft.linkedProductIds,
    promoteEnabled: Boolean(state.uploadDraft.promoteEnabled),
    promotedTitle: state.uploadDraft.promotedTitle,
    promotedPrice: state.uploadDraft.promotedPrice,
    promotedText: state.uploadDraft.promotedText,
    createdAt: new Date().toISOString()
  });
}

function getUploadDraftKindLabel(draft = state.uploadDraft) {
  const hasMedia = Boolean(String(draft && draft.mediaUrl || '').trim());
  const hasCopy = Boolean(String(draft && draft.title || '').trim() || String(draft && draft.text || '').trim());

  if (hasMedia) {
    return titleCase(draft.mediaType || 'image');
  }

  if (hasCopy) {
    return 'Text';
  }

  return 'Draft';
}

function getUploadTags(draft = state.uploadDraft) {
  const typedTags = getTypedUploadTags(draft);
  const productTags = draft.linkedProductIds
    .map((id) => state.products.find((product) => String(product.id) === String(id)))
    .filter(Boolean)
    .map((product) => String(product.category || '').trim().toLowerCase())
    .filter(Boolean);

  return Array.from(new Set([...typedTags, ...productTags])).slice(0, 4);
}

function getTypedUploadTags(draft = state.uploadDraft) {
  return String(draft.tagText || '')
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

function getUploadMediaHelperText() {
  if (state.uploadDraft.mediaName) {
    return `Selected: ${state.uploadDraft.mediaName}`;
  }

  return 'Choose a local photo or video, paste a direct media URL, or skip media for a text-only post.';
}

function clearUploadMedia({ renderNow = true } = {}) {
  state.uploadDraft.mediaUrl = '';
  state.uploadDraft.mediaFile = null;
  state.uploadDraft.mediaUrlInput = '';
  state.uploadDraft.mediaName = '';
  state.uploadDraft.mediaSource = 'none';

  if (renderNow) {
    render();
  }
}

function renderBagView() {
  return bagViewRenderService.renderBagView();
}

function isUsappThreadMode(selectedThread = getSelectedThread()) {
  return state.messagePanelMode === 'thread' && Boolean(selectedThread);
}

function renderUsappPanelCard() {
  const selectedThread = getSelectedThread();
  const showingThread = isUsappThreadMode(selectedThread);

  if (showingThread) {
    return `
      <section class="usapp-chat-card usapp-chat-stage usapp-page-surface">
        ${renderConversation(selectedThread)}
      </section>
    `;
  }

  return `
    <section class="usapp-shell-card usapp-widget-card usapp-page-surface">
      <div class="usapp-widget-head">
        <div class="usapp-widget-title">
          <strong><span class="usapp-widget-brand">${renderUsappBrandIcon()}<span>Usapp Chats</span></span></strong>
        </div>
        <div class="usapp-widget-head-actions">
          <button
            class="usapp-icon-button ${state.messageSearchOpen ? 'active' : ''}"
            type="button"
            data-message-search-toggle="true"
            aria-label="Search chats"
            aria-expanded="${state.messageSearchOpen ? 'true' : 'false'}"
          >
            ${renderUsappSearchIcon()}
          </button>
        </div>
      </div>

      <div class="usapp-widget-body">
        ${state.messageStatus ? `
          <div class="usapp-widget-status ${escapeHtml(state.messageStatusType || 'info')}">
            <span class="usapp-widget-status-dot" aria-hidden="true"></span>
            <span>${escapeHtml(getMessageStatusCopy())}</span>
          </div>
        ` : ''}

        <div class="usapp-search-wrap ${state.messageSearchOpen ? 'is-open' : ''}">
          <input
            class="usapp-search"
            type="text"
            data-message-search="true"
            value="${escapeHtml(state.messageSearchQuery)}"
            placeholder="Search people or chats"
            inputmode="search"
            enterkeyhint="search"
            autocapitalize="none"
            autocomplete="off"
            spellcheck="false"
          >
        </div>

        <div class="usapp-section usapp-section-threads">
          <div class="usapp-pull-indicator" data-usapp-pull-indicator="true" aria-hidden="true">Pull to refresh</div>
          <div class="thread-list usapp-thread-list" data-usapp-thread-list="true">
            ${renderUsappThreadListContent()}
          </div>
        </div>

        <div class="usapp-section usapp-section-people">
          <div class="usapp-contact-row" data-usapp-contact-row="true">
            ${renderUsappContactRowContent(selectedThread)}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderUsappThreadListContent() {
  return usappThreadRenderService.renderUsappThreadListContent(getVisibleMessageThreads(), {
    activeThreadId: state.selectedThreadId
  });
}

function renderUsappContactRowContent(selectedThread = getSelectedThread()) {
  return usappContactRenderService.renderUsappContactRowContent({
    selectedThread,
    visibleContacts: getVisibleMessageContacts(),
    signedIn: Boolean(state.authUser)
  });
}

function renderInboxView() {
  const selectedThread = getSelectedThread();
  const pageMode = isUsappThreadMode(selectedThread) ? 'thread' : 'list';
  return `
    <section class="inbox-layout usapp-stage usapp-stage-page usapp-page-${escapeHtml(pageMode)}" data-usapp-page-mode="${escapeHtml(pageMode)}">
      ${renderUsappPanelCard()}
    </section>
  `;
}

function renderAuthView() {
  return authViewRenderService.renderAuthView();
}

function renderUsappSheet() {
  if (!elements.usappSheetRoot) {
    return;
  }

  if (lastUsappSheetMarkup) {
    elements.usappSheetRoot.innerHTML = '';
    lastUsappSheetMarkup = '';
  }
  state.usappAnimateIn = false;
}

function renderProfileView() {
  const savedCount = state.posts.filter((post) => hasActor(post.saveActorIds)).length;
  const likedCount = state.posts.filter((post) => hasActor(post.likeActorIds)).length;
  const threadCount = state.threads.length;
  const signedIn = Boolean(state.authUser);
  const identityMeta = signedIn
    ? `${state.profile.userName} · ${getAuthEmail(state.authUser)}`
    : `${state.profile.userName} · ${shortenIdentifier(state.actorId)}`;

  return `
    <section class="profile-grid">
      <section class="card profile-card">
        <div class="profile-head">
          ${renderAvatarShell(state.profile, 'profile-avatar')}
          <div class="profile-copy">
            <p class="section-label">${signedIn ? 'Account profile' : 'Guest profile'}</p>
            <h3>${escapeHtml(state.profile.displayName)}</h3>
            <p>${escapeHtml(identityMeta)}</p>
          </div>
        </div>

        <div class="profile-mode-row">
          <span class="mode-badge ${signedIn ? '' : 'preview'}">${signedIn ? 'Logged in' : 'Guest mode'}</span>
          <span class="featured-badge">${signedIn ? 'Website account connected' : 'Local to this device'}</span>
        </div>

        <div class="stat-grid">
          <div class="mini-stat">
            <strong>${formatCompactNumber(savedCount)}</strong>
            <span>Saved</span>
          </div>
          <div class="mini-stat">
            <strong>${formatCompactNumber(likedCount)}</strong>
            <span>Liked</span>
          </div>
          <div class="mini-stat">
            <strong>${formatCompactNumber(threadCount)}</strong>
            <span>Threads</span>
          </div>
        </div>
      </section>

      <section class="card connection-card auth-card">
        ${renderAuthCard()}
      </section>

      <section class="card connection-card">
        <div>
          <p class="section-label">App settings</p>
          <h3>Appearance and personalization</h3>
          <p>${signedIn ? 'Open Settings to manage your profile photo, theme, and background across the app.' : 'Open Settings to manage your guest profile photo now, or sign in to sync profile and appearance changes across devices.'}</p>
        </div>

        <button class="settings-entry-button" type="button" data-open-view="settings">
          <span class="settings-entry-icon" aria-hidden="true">${renderSettingsIcon()}</span>
          <span class="settings-entry-copy">
            <strong>Settings</strong>
            <span>${signedIn ? 'Profile photo, theme, background, and page targeting' : 'Profile photo plus app appearance controls'}</span>
          </span>
        </button>
      </section>

      <section class="card connection-card">
        <div class="thread-meta">
          <div>
            <p class="section-label">Connection</p>
            <h3>Separate process status</h3>
          </div>
          <span class="mode-badge ${state.offlineMode ? 'preview' : ''}">${state.offlineMode ? 'Preview mode' : 'Live backend'}</span>
        </div>
        <p>API base: ${escapeHtml(state.apiBase)}</p>
        <p>Assets: ${escapeHtml(state.assetBase)}</p>
        <div class="summary-actions">
          <button class="chrome-button icon-button" type="button" data-refresh-now="true" aria-label="Refresh live data">
            ${renderRefreshIcon()}
          </button>
          <button class="ghost-button" type="button" data-toggle-usapp="inbox">Open Usapp Chats</button>
        </div>
      </section>
    </section>
  `;
}

function renderSettingsView() {
  const signedIn = Boolean(state.authUser);
  const settings = cloneAppearanceSettings(getAppearanceDraftWithPendingBackground());
  const hasBackground = hasAppearanceBackground(settings);
  const previewUrl = hasBackground ? settings.backgroundUrl : '';
  const dirty = !areAppearanceSettingsEqual(settings, state.appearanceSettings);
  const disableSave = state.appearanceSaving || !signedIn || (settings.backgroundMode === 'selected' && !settings.selectedPages.length);
  const isSelectedTargetMode = settings.backgroundMode === 'selected';

  return `
    <section class="card hero-card hero-card-compact settings-hero-card">
      <div class="hero-content">
        <div class="settings-hero-topline">
          <span class="mode-badge">${signedIn ? 'Account synced' : 'Device profile'}</span>
          <button class="ghost-button settings-back-button" type="button" data-open-view="profile" ${state.appearanceSaving ? 'disabled' : ''}>Back to profile</button>
        </div>
        <div>
          <p class="section-label">Profile settings</p>
          <h2 class="settings-hero-title">Control your profile and app appearance.</h2>
          <p class="settings-hero-note">${signedIn ? 'Profile photo, theme, and background preview live here first, then save them to follow your signed-in account after refresh.' : 'Guest profile photo changes save on this device, while account appearance settings unlock after sign-in.'}</p>
        </div>
      </div>
    </section>

    <section class="card settings-section-card">
      <div class="settings-section-head">
        <div>
          <p class="mini-label">Profile</p>
          <h3>Profile photo</h3>
        </div>
        <span class="featured-badge">${signedIn ? 'Syncs across devices' : 'Saved on this device'}</span>
      </div>
      ${renderProfileEditor({ inSettings: true })}
    </section>

    <form class="settings-form" data-appearance-form="true">
      <section class="card settings-section-card">
        <div class="settings-section-head">
          <div>
            <p class="mini-label">Theme</p>
            <h3>Appearance presets</h3>
          </div>
          <span class="featured-badge">${escapeHtml(getThemeMeta(settings.theme).label)}</span>
        </div>
        <div class="theme-grid">
          ${APP_THEMES.map((theme) => `
            <button
              class="theme-option ${settings.theme === theme.id ? 'active' : ''}"
              type="button"
              data-settings-theme="${escapeHtml(theme.id)}"
            >
              <span class="theme-swatches" aria-hidden="true">
                ${theme.swatches.map((color) => `<span class="theme-swatch" style="--theme-swatch:${escapeHtml(color)}"></span>`).join('')}
              </span>
              <span class="theme-option-copy">
                <strong>${escapeHtml(theme.label)}</strong>
                <span>${escapeHtml(theme.note)}</span>
              </span>
            </button>
          `).join('')}
        </div>
      </section>

      <section class="card settings-section-card">
        <div class="settings-section-head">
          <div>
            <p class="mini-label">Background</p>
            <h3>Upload a background image</h3>
          </div>
          <span class="featured-badge">${hasBackground ? 'Preview ready' : 'Optional'}</span>
        </div>
        <div class="settings-background-preview ${previewUrl ? 'has-image' : ''}">
          ${previewUrl
            ? `<img src="${escapeHtml(previewUrl)}" alt="Background preview" loading="lazy" decoding="async">`
            : `
              <div class="settings-background-empty">
                <strong>No background selected</strong>
                <span>Upload an image to preview it before saving.</span>
              </div>
            `}
          <div class="settings-background-overlay">
            <span>Live preview</span>
          </div>
        </div>
        <input class="hidden" type="file" accept="image/*" data-settings-background-input="true" ${signedIn ? '' : 'disabled'}>
        <div class="summary-actions">
          <button class="ghost-button" type="button" data-settings-background-pick="true" ${signedIn && !state.appearanceSaving ? '' : 'disabled'}>Upload image</button>
          <button class="ghost-button" type="button" data-settings-remove-background="true" ${!hasBackground || state.appearanceSaving ? 'disabled' : ''}>Remove background</button>
        </div>
        <p class="helper-text">Image files only. Larger images are optimized for the app and limited to about 5MB.</p>
      </section>

      <section class="card settings-section-card">
        <div class="settings-section-head">
          <div>
            <p class="mini-label">Page targeting</p>
            <h3>Choose where the background appears</h3>
          </div>
        </div>
        <div class="settings-target-mode">
          <button class="chip ${settings.backgroundMode === 'all' ? 'active' : ''}" type="button" data-settings-target-mode="all" ${state.appearanceSaving ? 'disabled' : ''}>All pages</button>
          <button class="chip ${settings.backgroundMode === 'selected' ? 'active' : ''}" type="button" data-settings-target-mode="selected" ${state.appearanceSaving ? 'disabled' : ''}>Selected pages</button>
        </div>
        <div class="settings-page-grid ${state.appearanceSaving ? 'is-disabled' : ''}">
          ${APPEARANCE_PAGE_OPTIONS.map((page) => `
            <button
              class="settings-page-option ${isSelectedTargetMode && settings.selectedPages.includes(page.id) ? 'active' : ''}"
              type="button"
              data-settings-page-toggle="${escapeHtml(page.id)}"
              ${state.appearanceSaving ? 'disabled' : ''}
            >
              <span>${escapeHtml(page.label)}</span>
              <span>${isSelectedTargetMode ? (settings.selectedPages.includes(page.id) ? 'On' : 'Off') : 'Pick'}</span>
            </button>
          `).join('')}
        </div>
        <p class="helper-text">${isSelectedTargetMode ? 'Pick one or more pages for this background.' : 'All pages are active now. Tap a page below to start a selected-pages list.'}</p>
      </section>

      <section class="card settings-section-card settings-controls-card">
        <div class="settings-section-head">
          <div>
            <p class="mini-label">Controls</p>
            <h3>Save or reset your draft</h3>
          </div>
          <span class="mode-badge ${dirty ? 'preview' : ''}">${dirty ? 'Unsaved changes' : 'Saved state'}</span>
        </div>
        <div class="summary-actions">
          <button class="primary-button" type="submit" ${disableSave ? 'disabled' : ''}>${state.appearanceSaving ? 'Saving...' : 'Save settings'}</button>
          <button class="ghost-button" type="button" data-settings-reset="true" ${state.appearanceSaving ? 'disabled' : ''}>Reset</button>
          <button class="ghost-button" type="button" data-settings-remove-background="true" ${!hasBackground || state.appearanceSaving ? 'disabled' : ''}>Remove background</button>
        </div>
        <p class="helper-text">${signedIn ? 'Theme and background preview live in the app shell while you edit. Save when you want to keep them.' : 'Sign in to edit and save appearance settings.'}</p>
      </section>
    </form>
  `;
}

function renderAuthCard({ standalone = false } = {}) {
  const signedIn = Boolean(state.authUser);
  const disabled = !state.authReady || !state.authAvailable || state.authBusy;
  const backView = standalone ? 'shop' : 'home';
  const backLabel = standalone ? 'Browse shop' : 'Back to feed';

  if (signedIn) {
    const user = state.authUser;
    const continueView = resolveAuthRedirectView();

    return `
      <div class="auth-card-top">
        <div class="auth-card-topline">
          <div>
            <p class="auth-eyebrow">Account access</p>
            <h3 class="auth-card-title">Connected to your SocialEra account</h3>
          </div>
          <span class="mode-badge">Live session</span>
        </div>
        <p class="auth-card-subtitle">You are using the same account system as the website, now inside the separate app shell.</p>
      </div>

      <div class="auth-card-body">
        <div class="auth-facts">
          <div class="summary-line">
            <strong>Email</strong>
            <span>${escapeHtml(getAuthEmail(user))}</span>
          </div>
          <div class="summary-line">
            <strong>Member since</strong>
            <span>${escapeHtml(formatCalendarDate(user && user.created_at))}</span>
          </div>
          <div class="summary-line">
            <strong>Account ID</strong>
            <span>${escapeHtml(shortenIdentifier(user && user.id))}</span>
          </div>
        </div>

        <div class="summary-actions">
          <button class="primary-button" type="button" data-auth-signout="true" ${state.authBusy ? 'disabled' : ''}>
            ${state.authBusy ? 'Signing out...' : 'Sign out'}
          </button>
          <button class="ghost-button" type="button" data-open-view="${escapeHtml(continueView)}">${escapeHtml(standalone ? 'Continue to app' : 'Back to feed')}</button>
        </div>

        ${renderAuthMessage()}
      </div>
    `;
  }

  const isSignup = state.authMode === 'signup';

  return `
    <div class="auth-card-top auth-mode-panel auth-mode-panel-${isSignup ? 'signup' : 'login'}">
      <div class="auth-card-topline">
        <div>
          <p class="auth-eyebrow">${isSignup ? 'Create account' : 'Welcome back'}</p>
          <h3 class="auth-card-title">${isSignup ? 'Create account' : 'Log in'}</h3>
        </div>
      </div>
    </div>

    <div class="auth-card-body auth-mode-panel auth-mode-panel-${isSignup ? 'signup' : 'login'}">
      <div class="auth-mode-switch" role="tablist" aria-label="Account mode">
        <button
          class="auth-mode-button ${!isSignup ? 'active' : ''}"
          type="button"
          data-set-auth-mode="login"
          aria-pressed="${!isSignup}"
        >
          Log in
        </button>
        <button
          class="auth-mode-button ${isSignup ? 'active' : ''}"
          type="button"
          data-set-auth-mode="signup"
          aria-pressed="${isSignup}"
        >
          Create account
        </button>
      </div>

      <form class="auth-form" data-auth-form="${isSignup ? 'signup' : 'login'}">
        ${isSignup ? `
          <div class="auth-field-grid ${standalone ? 'single-column' : ''}">
            <div class="auth-field">
              <label for="${standalone ? 'auth-standalone-full-name' : 'auth-profile-full-name'}">Full name</label>
              <input class="text-field" id="${standalone ? 'auth-standalone-full-name' : 'auth-profile-full-name'}" type="text" name="fullName" maxlength="60" autocomplete="name" placeholder="Your full name" ${disabled ? 'disabled' : ''}>
            </div>
            <div class="auth-field">
              <label for="${standalone ? 'auth-standalone-username' : 'auth-profile-username'}">Username</label>
              <input class="text-field" id="${standalone ? 'auth-standalone-username' : 'auth-profile-username'}" type="text" name="userName" maxlength="36" autocomplete="username" placeholder="@username" ${disabled ? 'disabled' : ''}>
              <div class="auth-field-helper">Shown on your profile.</div>
            </div>
          </div>
        ` : ''}
        <div class="auth-field">
          <label for="${standalone ? 'auth-standalone-email' : 'auth-profile-email'}">Email address</label>
          <input class="text-field" id="${standalone ? 'auth-standalone-email' : 'auth-profile-email'}" type="email" name="email" autocomplete="${isSignup ? 'email' : 'username'}" placeholder="you@example.com" ${disabled ? 'disabled' : ''}>
        </div>
        <div class="auth-field">
          <label for="${standalone ? 'auth-standalone-password' : 'auth-profile-password'}">Password</label>
          <input class="text-field" id="${standalone ? 'auth-standalone-password' : 'auth-profile-password'}" type="password" name="password" autocomplete="${isSignup ? 'new-password' : 'current-password'}" placeholder="${isSignup ? 'Create a password' : 'Enter your password'}" ${disabled ? 'disabled' : ''}>
          <div class="auth-field-helper">${isSignup ? 'Minimum 6 characters.' : 'Use your website password.'}</div>
        </div>

        <div class="summary-actions">
          <button class="primary-button" type="submit" ${disabled ? 'disabled' : ''}>
            ${state.authBusy ? (isSignup ? 'Creating account...' : 'Logging in...') : (isSignup ? 'Create account' : 'Log in')}
          </button>
          <button class="ghost-button" type="button" data-open-view="${escapeHtml(backView)}">${escapeHtml(backLabel)}</button>
          ${standalone && !isSignup ? `
            <button
              class="ghost-button"
              type="button"
              data-auth-install-app="true"
              aria-label="Install app"
              title="Install app"
            >
              Install app
            </button>
          ` : ''}
        </div>
      </form>

      ${state.authAvailable ? '' : '<p class="auth-bottom">Account login is temporarily unavailable.</p>'}
      ${isSignup ? '' : '<p class="auth-bottom"><button class="auth-link-button" type="button" data-auth-reset-password="true">Forgot password?</button></p>'}

      ${renderAuthMessage()}
    </div>
  `;
}

function renderProfileEditor({ inSettings = false } = {}) {
  const signedIn = Boolean(state.authUser);
  const disabled = state.profilePhotoBusy;
  const currentPhotoUrl = normalizeProfilePhotoValue(state.profile.photoUrl);
  const previewPhotoUrl = normalizeProfilePhotoValue(state.profilePhotoDraftUrl || currentPhotoUrl);
  const editablePhotoUrl = previewPhotoUrl.startsWith('data:') ? '' : previewPhotoUrl;
  const helperText = state.profilePhotoDraftName
    ? `Selected: ${state.profilePhotoDraftName}`
    : previewPhotoUrl && previewPhotoUrl.startsWith('data:')
      ? 'Using an uploaded image from this device.'
      : 'Use an image URL or upload a photo. Larger images will be optimized automatically for the app.';

  return `
    <form class="profile-form ${inSettings ? 'settings-profile-form' : ''}" data-profile-form="true">
      ${signedIn ? `
        <div class="auth-sync-note">
          <p class="helper-text">Your display name and handle still come from the connected SocialEra account. Saving the profile picture here now syncs it across devices and flows through Usapp, app-created posts, and the connected website account.</p>
        </div>
      ` : `
        <input class="text-field" type="text" name="displayName" maxlength="36" value="${escapeHtml(state.guestProfile.displayName)}" placeholder="Display name" ${disabled ? 'disabled' : ''}>
        <input class="text-field" type="text" name="userName" maxlength="36" value="${escapeHtml(state.guestProfile.userName)}" placeholder="@username" ${disabled ? 'disabled' : ''}>
      `}

      <div class="profile-photo-editor">
        ${renderAvatarShell({ ...state.profile, photoUrl: previewPhotoUrl }, 'profile-avatar profile-photo-preview')}
        <div class="profile-photo-fields">
          <input class="text-field" type="text" name="photoUrl" value="${escapeHtml(editablePhotoUrl)}" placeholder="Paste an image URL" ${disabled ? 'disabled' : ''}>
          <input class="hidden" type="file" name="photoFile" data-profile-photo-file-input="true" accept="image/*" ${disabled ? 'disabled' : ''}>
          <button class="ghost-button profile-photo-picker ${disabled ? 'disabled' : ''}" type="button" data-profile-photo-pick="true" ${disabled ? 'disabled' : ''}>Upload image</button>
          <p class="helper-text">${escapeHtml(helperText)}</p>
        </div>
      </div>

      <div class="summary-actions">
        <button class="primary-button" type="submit" ${disabled ? 'disabled' : ''}>${disabled ? 'Saving...' : signedIn ? 'Save photo' : 'Save guest profile'}</button>
        <button class="ghost-button" type="button" data-clear-profile-photo="true" ${disabled || !previewPhotoUrl ? 'disabled' : ''}>Remove photo</button>
        ${inSettings ? '' : '<button class="ghost-button" type="button" data-open-view="home">Back to feed</button>'}
      </div>
    </form>
  `;
}

function renderAuthMessage() {
  if (!state.authMessage || !state.authMessage.text) {
    return '';
  }

  return `<p class="auth-status ${escapeHtml(state.authMessage.type || 'info')}">${escapeHtml(state.authMessage.text)}</p>`;
}

async function submitProfileForm(form) {
  const formData = new FormData(form);

  let nextPhotoUrl = '';

  try {
    nextPhotoUrl = await resolveProfilePhotoInput(formData);
  } catch (error) {
    showToast(error.message || 'That profile picture could not be used.');
    return;
  }

  state.profilePhotoBusy = true;
  render();

  try {
    try {
      if (state.authUser) {
        const updatedUser = await persistAccountProfilePhoto(nextPhotoUrl);
        state.authUser = updatedUser || state.authUser;
        state.profile = buildProfileFromAuthUser(state.authUser);
        state.profilePhotoDraftUrl = '';
        state.profilePhotoDraftName = '';
        await Promise.allSettled([
          syncMessageProfile(),
          syncSupabaseMessageProfile()
        ]);
        await refreshConnectedAccountProfile().catch(() => null);
        showToast(nextPhotoUrl ? 'Profile picture updated.' : 'Profile picture cleared.');
        return;
      }

      const displayName = String(formData.get('displayName') || '').trim() || 'SocialEra Member';
      const userName = normalizeUserName(String(formData.get('userName') || '').trim() || '@socialera.member');

      state.guestProfile = {
        displayName,
        userName,
        avatar: getInitials(displayName),
        photoUrl: nextPhotoUrl
      };

      persistJson(STORAGE_KEYS.profile, state.guestProfile);
      persistProfilePhotoOverride(nextPhotoUrl, state.actorId);
      state.profile = { ...state.guestProfile };
      state.profilePhotoDraftUrl = '';
      state.profilePhotoDraftName = '';
      showToast('Profile updated for the app shell.');
    } catch (error) {
      showToast(error.message || 'That profile picture could not be saved right now.');
    }
  } finally {
    state.profilePhotoBusy = false;
    render();
  }
}

async function clearProfilePhoto() {
  if (state.profilePhotoBusy || (!state.profile.photoUrl && !state.profilePhotoDraftUrl)) {
    return;
  }

  state.profilePhotoBusy = true;
  render();

  try {
    try {
      if (state.authUser) {
        const updatedUser = await persistAccountProfilePhoto('');
        state.authUser = updatedUser || state.authUser;
        state.profile = buildProfileFromAuthUser(state.authUser);
        state.profilePhotoDraftUrl = '';
        state.profilePhotoDraftName = '';
        await Promise.allSettled([
          syncMessageProfile(),
          syncSupabaseMessageProfile()
        ]);
        await refreshConnectedAccountProfile().catch(() => null);
        showToast('Profile picture removed.');
        return;
      }

      state.guestProfile = {
        ...state.guestProfile,
        photoUrl: ''
      };
      persistJson(STORAGE_KEYS.profile, state.guestProfile);
      persistProfilePhotoOverride('', state.actorId);
      state.profile = { ...state.guestProfile };
      state.profilePhotoDraftUrl = '';
      state.profilePhotoDraftName = '';
      showToast('Profile picture removed.');
    } catch (error) {
      showToast(error.message || 'That profile picture could not be removed right now.');
    }
  } finally {
    state.profilePhotoBusy = false;
    render();
  }
}

async function resolveProfilePhotoInput(formData) {
  if (state.profilePhotoDraftUrl) {
    return normalizeProfilePhotoValue(state.profilePhotoDraftUrl);
  }

  const file = formData.get('photoFile');
  const typedPhotoUrl = normalizeProfilePhotoValue(formData.get('photoUrl'));

  if (file && typeof file === 'object' && Number(file.size || 0) > 0) {
    if (!String(file.type || '').toLowerCase().startsWith('image/')) {
      throw new Error('Please choose an image file for the profile picture.');
    }

    return optimizeProfilePhotoFile(file);
  }

  return typedPhotoUrl;
}

function renderCommentSheet() {
  if (!elements.commentSheetRoot) {
    return;
  }

  const post = getActiveCommentPost();

  if (!post) {
    elements.commentSheetRoot.innerHTML = '';
    return;
  }

  const activeReply = state.activeReplyCommentId
    ? findCommentByIdLocal(getPostComments(post), state.activeReplyCommentId)
    : null;

  elements.commentSheetRoot.innerHTML = `
    <div class="comment-sheet-overlay">
      <button class="comment-sheet-backdrop" type="button" data-close-comments="true" aria-label="Close comments"></button>

      <section class="comment-sheet-panel" role="dialog" aria-modal="true" aria-labelledby="comment-sheet-title">
        <div class="comment-sheet-handle" aria-hidden="true"></div>

        <div class="comment-sheet-head">
          <div>
            <p class="section-label">Comments</p>
            <h3 id="comment-sheet-title">${escapeHtml(post.captionTitle)}</h3>
            <p>${escapeHtml(post.captionText || 'See the conversation around this post.')}</p>
          </div>
          <button class="chrome-button icon-button comment-sheet-close" type="button" data-close-comments="true" aria-label="Close comments">
            ${renderUsappCloseIcon()}
          </button>
        </div>

        <div class="comment-sheet-post card">
          <div class="comment-sheet-post-copy">
            <div class="comment-sheet-post-meta">
              ${renderAvatarShell(post)}
              <div class="comment-sheet-post-meta-copy">
                <strong>${escapeHtml(post.displayName)}</strong>
                <span>${escapeHtml(post.userName)} · ${escapeHtml(formatRelativeTime(post.createdAt))}</span>
              </div>
            </div>
            <div class="comment-sheet-stat-row">
              <span class="comment-sheet-stat">Likes ${escapeHtml(formatCompactNumber(post.likes))}</span>
              <span class="comment-sheet-stat">Comments ${escapeHtml(formatCompactNumber(getPostCommentCount(post)))}</span>
              <span class="comment-sheet-stat">Saves ${escapeHtml(formatCompactNumber(post.saves))}</span>
            </div>
          </div>
          <div class="comment-sheet-media">
            ${renderMedia(post, 'comment-sheet')}
          </div>
        </div>

        <div class="comment-sheet-list">
          ${renderCommentThreadList(post)}
        </div>

        <form class="comment-sheet-form" data-comment-form="${escapeHtml(post.id)}">
          ${activeReply ? `<p class="comment-sheet-replying">Replying to <strong>${escapeHtml(activeReply.authorName || 'SocialEra Member')}</strong></p>` : ''}
          <textarea
            class="textarea"
            data-comment-input="true"
            placeholder="${escapeHtml(activeReply ? `Reply to ${activeReply.authorName || 'SocialEra Member'}` : 'Add a comment to this post')}"
          >${escapeHtml(state.commentDraftText)}</textarea>
          <div class="comment-sheet-actions">
            <button class="ghost-button" type="button" data-clear-comment-reply="true" ${activeReply ? '' : 'disabled'}>Cancel reply</button>
            <button class="primary-button" type="submit">Comment</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderNotificationSheet() {
  if (!elements.notificationSheetRoot) {
    return;
  }

  if (!state.activeNotificationPanel) {
    elements.notificationSheetRoot.innerHTML = '';
    return;
  }

  const items = getNotificationItems();
  const unreadCount = items.filter((item) => item.unread).length;

  elements.notificationSheetRoot.innerHTML = `
    <div class="notification-sheet-overlay">
      <button class="notification-sheet-backdrop" type="button" data-close-notifications="true" aria-label="Close notifications"></button>

      <section class="notification-sheet-panel" role="dialog" aria-modal="true" aria-labelledby="notification-sheet-title">
        <div class="notification-sheet-head">
          <div>
            <p class="section-label">Notifications</p>
            <h3 id="notification-sheet-title">Live activity</h3>
            <p>${unreadCount ? `${formatCompactNumber(unreadCount)} unread across messages, comments, likes, and recent share actions.` : 'Messages, comments, likes, and recent app actions appear here live.'}</p>
          </div>
          <div class="notification-sheet-actions">
            <button class="chrome-button icon-button notification-sheet-refresh" type="button" data-refresh-now="true" aria-label="Refresh notifications">
              ${renderRefreshIcon()}
            </button>
            <button class="chrome-button icon-button notification-sheet-close" type="button" data-close-notifications="true" aria-label="Close notifications">
              ${renderUsappCloseIcon()}
            </button>
          </div>
        </div>

        <div class="notification-sheet-list">
          ${items.length ? items.map(renderNotificationItem).join('') : renderEmptyCard('No live notifications yet', 'Once messages, comments, or share activity land, they will show up here.')}
        </div>
      </section>
    </div>
  `;
}

function renderNotificationItem(item) {
  const actionAttributes = item.type === 'message'
    ? `data-open-notification-thread="${escapeHtml(item.threadId)}"`
    : `data-open-notification-post="${escapeHtml(item.postId)}"${item.openComments ? ' data-open-notification-comments="true"' : ''}`;

  return `
    <button class="notification-item ${item.unread ? 'unread' : ''}" type="button" ${actionAttributes}>
      ${renderAvatarShell(item, 'notification-item-avatar', 'span')}
      <span class="notification-item-copy">
        <span class="notification-item-topline">
          <span class="notification-item-kind">${escapeHtml(item.kindLabel)}</span>
          <span class="notification-item-time">${escapeHtml(item.timeLabel)}</span>
        </span>
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.text)}</span>
      </span>
      <span class="notification-item-arrow" aria-hidden="true">›</span>
    </button>
  `;
}

function renderCommentThreadList(post) {
  const comments = getPostComments(post);

  if (!comments.length) {
    return renderEmptyCard('No comments yet', 'Start the conversation on this post.');
  }

  return comments.map((comment) => renderCommentThread(post.id, comment)).join('');
}

function renderCommentThread(postId, comment, depth = 0) {
  const liked = Array.isArray(comment.likeActorIds) && comment.likeActorIds.includes(state.actorId);
  const replies = Array.isArray(comment.replies) ? comment.replies : [];

  return `
    <article class="comment-thread ${depth ? 'is-reply' : ''}" style="--comment-depth:${Math.min(depth, 3)};">
      ${renderAvatarShell(comment, 'comment-thread-avatar')}
      <div class="comment-thread-body">
        <div class="comment-thread-meta">
          <strong>${escapeHtml(comment.authorName || 'SocialEra Member')}</strong>
          <span>${escapeHtml(formatRelativeTime(comment.createdAt))}</span>
        </div>
        <p>${escapeHtml(comment.text || '')}</p>
        <div class="comment-thread-actions">
          <button
            class="comment-thread-action ${liked ? 'active' : ''}"
            type="button"
            data-toggle-comment-like="${escapeHtml(comment.id)}"
            data-post-id="${escapeHtml(postId)}"
          >
            Like ${escapeHtml(formatCompactNumber(comment.likes || 0))}
          </button>
          <button
            class="comment-thread-action"
            type="button"
            data-comment-reply="${escapeHtml(comment.id)}"
            data-comment-author="${escapeHtml(comment.authorName || 'SocialEra Member')}"
          >
            Reply
          </button>
        </div>
        ${replies.length ? `
          <div class="comment-thread-replies">
            ${replies.map((reply) => renderCommentThread(postId, reply, depth + 1)).join('')}
          </div>
        ` : ''}
      </div>
    </article>
  `;
}

function renderPostCard(post) {
  const liked = hasActor(post.likeActorIds);
  const commentsOpen = state.activeCommentPostId === post.id;
  const shareCount = getPostShareCount(post.id);
  const hasMedia = hasPostMedia(post);
  const suggestions = findSuggestedProducts(post, { limit: 4 });
  const postKindLabel = getPostKindLabel(post);
  const captionText = String(post.captionText || '');
  const postExpanded = state.expandedPostIds.has(post.id);
  const canExpandPost = canExpandPostText(captionText);
  const actionRow = `
    <div class="metric-row post-actions ${hasMedia ? 'post-media-actions' : 'post-copy-actions'}">
      ${renderPostMetricButton({
        icon: 'heart',
        label: liked ? 'Liked' : 'Like',
        active: liked,
        count: formatCompactNumber(post.likes),
        attributes: `data-toggle-like="${escapeHtml(post.id)}"`
      })}
      ${renderPostMetricButton({
        icon: 'chat',
        label: 'Comment',
        active: commentsOpen,
        count: formatCompactNumber(getPostCommentCount(post)),
        attributes: `data-open-comments="${escapeHtml(post.id)}"`
      })}
      ${renderPostMetricButton({
        icon: 'share',
        label: 'Share',
        active: shareCount > 0,
        count: formatCompactNumber(shareCount),
        attributes: `data-share-post="${escapeHtml(post.id)}"`
      })}
    </div>
  `;

  return `
    <article class="card post-card ${hasMedia ? '' : 'text-only'}" data-post-id="${escapeHtml(post.id)}">
      <div class="post-head">
        <div class="identity">
          ${renderAvatarShell(post)}
          <div class="post-identity-copy">
            <h3>${escapeHtml(post.displayName)}</h3>
            <p>${escapeHtml(post.userName)} · ${escapeHtml(formatRelativeTime(post.createdAt))}</p>
          </div>
        </div>
        <div class="post-head-meta">
          <span class="mode-badge">${escapeHtml(titleCase(post.channel))}</span>
          <span class="post-stamp">${escapeHtml(postKindLabel)}</span>
        </div>
      </div>

      <div class="post-copy">
        <div class="post-body">
          <h3 class="post-title">${escapeHtml(post.captionTitle)}</h3>
          <p class="post-text ${postExpanded ? 'is-expanded' : ''}">${escapeHtml(captionText)}</p>
          ${canExpandPost ? `
            <button
              class="post-expand-toggle"
              type="button"
              data-toggle-post-expand="${escapeHtml(post.id)}"
              aria-expanded="${postExpanded ? 'true' : 'false'}"
            >
              ${escapeHtml(postExpanded ? 'Show less' : 'Read more')}
            </button>
          ` : ''}
        </div>
      </div>

      ${hasMedia ? `
        <div class="post-media-shell">
          <div class="post-media">
            ${renderMedia(post, 'feed')}
          </div>
          ${actionRow}
        </div>
      ` : `
        <div class="post-text-footer">
          ${actionRow}
        </div>
      `}

      <div class="post-copy">
        ${suggestions.length ? `
          <div class="post-commerce-block">
            <p class="post-commerce-label">${suggestions.length > 1 ? 'Shop Matches' : 'Shop Match'}</p>
            ${renderSuggestionList(suggestions)}
          </div>
        ` : ''}
      </div>
    </article>
  `;
}

function canExpandPostText(text) {
  const normalizedText = String(text || '').trim();
  return normalizedText.length > 180 || normalizedText.includes('\n');
}

function hasPostMedia(post) {
  return Boolean(resolveMediaUrl(post && post.mediaUrl));
}

function getPostKindLabel(post) {
  if (!hasPostMedia(post)) {
    return 'Text post';
  }

  return post && post.mediaType === 'video' ? 'Video post' : 'Image post';
}

function renderSuggestionList(products) {
  return `
    <div class="suggestion-card-list">
      ${products.map((product) => renderSuggestionCard(product)).join('')}
    </div>
  `;
}

function renderPostMetricButton({ icon, label, active = false, extraClass = '', attributes = '', count = '' }) {
  const classes = ['metric-button', 'post-action'];
  const wrapperClasses = ['metric-control'];
  const countLabel = String(count || '0');

  if (active) {
    classes.push('active');
    wrapperClasses.push('active');
  }

  if (extraClass) {
    classes.push(extraClass);
    wrapperClasses.push(extraClass);
  }

  return `
    <span class="${wrapperClasses.join(' ')}">
      <button class="${classes.join(' ')}" type="button" aria-label="${escapeHtml(`${label} ${countLabel}`)}" title="${escapeHtml(label)}" ${attributes}>
        <span class="metric-icon-wrap" aria-hidden="true">
          ${renderPostMetricIcon(icon)}
        </span>
        <span class="sr-only">${escapeHtml(label)}</span>
      </button>
      <span class="metric-live-count" aria-hidden="true">${escapeHtml(countLabel)}</span>
    </span>
  `;
}

function renderPostMetricIcon(icon) {
  const icons = {
    heart: `
      <svg class="metric-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 20L6.9 14.95A4.1 4.1 0 0 1 12 8.6A4.1 4.1 0 0 1 17.1 14.95Z"></path>
      </svg>
    `,
    chat: `
      <svg class="metric-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5.5 7.5A3.5 3.5 0 0 1 9 4h6a3.5 3.5 0 0 1 3.5 3.5v4A3.5 3.5 0 0 1 15 15H11l-3.75 3v-3H9A3.5 3.5 0 0 1 5.5 11.5Z"></path>
      </svg>
    `,
    share: `
      <svg class="metric-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14.5 4.5L19.5 9.5"></path>
        <path d="M19.5 4.5V9.5H14.5"></path>
        <path d="M10 14L19 5"></path>
        <path d="M18.5 13V17.5A1.5 1.5 0 0 1 17 19H6.5A1.5 1.5 0 0 1 5 17.5V7A1.5 1.5 0 0 1 6.5 5.5H11"></path>
      </svg>
    `
  };

  return icons[icon] || icons.chat;
}

function renderSuggestionCard(product) {
  return `
    <div class="suggestion-card">
      <div class="suggestion-media">
        ${renderProductMedia(product)}
      </div>
      <div class="suggestion-copy">
        <strong>${escapeHtml(product.name)}</strong>
        <span>${escapeHtml(product.description || 'Shared directly from the SocialEra product inventory.')}</span>
        <div class="action-row">
          <button class="action-button" type="button" data-add-product="${escapeHtml(String(product.id))}">Add to bag</button>
          <button class="ghost-button" type="button" data-open-view="shop">View more</button>
        </div>
      </div>
    </div>
  `;
}

function renderProductCard(product) {
  return `
    <article class="card product-card">
      <div class="product-media">
        ${renderProductMedia(product)}
      </div>
      <div class="product-copy">
        <div class="product-meta">
          <span class="mode-badge">${escapeHtml(titleCase(product.category))}</span>
          ${product.featured ? '<span class="featured-badge">Featured</span>' : ''}
        </div>

        <div>
          <h3 class="product-name">${escapeHtml(product.name)}</h3>
          <p class="helper-text">${escapeHtml(product.description || 'Curated from the shared backend inventory.')}</p>
        </div>

        <div class="product-meta">
          <span class="price">${formatCurrency(product.price)}</span>
          <span class="helper-text">${product.stock > 0 ? `${product.stock} in stock` : 'Made to order'}</span>
        </div>

        <div class="action-row">
          <button class="primary-button" type="button" data-add-product="${escapeHtml(String(product.id))}">Add</button>
          <button class="ghost-button" type="button" data-open-view="bag">Bag</button>
        </div>
      </div>
    </article>
  `;
}

function renderBagItem(item) {
  return `
    <article class="card bag-card bag-row">
      <div class="bag-media">
        ${renderProductMedia(item.product)}
      </div>
      <div>
        <div class="thread-meta">
          <div>
            <h3>${escapeHtml(item.product.name)}</h3>
            <p>${escapeHtml(titleCase(item.product.category))}</p>
          </div>
          <strong class="price">${formatCurrency(item.product.price * item.quantity)}</strong>
        </div>

        <div class="bag-actions">
          <div class="qty-controls">
            <button class="qty-button" type="button" data-qty-change="-1" data-product-id="${escapeHtml(String(item.product.id))}">-</button>
            <span class="qty-value">${item.quantity}</span>
            <button class="qty-button" type="button" data-qty-change="1" data-product-id="${escapeHtml(String(item.product.id))}">+</button>
          </div>
          <button class="ghost-button" type="button" data-remove-product="${escapeHtml(String(item.product.id))}">Remove</button>
        </div>
      </div>
    </article>
  `;
}

function renderThreadRow(thread, index = 0) {
  return usappThreadRenderService.renderThreadRow(thread, {
    activeThreadId: state.selectedThreadId,
    index
  });
}

function renderConversation(thread) {
  const messageCount = Array.isArray(thread.messages) ? thread.messages.length : 0;
  const currentActorId = getMessageActorId();

  return `
    <div class="usapp-chat-window">
      <div class="usapp-chat-head">
        <div class="usapp-chat-head-primary">
          <button class="usapp-icon-button usapp-back-button" type="button" data-message-back="true" aria-label="Back to chats">
            ${renderUsappBackIcon()}
          </button>
          <div class="usapp-chat-person">
            <button class="thread-avatar large usapp-thread-avatar-button" type="button" data-thread-settings-toggle="true" aria-label="Open chat settings">
              ${renderAvatarMedia(thread.contact)}
            </button>
            <div class="usapp-chat-meta">
              <strong>${escapeHtml(thread.contact.displayName)}</strong>
              <div class="usapp-chat-meta-row">
                <span class="usapp-chat-subtitle">${escapeHtml(getMessageChatModeLabel(thread.contact))}</span>
                ${renderUsappPresenceBadge(thread.contact)}
              </div>
            </div>
          </div>
        </div>
        <div class="usapp-chat-actions">
          ${thread.contact.sourcePostId ? `<button class="ghost-button usapp-chat-link" type="button" data-open-post="${escapeHtml(thread.contact.sourcePostId)}">Open post</button>` : ''}
        </div>
        ${renderThreadSettingsMenu(thread)}
      </div>
      <div class="message-list usapp-message-list">
        ${messageCount ? thread.messages.map((message, index) => renderMessageBubble(thread, message, currentActorId, index)).join('') : renderEmptyCard('No messages yet', 'Start the conversation here.')}
      </div>

      <form class="message-form usapp-message-form ${state.messageBusy ? 'sending' : ''}" data-message-form="${escapeHtml(thread.id)}" aria-busy="${state.messageBusy ? 'true' : 'false'}">
        <div class="usapp-composer-popovers ${state.composerEmojiOpen ? 'open' : ''}">
          ${state.composerEmojiOpen ? `
            <div class="usapp-emoji-picker">
              ${MESSAGE_COMPOSER_EMOJIS.map((emoji) => `
                <button type="button" class="usapp-emoji-option" data-message-emoji="${escapeHtml(emoji)}">${escapeHtml(emoji)}</button>
              `).join('')}
            </div>
          ` : ''}
        </div>

        ${renderMessageReplyPreview(thread)}
        ${state.pendingMessageAttachment ? renderPendingMessageAttachment() : ''}
        ${state.messageRecording ? `
          <div class="usapp-voice-recording-banner">
            <span class="usapp-voice-recording-dot" aria-hidden="true"></span>
            <strong>Recording voice note...</strong>
            <button class="ghost-button usapp-voice-stop" type="button" data-voice-record-toggle="true">Stop</button>
          </div>
        ` : ''}

        <div class="usapp-composer-shell">
          <textarea class="textarea usapp-textarea" name="message" data-message-input="true" maxlength="2000" placeholder="${escapeHtml(getMessageComposerPlaceholder(thread.contact))}">${escapeHtml(state.messageDraftText)}</textarea>

          <div class="usapp-form-bar">
            <div class="usapp-composer-tools">
              <button class="usapp-tool ${state.composerEmojiOpen ? 'active' : ''}" type="button" data-message-emoji-toggle="true" aria-label="Add emoji">
                ${renderUsappEmojiIcon()}
              </button>
              <button class="usapp-tool ${state.messageRecording ? 'active recording' : ''}" type="button" data-voice-record-toggle="true" aria-label="${state.messageRecording ? 'Stop voice recording' : 'Record voice message'}">
                ${renderUsappMicIcon()}
              </button>
              <button class="usapp-tool" type="button" data-message-attach="true" aria-label="Attach file">
                ${renderUsappAttachIcon()}
              </button>
              <input class="hidden" type="file" data-message-file-input="true" accept="image/*,.pdf,.txt,.csv,.doc,.docx,.zip">
            </div>
            <button class="usapp-send ${state.messageBusy ? 'sending' : ''}" type="submit" ${state.messageBusy ? 'disabled' : ''}>
              <span class="usapp-send-label">${state.messageBusy ? 'Sending' : 'Send'}</span>
              ${state.messageBusy ? `
                <span class="usapp-send-dots" aria-hidden="true">
                  <span></span><span></span><span></span>
                </span>
              ` : ''}
            </button>
          </div>
        </div>

        <div class="usapp-counter-row">
          <span class="usapp-counter" data-message-counter="true">${escapeHtml(String(state.messageDraftText.length))} / 2000</span>
        </div>
      </form>
    </div>
  `;
}

function renderThreadSettingsMenu(thread) {
  return usappThreadSettingsRenderService.renderThreadSettingsMenu(thread, {
    threadSettingsOpen: state.threadSettingsOpen
  });
}

function renderMessageBubble(thread, message, currentActorId, index = 0) {
  const outgoing = isCurrentActorId(message.senderActorId) || String(message.senderActorId) === currentActorId;
  const attachmentsMarkup = Array.isArray(message.attachments) ? message.attachments.map(renderMessageAttachment).join('') : '';
  const textMarkup = message.text ? `<p class="bubble-text">${escapeHtml(message.text || '')}</p>` : '';
  const reactionsVisible = state.reactionRevealMessageId === message.id || state.reactionPickerMessageId === message.id;
  const motionOrder = Math.max(0, Math.min(Number(index) || 0, 14));
  const liveClass = getUsappMessageLiveClass(message.id);

  return `
    <div class="usapp-bubble-row ${outgoing ? 'outgoing' : 'incoming'} ${reactionsVisible ? 'reactions-visible' : ''}" data-message-bubble="${escapeHtml(message.id)}" style="--usapp-order:${motionOrder}">
      <span class="usapp-reply-swipe-cue" aria-hidden="true">${renderUsappReplyIcon()}</span>
      <article class="message-bubble usapp-bubble ${liveClass}">
        ${outgoing ? '' : `<strong>${escapeHtml(message.authorName || thread.contact.displayName)}</strong>`}
        ${renderMessageReplyQuote(message)}
        ${attachmentsMarkup}
        ${textMarkup}
        <div class="usapp-bubble-meta">
          <time datetime="${escapeHtml(message.createdAt || '')}">${escapeHtml(formatRelativeTime(message.createdAt))}</time>
        </div>
        ${renderMessageReactionSummary(message)}
        ${renderMessageBubbleAction(message)}
      </article>
    </div>
  `;
}

function renderEmptyCard(title, text) {
  return `
    <section class="card empty-card">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(text)}</p>
    </section>
  `;
}

function renderFilterChip(value, activeValue, mode) {
  return `
    <button
      class="chip ${value === activeValue ? 'active' : ''}"
      type="button"
      data-filter-mode="${escapeHtml(mode)}"
      data-filter-value="${escapeHtml(value)}"
    >
      ${escapeHtml(titleCase(value))}
    </button>
  `;
}

function renderMedia(item, type) {
  const mediaUrl = resolveMediaUrl(item && item.mediaUrl);

  if (!mediaUrl) {
    return `
      <div class="media-fallback">
        <div>
          <strong>${escapeHtml(item && item.captionTitle ? item.captionTitle : 'SocialEra App')}</strong>
        </div>
      </div>
    `;
  }

  if (item.mediaType === 'video') {
    const smartVideo = isViewportManagedVideo(type) && ('IntersectionObserver' in window);
    const autoplay = smartVideo ? false : shouldAutoplayVideo(type);
    const showControls = type === 'detail';
    const videoAttrs = [
      `src="${escapeHtml(mediaUrl)}"`,
      autoplay ? 'autoplay' : '',
      'muted',
      autoplay ? 'loop' : '',
      'playsinline',
      'preload="metadata"',
      showControls ? 'controls' : '',
      smartVideo ? 'data-smart-video="true"' : '',
      smartVideo ? `data-smart-video-kind="${escapeHtml(type)}"` : ''
    ].filter(Boolean).join(' ');

    return `<video ${videoAttrs}></video>`;
  }

  return `<img src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(item.captionTitle || item.name || 'SocialEra media')}" loading="lazy" decoding="async">`;
}

function renderSpotlightPreviewMedia(item) {
  const mediaUrl = resolveMediaUrl(item && item.mediaUrl);

  if (!mediaUrl) {
    return `
      <div class="media-fallback">
        <div>
          <strong>${escapeHtml(item && item.captionTitle ? item.captionTitle : 'SocialEra App')}</strong>
        </div>
      </div>
    `;
  }

  if (item.mediaType === 'video') {
    if (state.iosOptimized) {
      return `
        <video class="spotlight-folder-foreground spotlight-folder-foreground-solo" src="${escapeHtml(mediaUrl)}" muted playsinline preload="metadata" ${'IntersectionObserver' in window ? 'data-smart-video="true" data-smart-video-kind="spotlight"' : 'autoplay loop'}></video>
      `;
    }

    return `
      <video class="spotlight-folder-backdrop" src="${escapeHtml(mediaUrl)}" autoplay muted loop playsinline preload="metadata" aria-hidden="true" ${'IntersectionObserver' in window ? 'data-smart-video="true" data-smart-video-kind="spotlight"' : ''}></video>
      <video class="spotlight-folder-foreground" src="${escapeHtml(mediaUrl)}" autoplay muted loop playsinline preload="metadata" ${'IntersectionObserver' in window ? 'data-smart-video="true" data-smart-video-kind="spotlight"' : ''}></video>
    `;
  }

  const alt = escapeHtml(item.captionTitle || item.name || 'SocialEra media');

  return `
    <img class="spotlight-folder-backdrop" src="${escapeHtml(mediaUrl)}" alt="" aria-hidden="true" loading="lazy" decoding="async">
    <img class="spotlight-folder-foreground" src="${escapeHtml(mediaUrl)}" alt="${alt}" loading="lazy" decoding="async">
  `;
}

function renderProductMedia(product) {
  const mediaUrl = resolveMediaUrl(product && product.image);

  if (!mediaUrl) {
    return `
      <div class="media-fallback">
        <div>
          <strong>${escapeHtml(product && product.name ? product.name : 'SocialEra product')}</strong>
        </div>
      </div>
    `;
  }

  return `<img src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(product.name || 'Product image')}" loading="lazy" decoding="async">`;
}

function refreshPostSurfaces(postId, {
  includeSpotlight = true,
  includeCommentSheet = true
} = {}) {
  const post = findPostById(postId);

  if (!post) {
    return;
  }

  if (state.activeView === 'post' && state.selectedPostId === postId) {
    render();
    return;
  }

  const currentScrollTop = elements.viewRoot ? elements.viewRoot.scrollTop : 0;

  if (elements.viewRoot) {
    if (state.activeView === 'home' && includeSpotlight) {
      const spotlightFolder = elements.viewRoot.querySelector('.spotlight-folder');

      if (spotlightFolder) {
        spotlightFolder.outerHTML = renderSpotlightFolder(getSpotlightPosts(getFilteredPosts()));
      }
    }

    Array.from(elements.viewRoot.querySelectorAll('.post-card[data-post-id]'))
      .filter((node) => node.dataset.postId === postId)
      .forEach((node) => {
        node.outerHTML = renderPostCard(post);
      });

    elements.viewRoot.scrollTop = currentScrollTop;
  }

  if (includeCommentSheet && state.activeCommentPostId === postId) {
    renderCommentSheet();
  }

  syncViewportVideoPlayback();
}

function isViewportManagedVideo(type = 'feed') {
  return ['feed', 'hero', 'peek', 'comment-sheet', 'detail', 'spotlight'].includes(type);
}

function syncViewportVideoPlayback() {
  if (!('IntersectionObserver' in window)) {
    return;
  }

  if (viewportVideoObserver) {
    viewportVideoObserver.disconnect();
  }

  viewportVideoObserver = new IntersectionObserver(handleViewportVideoIntersect, {
    threshold: [0, 0.2, 0.5, 0.75]
  });

  document.querySelectorAll('video[data-smart-video="true"]').forEach((video) => {
    viewportVideoVisibility.set(video, 0);
    viewportVideoObserver.observe(video);
  });

  if (document.hidden) {
    pauseAllSmartVideos();
  }
}

function handleViewportVideoIntersect(entries) {
  entries.forEach((entry) => {
    viewportVideoVisibility.set(entry.target, entry.intersectionRatio);
  });

  document.querySelectorAll('video[data-smart-video="true"]').forEach((video) => {
    const ratio = Number(viewportVideoVisibility.get(video) || 0);
    const threshold = video.dataset.smartVideoKind === 'detail' ? 0.28 : 0.58;
    const shouldPlay = !document.hidden && ratio >= threshold;

    if (shouldPlay) {
      if (video.paused) {
        const playAttempt = video.play();

        if (playAttempt && typeof playAttempt.catch === 'function') {
          playAttempt.catch(() => null);
        }
      }
      return;
    }

    if (!video.paused) {
      video.pause();
    }
  });
}

function pauseAllSmartVideos() {
  document.querySelectorAll('video[data-smart-video="true"]').forEach((video) => {
    if (!video.paused) {
      video.pause();
    }
  });
}

async function handleClick(event) {
  let shouldRefreshMessaging = false;

  if (state.threadSettingsOpen && !event.target.closest('[data-thread-settings-toggle], .usapp-thread-settings')) {
    state.threadSettingsOpen = false;
    shouldRefreshMessaging = true;
  }

  if ((state.reactionPickerMessageId || state.reactionRevealMessageId) && !event.target.closest('[data-message-reaction-picker], [data-message-reaction-option], [data-message-reaction], [data-message-bubble]')) {
    state.reactionPickerMessageId = '';
    state.reactionRevealMessageId = '';
    shouldRefreshMessaging = true;
  }

  if (sheetPanelController.handleSheetPanelClick(event)) {
    return;
  }

  const commentLikeTarget = event.target.closest('[data-toggle-comment-like]');
  if (commentLikeTarget) {
    await toggleCommentReaction(commentLikeTarget.dataset.postId, commentLikeTarget.dataset.toggleCommentLike);
    return;
  }

  if (await authProfileController.handleAuthProfileClick(event)) {
    return;
  }

  const authResetButton = event.target.closest('[data-auth-reset-password]');
  if (authResetButton) {
    await requestPasswordResetFromApp();
    return;
  }

  const authInstallButton = event.target.closest('[data-auth-install-app]');
  if (authInstallButton) {
    await promptInstallApp();
    return;
  }

  if (viewNavigationController.handleViewNavigationClick(event)) {
    return;
  }

  const searchResultButton = event.target.closest('[data-app-search-kind]');
  if (searchResultButton) {
    handleCatalogSearchResult(searchResultButton.dataset);
    return;
  }

  const openPostTarget = event.target.closest('[data-open-post]');
  if (openPostTarget) {
    openPost(openPostTarget.dataset.openPost);
    return;
  }

  const postExpandToggle = event.target.closest('[data-toggle-post-expand]');
  if (postExpandToggle) {
    const postId = String(postExpandToggle.dataset.togglePostExpand || '').trim();

    if (!postId) {
      return;
    }

    if (state.expandedPostIds.has(postId)) {
      state.expandedPostIds.delete(postId);
    } else {
      state.expandedPostIds.add(postId);
    }

    render();
    return;
  }

  const spotlightToggle = event.target.closest('[data-toggle-spotlight]');
  if (spotlightToggle) {
    state.spotlightExpanded = !state.spotlightExpanded;
    render();
    return;
  }

  const themeButton = event.target.closest('[data-set-theme]');
  if (themeButton) {
    state.theme = normalizeTheme(themeButton.dataset.setTheme);
    persistText(STORAGE_KEYS.theme, state.theme);
    applyTheme();
    render();
    showToast(`${getThemeMeta(state.theme).label} theme applied.`);
    return;
  }

  const settingsThemeButton = event.target.closest('[data-settings-theme]');
  if (settingsThemeButton) {
    updateAppearanceDraft({
      theme: settingsThemeButton.dataset.settingsTheme
    });
    render();
    return;
  }

  const settingsTargetModeButton = event.target.closest('[data-settings-target-mode]');
  if (settingsTargetModeButton) {
    const nextMode = settingsTargetModeButton.dataset.settingsTargetMode === 'selected' ? 'selected' : 'all';
    const currentSelectedPages = normalizeAppearanceSelectedPages(state.appearanceDraft.selectedPages, [], { allowEmpty: true });
    const isDefaultAllSelection = state.appearanceDraft.backgroundMode === 'all' && currentSelectedPages.length === APPEARANCE_PAGE_IDS.length;
    updateAppearanceDraft({
      backgroundMode: nextMode,
      selectedPages: nextMode === 'all'
        ? getAllAppearancePageIds()
        : (!currentSelectedPages.length || isDefaultAllSelection)
          ? [getAppearanceTargetView('settings')]
          : currentSelectedPages
    });
    render();
    return;
  }

  const settingsPageToggle = event.target.closest('[data-settings-page-toggle]');
  if (settingsPageToggle) {
    const targetPage = normalizeAppearancePage(settingsPageToggle.dataset.settingsPageToggle);

    if (state.appearanceDraft.backgroundMode !== 'selected') {
      updateAppearanceDraft({
        backgroundMode: 'selected',
        selectedPages: targetPage ? [targetPage] : [getAppearanceTargetView('settings')]
      });
    } else {
      toggleAppearanceDraftPage(targetPage);
    }

    render();
    return;
  }

  const settingsBackgroundPickButton = event.target.closest('[data-settings-background-pick]');
  if (settingsBackgroundPickButton) {
    const fileInput = document.querySelector('[data-settings-background-input]');

    if (fileInput) {
      fileInput.click();
    }

    return;
  }

  const settingsResetButton = event.target.closest('[data-settings-reset]');
  if (settingsResetButton) {
    resetAppearanceDraft();
    render();
    showToast('Settings draft reset.');
    return;
  }

  const settingsRemoveBackgroundButton = event.target.closest('[data-settings-remove-background]');
  if (settingsRemoveBackgroundButton) {
    removeAppearanceDraftBackground();
    render();
    showToast('Background removed from the draft.');
    return;
  }

  const uploadMediaTypeButton = event.target.closest('[data-upload-media-type]');
  if (uploadMediaTypeButton) {
    state.uploadDraft.mediaType = uploadMediaTypeButton.dataset.uploadMediaType || 'image';
    render();
    return;
  }

  const uploadStepButton = event.target.closest('[data-upload-step]');
  if (uploadStepButton) {
    setUploadStep(uploadStepButton.dataset.uploadStep || UPLOAD_STEPS[0].id);
    return;
  }

  const uploadStepNavButton = event.target.closest('[data-upload-step-nav]');
  if (uploadStepNavButton) {
    const direction = uploadStepNavButton.dataset.uploadStepNav === 'previous' ? 'previous' : 'next';
    setUploadStep(direction === 'previous' ? getPreviousUploadStepId() : getNextUploadStepId());
    return;
  }

  const uploadPreviewToggle = event.target.closest('[data-upload-preview-toggle]');
  if (uploadPreviewToggle) {
    state.uploadPreviewOpen = !state.uploadPreviewOpen;
    render();
    return;
  }

  const uploadChannelButton = event.target.closest('[data-upload-channel]');
  if (uploadChannelButton) {
    state.uploadDraft.channel = uploadChannelButton.dataset.uploadChannel || DEFAULT_UPLOAD_CHANNELS[0];
    render();
    return;
  }

  const uploadProductButton = event.target.closest('[data-upload-product]');
  if (uploadProductButton) {
    const productId = String(uploadProductButton.dataset.uploadProduct || '');
    const selectedIds = new Set(state.uploadDraft.linkedProductIds.map(String));

    if (selectedIds.has(productId)) {
      selectedIds.delete(productId);
    } else {
      selectedIds.add(productId);
    }

    state.uploadDraft.linkedProductIds = Array.from(selectedIds);
    render();
    return;
  }

  const clearUploadButton = event.target.closest('[data-clear-upload-media]');
  if (clearUploadButton) {
    clearUploadMedia();
    return;
  }

  const resetUploadButton = event.target.closest('[data-reset-upload]');
  if (resetUploadButton) {
    state.uploadDraft = createUploadDraft();
    state.uploadStep = UPLOAD_STEPS[0].id;
    render();
    return;
  }

  const filterButton = event.target.closest('[data-filter-mode]');
  if (filterButton) {
    const mode = filterButton.dataset.filterMode;
    const value = filterButton.dataset.filterValue || 'all';

    if (mode === 'feed') {
      state.feedFilter = value;
    }

    if (mode === 'discover') {
      if (normalizeView(state.activeView) === 'search') {
        state.searchViewFilter = value;
      } else {
        state.discoverFilter = value;
      }
    }

    render();
    return;
  }

  const likeButton = event.target.closest('[data-toggle-like]');
  if (likeButton) {
    await togglePostMetric(likeButton.dataset.toggleLike, 'likes');
    return;
  }

  const shareButton = event.target.closest('[data-share-post]');
  if (shareButton) {
    await sharePost(shareButton.dataset.sharePost);
    return;
  }

  const addProductButton = event.target.closest('[data-add-product]');
  if (addProductButton) {
    addToBag(addProductButton.dataset.addProduct);
    return;
  }

  const qtyButton = event.target.closest('[data-qty-change]');
  if (qtyButton) {
    updateBagQuantity(qtyButton.dataset.productId, Number(qtyButton.dataset.qtyChange || 0));
    return;
  }

  const removeProductButton = event.target.closest('[data-remove-product]');
  if (removeProductButton) {
    removeFromBag(removeProductButton.dataset.removeProduct);
    return;
  }

  const threadButton = event.target.closest('[data-select-thread]');
  if (threadButton) {
    state.selectedThreadId = threadButton.dataset.selectThread || '';
    state.messagePanelMode = 'thread';
    state.messageSearchOpen = false;
    setUsappSearchFocusState(false);
    state.messageDraftText = '';
    state.pendingMessageAttachment = null;
    clearMessageReplyTarget({ refresh: false });
    state.threadSettingsOpen = false;
    state.composerEmojiOpen = false;
    state.reactionPickerMessageId = '';
    state.reactionRevealMessageId = '';
    persistText(STORAGE_KEYS.selectedThread, state.selectedThreadId);
    markSelectedThreadRead();
    syncMessageAutoRefresh();
    queueMessageRefresh({ delayMs: 80, includeContacts: false });
    refreshMessagingUi({
      scrollToLatest: true
    });
    return;
  }

  const messageBackButton = event.target.closest('[data-message-back]');
  if (messageBackButton) {
    state.messagePanelMode = 'inbox';
    setUsappSearchFocusState(false);
    state.threadSettingsOpen = false;
    clearMessageReplyTarget({ refresh: false });
    state.composerEmojiOpen = false;
    state.reactionPickerMessageId = '';
    state.reactionRevealMessageId = '';
    syncMessageAutoRefresh();
    refreshMessagingUi();
    return;
  }

  const messageSearchToggle = event.target.closest('[data-message-search-toggle]');
  if (messageSearchToggle) {
    state.messageSearchOpen = !state.messageSearchOpen;
    if (!state.messageSearchOpen) {
      setUsappSearchFocusState(false);
      state.messageSearchPendingSync = false;
    }

    if (!state.messageSearchOpen) {
      clearUsappSearchUiSyncTimer();
      state.messageSearchQuery = '';
    }

    refreshMessagingUi({
      focusSearch: state.messageSearchOpen
    });

    return;
  }

  const startThreadButton = event.target.closest('[data-start-thread]');
  if (startThreadButton) {
    await ensureThread(startThreadButton.dataset.startThread);
    return;
  }

  const emojiToggleButton = event.target.closest('[data-message-emoji-toggle]');
  if (emojiToggleButton) {
    state.composerEmojiOpen = !state.composerEmojiOpen;
    refreshMessagingUi();
    return;
  }

  const threadSettingsToggle = event.target.closest('[data-thread-settings-toggle]');
  if (threadSettingsToggle) {
    state.threadSettingsOpen = !state.threadSettingsOpen;
    state.reactionPickerMessageId = '';
    state.reactionRevealMessageId = '';
    refreshMessagingUi();
    return;
  }

  const threadSettingsAction = event.target.closest('[data-thread-setting-action]');
  if (threadSettingsAction) {
    const selectedThread = getSelectedThread();
    const action = String(threadSettingsAction.dataset.threadSettingAction || '').trim();

    if (!selectedThread) {
      return;
    }

    if (action === 'mute') {
      toggleThreadMuted(selectedThread.id);
      state.threadSettingsOpen = false;
      refreshMessagingUi();
      showToast(isThreadMuted(selectedThread.id) ? 'Thread muted.' : 'Thread unmuted.');
      return;
    }

    if (action === 'unread') {
      const unread = isThreadUnread(selectedThread);

      if (unread) {
        markThreadRead(selectedThread);
      } else {
        markThreadUnread(selectedThread);
      }

      state.threadSettingsOpen = false;
      state.messagePanelMode = unread ? 'thread' : 'inbox';
      refreshMessagingUi();
      showToast(unread ? 'Thread marked read.' : 'Thread marked unread.');
      return;
    }

    if (action === 'post' && threadSettingsAction.dataset.postId) {
      state.threadSettingsOpen = false;
      openPost(threadSettingsAction.dataset.postId);
      return;
    }

    if (action === 'close') {
      state.threadSettingsOpen = false;
      closeUsappSheet();
      return;
    }
  }

  const emojiOptionButton = event.target.closest('[data-message-emoji]');
  if (emojiOptionButton) {
    insertEmojiIntoMessageDraft(emojiOptionButton.dataset.messageEmoji || '');
    return;
  }

  const clearMessageReplyButton = event.target.closest('[data-clear-message-reply]');
  if (clearMessageReplyButton) {
    clearMessageReplyTarget();
    return;
  }

  const voiceRecordToggle = event.target.closest('[data-voice-record-toggle]');
  if (voiceRecordToggle) {
    await toggleVoiceRecording();
    return;
  }

  const attachButton = event.target.closest('[data-message-attach]');
  if (attachButton) {
    const fileInput = queryUsappElement('[data-message-file-input]');

    if (fileInput) {
      fileInput.click();
    }

    return;
  }

  const removeAttachmentButton = event.target.closest('[data-message-attachment-remove]');
  if (removeAttachmentButton) {
    clearPendingMessageAttachment();
    return;
  }

  const messageReactionOption = event.target.closest('[data-message-reaction-option]');
  if (messageReactionOption) {
    await sendMessageReaction(
      getSelectedThread(),
      messageReactionOption.dataset.messageReactionOption,
      messageReactionOption.dataset.emoji
    );
    return;
  }

  const messageReactionPill = event.target.closest('[data-message-reaction]');
  if (messageReactionPill) {
    await sendMessageReaction(
      getSelectedThread(),
      messageReactionPill.dataset.messageReaction,
      messageReactionPill.dataset.emoji
    );
    return;
  }

  const refreshButton = event.target.closest('[data-refresh-now]');
  if (refreshButton) {
    if (state.activeView === 'inbox') {
      await refreshMessagingData({ includeContacts: true, renderNow: true });
    } else if (state.activeNotificationPanel) {
      await refreshLiveActivity({ includePosts: true, includeThreads: true, announce: false });
    } else {
      await refreshData({ quiet: false });
    }
    return;
  }

  const resetBagButton = event.target.closest('[data-reset-bag]');
  if (resetBagButton) {
    state.bag = {};
    persistBag();
    render();
    showToast('Bag cleared.');
    return;
  }

  if (shouldRefreshMessaging) {
    refreshMessagingUi();
  }
}

async function uploadToSupabaseStorage(file) {
  if (!file) {
    return '';
  }

  const uploadUrl = apiService.createApiUrl('/uploads/post-media');
  const contentType = String(file.type || 'application/octet-stream').replace(/[^\x20-\x7E]/g, '') || 'application/octet-stream';

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': contentType
    },
    body: file
  });

  if (!response.ok) {
    const rawText = await response.text().catch(() => '');
    let message = rawText || `Upload failed (${response.status})`;

    try {
      const parsed = JSON.parse(rawText);
      message = String(parsed.error || parsed.message || message);
    } catch (error) {
      // Keep the raw text when the backend sends plain text or HTML.
    }

    throw new Error(message);
  }

  const data = await response.json().catch(() => null);
  return data && (data.url || data.publicUrl) ? String(data.url || data.publicUrl) : '';
}

async function handleSubmit(event) {
  const commentForm = event.target.closest('[data-comment-form]');
  if (commentForm) {
    event.preventDefault();
    await submitComment(commentForm.dataset.commentForm);
    return;
  }

  const authForm = event.target.closest('[data-auth-form]');
  if (authForm) {
    event.preventDefault();
    await submitAuthForm(authForm);
    return;
  }

  const uploadForm = event.target.closest('[data-upload-form]');
  if (uploadForm) {
    event.preventDefault();
    await publishUploadDraft();
    return;
  }

  const messageForm = event.target.closest('[data-message-form]');
  if (messageForm) {
    event.preventDefault();

    if (state.messageRecording) {
      showToast('Stop the voice recording first.');
      return;
    }

    const threadId = messageForm.dataset.messageForm;
    const text = String(state.messageDraftText || '').trim();
    const attachment = state.pendingMessageAttachment;

    if (!text && !attachment) {
      showToast('Write a message or add an attachment first.');
      return;
    }

    await sendMessage(threadId, text, attachment);

    return;
  }

  const profileForm = event.target.closest('[data-profile-form]');
  if (profileForm) {
    event.preventDefault();
    await submitProfileForm(profileForm);
    return;
  }

  const appearanceForm = event.target.closest('[data-appearance-form]');
  if (appearanceForm) {
    event.preventDefault();
    await saveAppearanceSettings();
  }
}

function handleInput(event) {
  const profileForm = event.target.closest('[data-profile-form]');
  if (profileForm) {
    if (event.target.name === 'photoUrl') {
      state.profilePhotoDraftUrl = '';
      state.profilePhotoDraftName = '';
      return;
    }
  }

  const commentField = event.target.closest('[data-comment-input]');
  if (commentField) {
    state.commentDraftText = String(commentField.value || '');
    return;
  }

  const uploadField = event.target.closest('[data-upload-field]');
  if (uploadField) {
    const field = uploadField.dataset.uploadField || '';
    const value = String(uploadField.value || '');

    if (field === 'mediaUrl') {
      const trimmed = value.trim();
      state.uploadDraft.mediaUrlInput = value;
      state.uploadDraft.mediaUrl = trimmed;
      state.uploadDraft.mediaSource = trimmed ? 'url' : 'none';
      state.uploadDraft.mediaName = trimmed ? getMediaDisplayName(trimmed) : '';

      const inferredType = inferMediaTypeFromUrl(trimmed);
      if (inferredType) {
        state.uploadDraft.mediaType = inferredType;
      }
    } else if (field in state.uploadDraft) {
      state.uploadDraft[field] = value;
    }

    syncUploadPreview();
    return;
  }

  const messageSearchField = event.target.closest('[data-message-search]');
  if (messageSearchField) {
    state.messageSearchQuery = String(messageSearchField.value || '');
    if (!elements.viewRoot || normalizeView(state.activeView) !== 'inbox' || state.messagePanelMode !== 'inbox') {
      refreshMessagingUi({
        focusSearch: true,
        searchSelectionStart: messageSearchField.selectionStart,
        searchSelectionEnd: messageSearchField.selectionEnd
      });
    } else if (shouldDeferUsappSearchWhileTyping()) {
      state.messageSearchPendingSync = true;
    } else {
      state.messageSearchPendingSync = false;
      queueUsappSearchUiSync();
    }
    return;
  }

  const messageField = event.target.closest('[data-message-input]');
  if (messageField) {
    state.messageDraftText = String(messageField.value || '').slice(0, 2000);
    const maxLength = Number(messageField.getAttribute('maxlength') || 2000);
    if (state.messageDraftText.length > maxLength) {
      state.messageDraftText = state.messageDraftText.slice(0, maxLength);
      messageField.value = state.messageDraftText;
    }
    syncMessageComposerMeta();
    return;
  }

  const searchField = event.target.closest('input[name="discoverQuery"]');
  if (searchField) {
    const value = String(searchField.value || '');
    if (normalizeView(state.activeView) === 'search') {
      state.searchViewQuery = value;
    } else {
      state.searchQuery = value;
    }
    if (!syncCatalogSearchUi()) {
      render();
    }
  }
}

async function handleChange(event) {
  const uploadPromoteToggle = event.target.closest('[data-upload-promote-toggle]');
  if (uploadPromoteToggle) {
    state.uploadDraft.promoteEnabled = Boolean(uploadPromoteToggle.checked);

    if (!state.uploadDraft.promoteEnabled) {
      state.uploadDraft.promotedTitle = '';
      state.uploadDraft.promotedPrice = '';
      state.uploadDraft.promotedText = '';
    }

    render();
    return;
  }

  const profilePhotoFileField = event.target.closest('[data-profile-photo-file-input]');
  if (profilePhotoFileField) {
    const [file] = Array.from(profilePhotoFileField.files || []);

    if (!file) {
      return;
    }

    if (!String(file.type || '').toLowerCase().startsWith('image/')) {
      profilePhotoFileField.value = '';
      showToast('Please choose an image file for the profile picture.');
      return;
    }

    try {
      state.profilePhotoDraftUrl = await optimizeProfilePhotoFile(file);
      state.profilePhotoDraftName = String(file.name || 'Selected image').trim() || 'Selected image';
      render();
      showToast('Profile picture ready to save.');
    } catch (error) {
      state.profilePhotoDraftUrl = '';
      state.profilePhotoDraftName = '';
      showToast('That profile picture could not be loaded.');
    } finally {
      profilePhotoFileField.value = '';
    }

    return;
  }

  const settingsBackgroundField = event.target.closest('[data-settings-background-input]');
  if (settingsBackgroundField) {
    const [file] = Array.from(settingsBackgroundField.files || []);

    if (!file) {
      return;
    }

    try {
      const dataUrl = await optimizeAppearanceBackgroundFile(file);
      state.appearancePendingBackgroundUrl = dataUrl;
      updateAppearanceDraft({
        backgroundUrl: dataUrl,
        backgroundEnabled: true
      });
      render();
      showToast('Background ready to save.');
    } catch (error) {
      showToast(error.message || 'That background could not be loaded.');
    } finally {
      settingsBackgroundField.value = '';
    }

    return;
  }

  const messageFileField = event.target.closest('[data-message-file-input]');
  if (messageFileField) {
    const [file] = Array.from(messageFileField.files || []);

    if (!file) {
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      messageFileField.value = '';
      showToast('Keep attachments under 4MB for Usapp.');
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      state.pendingMessageAttachment = normalizeMessageAttachmentInput({
        name: file.name,
        type: file.type,
        size: file.size,
        kind: String(file.type || '').toLowerCase().startsWith('image/') ? 'image' : 'file',
        dataUrl
      });
      refreshMessagingUi();
      showToast('Attachment ready to send.');
    } catch (error) {
      showToast('That file could not be attached.');
    } finally {
      messageFileField.value = '';
    }

    return;
  }

  const uploadFileField = event.target.closest('[data-upload-file]');
  if (!uploadFileField) {
    return;
  }

  const [file] = Array.from(uploadFileField.files || []);

  if (!file) {
    return;
  }

  if (file.size > 12 * 1024 * 1024) {
    uploadFileField.value = '';
    showToast('Keep uploads under 12MB for this preview.');
    return;
  }

  try {
    const mediaUrl = await readFileAsDataUrl(file);
    state.uploadDraft.mediaUrl = mediaUrl;
    state.uploadDraft.mediaFile = file;
    state.uploadDraft.mediaUrlInput = '';
    state.uploadDraft.mediaName = file.name || 'Local upload';
    state.uploadDraft.mediaSource = 'file';
    state.uploadDraft.mediaType = String(file.type || '').toLowerCase().startsWith('video/') ? 'video' : 'image';
    render();
  } catch (error) {
    showToast('That file could not be loaded.');
  } finally {
    uploadFileField.value = '';
  }
}

async function submitAuthForm(form) {
  if (!supabaseClient || !state.authAvailable) {
    state.authMessage = {
      type: 'error',
      text: 'Account login is unavailable right now.'
    };
    render();
    return;
  }

  const mode = form.dataset.authForm === 'signup' ? 'signup' : 'login';
  const formData = new FormData(form);

  state.authBusy = true;
  state.authMessage = null;
  render();

  try {
    if (mode === 'signup') {
      await signUpAccount(formData);
    } else {
      await signInAccount(formData);
    }
  } finally {
    state.authBusy = false;
    render();
  }
}

async function signInAccount(formData) {
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');

  if (!email || !password) {
    state.authMessage = {
      type: 'error',
      text: 'Please enter your email and password.'
    };
    return;
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    const rawMessage = String(error.message || '').trim();
    const normalizedMessage = rawMessage.toLowerCase();
    state.authMessage = {
      type: 'error',
      text: (
        normalizedMessage.includes('invalid login credentials')
        || normalizedMessage.includes('invalid email or password')
        || normalizedMessage.includes('email not confirmed')
      )
        ? 'Login failed. Check your email and password, or use “Forgot password?” to reset access.'
        : normalizeAuthErrorMessage(rawMessage)
    };
    return;
  }

  await syncAuthSession(data && data.session ? data.session : null, {
    renderNow: false,
    refreshNow: state.ready
  });
  await maybeRepairOversizedAuthSession();

  const nextView = resolveAuthRedirectView();

  state.authMessage = {
    type: 'success',
    text: 'Login successful. Your SocialEra account is now active in the app.'
  };
  state.authRedirectView = '';
  state.activeView = nextView;
  showToast('Logged into your SocialEra account.');
}

async function signUpAccount(formData) {
  const fullName = String(formData.get('fullName') || '').trim();
  const username = normalizeAccountUserName(formData.get('userName'));
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');

  if (!fullName || !username || !email || !password) {
    state.authMessage = {
      type: 'error',
      text: 'Please fill in your name, username, email, and password.'
    };
    return;
  }

  if (password.length < 6) {
    state.authMessage = {
      type: 'error',
      text: 'Password must be at least 6 characters long.'
    };
    return;
  }

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: buildWebsiteResetPasswordUrl(),
      data: {
        full_name: fullName,
        username
      }
    }
  });

  if (error) {
    state.authMessage = {
      type: 'error',
      text: error.message
    };
    return;
  }

  if (data && data.session) {
    await syncAuthSession(data.session, {
      renderNow: false,
      refreshNow: state.ready
    });
    await maybeRepairOversizedAuthSession();

    const nextView = resolveAuthRedirectView();

    state.authMessage = {
      type: 'success',
      text: 'Account created and connected to the app.'
    };
    state.authRedirectView = '';
    state.activeView = nextView;
    showToast('Account created and logged in.');
    return;
  }

  state.authMode = 'login';
  state.authMessage = {
    type: 'success',
    text: 'Account created. If email confirmation is enabled, check your inbox before logging in. If you lose access later, use “Forgot password?”.'
  };
  showToast('Account created.');
}

function buildWebsiteResetPasswordUrl() {
  const runtimeOrigin = String(runtimePublicAuthOrigin || '').trim().replace(/\/+$/, '');

  if (runtimeOrigin) {
    return `${runtimeOrigin}/reset-password.html`;
  }

  const configuredOrigin = String(APP_CONFIG.publicAuthOrigin || '').trim().replace(/\/+$/, '');

  if (configuredOrigin) {
    return `${configuredOrigin}/reset-password.html`;
  }

  const backendOrigin = String(APP_CONFIG.backendOrigin || '').trim().replace(/\/+$/, '');

  if (backendOrigin) {
    try {
      const parsedBackendOrigin = new URL(backendOrigin);
      const hostname = String(parsedBackendOrigin.hostname || '').trim().toLowerCase();
      const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(hostname);
      const isPrivateIpv4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname);
      const isLocalDevelopmentHost = isLocalhost || isPrivateIpv4 || hostname.endsWith('.local');

      if (isLocalDevelopmentHost) {
        return `${backendOrigin}/reset-password.html`;
      }
    } catch (error) {
      // no-op
    }
  }

  try {
    const origin = String(window.location.origin || '').trim().replace(/\/+$/, '');

    if (origin) {
      return `${origin}/reset-password.html`;
    }
  } catch (error) {
    // no-op
  }

  return 'reset-password.html';
}

function normalizeAuthErrorMessage(message) {
  const rawMessage = String(message || '').trim();
  const normalizedMessage = rawMessage.toLowerCase();

  if (
    normalizedMessage.includes('email rate limit exceeded')
    || normalizedMessage.includes('rate limit exceeded')
    || normalizedMessage.includes('too many requests')
  ) {
    return 'Too many reset or login emails were requested. Wait a few minutes, then try again.';
  }

  return rawMessage;
}

async function requestPasswordResetFromApp() {
  if (!supabaseClient || !state.authAvailable) {
    state.authMessage = {
      type: 'error',
      text: 'Account recovery is unavailable right now.'
    };
    render();
    return;
  }

  const emailField = document.querySelector('.auth-form input[name="email"]');
  const email = String(emailField && emailField.value ? emailField.value : '').trim();

  if (!email) {
    state.authMessage = {
      type: 'error',
      text: 'Enter your email address first, then request a password reset.'
    };
    render();
    return;
  }

  state.authBusy = true;
  state.authMessage = null;
  render();

  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: buildWebsiteResetPasswordUrl()
    });

    if (error) {
      state.authMessage = {
        type: 'error',
        text: normalizeAuthErrorMessage(error.message || 'Could not send a password reset email.')
      };
      return;
    }

    state.authMessage = {
      type: 'success',
      text: 'Password reset link sent. Check your email, then open the link to choose a new password.'
    };
  } finally {
    state.authBusy = false;
    render();
  }
}

async function signOutAccount() {
  if (!supabaseClient || !state.authAvailable) {
    state.authMessage = {
      type: 'error',
      text: 'Account login is unavailable right now.'
    };
    render();
    return;
  }

  state.authBusy = true;
  render();

  try {
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
      throw error;
    }

    await syncAuthSession(null, {
      renderNow: false,
      refreshNow: state.ready
    });

    state.authMode = 'login';
    state.authRedirectView = '';
    state.activeView = 'auth';
    state.authMessage = {
      type: 'success',
      text: 'Signed out. Browse Shop as a guest or log back in to unlock the app again.'
    };
    showToast('Signed out of your SocialEra account.');
  } catch (error) {
    const message = String(error && error.message ? error.message : '').trim();
    const networkError = /failed to fetch|networkerror|network request failed|load failed/i.test(message);

    if (networkError) {
      try {
        clearLocalSupabaseSessionArtifacts();

        await syncAuthSession(null, {
          renderNow: false,
          refreshNow: false
        });

        state.authMode = 'login';
        state.authRedirectView = '';
        state.activeView = 'auth';
        state.authMessage = {
          type: 'info',
          text: 'Signed out on this device. The app could not reach the account service, so the remote session may clear a little later.'
        };
        showToast('Signed out on this device.');
        return;
      } catch (fallbackError) {
        console.error('Local sign-out fallback failed:', fallbackError);
      }
    }

    state.authMessage = {
      type: 'error',
      text: networkError
        ? 'Could not reach the account service to sign out. Check your connection and try again.'
        : (message || 'Could not sign out right now.')
    };
  } finally {
    state.authBusy = false;
    render();
  }
}

function clearLocalSupabaseSessionArtifacts() {
  [window.localStorage, window.sessionStorage].forEach((storage) => {
    if (!storage) {
      return;
    }

    runtimeSupabaseConfigService.getSupabaseSessionStorageKeys().forEach((key) => {
      try {
        storage.removeItem(key);
      } catch (error) {
        console.error('Could not clear auth storage key:', key, error);
      }
    });

    try {
      for (let index = storage.length - 1; index >= 0; index -= 1) {
        const key = String(storage.key(index) || '');

        if (/^sb-.*-auth-token(?:-code-verifier)?$/i.test(key)) {
          storage.removeItem(key);
        }
      }
    } catch (error) {
      console.error('Could not clear Supabase auth storage keys:', error);
    }
  });
}

function openCommentSheet(postId) {
  const post = findPostById(postId);

  if (!post) {
    showToast('Comments unavailable for that post.');
    return;
  }

  const previousPostId = state.activeCommentPostId;
  closeNotificationSheet({ renderNow: false });
  closeUsappSheet();
  state.activeCommentPostId = post.id;
  state.activeReplyCommentId = '';
  state.commentDraftText = '';
  renderCommentSheet();
  if (previousPostId && previousPostId !== post.id) {
    refreshPostSurfaces(previousPostId, { includeSpotlight: false, includeCommentSheet: false });
  }
  refreshPostSurfaces(post.id, { includeSpotlight: false, includeCommentSheet: false });
  syncViewportVideoPlayback();
  focusCommentComposer();
}

function closeCommentSheet({ renderNow = true } = {}) {
  const previousPostId = state.activeCommentPostId;
  state.activeCommentPostId = '';
  state.activeReplyCommentId = '';
  state.commentDraftText = '';

  if (renderNow) {
    renderCommentSheet();
    if (previousPostId) {
      refreshPostSurfaces(previousPostId, { includeSpotlight: false, includeCommentSheet: false });
    }
    syncViewportVideoPlayback();
  }
}

function toggleNotificationSheet() {
  if (ensureSignedIn('home', 'Sign in or create an account to open your notifications.')) {
    return;
  }

  if (state.activeNotificationPanel) {
    closeNotificationSheet();
    return;
  }

  openNotificationSheet();
}

function openNotificationSheet() {
  closeCommentSheet({ renderNow: false });
  closeUsappSheet({ renderNow: false });
  state.activeNotificationPanel = true;
  state.notificationSeenAt = new Date().toISOString();
  persistNotificationSeenAt(state.notificationSeenAt);
  queueRemoteMessageStateSync({ delayMs: 60 });
  primeLiveNotificationState([]);
  render();
}

function closeNotificationSheet({ renderNow = true } = {}) {
  if (!state.activeNotificationPanel && !renderNow) {
    return;
  }

  state.activeNotificationPanel = false;

  if (renderNow) {
    renderNotificationSheet();
    updateHeader();
    updateNav();
  }
}

function openNotificationThread(threadId) {
  if (!threadId) {
    return;
  }

  state.selectedThreadId = threadId;
  state.messagePanelMode = 'thread';
  state.messageSearchOpen = false;
  setUsappSearchFocusState(false);
  persistText(STORAGE_KEYS.selectedThread, state.selectedThreadId);
  markSelectedThreadRead();
  closeNotificationSheet({ renderNow: false });
  openUsappSheet({ mode: 'thread' });
}

function openNotificationPost(postId, openComments = false) {
  if (!postId) {
    return;
  }

  closeNotificationSheet({ renderNow: false });
  openPost(postId);

  if (openComments) {
    openCommentSheet(postId);
  }
}

function clearCommentReply() {
  state.activeReplyCommentId = '';
  renderCommentSheet();
  focusCommentComposer();
}

function startCommentReply(commentId, authorName) {
  if (!commentId) {
    return;
  }

  state.activeReplyCommentId = commentId;

  if (!state.commentDraftText.trim()) {
    state.commentDraftText = '';
  }

  renderCommentSheet();
  focusCommentComposer(authorName);
}

function focusCommentComposer(authorName = '') {
  window.setTimeout(() => {
    const composer = elements.commentSheetRoot
      ? elements.commentSheetRoot.querySelector('[data-comment-input]')
      : null;

    if (!composer) {
      return;
    }

    composer.focus();

    if (authorName && typeof composer.setSelectionRange === 'function') {
      const length = composer.value.length;
      composer.setSelectionRange(length, length);
    }
  }, 30);
}

async function submitComment(postId) {
  const post = findPostById(postId);

  if (!post) {
    showToast('Post unavailable.');
    return;
  }

  const text = String(state.commentDraftText || '').trim();

  if (!text) {
    showToast('Write a comment first.');
    return;
  }

  const commentPayload = {
    id: getUuid(),
    actorId: state.actorId,
    userId: state.authUser && state.authUser.id ? String(state.authUser.id) : '',
    authorName: state.profile.displayName,
    userName: state.profile.userName,
    avatar: state.profile.avatar,
    photoUrl: state.profile.photoUrl,
    text,
    parentCommentId: state.activeReplyCommentId || '',
    createdAt: new Date().toISOString()
  };

  try {
    const response = await apiService.fetchJson(`/social/posts/${encodeURIComponent(postId)}/comments`, {
      method: 'POST',
      body: JSON.stringify(commentPayload)
    });

    applyCommentResponse(postId, response);
    state.commentDraftText = '';
    state.activeReplyCommentId = '';
    refreshPostSurfaces(postId, { includeSpotlight: state.activeView === 'home' });
    focusCommentComposer();
    showToast('Comment added.');
  } catch (error) {
    applyLocalCommentInsert(postId, commentPayload);
    state.commentDraftText = '';
    state.activeReplyCommentId = '';
    refreshPostSurfaces(postId, { includeSpotlight: state.activeView === 'home' });
    focusCommentComposer();
    showToast('Comment added locally in preview mode.');
  }
}

async function toggleCommentReaction(postId, commentId) {
  if (!postId || !commentId) {
    return;
  }

  try {
    const response = await apiService.fetchJson(`/social/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/reactions`, {
      method: 'POST',
      body: JSON.stringify({
        actorId: state.actorId,
        authorName: state.profile.displayName,
        userName: state.profile.userName,
        avatar: state.profile.avatar,
        photoUrl: state.profile.photoUrl
      })
    });

    applyCommentResponse(postId, response);
    refreshPostSurfaces(postId, { includeSpotlight: false });
    return;
  } catch (error) {
    if (toggleCommentReactionLocally(postId, commentId)) {
      refreshPostSurfaces(postId, { includeSpotlight: false });
      showToast('Comment like saved locally.');
      return;
    }
  }

  showToast('Could not update the comment right now.');
}

async function togglePostMetric(postId, metric) {
  const post = state.posts.find((entry) => entry.id === postId);
  if (!post) {
    return;
  }

  const actorListKey = metric === 'likes' ? 'likeActorIds' : 'saveActorIds';
  const countKey = metric === 'likes' ? 'likes' : 'saves';
  const currentlyActive = hasActor(post[actorListKey]);

  post[actorListKey] = toggleActor(post[actorListKey], state.actorId, currentlyActive);
  post[countKey] = Math.max(0, Number(post[countKey] || 0) + (currentlyActive ? -1 : 1));
  refreshPostSurfaces(postId, { includeSpotlight: metric === 'likes' });

  try {
    const response = await apiService.fetchJson(`/social/posts/${encodeURIComponent(postId)}/reactions`, {
      method: 'POST',
      body: JSON.stringify({
        metric,
        actorId: state.actorId,
        authorName: state.profile.displayName,
        userName: state.profile.userName,
        avatar: state.profile.avatar,
        photoUrl: state.profile.photoUrl
      })
    });

    post[countKey] = Number(response.count || 0);
    post[actorListKey] = toggleActor(post[actorListKey], state.actorId, !response.active);
    refreshPostSurfaces(postId, { includeSpotlight: metric === 'likes' });
  } catch (error) {
    post[actorListKey] = toggleActor(post[actorListKey], state.actorId, !currentlyActive);
    post[countKey] = Math.max(0, Number(post[countKey] || 0) + (currentlyActive ? 1 : -1));
    refreshPostSurfaces(postId, { includeSpotlight: metric === 'likes' });
    showToast('Could not sync reaction right now.');
  }
}

async function sharePost(postId) {
  const post = state.posts.find((entry) => entry.id === postId);
  if (!post) {
    return;
  }

  const shareUrl = new URL(window.location.href);
  shareUrl.hash = '';
  shareUrl.searchParams.set('post', post.id);

  const payload = {
    title: post.captionTitle,
    text: `${post.captionTitle} - ${post.captionText}`,
    url: shareUrl.toString()
  };

  try {
    if (navigator.share) {
      await navigator.share(payload);
      rememberSharedPost(post.id);
      refreshPostSurfaces(post.id, { includeSpotlight: false, includeCommentSheet: false });
      showToast('Post shared.');
      return;
    }
  } catch (error) {
    if (error && error.name === 'AbortError') {
      return;
    }
  }

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(payload.url);
      rememberSharedPost(post.id);
      refreshPostSurfaces(post.id, { includeSpotlight: false, includeCommentSheet: false });
      showToast('Share link copied.');
      return;
    }
  } catch (error) {
    // Fall through to the final fallback toast.
  }

  showToast('Share is not available in this browser.');
}

function addToBag(productId) {
  const key = String(productId || '');

  if (!key) {
    return;
  }

  if (ensureSignedIn('bag', 'Sign in or create an account to save products to your bag.')) {
    return;
  }

  state.bag[key] = Number(state.bag[key] || 0) + 1;
  persistBag();
  render();
  showToast('Added to bag.');
}

function updateBagQuantity(productId, delta) {
  const key = String(productId || '');
  if (!key || !delta) {
    return;
  }

  const nextQuantity = Number(state.bag[key] || 0) + delta;

  if (nextQuantity <= 0) {
    delete state.bag[key];
  } else {
    state.bag[key] = nextQuantity;
  }

  persistBag();
  render();
}

function removeFromBag(productId) {
  const key = String(productId || '');
  if (!key) {
    return;
  }

  delete state.bag[key];
  persistBag();
  render();
  showToast('Removed from bag.');
}

async function ensureThread(contactId) {
  const contact = state.contacts.find((entry) => entry.actorId === contactId);
  const existing = state.threads.find((thread) => thread.contact.actorId === contactId);

  if (existing) {
    state.selectedThreadId = existing.id;
    state.messagePanelMode = 'thread';
    state.messageSearchOpen = false;
    setUsappSearchFocusState(false);
    persistText(STORAGE_KEYS.selectedThread, state.selectedThreadId);
    openUsappSheet({ mode: 'thread' });
    return;
  }

  if (!contact) {
    showToast('That contact is not available right now.');
    return;
  }

  if (!isMemberMessageContact(contact)) {
    showToast('Only real member chats are available in Usapp now.');
    return;
  }

  try {
    let thread = null;
    let created = false;

    await syncMessageProfile().catch(() => null);

    const response = await apiService.fetchMessageJson('/messages/member-threads', {
      method: 'POST',
      body: JSON.stringify({
        actorId: getMessageActorId(),
        contactActorId: contact.actorId,
        displayName: state.profile.displayName,
        userName: state.profile.userName,
        avatar: state.profile.avatar,
        photoUrl: state.profile.photoUrl
      })
    });

    thread = normalizeThread(response.thread, 'member');
    created = Boolean(response.created);

    state.threads = [thread, ...state.threads.filter((entry) => entry.id !== thread.id)];
    state.selectedThreadId = thread.id;
    state.messagePanelMode = 'thread';
    state.messageSearchOpen = false;
    setUsappSearchFocusState(false);
    state.messageDraftText = '';
    state.pendingMessageAttachment = null;
    clearMessageReplyTarget({ refresh: false });
    state.composerEmojiOpen = false;
    state.reactionPickerMessageId = '';
    state.reactionRevealMessageId = '';
    persistText(STORAGE_KEYS.selectedThread, state.selectedThreadId);
    openUsappSheet({ mode: 'thread' });
    queueMessageRefresh({ delayMs: 350 });
    showToast(created ? 'Conversation created.' : 'Conversation reopened.');
  } catch (error) {
    console.error('Could not open member chat:', error);
    showToast(error.message || 'Could not open that direct member chat right now.');
  }
}

function toggleUsappSheet() {
  if (ensureSignedIn('home', 'Sign in or create an account to use Usapp Chats.')) {
    return;
  }

  if (state.activeView === 'inbox') {
    setActiveView('home');
    return;
  }

  openUsappSheet();
}

function openUsappSheet({ mode = '', threadId = '', renderNow = true } = {}) {
  if (ensureSignedIn('home', 'Sign in or create an account to use Usapp Chats.')) {
    return;
  }

  closeCommentSheet({ renderNow: false });
  closeNotificationSheet({ renderNow: false });
  rememberViewScroll(state.activeView);

  const requestedThreadId = String(threadId || '').trim();
  if (requestedThreadId) {
    state.selectedThreadId = requestedThreadId;
    persistText(STORAGE_KEYS.selectedThread, state.selectedThreadId);
  }

  if (mode === 'inbox') {
    state.messagePanelMode = 'inbox';
  } else if (mode === 'thread') {
    if (!state.selectedThreadId && state.threads[0]) {
      state.selectedThreadId = state.threads[0].id;
      persistText(STORAGE_KEYS.selectedThread, state.selectedThreadId);
    }

    if (state.selectedThreadId) {
      state.messagePanelMode = 'thread';
    }
  }

  state.activeView = 'inbox';
  persistText(STORAGE_KEYS.activeView, 'inbox');
  state.usappOpen = false;
  state.usappAnimateIn = false;
  state.messageSearchOpen = state.messagePanelMode === 'inbox' ? state.messageSearchOpen : false;
  if (!state.messageSearchOpen) {
    setUsappSearchFocusState(false);
  }
  state.threadSettingsOpen = false;

  if (state.messagePanelMode === 'thread') {
    markSelectedThreadRead();
  }

  if (renderNow) {
    render();
    if (state.messagePanelMode === 'thread') {
      window.setTimeout(() => {
        scrollUsappThreadToLatest({ behavior: 'auto' });
      }, 40);
    }
    syncMessageAutoRefresh();
    queueMessageRefresh({ delayMs: 80, includeContacts: true });
    return;
  }

  syncMessageAutoRefresh();
  queueMessageRefresh({ delayMs: 80, includeContacts: true });
}

function closeUsappSheet({ renderNow = true, resetMode = false } = {}) {
  if (state.activeView !== 'inbox' && !renderNow) {
    return;
  }

  state.usappOpen = false;
  state.usappAnimateIn = false;
  state.messageSearchOpen = false;
  setUsappSearchFocusState(false);
  state.threadSettingsOpen = false;
  clearMessageReplyTarget({ refresh: false });
  state.composerEmojiOpen = false;
  state.reactionPickerMessageId = '';
  state.reactionRevealMessageId = '';

  if (voiceRecorder) {
    voiceRecorder.onstop = null;
    resetVoiceRecorder();
    state.messageRecording = false;
  }

  if (resetMode) {
    state.messagePanelMode = 'inbox';
  }

  if (renderNow) {
    setActiveView('home');
    return;
  }

  syncMessageAutoRefresh();
}

async function sendMessage(threadId, text, attachment = null) {
  const thread = state.threads.find((entry) => entry.id === threadId) || getSelectedThread();

  if (!thread) {
    showToast('Thread unavailable.');
    return;
  }

  state.messageBusy = true;
  refreshMessagingUi();
  let shouldScrollToLatest = false;
  const replyContext = getMessageReplyContext(thread);
  const previousThreadSnapshot = thread
    ? {
        id: thread.id,
        messages: Array.isArray(thread.messages)
          ? thread.messages.map((message) => ({
              id: message.id,
              senderActorId: message.senderActorId
            }))
          : []
      }
    : null;

  try {
    let nextThread = null;

    if (thread.provider !== 'member') {
      showToast('This chat is no longer available. Refresh Usapp to load real member chats.');
      return;
    }

    const response = await apiService.fetchMessageJson(`/messages/member-threads/${encodeURIComponent(thread.nativeId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        actorId: getMessageActorId(),
        authorName: state.profile.displayName,
        displayName: state.profile.displayName,
        userName: state.profile.userName,
        avatar: state.profile.avatar,
        photoUrl: state.profile.photoUrl,
        text,
        attachment,
        replyToMessageId: replyContext ? replyContext.messageId : '',
        replyPreviewAuthor: replyContext ? replyContext.authorName : '',
        replyPreviewText: replyContext ? replyContext.previewText : ''
      })
    });

    nextThread = normalizeThread(response.thread, 'member');

    nextThread = applyReplyContextToThread(nextThread, text, replyContext);

    state.threads = [nextThread, ...state.threads.filter((thread) => thread.id !== nextThread.id)];
    markUsappLiveChanges(previousThreadSnapshot ? [previousThreadSnapshot] : [], [nextThread]);
    state.selectedThreadId = nextThread.id;
    persistText(STORAGE_KEYS.selectedThread, state.selectedThreadId);
    state.messageDraftText = '';
    state.pendingMessageAttachment = null;
    clearMessageReplyTarget({ refresh: false });
    state.composerEmojiOpen = false;
    state.reactionPickerMessageId = '';
    state.reactionRevealMessageId = '';
    markThreadRead(nextThread);
    shouldScrollToLatest = true;
    refreshMessagingUi();
    queueMessageRefresh({ delayMs: thread.provider === 'member' ? 1200 : USAPP_PREVIEW_REPLY_DELAY_MS });
    showToast('Message sent.');
    return;
  } catch (error) {
    showToast(error.message || 'Could not send that member-chat message right now.');
  } finally {
    state.messageBusy = false;
    refreshMessagingUi({
      scrollToLatest: shouldScrollToLatest,
      scrollBehavior: 'auto'
    });
  }
}

async function sendMessageReaction(thread, messageId, emoji) {
  if (!thread || !messageId || !emoji) {
    return;
  }

  const message = Array.isArray(thread.messages) ? thread.messages.find((entry) => entry.id === messageId) : null;

  if (!message) {
    return;
  }

  try {
    let nextThread = null;

    if (thread.provider === 'member') {
      const response = await apiService.fetchMessageJson(`/messages/member-threads/${encodeURIComponent(thread.nativeId)}/messages/${encodeURIComponent(message.nativeId)}/reactions`, {
        method: 'POST',
        body: JSON.stringify({
          actorId: getMessageActorId(),
          emoji
        })
      });

      nextThread = normalizeThread(response.thread, 'member');
    } else {
      const response = await apiService.fetchMessageJson(`/messages/threads/${encodeURIComponent(thread.nativeId)}/messages/${encodeURIComponent(message.nativeId)}/reactions`, {
        method: 'POST',
        body: JSON.stringify({
          actorId: getMessageActorId(),
          emoji
        })
      });

      nextThread = normalizeThread(response.thread, 'local');
    }

    state.threads = [nextThread, ...state.threads.filter((entry) => entry.id !== nextThread.id)];
    state.selectedThreadId = nextThread.id;
    persistText(STORAGE_KEYS.selectedThread, state.selectedThreadId);
    state.reactionPickerMessageId = '';
    state.reactionRevealMessageId = '';
    refreshMessagingUi({
      preserveThreadScroll: true
    });
    queueMessageRefresh({ delayMs: 500 });
    return;
  } catch (error) {
    if (thread.provider === 'member') {
      showToast(error.message || 'Could not sync that reaction right now.');
      return;
    }

    toggleMessageReactionLocally(thread.id, messageId, emoji);
    state.reactionPickerMessageId = '';
    state.reactionRevealMessageId = '';
    refreshMessagingUi({
      preserveThreadScroll: true
    });
    showToast('Reaction saved locally.');
  }
}

function toggleMessageReactionLocally(threadId, messageId, emoji) {
  const thread = state.threads.find((entry) => entry.id === threadId);

  if (!thread || !Array.isArray(thread.messages)) {
    return;
  }

  const message = thread.messages.find((entry) => entry.id === messageId);

  if (!message) {
    return;
  }

  if (!Array.isArray(message.reactions)) {
    message.reactions = [];
  }

  const actorId = getMessageActorId();
  const existing = message.reactions.find((reaction) => reaction.emoji === emoji);

  if (!existing) {
    message.reactions.push({
      emoji,
      actorIds: [actorId]
    });
    return;
  }

  existing.actorIds = Array.isArray(existing.actorIds) ? [...existing.actorIds] : [];

  if (existing.actorIds.includes(actorId)) {
    existing.actorIds = existing.actorIds.filter((entry) => entry !== actorId);
  } else {
    existing.actorIds.push(actorId);
  }

  message.reactions = message.reactions.filter((reaction) => Array.isArray(reaction.actorIds) && reaction.actorIds.length);
}

function updateHeader() {
  const hideAuthChrome = normalizeView(state.activeView) === 'auth';
  elements.profileShortcut.innerHTML = renderAvatarMedia(state.profile);
  if (elements.topbarActions) {
    elements.topbarActions.classList.toggle('hidden-for-auth', hideAuthChrome);
  }
  elements.refreshButton.hidden = hideAuthChrome;
  elements.profileShortcut.hidden = hideAuthChrome;
  elements.refreshButton.classList.toggle('active', state.activeNotificationPanel);
  elements.refreshButton.setAttribute('aria-expanded', state.activeNotificationPanel ? 'true' : 'false');
  syncInstallButton();
}

function updateNav() {
  const activeNavView = getActiveNavView();
  const bagCount = isSignedIn() ? getBagCount() : 0;
  const unreadThreadCount = isSignedIn() ? getUnreadThreadCount() : 0;
  const unreadNotificationCount = isSignedIn() ? getUnreadNotificationCount(getNotificationItems()) : 0;

  elements.navButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.navView === activeNavView);
  });

  if (elements.messagesBadge) {
    elements.messagesBadge.textContent = unreadThreadCount > 0 ? String(Math.min(unreadThreadCount, 9)) : '';
  }

  if (elements.notificationBadge) {
    elements.notificationBadge.textContent = unreadNotificationCount > 0 ? String(Math.min(unreadNotificationCount, 9)) : '';
  }

  if (elements.refreshButton) {
    elements.refreshButton.classList.toggle('has-unread', unreadNotificationCount > 0);
  }

  const badgeMap = {
    bag: bagCount,
    inbox: unreadThreadCount
  };

  elements.navBadges.forEach((badge) => {
    const count = Number(badgeMap[badge.dataset.badgeFor] || 0);
    badge.textContent = count > 0 ? String(Math.min(count, 9)) : '';
  });
}

function syncInstallButton() {
  const isStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  const suppressOnDesktop = Boolean(
    window.matchMedia
    && window.matchMedia('(min-width: 768px)').matches
    && window.matchMedia('(pointer: fine)').matches
  );
  const shouldShow = Boolean(state.installPrompt) && !isStandalone && !suppressOnDesktop;
  elements.installButton.classList.toggle('hidden', !shouldShow);
}

function setActiveView(nextView, { renderNow = true } = {}) {
  const normalizedView = normalizeView(nextView);

  if (!isSignedIn() && requiresAuthForView(normalizedView)) {
    requestAuthAccess(normalizedView, `Sign in or create an account to open ${titleCase(normalizedView)} in the app.`);
    return;
  }

  if (normalizeView(state.activeView) === 'settings' && normalizedView !== 'settings' && !state.appearanceSaving) {
    discardAppearanceDraft();
  }

  rememberViewScroll(state.activeView);

  if (normalizedView === 'inbox') {
    openUsappSheet({ mode: 'inbox', renderNow });
    return;
  }

  state.activeView = normalizedView;
  state.activeNotificationPanel = false;
  closeUsappSheet({ renderNow: false });

  state.messageSearchOpen = false;
  setUsappSearchFocusState(false);
  state.composerEmojiOpen = false;
  state.reactionPickerMessageId = '';
  state.reactionRevealMessageId = '';

  if (!(state.activeView in VIEW_META)) {
    state.activeView = 'home';
  }

  if (state.activeView !== 'post') {
    persistText(STORAGE_KEYS.activeView, state.activeView);
  }

  if (renderNow) {
    render();
  }

  if (normalizedView === 'settings' && isSignedIn()) {
    loadAppearanceSettings({
      quiet: false,
      syncDraft: true
    }).catch((error) => {
      console.error('Could not load appearance settings:', error);
    });
  }
}

function normalizeStoredView(value) {
  const view = normalizeView(value);
  return view === 'inbox' ? 'home' : view;
}

function normalizeTheme(value) {
  const themeId = String(value || 'socialera').trim().toLowerCase();
  return APP_THEME_IDS.includes(themeId) ? themeId : 'socialera';
}

function getThemeMeta(themeId = state.theme) {
  return APP_THEMES.find((theme) => theme.id === normalizeTheme(themeId)) || APP_THEMES[0];
}

function isSignedIn() {
  return Boolean(state.authUser);
}

function canAccessViewWithoutAuth(view) {
  return GUEST_ACCESSIBLE_VIEWS.has(normalizeView(view));
}

function requiresAuthForView(view) {
  return !canAccessViewWithoutAuth(view);
}

function resolveAuthRedirectView() {
  const target = normalizeView(state.authRedirectView || 'home');

  if (!target || target === 'auth' || target === 'post' || !(target in VIEW_META)) {
    return 'home';
  }

  return target;
}

function requestAuthAccess(targetView = 'home', message = 'Sign in or create an account to continue in the SocialEra app.') {
  state.authRedirectView = resolveAuthTargetView(targetView);
  state.authMessage = {
    type: 'info',
    text: message
  };
  state.activeNotificationPanel = false;
  closeCommentSheet({ renderNow: false });
  closeNotificationSheet({ renderNow: false });
  closeUsappSheet({ renderNow: false, resetMode: true });
  state.activeView = 'auth';
  persistText(STORAGE_KEYS.activeView, state.activeView);
  render();
}

function resolveAuthTargetView(targetView) {
  const normalized = normalizeView(targetView);

  if (!normalized || normalized === 'auth' || normalized === 'post' || !(normalized in VIEW_META)) {
    return 'home';
  }

  return normalized;
}

function ensureSignedIn(targetView = 'home', message = 'Sign in or create an account to continue.') {
  if (isSignedIn()) {
    return false;
  }

  requestAuthAccess(targetView, message);
  return true;
}

function getUploadStepIndex(stepId = state.uploadStep) {
  const index = UPLOAD_STEPS.findIndex((step) => step.id === stepId);
  return index === -1 ? 0 : index;
}

function normalizeUploadStep(stepId = state.uploadStep) {
  return UPLOAD_STEPS[getUploadStepIndex(stepId)].id;
}

function getUploadStepMeta(stepId = state.uploadStep) {
  return UPLOAD_STEPS[getUploadStepIndex(stepId)];
}

function getPreviousUploadStepId(stepId = state.uploadStep) {
  return UPLOAD_STEPS[Math.max(0, getUploadStepIndex(stepId) - 1)].id;
}

function getNextUploadStepId(stepId = state.uploadStep) {
  return UPLOAD_STEPS[Math.min(UPLOAD_STEPS.length - 1, getUploadStepIndex(stepId) + 1)].id;
}

function setUploadStep(stepId, { renderNow = true } = {}) {
  state.uploadStep = normalizeUploadStep(stepId);

  if (renderNow) {
    render();
  }
}

function applyTheme() {
  const effectiveSettings = getEffectiveAppearanceSettings();
  const resolvedTheme = normalizeTheme(effectiveSettings.theme);
  const backgroundActive = shouldApplyAppearanceBackground(effectiveSettings);

  state.theme = resolvedTheme;
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.classList.toggle('ios-optimized', Boolean(state.iosOptimized));
  document.documentElement.dataset.appearanceTarget = getAppearanceTargetView();

  if (elements.phoneShell) {
    elements.phoneShell.dataset.customBackground = backgroundActive ? 'true' : 'false';
    elements.phoneShell.style.setProperty(
      '--appearance-bg-image',
      backgroundActive && effectiveSettings.backgroundUrl
        ? `url(${JSON.stringify(effectiveSettings.backgroundUrl)})`
        : 'none'
    );
    elements.phoneShell.style.setProperty('--appearance-bg-opacity', backgroundActive ? '1' : '0');
  }
}

function shouldAutoplayVideo(type = 'post') {
  if (!state.iosOptimized) {
    return true;
  }

  return state.activeView === 'videos' || state.activeView === 'post';
}

async function publishUploadDraft() {
  const draft = state.uploadDraft;

  if (!canPublishUploadDraft(draft)) {
    showToast('Add a title, caption, or media before publishing.');
    return;
  }

  if (!String(draft.title || '').trim()) {
    showToast('Add a post title before publishing.');
    return;
  }

  if (!String(draft.text || '').trim()) {
    showToast('Add a caption before publishing.');
    return;
  }

  if (draft.promoteEnabled && !String(draft.promotedTitle || '').trim()) {
    showToast('Add the promoted item title before publishing.');
    return;
  }

  let uploadedMediaUrl = '';

  try {
    if (draft.mediaFile) {
      showToast('Uploading media...');
      uploadedMediaUrl = await uploadToSupabaseStorage(draft.mediaFile);
    }

    const postPayload = {
      id: `post-${Date.now()}`,
      actorId: state.actorId,
      userId: state.authUser && state.authUser.id ? String(state.authUser.id) : '',
      channel: draft.channel || DEFAULT_UPLOAD_CHANNELS[0],
      userName: state.profile.userName,
      displayName: state.profile.displayName,
      avatar: state.profile.avatar,
      photoUrl: state.profile.photoUrl,
      mediaType: draft.mediaType,
      mediaUrl: uploadedMediaUrl || draft.mediaUrl,
      captionTitle: draft.title || 'New SocialEra post',
      captionText: draft.text || 'Shared from the SocialEra app upload flow.',
      tags: getUploadTags(draft),
      linkedProductIds: draft.linkedProductIds,
      promoteEnabled: Boolean(draft.promoteEnabled),
      promotedTitle: draft.promotedTitle || '',
      promotedPrice: draft.promotedPrice || '',
      promotedText: draft.promotedText || '',
      likes: 0,
      commentsCount: 0,
      saves: 0,
      createdAt: new Date().toISOString()
    };

    const response = await apiService.fetchJson('/social/posts', {
      method: 'POST',
      omitAuth: true,
      body: JSON.stringify(postPayload)
    });

    const persistedPostId = String(response && response.id ? response.id : '').trim();

    if (!persistedPostId) {
      throw new Error('Publish did not return a saved post.');
    }

    const publishedPost = normalizePost({
      ...response,
      linkedProductIds: draft.linkedProductIds
    });
    const refreshedPosts = await loadSocialFeedPosts();
    const confirmedPosts = mergePostCollections(Array.isArray(refreshedPosts) ? refreshedPosts : [], []);
    const confirmedPost = confirmedPosts.find((post) => post.id === publishedPost.id);

    if (!confirmedPost) {
      throw new Error('Publish could not be confirmed.');
    }

    state.posts = confirmedPosts;
    state.uploadDraft = createUploadDraft();
    state.uploadStep = UPLOAD_STEPS[0].id;
    state.spotlightExpanded = false;
    state.spotlightPreviewIndex = 0;
    openPost(confirmedPost.id, { fromView: 'upload' });
    showToast('Post published to Home and Spotlight.');
  } catch (error) {
    console.error('Could not publish upload draft:', error);
    const message = getRequestErrorMessage(error, 'We could not publish your post. Your draft is still here so you can try again.');
    showToast(
      message === 'Publish did not return a saved post.' || message === 'Publish could not be confirmed.'
        ? 'We could not confirm that your post was saved. Your draft is still here so you can try again.'
        : `Could not publish post. ${message}`
    );
  }
}

function syncUploadPreview() {
  if (state.activeView !== 'upload') {
    return;
  }

  const previewPost = buildUploadPreviewPost();
  const canPublish = canPublishUploadDraft();
  const selectionCount = state.uploadDraft.linkedProductIds.length;
  const typedTags = getTypedUploadTags();
  const previewRoot = elements.viewRoot.querySelector('[data-upload-preview]');
  const mediaRoot = elements.viewRoot.querySelector('[data-upload-inline-media]');
  const mediaNote = elements.viewRoot.querySelector('[data-upload-media-note]');
  const titleCount = elements.viewRoot.querySelector('[data-upload-title-count]');
  const captionCount = elements.viewRoot.querySelector('[data-upload-caption-count]');
  const promotedCount = elements.viewRoot.querySelector('[data-upload-promoted-count]');
  const tagsCount = elements.viewRoot.querySelector('[data-upload-tags-count]');
  const selectionCounter = elements.viewRoot.querySelector('[data-upload-selection-count]');
  const reviewCopy = elements.viewRoot.querySelector('[data-upload-review-copy]');

  if (previewRoot) {
    previewRoot.innerHTML = renderPostCard(previewPost);
  }

  if (mediaRoot) {
    mediaRoot.classList.toggle('has-media', Boolean(state.uploadDraft.mediaUrl));
    mediaRoot.innerHTML = renderUploadModalPreviewMedia(previewPost, Boolean(state.uploadDraft.mediaUrl));
  }

  if (mediaNote) {
    mediaNote.textContent = state.uploadDraft.mediaName || (state.uploadDraft.mediaUrl ? 'Media added via URL.' : 'No file selected yet.');
  }

  if (titleCount) {
    titleCount.textContent = `${String(state.uploadDraft.title || '').trim().length}/90`;
  }

  if (captionCount) {
    captionCount.textContent = `${String(state.uploadDraft.text || '').trim().length}/340`;
  }

  if (promotedCount) {
    promotedCount.textContent = `${String(state.uploadDraft.promotedText || '').trim().length}/180`;
  }

  if (tagsCount) {
    tagsCount.textContent = `${typedTags.length} ${typedTags.length === 1 ? 'tag' : 'tags'}`;
  }

  if (selectionCounter) {
    selectionCounter.textContent = `${selectionCount} ${selectionCount === 1 ? 'item selected' : 'items selected'}`;
  }

  if (reviewCopy) {
    reviewCopy.textContent = getUploadPublishMessage();
    reviewCopy.className = `upload-modal-status ${canPublish ? 'success' : 'error'}`;
  }
}

function getFilteredPosts() {
  const posts = [...state.posts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (state.feedFilter === 'all') {
    return posts;
  }

  return posts.filter((post) => post.channel === state.feedFilter);
}

function normalizeFeedView(view) {
  return normalizeView(view) === 'videos' ? 'videos' : 'home';
}

function getFeedVisibleCount(view) {
  const normalizedView = normalizeFeedView(view);
  return Math.max(FEED_RENDER_BATCH[normalizedView], Number(state.feedVisibleCount[normalizedView] || FEED_RENDER_BATCH[normalizedView]));
}

function getVisibleFeedPosts(view, posts) {
  const normalizedView = normalizeFeedView(view);
  const items = (Array.isArray(posts) ? posts : []).slice(0, getFeedVisibleCount(normalizedView));

  return {
    items,
    hasMore: (Array.isArray(posts) ? posts.length : 0) > items.length
  };
}

function expandFeedView(view) {
  const normalizedView = normalizeFeedView(view);
  state.feedVisibleCount[normalizedView] = getFeedVisibleCount(normalizedView) + FEED_RENDER_BATCH[normalizedView];
  render();
}

function getAutoExpandableFeedPosts(view = state.activeView) {
  const normalizedView = normalizeFeedView(view);

  if (normalizedView === 'videos') {
    const videoPosts = state.posts.filter((post) => post.mediaType === 'video');
    return videoPosts.length ? videoPosts : state.posts;
  }

  return getFilteredPosts();
}

function scheduleFeedAutoExpandCheck() {
  if (feedAutoExpandFrame) {
    window.cancelAnimationFrame(feedAutoExpandFrame);
  }

  feedAutoExpandFrame = window.requestAnimationFrame(() => {
    feedAutoExpandFrame = 0;
    tryAutoExpandFeed();
  });
}

function tryAutoExpandFeed() {
  const normalizedView = normalizeFeedView(state.activeView);

  if (!elements.viewRoot || !['home', 'videos'].includes(normalizedView)) {
    return;
  }

  const sentinel = elements.viewRoot.querySelector(`[data-feed-autoload="${normalizedView}"]`);

  if (!sentinel) {
    return;
  }

  const posts = getAutoExpandableFeedPosts(normalizedView);
  const { hasMore } = getVisibleFeedPosts(normalizedView, posts);

  if (!hasMore) {
    return;
  }

  const containerRect = elements.viewRoot.getBoundingClientRect();
  const sentinelRect = sentinel.getBoundingClientRect();
  const threshold = 220;

  if (sentinelRect.top <= containerRect.bottom + threshold) {
    expandFeedView(normalizedView);
  }
}

function openPost(postId, { fromView = state.activeView } = {}) {
  if (ensureSignedIn('home', 'Sign in or create an account to open posts in the app.')) {
    return;
  }

  const post = findPostById(postId);

  if (!post) {
    showToast('Post unavailable.');
    return;
  }

  state.selectedPostId = post.id;
  state.postReturnView = normalizeView(fromView === 'post' ? state.postReturnView : fromView);
  state.viewScrollTop.post = 0;
  setActiveView('post');
}

function getSelectedPost() {
  return findPostById(state.selectedPostId);
}

function getActiveCommentPost() {
  return findPostById(state.activeCommentPostId);
}

function findPostById(postId) {
  return state.posts.find((post) => post.id === postId) || null;
}

function getPostComments(post) {
  if (!post) {
    return [];
  }

  if (Array.isArray(post.commentsData) && post.commentsData.length) {
    return post.commentsData;
  }

  if (Array.isArray(post.commentPreview) && post.commentPreview.length) {
    return post.commentPreview;
  }

  return [];
}

function getPostCommentCount(post) {
  return Math.max(Number(post && post.commentsCount ? post.commentsCount : 0), countCommentTree(getPostComments(post)));
}

function getPostReturnView() {
  const returnView = normalizeView(state.postReturnView || 'home');
  return returnView in VIEW_META && returnView !== 'post' ? returnView : 'home';
}

function getActiveNavView() {
  return state.activeView === 'post' ? getPostReturnView() : state.activeView;
}

function getCatalogContext(view = state.activeView) {
  const normalizedView = normalizeView(view);

  if (normalizedView === 'search') {
    return {
      query: String(state.searchViewQuery || ''),
      filter: String(state.searchViewFilter || 'all')
    };
  }

  return {
    query: String(state.searchQuery || ''),
    filter: String(state.discoverFilter || 'all')
  };
}

function getFilteredProducts({ view = state.activeView } = {}) {
  const catalogContext = getCatalogContext(view);
  const query = catalogContext.query.trim().toLowerCase();

  return state.products.filter((product) => {
    const matchesFilter = catalogContext.filter === 'all' || product.category === catalogContext.filter;

    if (!matchesFilter) {
      return false;
    }

    if (!query) {
      return true;
    }

    const haystack = [
      product.name,
      product.category,
      product.description
    ].join(' ').toLowerCase();

    return haystack.includes(query);
  });
}

function rememberViewScroll(view = state.activeView) {
  const normalizedView = normalizeView(view);

  if (!elements.viewRoot || !normalizedView || normalizedView === 'inbox') {
    return;
  }

  state.viewScrollTop[normalizedView] = Math.max(0, elements.viewRoot.scrollTop || 0);
}

function restoreViewScroll(view = state.activeView) {
  const normalizedView = normalizeView(view);
  const targetScrollTop = Math.max(0, Number(state.viewScrollTop[normalizedView] || 0));

  window.requestAnimationFrame(() => {
    if (!elements.viewRoot || normalizeView(state.activeView) !== normalizedView) {
      return;
    }

    elements.viewRoot.scrollTop = targetScrollTop;
    lastDockScrollTop = targetScrollTop;
  });
}

function getBagItems() {
  const productMap = new Map(state.products.map((product) => [String(product.id), product]));

  return Object.entries(state.bag)
    .map(([id, quantity]) => {
      const product = productMap.get(String(id));

      if (!product) {
        return null;
      }

      return {
        product,
        quantity: Number(quantity || 0)
      };
    })
    .filter(Boolean);
}

function getBagCount() {
  return Object.values(state.bag).reduce((sum, quantity) => sum + Number(quantity || 0), 0);
}

function getSelectedThread() {
  return state.threads.find((thread) => thread.id === state.selectedThreadId) || state.threads[0] || null;
}

function syncActiveThreadReadState() {
  if (state.activeView !== 'inbox' || state.messagePanelMode !== 'thread') {
    return;
  }

  markSelectedThreadRead();
}

function markSelectedThreadRead() {
  const thread = getSelectedThread();

  if (!thread) {
    return;
  }

  markThreadRead(thread);
}

function markThreadRead(thread) {
  if (!thread || !thread.id) {
    return;
  }

  const readState = loadThreadReadState();
  const latestSeenAt = getThreadReadTimestamp(thread);
  const currentLocalSeenAt = String(readState[thread.id] || '').trim();
  const currentRemoteSeenAt = String(thread.lastReadAt || '').trim();
  const hasForcedUnread = Array.isArray(state.forcedUnreadThreadIds) && state.forcedUnreadThreadIds.includes(thread.id);

  if (!hasForcedUnread && currentLocalSeenAt === latestSeenAt && (thread.provider !== 'member' || currentRemoteSeenAt === latestSeenAt)) {
    return;
  }

  readState[thread.id] = latestSeenAt;
  persistThreadReadState(readState);
  state.forcedUnreadThreadIds = (state.forcedUnreadThreadIds || []).filter((threadId) => threadId !== thread.id);
  persistForcedUnreadThreadIds(state.forcedUnreadThreadIds);
  queueRemoteMessageStateSync();

  if (thread.provider === 'member') {
    thread.lastReadAt = latestSeenAt;
  }
}

function markThreadUnread(thread) {
  if (!thread || !thread.id) {
    return;
  }

  const readState = loadThreadReadState();
  const hadReadState = Boolean(readState[thread.id]);
  const alreadyForcedUnread = Array.isArray(state.forcedUnreadThreadIds) && state.forcedUnreadThreadIds.includes(thread.id);

  if (!hadReadState && alreadyForcedUnread && (thread.provider !== 'member' || !thread.lastReadAt)) {
    return;
  }

  delete readState[thread.id];
  persistThreadReadState(readState);
  state.forcedUnreadThreadIds = Array.from(new Set([...(state.forcedUnreadThreadIds || []).map(String), String(thread.id)]));
  persistForcedUnreadThreadIds(state.forcedUnreadThreadIds);
  queueRemoteMessageStateSync();

  if (thread.provider === 'member') {
    thread.lastReadAt = '';
  }
}

function isThreadUnread(thread) {
  if (!thread || !thread.id) {
    return false;
  }

  if (Array.isArray(state.forcedUnreadThreadIds) && state.forcedUnreadThreadIds.includes(thread.id)) {
    return true;
  }

  const readState = loadThreadReadState();
  const localSeenAt = String(readState[thread.id] || '').trim();
  const seenAt = thread.provider === 'member'
    ? [String(thread.lastReadAt || '').trim(), localSeenAt]
        .filter(Boolean)
        .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] || ''
    : localSeenAt;
  const latestActivityAt = getThreadReadTimestamp(thread);

  if (!seenAt) {
    return latestActivityAt !== thread.createdAt && hasIncomingThreadActivity(thread);
  }

  return hasIncomingThreadActivity(thread) && new Date(latestActivityAt).getTime() > new Date(seenAt).getTime();
}

function getUnreadThreadCount() {
  return state.threads.filter((thread) => !isThreadMuted(thread.id) && isThreadUnread(thread)).length;
}

function hasIncomingThreadActivity(thread) {
  const latest = thread && Array.isArray(thread.messages) ? thread.messages[thread.messages.length - 1] : null;
  return Boolean(latest && !isCurrentActorId(latest.senderActorId));
}

function getThreadReadTimestamp(thread) {
  const latest = thread && Array.isArray(thread.messages) ? thread.messages[thread.messages.length - 1] : null;
  return String((latest && latest.createdAt) || thread.updatedAt || thread.createdAt || new Date().toISOString());
}

function getPostShareCount(postId) {
  const entry = state.sharedPosts[String(postId || '')];
  return Math.max(0, Number(entry && entry.count ? entry.count : 0));
}

function rememberSharedPost(postId) {
  const key = String(postId || '').trim();

  if (!key) {
    return;
  }

  const current = state.sharedPosts[key] && typeof state.sharedPosts[key] === 'object'
    ? state.sharedPosts[key]
    : { count: 0, lastSharedAt: '' };

  state.sharedPosts[key] = {
    count: Math.max(0, Number(current.count || 0) + 1),
    lastSharedAt: new Date().toISOString()
  };

  persistSharedPosts();
}

function getNotificationItems() {
  const items = [
    ...getThreadNotificationItems(),
    ...getCommentNotificationItems(),
    ...getLikeNotificationItems(),
    ...getShareNotificationItems()
  ];

  return items
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 18);
}

function getThreadNotificationItems() {
  return state.threads
    .map((thread) => {
      if (isThreadMuted(thread.id)) {
        return null;
      }

      const latest = Array.isArray(thread.messages) ? thread.messages[thread.messages.length - 1] : null;

      if (!latest || isCurrentActorId(latest.senderActorId)) {
        return null;
      }

      return {
        id: `thread:${thread.id}:${latest.id}`,
        type: 'message',
        threadId: thread.id,
        avatar: thread.contact.avatar || getInitials(thread.contact.displayName || 'UC'),
        photoUrl: thread.contact.photoUrl || '',
        kindLabel: 'Usapp Chats',
        title: `${thread.contact.displayName} messaged you`,
        text: getMessageThreadPreview(thread),
        timeLabel: formatRelativeTime(latest.createdAt || thread.updatedAt),
        createdAt: latest.createdAt || thread.updatedAt,
        unread: isThreadUnread(thread)
      };
    })
    .filter(Boolean);
}

function getCommentNotificationItems() {
  const hasSeenBaseline = Boolean(state.notificationSeenAt);

  return state.posts
    .filter((post) => String(post.actorId || '') === state.actorId)
    .flatMap((post) => flattenCommentsForNotifications(getPostComments(post)).map((comment) => ({ post, comment })))
    .filter(({ comment }) => String(comment.actorId || '') !== state.actorId)
    .map(({ post, comment }) => ({
      id: `comment:${post.id}:${comment.id}`,
      type: 'comment',
      postId: post.id,
      openComments: true,
      avatar: comment.avatar || getInitials(comment.authorName || 'SE'),
      photoUrl: comment.photoUrl || '',
      kindLabel: 'Comment',
      title: `${comment.authorName || 'SocialEra Member'} commented on your post`,
      text: comment.text || post.captionTitle || 'Opened the conversation on your post.',
      timeLabel: formatRelativeTime(comment.createdAt),
      createdAt: comment.createdAt,
      unread: hasSeenBaseline && new Date(comment.createdAt).getTime() > new Date(state.notificationSeenAt).getTime()
    }));
}

function getLikeNotificationItems() {
  const hasSeenBaseline = Boolean(state.notificationSeenAt);

  return state.posts
    .filter((post) => String(post.actorId || '') === state.actorId)
    .flatMap((post) => (Array.isArray(post.likeActors) ? post.likeActors : []).map((actor) => ({ post, actor })))
    .filter(({ actor }) => actor && String(actor.actorId || '') && String(actor.actorId || '') !== state.actorId)
    .map(({ post, actor }) => {
      const createdAt = String(actor.createdAt || actor.created_at || actor.reactedAt || actor.reacted_at || post.createdAt || '').trim();

      return {
        id: `like:${post.id}:${String(actor.actorId || '')}:${createdAt || 'unknown'}`,
        type: 'like',
        postId: post.id,
        openComments: false,
        avatar: actor.avatar || getInitials(actor.authorName || 'SE'),
        photoUrl: actor.photoUrl || '',
        kindLabel: 'Like',
        title: `${actor.authorName || 'SocialEra Member'} liked your post`,
        text: post.captionTitle || post.captionText || 'Someone liked your post.',
        timeLabel: formatRelativeTime(createdAt),
        createdAt,
        unread: hasSeenBaseline && createdAt ? new Date(createdAt).getTime() > new Date(state.notificationSeenAt).getTime() : false
      };
    });
}

function getShareNotificationItems() {
  const hasSeenBaseline = Boolean(state.notificationSeenAt);

  return Object.entries(state.sharedPosts)
    .map(([postId, entry]) => {
      const post = findPostById(postId);
      const createdAt = String(entry && entry.lastSharedAt ? entry.lastSharedAt : '').trim();

      if (!post || !createdAt) {
        return null;
      }

      return {
        id: `share:${postId}:${createdAt}`,
        type: 'share',
        postId,
        openComments: false,
        avatar: state.profile.avatar,
        photoUrl: state.profile.photoUrl || '',
        kindLabel: 'Shared',
        title: `You shared ${post.captionTitle}`,
        text: `${formatCompactNumber(Number(entry.count || 0))} share${Number(entry.count || 0) === 1 ? '' : 's'} from this device`,
        timeLabel: formatRelativeTime(createdAt),
        createdAt,
        unread: hasSeenBaseline && new Date(createdAt).getTime() > new Date(state.notificationSeenAt).getTime()
      };
    })
    .filter(Boolean);
}

function flattenCommentsForNotifications(comments) {
  const flattened = [];

  const visit = (items) => {
    (Array.isArray(items) ? items : []).forEach((comment) => {
      flattened.push(comment);
      visit(comment.replies);
    });
  };

  visit(comments);
  return flattened;
}

function getMessageReadyStatus() {
  if (state.authUser) {
    return 'Your member chats are ready.';
  }

  return 'Sign in to use Usapp.';
}

function getMessageStatusCopy() {
  return state.messageStatus || '';
}

function setMessageStatus(message = '', type = 'info') {
  const nextMessage = String(message || '').trim();
  state.messageStatus = nextMessage;
  state.messageStatusType = nextMessage ? String(type || 'info').trim().toLowerCase() || 'info' : '';
}

function clearMessageStatus() {
  state.messageStatus = '';
  state.messageStatusType = '';
}

function getUsappLoadErrorMessage(scope, error) {
  const normalizedScope = scope === 'people' ? 'people' : 'chats';
  const message = String(error && error.message ? error.message : '').trim();

  if (isSupabaseAuthRequiredError(error) || /session expired|sign in again/i.test(message)) {
    return 'Sign in again to load your member chats.';
  }

  if (/failed to fetch|networkerror|network request failed|load failed/i.test(message)) {
    return normalizedScope === 'people'
      ? 'Could not load people. Check your connection and refresh.'
      : 'Could not load chats. Check your connection and refresh.';
  }

  return normalizedScope === 'people'
    ? 'Could not load people right now.'
    : 'Could not load chats right now.';
}

function updateUsappLoadStatus({ contactResult = null, threadResult = null } = {}) {
  const contactError = contactResult && contactResult.status === 'rejected'
    ? contactResult.reason
    : null;
  const threadError = threadResult && threadResult.status === 'rejected'
    ? threadResult.reason
    : null;

  if (threadError) {
    setMessageStatus(getUsappLoadErrorMessage('chats', threadError), 'error');
    return;
  }

  if (contactError) {
    setMessageStatus(getUsappLoadErrorMessage('people', contactError), 'error');
    return;
  }

  if (state.authUser && !state.contacts.length && !state.threads.length) {
    setMessageStatus('No chats or people yet.', 'info');
    return;
  }

  clearMessageStatus();
}

function getVisibleMessageContacts() {
  return state.contacts.filter((contact) => matchesMessageSearch(contact));
}

function getVisibleMessageThreads() {
  return state.threads
    .filter((thread) => matchesMessageSearch(thread.contact, getMessageThreadPreview(thread)))
    .sort((left, right) => {
      const leftMuted = isThreadMuted(left.id) ? 1 : 0;
      const rightMuted = isThreadMuted(right.id) ? 1 : 0;

      if (leftMuted !== rightMuted) {
        return leftMuted - rightMuted;
      }

      const leftUnread = isThreadUnread(left) ? 1 : 0;
      const rightUnread = isThreadUnread(right) ? 1 : 0;

      if (leftUnread !== rightUnread) {
        return rightUnread - leftUnread;
      }

      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });
}

function matchesMessageSearch(entity, extraText = '') {
  const query = String(state.messageSearchQuery || '').trim().toLowerCase();

  if (!query) {
    return true;
  }

  const haystack = [
    entity && entity.displayName,
    entity && entity.userName,
    entity && entity.intro,
    entity && entity.topic,
    extraText
  ].join(' ').toLowerCase();

  return haystack.includes(query);
}

function getContactProvider(contact) {
  return String(contact && contact.provider ? contact.provider : 'local').trim() || 'local';
}

function isMemberMessageContact(contact) {
  return Boolean(contact && (contact.provider === 'member' || contact.role === 'member'));
}

function getRoleSlug(contact) {
  return String(contact && contact.role ? contact.role : 'creator').trim().toLowerCase();
}

function getMessageRoleLabel(contact) {
  if (isMemberMessageContact(contact)) {
    return 'Member';
  }

  if (contact && contact.role === 'support') {
    return 'Support';
  }

  return 'Creator';
}

function getMessageChatModeLabel(contact) {
  if (isMemberMessageContact(contact)) {
    return 'Direct chat';
  }

  if (contact && contact.role === 'support') {
    return 'Help desk';
  }

  if (contact && contact.role === 'creator' && contact.sourcePostId) {
    return 'Post chat';
  }

  return 'Creator chat';
}

function getMessageComposerPlaceholder(contact) {
  if (!contact) {
    return 'Write a message...';
  }

  if (isMemberMessageContact(contact)) {
    return `Message ${contact.displayName || 'member'}...`;
  }

  if (contact.role === 'support') {
    return 'Message support...';
  }

  return 'Message creator...';
}

function getMessageAttachmentLabel(attachment, { sentence = false } = {}) {
  if (!attachment) {
    return sentence ? 'an attachment' : 'Attachment';
  }

  if (attachment.kind === 'image') {
    return sentence ? 'a photo' : 'Photo';
  }

  if (attachment.kind === 'audio') {
    return sentence ? 'a voice note' : 'Voice note';
  }

  return sentence
    ? String(attachment.name || 'a file')
    : String(attachment.name || 'Attachment');
}

function getMessageThreadPreview(thread) {
  const lastMessage = Array.isArray(thread && thread.messages) && thread.messages.length
    ? thread.messages[thread.messages.length - 1]
    : null;

  if (lastMessage && lastMessage.text) {
    return lastMessage.text;
  }

  if (lastMessage && Array.isArray(lastMessage.attachments) && lastMessage.attachments.length) {
    const firstAttachment = lastMessage.attachments[0];
    return `Sent ${getMessageAttachmentLabel(firstAttachment, { sentence: true })}`;
  }

  return thread && thread.contact && thread.contact.intro
    ? thread.contact.intro
    : 'Start the conversation here.';
}

function getReplyPreviewText(message) {
  if (!message) {
    return '';
  }

  const text = String(message.text || '').trim();

  if (text) {
    return text.length > 90 ? `${text.slice(0, 87)}...` : text;
  }

  if (Array.isArray(message.attachments) && message.attachments.length) {
    return getMessageAttachmentLabel(message.attachments[0]);
  }

  return 'Message';
}

function getMessageReplyContext(thread, messageId = state.messageReplyToMessageId) {
  if (!thread || !messageId || (state.messageReplyThreadId && state.messageReplyThreadId !== thread.id)) {
    return null;
  }

  const message = Array.isArray(thread.messages)
    ? thread.messages.find((entry) => entry.id === messageId)
    : null;

  if (!message) {
    return null;
  }

  return {
    messageId: message.id,
    authorName: isCurrentActorId(message.senderActorId) ? 'You' : (message.authorName || thread.contact.displayName || 'SocialEra Member'),
    previewText: getReplyPreviewText(message)
  };
}

function renderMessageReplyPreview(thread) {
  const replyContext = getMessageReplyContext(thread);

  if (!replyContext) {
    return '';
  }

  return `
    <div class="usapp-reply-preview">
      <div class="usapp-reply-preview-copy">
        <span>Replying to ${escapeHtml(replyContext.authorName)}</span>
        <strong>${escapeHtml(replyContext.previewText)}</strong>
      </div>
      <button class="ghost-button usapp-reply-clear" type="button" data-clear-message-reply="true">Clear</button>
    </div>
  `;
}

function renderMessageReplyQuote(message) {
  if (!message || !message.replyPreviewText) {
    return '';
  }

  return `
    <div class="usapp-reply-quote">
      <span>${escapeHtml(message.replyPreviewAuthor || 'Reply')}</span>
      <strong>${escapeHtml(message.replyPreviewText)}</strong>
    </div>
  `;
}

function applyReplyContextToThread(thread, text, replyContext) {
  if (!thread || !replyContext || !Array.isArray(thread.messages) || !thread.messages.length) {
    return thread;
  }

  const replyMeta = {
    replyToMessageId: replyContext.messageId,
    replyPreviewAuthor: replyContext.authorName,
    replyPreviewText: replyContext.previewText
  };
  const nextMessages = [...thread.messages];

  for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
    const message = nextMessages[index];

    if (!isCurrentActorId(message.senderActorId)) {
      continue;
    }

    if (text && String(message.text || '').trim() !== text) {
      continue;
    }

    nextMessages[index] = {
      ...message,
      ...replyMeta
    };

    persistMessageReplyDecoration(thread, nextMessages[index]);

    return {
      ...thread,
      messages: nextMessages
    };
  }

  return thread;
}

function getEntityPhotoUrl(entity) {
  if (!entity || typeof entity !== 'object') {
    return '';
  }

  const directPhoto = normalizeProfilePhotoValue(entity.photoUrl || entity.photo_url);

  if (directPhoto) {
    return directPhoto;
  }

  const actorId = String(entity.actorId || entity.senderActorId || '').trim();
  const userId = String(entity.userId || entity.senderUserId || '').trim();

  if ((actorId && isCurrentActorId(actorId)) || (userId && state.authUser && userId === String(state.authUser.id))) {
    return normalizeProfilePhotoValue(state.profile.photoUrl);
  }

  return '';
}

function renderAvatarMedia(entity) {
  const photoUrl = resolveMediaUrl(getEntityPhotoUrl(entity));
  const label = entity && typeof entity === 'object'
    ? (entity.displayName || entity.authorName || entity.title || 'SocialEra contact')
    : 'SocialEra contact';

  return photoUrl
    ? `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(label)}">`
    : escapeHtml(String(entity && entity.avatar ? entity.avatar : getInitials(label)).slice(0, 2).toUpperCase());
}

function renderAvatarShell(entity, className = 'avatar', tagName = 'div') {
  return `<${tagName} class="${escapeHtml(className)}">${renderAvatarMedia(entity)}</${tagName}>`;
}

function renderPendingMessageAttachment() {
  const attachment = state.pendingMessageAttachment;

  if (!attachment) {
    return '';
  }

  return `
    <div class="usapp-attachment-preview">
      <div class="usapp-attachment-chip">
        <div class="usapp-attachment-chip-meta">
          <strong>${escapeHtml(attachment.kind === 'audio' ? 'Voice note' : attachment.name)}</strong>
          <span>${escapeHtml(formatFileSize(attachment.size))}</span>
        </div>
        <button class="ghost-button usapp-attachment-remove" type="button" data-message-attachment-remove="true">Remove</button>
      </div>
    </div>
  `;
}

function renderMessageAttachment(attachment) {
  if (!attachment) {
    return '';
  }

  if (attachment.kind === 'image') {
    return `
      <a class="message-attachment media" href="${escapeHtml(attachment.dataUrl)}" target="_blank" rel="noreferrer">
        <img src="${escapeHtml(attachment.dataUrl)}" alt="${escapeHtml(attachment.name || 'Attachment')}">
      </a>
    `;
  }

  if (attachment.kind === 'audio') {
    return `
      <div class="message-attachment audio">
        <div class="message-attachment-audio-label">Voice note</div>
        <audio controls preload="metadata" src="${escapeHtml(attachment.dataUrl)}"></audio>
      </div>
    `;
  }

  return `
    <a class="message-attachment file" href="${escapeHtml(attachment.dataUrl)}" download="${escapeHtml(attachment.name || 'attachment')}">
      <div class="message-attachment-file-icon">FILE</div>
      <div class="message-attachment-file-meta">
        <strong>${escapeHtml(attachment.name || 'Attachment')}</strong>
        <span>${escapeHtml(formatFileSize(attachment.size))}</span>
      </div>
    </a>
  `;
}

function renderMessageReactionSummary(message) {
  const reactions = Array.isArray(message && message.reactions)
    ? message.reactions.filter((reaction) => reaction && reaction.emoji && Array.isArray(reaction.actorIds) && reaction.actorIds.length)
    : [];

  if (!reactions.length) {
    return '';
  }

  return `
    <div class="usapp-reaction-row has-reactions">
      ${reactions.map((reaction) => `
        <button
          class="usapp-reaction-pill ${reaction.actorIds.some((actorId) => isCurrentActorId(actorId)) ? 'active' : ''}"
          type="button"
          data-message-reaction="${escapeHtml(message.id)}"
          data-emoji="${escapeHtml(reaction.emoji)}"
        >
          <span>${escapeHtml(reaction.emoji)}</span>
          <strong>${escapeHtml(String(reaction.actorIds.length))}</strong>
        </button>
      `).join('')}
    </div>
  `;
}

function renderMessageBubbleAction(message) {
  const isOpen = state.reactionPickerMessageId === message.id;

  if (!isOpen) {
    return '';
  }

  return `
    <div class="usapp-reaction-picker" data-message-reaction-picker="${escapeHtml(message.id)}">
      ${MESSAGE_REACTION_EMOJIS.map((emoji) => `
        <button
          class="usapp-reaction-option"
          type="button"
          data-message-reaction-option="${escapeHtml(message.id)}"
          data-emoji="${escapeHtml(emoji)}"
        >
          ${escapeHtml(emoji)}
        </button>
      `).join('')}
    </div>
  `;
}

function insertEmojiIntoMessageDraft(emoji) {
  if (!emoji) {
    return;
  }

  state.messageDraftText = `${state.messageDraftText || ''}${emoji}`.slice(0, 2000);
  state.composerEmojiOpen = false;
  refreshMessagingUi();
}

function clearPendingMessageAttachment() {
  state.pendingMessageAttachment = null;
  refreshMessagingUi();
}

function queryUsappElement(selector) {
  if (elements.usappSheetRoot) {
    const sheetMatch = elements.usappSheetRoot.querySelector(selector);
    if (sheetMatch) {
      return sheetMatch;
    }
  }

  return elements.viewRoot ? elements.viewRoot.querySelector(selector) : null;
}

function getUsappThreadScrollSnapshot() {
  const messageList = queryUsappElement('.usapp-message-list');

  if (!messageList) {
    return null;
  }

  const messageRows = Array.from(messageList.querySelectorAll('[data-message-bubble]'));
  const listBounds = messageList.getBoundingClientRect();
  const anchorRow = messageRows.find((row) => row.getBoundingClientRect().bottom > listBounds.top + 12) || messageRows[0] || null;

  return {
    top: Number(messageList.scrollTop || 0),
    height: Number(messageList.scrollHeight || 0),
    anchorMessageId: anchorRow ? String(anchorRow.dataset.messageBubble || '') : '',
    anchorOffset: anchorRow ? Math.max(0, anchorRow.getBoundingClientRect().top - listBounds.top) : 0
  };
}

function restoreUsappThreadScroll(snapshot) {
  if (!snapshot) {
    return;
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const messageList = queryUsappElement('.usapp-message-list');

      if (!messageList) {
        return;
      }

      const maxScrollTop = Math.max(0, messageList.scrollHeight - messageList.clientHeight);
      const anchorRow = snapshot.anchorMessageId
        ? Array.from(messageList.querySelectorAll('[data-message-bubble]')).find((row) => row.dataset.messageBubble === snapshot.anchorMessageId)
        : null;
      const anchorScrollTop = anchorRow
        ? Math.max(0, Number(anchorRow.offsetTop || 0) - Number(snapshot.anchorOffset || 0))
        : Number(snapshot.top || 0);
      const nextScrollTop = Math.max(0, Math.min(anchorScrollTop, maxScrollTop));
      messageList.scrollTop = nextScrollTop;
    });
  });
}

function scrollUsappThreadToLatest({ behavior = 'auto' } = {}) {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const messageList = queryUsappElement('.usapp-message-list');

      if (!messageList) {
        return;
      }

      const prefersReducedMotion = typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (typeof messageList.scrollTo === 'function') {
        messageList.scrollTo({
          top: messageList.scrollHeight,
          behavior: prefersReducedMotion ? 'auto' : behavior
        });
        return;
      }

      messageList.scrollTop = messageList.scrollHeight;
    });
  });
}

function syncMessageComposerMeta() {
  const counter = queryUsappElement('[data-message-counter]');

  if (counter) {
    counter.textContent = `${state.messageDraftText.length} / 2000`;
  }
}

function findSuggestedProducts(post, { limit = 2 } = {}) {
  if (!post) {
    return [];
  }

  const normalizedLimit = Math.max(0, Number(limit || 0) || 0);

  if (!normalizedLimit) {
    return [];
  }

  const selected = [];
  const seen = new Set();
  const linkedProducts = Array.isArray(post.linkedProductIds)
    ? post.linkedProductIds
        .map((id) => state.products.find((product) => String(product.id) === String(id)))
        .filter(Boolean)
    : [];

  linkedProducts.forEach((product) => {
    const key = String(product.id);

    if (seen.has(key) || selected.length >= normalizedLimit) {
      return;
    }

    seen.add(key);
    selected.push(product);
  });

  if (!hasPostMedia(post) && !selected.length) {
    return [];
  }

  const tags = new Set(
    [post.channel, ...(Array.isArray(post.tags) ? post.tags : [])]
      .map((tag) => String(tag || '').trim().toLowerCase())
      .filter(Boolean)
  );

  state.products.forEach((product) => {
    const key = String(product.id);
    const category = String(product.category || '').trim().toLowerCase();

    if (selected.length >= normalizedLimit || seen.has(key) || !tags.has(category)) {
      return;
    }

    seen.add(key);
    selected.push(product);
  });

  if (selected.length >= normalizedLimit || !hasPostMedia(post)) {
    return selected.slice(0, normalizedLimit);
  }

  const fallbackSource = state.products.filter((product) => product.featured);
  const fallbackProducts = fallbackSource.length ? fallbackSource : state.products;

  fallbackProducts.forEach((product) => {
    const key = String(product.id);

    if (selected.length >= normalizedLimit || seen.has(key)) {
      return;
    }

    seen.add(key);
    selected.push(product);
  });

  return selected.slice(0, normalizedLimit);
}

function hasActor(actorIds) {
  return Array.isArray(actorIds) && actorIds.includes(state.actorId);
}

function toggleActor(actorIds, actorId, currentlyActive) {
  const next = Array.isArray(actorIds) ? [...actorIds] : [];
  const index = next.indexOf(actorId);

  if (currentlyActive && index !== -1) {
    next.splice(index, 1);
  }

  if (!currentlyActive && index === -1) {
    next.push(actorId);
  }

  return next;
}

async function loadSocialFeedPosts() {
  try {
    const payload = await apiService.fetchJson('/social/posts', { omitAuth: true });
    const normalizedPosts = normalizePosts(payload);

    if (normalizedPosts.length || !Array.isArray(payload)) {
      return normalizedPosts;
    }

    const backendOrigin = String(APP_CONFIG.backendOrigin || '').trim();

    if (!backendOrigin) {
      return normalizedPosts;
    }

    console.warn('Social feed proxy returned an empty list. Retrying directly against the backend origin.');
    const backendPayload = await apiService.fetchBackendJson('/social/posts', { omitAuth: true });
    const backendPosts = normalizePosts(backendPayload);

    return backendPosts.length ? backendPosts : normalizedPosts;
  } catch (apiError) {
    console.warn('Falling back to Supabase social posts for the mobile app:', apiError);

    try {
      const backendPayload = await apiService.fetchBackendJson('/social/posts', { omitAuth: true });
      const backendPosts = normalizePosts(backendPayload);

      if (backendPosts.length) {
        return backendPosts;
      }
    } catch (backendError) {
      console.warn('Direct backend social feed retry failed for the mobile app:', backendError);
    }

    const supabasePosts = await fetchSocialPostsFromSupabase();
    return supabasePosts;
  }
}

async function fetchSocialPostsFromSupabase() {
  if (!supabaseClient || typeof supabaseClient.from !== 'function') {
    throw new Error('Supabase social posts are unavailable.');
  }

  const postsResult = await supabaseClient
    .from('social_posts')
    .select('*')
    .order('created_at', { ascending: false });

  if (postsResult.error) {
    throw postsResult.error;
  }

  const commentsResult = await supabaseClient
    .from('social_post_comments')
    .select('*')
    .order('created_at', { ascending: true });

  if (commentsResult.error) {
    throw commentsResult.error;
  }

  const commentsByPostId = new Map();

  (Array.isArray(commentsResult.data) ? commentsResult.data : []).forEach((comment) => {
    const mapped = mapSupabaseCommentRecord(comment);

    if (!mapped.postId) {
      return;
    }

    if (!commentsByPostId.has(mapped.postId)) {
      commentsByPostId.set(mapped.postId, []);
    }

    commentsByPostId.get(mapped.postId).push(mapped);
  });

  return normalizePosts(
    (Array.isArray(postsResult.data) ? postsResult.data : []).map((post) => {
      const postId = String(post && post.id ? post.id : '');
      return mapSupabasePostRecord(post, commentsByPostId.get(postId) || []);
    })
  );
}

function mapSupabaseCommentRecord(comment) {
  return {
    id: String(comment && comment.id ? comment.id : '').trim(),
    postId: String(comment && (comment.postId || comment.post_id) ? comment.postId || comment.post_id : '').trim(),
    parentCommentId: String(comment && (comment.parentCommentId || comment.parent_comment_id) ? comment.parentCommentId || comment.parent_comment_id : '').trim(),
    actorId: String(comment && (comment.actorId || comment.actor_id) ? comment.actorId || comment.actor_id : '').trim(),
    userId: String(comment && (comment.userId || comment.user_id) ? comment.userId || comment.user_id : '').trim(),
    authorName: String(comment && (comment.authorName || comment.author_name) ? comment.authorName || comment.author_name : 'SocialEra Member').trim() || 'SocialEra Member',
    userName: normalizeUserName(comment && (comment.userName || comment.user_name) ? comment.userName || comment.user_name : '@socialera.member'),
    avatar: getInitials(comment && (comment.avatar || comment.authorName || comment.author_name) ? comment.avatar || comment.authorName || comment.author_name : 'SE'),
    photoUrl: String(comment && (comment.photoUrl || comment.photo_url) ? comment.photoUrl || comment.photo_url : '').trim(),
    text: String(comment && (comment.text || comment.body) ? comment.text || comment.body : '').trim(),
    likes: Number(comment && (comment.likes ?? comment.likesCount ?? comment.likes_count) ? comment.likes ?? comment.likesCount ?? comment.likes_count : 0),
    likeActorIds: Array.isArray(comment && (comment.likeActorIds || comment.like_actor_ids)) ? (comment.likeActorIds || comment.like_actor_ids).map(String) : [],
    likeActors: Array.isArray(comment && (comment.likeActors || comment.like_actors)) ? (comment.likeActors || comment.like_actors).map(normalizeCommentActor).filter(Boolean) : [],
    createdAt: String(comment && (comment.createdAt || comment.created_at) ? comment.createdAt || comment.created_at : new Date().toISOString()),
    replies: []
  };
}

function mapSupabasePostRecord(post, comments) {
  const commentsData = nestSupabaseComments(comments);

  return {
    id: String(post && post.id ? post.id : ''),
    actorId: String(post && (post.actorId || post.actor_id) ? post.actorId || post.actor_id : '').trim(),
    userId: String(post && (post.userId || post.user_id) ? post.userId || post.user_id : '').trim(),
    channel: String(post && post.channel ? post.channel : 'all').trim() || 'all',
    userName: normalizeUserName(post && (post.userName || post.user_name) ? post.userName || post.user_name : '@socialera.member'),
    displayName: String(post && (post.displayName || post.display_name) ? post.displayName || post.display_name : 'SocialEra Member').trim() || 'SocialEra Member',
    avatar: getInitials(post && (post.avatar || post.displayName || post.display_name) ? post.avatar || post.displayName || post.display_name : 'SE'),
    photoUrl: String(post && (post.photoUrl || post.photo_url) ? post.photoUrl || post.photo_url : '').trim(),
    mediaType: String(post && (post.mediaType || post.media_type) ? post.mediaType || post.media_type : 'image').trim() || 'image',
    mediaUrl: String(post && (post.mediaUrl || post.media_url) ? post.mediaUrl || post.media_url : '').trim(),
    captionTitle: String(post && (post.captionTitle || post.caption_title) ? post.captionTitle || post.caption_title : '').trim(),
    captionText: String(post && (post.captionText || post.caption_text) ? post.captionText || post.caption_text : '').trim(),
    tags: Array.isArray(post && post.tags) ? post.tags.map((tag) => String(tag || '').trim()).filter(Boolean) : [],
    linkedProductIds: Array.isArray(post && (post.linkedProductIds || post.linked_product_ids)) ? (post.linkedProductIds || post.linked_product_ids).map(String) : [],
    promoteEnabled: Boolean(post && (post.promoteEnabled || post.promote_enabled)),
    promotedTitle: String(post && (post.promotedTitle || post.promoted_title) ? post.promotedTitle || post.promoted_title : '').trim(),
    promotedPrice: String(post && (post.promotedPrice || post.promoted_price) ? post.promotedPrice || post.promoted_price : '').trim(),
    promotedText: String(post && (post.promotedText || post.promoted_text) ? post.promotedText || post.promoted_text : '').trim(),
    likes: Number(post && (post.likes ?? post.likesCount ?? post.likes_count) ? post.likes ?? post.likesCount ?? post.likes_count : 0),
    commentsCount: Number(post && (post.commentsCount ?? post.comments ?? post.comments_count) ? post.commentsCount ?? post.comments ?? post.comments_count : countCommentTree(commentsData)),
    saves: Number(post && (post.saves ?? post.savesCount ?? post.saves_count) ? post.saves ?? post.savesCount ?? post.saves_count : 0),
    createdAt: String(post && (post.createdAt || post.created_at) ? post.createdAt || post.created_at : new Date().toISOString()),
    likeActorIds: Array.isArray(post && (post.likeActorIds || post.like_actor_ids)) ? (post.likeActorIds || post.like_actor_ids).map(String) : [],
    likeActors: Array.isArray(post && (post.likeActors || post.like_actors)) ? (post.likeActors || post.like_actors).map(normalizeCommentActor).filter(Boolean) : [],
    saveActorIds: Array.isArray(post && (post.saveActorIds || post.save_actor_ids)) ? (post.saveActorIds || post.save_actor_ids).map(String) : [],
    commentsData
  };
}

function nestSupabaseComments(comments) {
  const normalizedComments = (Array.isArray(comments) ? comments : [])
    .filter((comment) => comment && comment.id)
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
    .map((comment) => ({
      ...comment,
      replies: []
    }));

  const commentMap = new Map();
  const roots = [];

  normalizedComments.forEach((comment) => {
    commentMap.set(comment.id, comment);
  });

  normalizedComments.forEach((comment) => {
    if (comment.parentCommentId && commentMap.has(comment.parentCommentId)) {
      commentMap.get(comment.parentCommentId).replies.push(comment);
      return;
    }

    roots.push(comment);
  });

  return roots;
}

function updatePostInstances(postId, updater) {
  [state.posts, state.localPosts].forEach((collection) => {
    collection.forEach((post) => {
      if (post.id === postId) {
        updater(post);
      }
    });
  });
}

function applyCommentResponse(postId, payload = {}) {
  const nextComments = Array.isArray(payload.comments) ? normalizeComments(payload.comments) : null;
  const nextPreview = Array.isArray(payload.commentPreview) ? normalizeComments(payload.commentPreview) : null;

  updatePostInstances(postId, (post) => {
    if (nextComments) {
      post.commentsData = nextComments;
      post.commentPreview = flattenRecentCommentsLocal(nextComments, 3);
      post.commentsCount = countCommentTree(nextComments);
      return;
    }

    if (nextPreview) {
      post.commentPreview = nextPreview;
    }

    if (payload.commentsCount != null) {
      post.commentsCount = Number(payload.commentsCount || 0);
    }
  });
}

function applyLocalCommentInsert(postId, payload) {
  updatePostInstances(postId, (post) => {
    const nextComments = normalizeComments(getPostComments(post));
    const newComment = normalizeComment({
      ...payload,
      replies: [],
      likes: 0,
      likeActorIds: [],
      likeActors: []
    });

    if (payload.parentCommentId) {
      const parentComment = findCommentByIdLocal(nextComments, payload.parentCommentId);

      if (parentComment) {
        parentComment.replies = Array.isArray(parentComment.replies) ? parentComment.replies : [];
        parentComment.replies.push(newComment);
      } else {
        nextComments.push(newComment);
      }
    } else {
      nextComments.push(newComment);
    }

    post.commentsData = nextComments;
    post.commentPreview = flattenRecentCommentsLocal(nextComments, 3);
    post.commentsCount = countCommentTree(nextComments);
  });
}

function toggleCommentReactionLocally(postId, commentId) {
  let updated = false;

  updatePostInstances(postId, (post) => {
    const nextComments = normalizeComments(getPostComments(post));
    const comment = findCommentByIdLocal(nextComments, commentId);

    if (!comment) {
      return;
    }

    comment.likeActorIds = Array.isArray(comment.likeActorIds) ? [...comment.likeActorIds] : [];
    comment.likeActors = Array.isArray(comment.likeActors) ? [...comment.likeActors] : [];

    const likeIndex = comment.likeActorIds.indexOf(state.actorId);
    const actorIndex = comment.likeActors.findIndex((entry) => entry.actorId === state.actorId);

    if (likeIndex === -1) {
      comment.likeActorIds.push(state.actorId);
      comment.likeActors.unshift({
        actorId: state.actorId,
        authorName: state.profile.displayName,
        userName: state.profile.userName,
        avatar: state.profile.avatar,
        photoUrl: state.profile.photoUrl
      });
      comment.likes = Number(comment.likes || 0) + 1;
    } else {
      comment.likeActorIds.splice(likeIndex, 1);
      if (actorIndex !== -1) {
        comment.likeActors.splice(actorIndex, 1);
      }
      comment.likes = Math.max(0, Number(comment.likes || 0) - 1);
    }

    post.commentsData = nextComments;
    post.commentPreview = flattenRecentCommentsLocal(nextComments, 3);
    post.commentsCount = countCommentTree(nextComments);
    updated = true;
  });

  return updated;
}

function findCommentByIdLocal(comments, commentId) {
  for (const comment of Array.isArray(comments) ? comments : []) {
    if (comment.id === commentId) {
      return comment;
    }

    const nested = findCommentByIdLocal(comment.replies, commentId);

    if (nested) {
      return nested;
    }
  }

  return null;
}

function flattenRecentCommentsLocal(comments, limit = 3) {
  const flattened = [];

  const visit = (items) => {
    (Array.isArray(items) ? items : []).forEach((comment) => {
      flattened.push(normalizeComment(comment));
      visit(comment.replies);
    });
  };

  visit(comments);
  return flattened.slice(-limit);
}

function countCommentTree(comments) {
  return (Array.isArray(comments) ? comments : []).reduce((total, comment) => {
    return total + 1 + countCommentTree(comment.replies);
  }, 0);
}

function normalizePosts(payload) {
  if (!Array.isArray(payload)) {
    return [];
  }

  const normalizedPosts = [];

  payload.forEach((post, index) => {
    try {
      const normalizedPost = normalizePost(post);

      if (normalizedPost) {
        normalizedPosts.push(normalizedPost);
      }
    } catch (error) {
      console.error('Skipping malformed social post while normalizing feed:', {
        index,
        postId: post && post.id ? post.id : '',
        error
      });
    }
  });

  return normalizedPosts;
}

function normalizePost(post) {
  const commentsData = normalizeComments(
    Array.isArray(post.commentsData)
      ? post.commentsData
      : Array.isArray(post.comments)
        ? post.comments
        : []
  );
  const commentPreview = normalizeComments(
    Array.isArray(post.commentPreview) && post.commentPreview.length
      ? post.commentPreview
      : flattenRecentCommentsLocal(commentsData, 3)
  );
  const authoredByCurrentUser = (
    (String(post.actorId || '').trim() && String(post.actorId || '').trim() === state.actorId)
    || (String(post.userId || '').trim() && state.authUser && String(post.userId || '').trim() === String(state.authUser.id || '').trim())
  );
  const authoredDisplayName = authoredByCurrentUser ? String(state.profile.displayName || '').trim() : '';
  const authoredUserName = authoredByCurrentUser ? normalizeUserName(state.profile.userName) : '';
  const authoredPhotoUrl = authoredByCurrentUser ? normalizeProfilePhotoValue(state.profile.photoUrl) : '';

  return {
    id: String(post.id || `post-${Date.now()}`),
    actorId: String(post.actorId || '').trim(),
    userId: String(post.userId || '').trim(),
    channel: String(post.channel || 'all').trim() || 'all',
    userName: authoredUserName || normalizeUserName(post.userName || '@socialera'),
    displayName: authoredDisplayName || String(post.displayName || 'SocialEra Member').trim() || 'SocialEra Member',
    avatar: getInitials((authoredDisplayName || '') || post.avatar || post.displayName || 'SE'),
    photoUrl: authoredPhotoUrl || String(post.photoUrl || post.photo_url || '').trim(),
    mediaType: String(post.mediaType || 'image').trim().toLowerCase() === 'video' ? 'video' : 'image',
    mediaUrl: String(post.mediaUrl || '').trim(),
    captionTitle: String(post.captionTitle || 'SocialEra update').trim() || 'SocialEra update',
    captionText: String(post.captionText || 'Fresh from the SocialEra app feed.').trim() || 'Fresh from the SocialEra app feed.',
    tags: Array.isArray(post.tags) ? post.tags.map((tag) => String(tag).trim()).filter(Boolean) : [],
    linkedProductIds: Array.isArray(post.linkedProductIds) ? post.linkedProductIds.map(String) : [],
    promoteEnabled: Boolean(post.promoteEnabled),
    promotedTitle: String(post.promotedTitle || '').trim(),
    promotedPrice: String(post.promotedPrice || '').trim(),
    promotedText: String(post.promotedText || '').trim(),
    likes: Number(post.likes || 0),
    commentsCount: Math.max(Number(post.commentsCount || 0), countCommentTree(commentsData)),
    saves: Number(post.saves || 0),
    createdAt: post.createdAt || new Date().toISOString(),
    likeActorIds: Array.isArray(post.likeActorIds) ? post.likeActorIds.map(String) : [],
    likeActors: Array.isArray(post.likeActors) ? post.likeActors.map(normalizeCommentActor).filter(Boolean) : [],
    saveActorIds: Array.isArray(post.saveActorIds) ? post.saveActorIds.map(String) : [],
    commentsData,
    commentPreview
  };
}

function normalizeComments(payload) {
  return Array.isArray(payload) ? payload.map(normalizeComment).filter(Boolean) : [];
}

function normalizeComment(comment) {
  if (!comment || typeof comment !== 'object') {
    return null;
  }

  const authoredByCurrentUser = (
    (String(comment.actorId || '').trim() && String(comment.actorId || '').trim() === state.actorId)
    || (String(comment.userId || '').trim() && state.authUser && String(comment.userId || '').trim() === String(state.authUser.id || '').trim())
  );
  const authoredDisplayName = authoredByCurrentUser ? String(state.profile.displayName || '').trim() : '';
  const authoredUserName = authoredByCurrentUser ? normalizeUserName(state.profile.userName) : '';
  const authoredPhotoUrl = authoredByCurrentUser ? normalizeProfilePhotoValue(state.profile.photoUrl) : '';

  return {
    id: String(comment.id || `comment-${Date.now()}`).trim() || `comment-${Date.now()}`,
    actorId: String(comment.actorId || '').trim(),
    userId: String(comment.userId || '').trim(),
    authorName: authoredDisplayName || String(comment.authorName || 'SocialEra Member').trim() || 'SocialEra Member',
    userName: authoredUserName || normalizeUserName(comment.userName || '@socialera.member'),
    avatar: getInitials((authoredDisplayName || '') || comment.avatar || comment.authorName || 'SE'),
    photoUrl: authoredPhotoUrl || String(comment.photoUrl || comment.photo_url || '').trim(),
    text: String(comment.text || '').trim(),
    createdAt: comment.createdAt || new Date().toISOString(),
    likes: Number(comment.likes || 0),
    likeActorIds: Array.isArray(comment.likeActorIds) ? comment.likeActorIds.map(String) : [],
    likeActors: Array.isArray(comment.likeActors) ? comment.likeActors.map(normalizeCommentActor).filter(Boolean) : [],
    replies: normalizeComments(comment.replies)
  };
}

function normalizeCommentActor(actor) {
  if (!actor || typeof actor !== 'object') {
    return null;
  }

  return {
    actorId: String(actor.actorId || '').trim(),
    authorName: String(actor.authorName || 'SocialEra Member').trim() || 'SocialEra Member',
    userName: normalizeUserName(actor.userName || '@socialera.member'),
    avatar: getInitials(actor.avatar || actor.authorName || 'SE'),
    photoUrl: String(actor.photoUrl || actor.photo_url || '').trim(),
    createdAt: String(actor.createdAt || actor.created_at || actor.reactedAt || actor.reacted_at || '').trim()
  };
}

function normalizeProducts(payload) {
  return Array.isArray(payload) ? payload.map(normalizeProduct) : [];
}

function normalizeProduct(product) {
  return {
    id: String(product.id || `product-${Date.now()}`),
    name: String(product.name || 'SocialEra product').trim() || 'SocialEra product',
    price: Number(product.price || 0),
    category: String(product.category || 'general').trim().toLowerCase() || 'general',
    image: String(product.image || '').trim(),
    stock: Number(product.stock || 0),
    featured: Boolean(product.featured),
    description: String(product.description || 'Curated directly from the SocialEra catalog.').trim() || 'Curated directly from the SocialEra catalog.'
  };
}

async function syncMessageProfile() {
  if (!state.authUser) {
    return null;
  }

  return apiService.fetchMessageJson('/messages/profiles/sync', {
    method: 'POST',
    body: JSON.stringify({
      actorId: getMessageActorId(),
      displayName: state.profile.displayName,
      userName: state.profile.userName,
      avatar: state.profile.avatar,
      photoUrl: state.profile.photoUrl
    })
  });
}

function isChatProfileRlsError(error) {
  const code = String(error && error.code ? error.code : '').trim();
  const message = String(error && error.message ? error.message : '').trim();

  return code === '42501' || /row-level security/i.test(message);
}

function isSupabaseAuthRequiredError(error) {
  const code = String(error && error.code ? error.code : '').trim();
  const message = String(error && error.message ? error.message : '').trim();

  return code === 'PGRST301'
    || /authentication required/i.test(message)
    || /jwt/i.test(message)
    || /not authenticated/i.test(message)
    || /sign in to /i.test(message);
}

function forceReauth(targetView = 'profile', message = 'Your app session expired. Sign in again to continue.') {
  state.authSession = null;
  state.authUser = null;
  state.actorId = state.deviceActorId;
  state.profile = { ...state.guestProfile };
  state.appearanceSettings = loadCachedAppearanceSettings(state.actorId, {
    themeFallback: loadTheme()
  });
  state.appearanceDraft = cloneAppearanceSettings(state.appearanceSettings);
  state.theme = state.appearanceSettings.theme;
  state.sharedPosts = loadSharedPosts(state.actorId);
  state.notificationSeenAt = loadNotificationSeenAt(state.actorId);
  state.forcedUnreadThreadIds = loadForcedUnreadThreadIds(state.actorId);
  state.mutedThreadIds = loadMutedThreadIds(state.actorId);
  state.messageReplyDecorations = loadMessageReplyDecorations(state.actorId);
  state.selectedThreadId = '';
  state.usappLiveConnected = false;
  resetLiveNotificationState();
  stopActivityAutoRefresh();
  syncUsappLiveStream();
  requestAuthAccess(targetView, message);
}

async function syncSupabaseMessageProfile() {
  const supabase = supabaseSessionService.getSupabaseClient();

  if (!supabase || !state.authUser || !state.authUser.id) {
    throw new Error('Supabase is not available for member chats.');
  }

  const result = await supabase
    .from('chat_profiles')
    .upsert({
      user_id: String(state.authUser.id),
      display_name: state.profile.displayName,
      username: String(state.profile.userName || '').replace(/^@+/, ''),
      avatar_url: state.profile.photoUrl || '',
      bio: ''
    }, {
      onConflict: 'user_id'
    })
    .select('user_id')
    .single();

  if (result.error) {
    if (isChatProfileRlsError(result.error)) {
      console.warn('Skipping chat profile sync because chat_profiles is blocked by RLS.', result.error);
      return null;
    }

    throw result.error;
  }

  return result.data;
}

async function loadSupabaseMessageContacts() {
  const supabase = supabaseSessionService.getSupabaseClient();

  if (!supabase || !state.authUser || !state.authUser.id) {
    throw new Error('Supabase is not available for member chats.');
  }

  const result = await supabase
    .from('chat_profiles')
    .select('user_id, display_name, username, avatar_url')
    .neq('user_id', String(state.authUser.id))
    .order('display_name', { ascending: true });

  if (result.error) {
    throw result.error;
  }

  return Array.isArray(result.data)
    ? result.data.map(normalizeSupabaseMessageContact).filter(Boolean)
    : [];
}

async function loadSupabaseMessageThreads(conversationIds = []) {
  const supabase = supabaseSessionService.getSupabaseClient();

  if (!supabase || !state.authUser || !state.authUser.id) {
    throw new Error('Supabase is not available for member chats.');
  }

  const requestedIds = Array.isArray(conversationIds)
    ? conversationIds.map((conversationId) => String(conversationId || '').trim()).filter(Boolean)
    : [];
  let membershipQuery = supabase
    .from('conversation_participants')
    .select('conversation_id, last_read_at')
    .eq('user_id', String(state.authUser.id));

  if (requestedIds.length) {
    membershipQuery = membershipQuery.in('conversation_id', requestedIds);
  }

  const membershipResult = await membershipQuery;

  if (membershipResult.error) {
    throw membershipResult.error;
  }

  const membershipRows = Array.isArray(membershipResult.data) ? membershipResult.data : [];
  const threadIds = membershipRows
    .map((row) => String(row.conversation_id || '').trim())
    .filter(Boolean);

  if (!threadIds.length) {
    return [];
  }

  const conversationResult = await supabase
    .from('conversations')
    .select('id, created_at, updated_at, last_message_at')
    .in('id', threadIds)
    .order('last_message_at', { ascending: false });

  if (conversationResult.error) {
    throw conversationResult.error;
  }

  const participantResult = await supabase
    .from('conversation_participants')
    .select('conversation_id, user_id, joined_at, last_read_at')
    .in('conversation_id', threadIds);

  if (participantResult.error) {
    throw participantResult.error;
  }

  const participantRows = Array.isArray(participantResult.data) ? participantResult.data : [];
  const profileIds = Array.from(new Set(participantRows
    .map((row) => String(row.user_id || '').trim())
    .filter(Boolean)));
  const profileMap = {};

  if (profileIds.length) {
    const profileResult = await supabase
      .from('chat_profiles')
      .select('user_id, display_name, username, avatar_url')
      .in('user_id', profileIds);

    if (profileResult.error) {
      throw profileResult.error;
    }

    (profileResult.data || []).forEach((profile) => {
      if (profile && profile.user_id) {
        profileMap[String(profile.user_id)] = profile;
      }
    });
  }

  const messageResult = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, body, attachments, reactions, created_at')
    .in('conversation_id', threadIds)
    .order('created_at', { ascending: true });

  if (messageResult.error) {
    throw messageResult.error;
  }

  const membershipByConversationId = {};
  membershipRows.forEach((row) => {
    membershipByConversationId[String(row.conversation_id || '')] = row;
  });

  const participantsByConversationId = {};
  participantRows.forEach((row) => {
    const conversationId = String(row.conversation_id || '').trim();

    if (!conversationId) {
      return;
    }

    if (!participantsByConversationId[conversationId]) {
      participantsByConversationId[conversationId] = [];
    }

    participantsByConversationId[conversationId].push(row);
  });

  const messagesByConversationId = {};
  (messageResult.data || []).forEach((message) => {
    const conversationId = String(message.conversation_id || '').trim();

    if (!conversationId) {
      return;
    }

    if (!messagesByConversationId[conversationId]) {
      messagesByConversationId[conversationId] = [];
    }

    messagesByConversationId[conversationId].push(message);
  });

  return (conversationResult.data || []).map((conversation) => {
    const conversationId = String(conversation.id || '').trim();
    const participants = participantsByConversationId[conversationId] || [];
    const otherParticipant = participants.find((participant) => String(participant.user_id || '').trim() !== String(state.authUser.id || '').trim())
      || participants[0]
      || null;
    const contact = normalizeSupabaseMessageContact(
      otherParticipant && profileMap[String(otherParticipant.user_id || '').trim()]
        ? profileMap[String(otherParticipant.user_id || '').trim()]
        : { user_id: otherParticipant ? otherParticipant.user_id : '' }
    );

    return normalizeSupabaseMessageThread({
      id: conversationId,
      updated_at: conversation.last_message_at || conversation.updated_at || conversation.created_at,
      created_at: conversation.created_at || conversation.updated_at,
      last_read_at: membershipByConversationId[conversationId] && membershipByConversationId[conversationId].last_read_at,
      contact,
      profilesByUserId: profileMap,
      messages: messagesByConversationId[conversationId] || []
    });
  }).filter(Boolean);
}

function waitForSupabaseThread(ms = 120) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function loadSupabaseMessageThreadById(
  conversationId,
  { attempts = 1, delayMs = 140, fallbackContact = null } = {}
) {
  const normalizedConversationId = String(conversationId || '').trim();
  let lastError = null;

  for (let attempt = 0; attempt < Math.max(1, attempts); attempt += 1) {
    try {
      const threads = await loadSupabaseMessageThreads([normalizedConversationId]);
      const thread = threads.find((entry) => entry && entry.nativeId === normalizedConversationId) || null;

      if (thread) {
        return thread;
      }
    } catch (error) {
      lastError = error;

      if (isSupabaseAuthRequiredError(error)) {
        throw error;
      }
    }

    if (attempt < attempts - 1) {
      await waitForSupabaseThread(delayMs * (attempt + 1));
    }
  }

  if (fallbackContact) {
    return buildFallbackSupabaseThread(normalizedConversationId, fallbackContact);
  }

  if (lastError) {
    throw lastError;
  }

  return null;
}

async function syncSupabaseThreadRead(thread, readAt) {
  if (!thread || thread.provider !== 'member' || !state.authUser || !state.authUser.id) {
    return;
  }

  const supabase = supabaseSessionService.getSupabaseClient();

  if (!supabase) {
    return;
  }

  const result = await supabase
    .from('conversation_participants')
    .update({
      last_read_at: readAt || new Date().toISOString()
    })
    .eq('conversation_id', thread.nativeId)
    .eq('user_id', String(state.authUser.id));

  if (result.error) {
    throw result.error;
  }
}

function buildFallbackPosts() {
  return [
    {
      id: 'fallback-post-1',
      channel: 'night-code',
      userName: '@socialera.studio',
      displayName: 'SocialEra Studio',
      avatar: 'SS',
      mediaType: 'image',
      mediaUrl: createPoster('Night Code', '#d7bc85', '#0c0e12'),
      captionTitle: 'Night Code / App-first drop',
      captionText: 'The app shell is ready to turn the current SocialEra site into a faster, creator-led mobile experience.',
      tags: ['night-code', 'bag', 'wishlist'],
      likes: 1840,
      commentsCount: 64,
      saves: 420,
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      likeActorIds: [],
      saveActorIds: []
    },
    {
      id: 'fallback-post-2',
      channel: 'soft-power',
      userName: '@socialera.concierge',
      displayName: 'Drop Concierge',
      avatar: 'DC',
      mediaType: 'image',
      mediaUrl: createPoster('Soft Power', '#c8a96b', '#12161c'),
      captionTitle: 'Soft Power / Mobile checkout energy',
      captionText: 'Bag, inbox, and creator discovery all sit inside a standalone app process so the website can stay exactly where it is.',
      tags: ['soft-power', 'checkout', 'inbox'],
      likes: 960,
      commentsCount: 34,
      saves: 205,
      createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      likeActorIds: [],
      saveActorIds: []
    }
  ].map(normalizePost);
}

function buildFallbackProducts() {
  return [
    {
      id: 'fallback-product-1',
      name: 'Night Shift Shell',
      price: 229,
      category: 'outerwear',
      image: createPoster('Night Shift', '#d7bc85', '#0c0e12'),
      stock: 7,
      featured: true,
      description: 'A sharper outer layer used to prove the faster bag flow inside the separate mobile app.'
    },
    {
      id: 'fallback-product-2',
      name: 'Contour Watch',
      price: 319,
      category: 'accessories',
      image: createPoster('Contour Watch', '#c8a96b', '#0c0e12'),
      stock: 11,
      featured: true,
      description: 'Shared inventory styling for the app-first creator feed.'
    },
    {
      id: 'fallback-product-3',
      name: 'Studio Carry',
      price: 184,
      category: 'bag',
      image: createPoster('Studio Carry', '#d7bc85', '#12161c'),
      stock: 9,
      featured: false,
      description: 'A bag-ready item seeded into the standalone app experience.'
    }
  ].map(normalizeProduct);
}

function buildFallbackContacts() {
  return [];
}

function buildFallbackThreads(actorId, contacts) {
  void actorId;
  void contacts;
  return [];
}

function resolveMediaUrl(value) {
  const media = String(value || '').trim();

  if (!media) {
    return '';
  }

  if (media.startsWith('data:') || /^https?:\/\//i.test(media)) {
    return media;
  }

  if (media.startsWith('/')) {
    return media;
  }

  return `${state.assetBase.replace(/\/+$/, '')}/${media.replace(/^\/+/, '')}`;
}

function createUploadDraft() {
  return {
    mediaType: 'image',
    mediaUrl: '',
    mediaUrlInput: '',
    mediaName: '',
    mediaSource: 'none',
    channel: DEFAULT_UPLOAD_CHANNELS[0],
    title: '',
    text: '',
    tagText: '',
    linkedProductIds: [],
    promoteEnabled: false,
    promotedTitle: '',
    promotedPrice: '',
    promotedText: ''
  };
}

function mergePostCollections(basePosts = [], localPosts = []) {
  const merged = new Map();

  normalizePosts(basePosts).forEach((post) => {
    merged.set(post.id, post);
  });

  normalizePosts(localPosts).forEach((post) => {
    merged.set(post.id, post);
  });

  return Array.from(merged.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function inferMediaTypeFromUrl(value) {
  const mediaUrl = String(value || '').trim().toLowerCase();

  if (!mediaUrl) {
    return '';
  }

  if (/\.(mp4|mov|webm|m4v|ogg)([?#].*)?$/i.test(mediaUrl)) {
    return 'video';
  }

  if (/\.(png|jpe?g|gif|webp|avif|svg)([?#].*)?$/i.test(mediaUrl)) {
    return 'image';
  }

  return '';
}

function getMediaDisplayName(value) {
  const text = String(value || '').trim();

  if (!text) {
    return '';
  }

  try {
    const url = new URL(text);
    const pathName = url.pathname.split('/').filter(Boolean).pop();
    return pathName || url.hostname || 'Remote media';
  } catch (error) {
    return text.slice(0, 42);
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(String(reader.result || ''));
    };

    reader.onerror = () => {
      reject(new Error('Could not read file.'));
    };

    reader.readAsDataURL(file);
  });
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

function loadImageElementFromFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('That profile picture could not be loaded.'));
    };

    image.src = objectUrl;
  });
}

async function optimizeProfilePhotoFile(file) {
  if (!file || !String(file.type || '').toLowerCase().startsWith('image/')) {
    throw new Error('Please choose an image file for the profile picture.');
  }

  if (Number(file.size || 0) <= MAX_PROFILE_PHOTO_BYTES) {
    return readFileAsDataUrl(file);
  }

  if (typeof document === 'undefined') {
    throw new Error('That profile picture could not be processed here.');
  }

  const mimeType = String(file.type || '').toLowerCase();

  if (mimeType === 'image/svg+xml') {
    throw new Error('Please use a PNG, JPG, or WebP image for the profile picture.');
  }

  const image = await loadImageElementFromFile(file);
  const largestSide = Math.max(Number(image.naturalWidth || image.width || 0), Number(image.naturalHeight || image.height || 0));

  if (!largestSide) {
    throw new Error('That profile picture could not be loaded.');
  }

  let scale = Math.min(1, MAX_PROFILE_PHOTO_DIMENSION / largestSide);
  let quality = 0.9;
  let attempts = 0;

  while (attempts < 8) {
    const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('That profile picture could not be processed.');
    }

    canvas.width = width;
    canvas.height = height;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', quality);

    if (estimateDataUrlBytes(dataUrl) <= MAX_PROFILE_PHOTO_BYTES) {
      return dataUrl;
    }

    if (scale > 0.45) {
      scale *= 0.84;
    } else {
      quality -= 0.12;
    }

    attempts += 1;
  }

  throw new Error('That photo is too large to use right now. Try a smaller image.');
}

async function optimizeAppearanceBackgroundFile(file) {
  if (!file || !String(file.type || '').toLowerCase().startsWith('image/')) {
    throw new Error('Please choose an image file for the background.');
  }

  const mimeType = String(file.type || '').toLowerCase();

  if (mimeType === 'image/svg+xml') {
    throw new Error('Please use a PNG, JPG, or WebP image for the background.');
  }

  if (Number(file.size || 0) > MAX_APPEARANCE_BACKGROUND_FILE_BYTES) {
    throw new Error('Please choose a background image under 5MB.');
  }

  if (typeof document === 'undefined') {
    if (Number(file.size || 0) <= MAX_APPEARANCE_BACKGROUND_BYTES) {
      return readFileAsDataUrl(file);
    }

    throw new Error('That background could not be processed here.');
  }

  const image = await loadImageElementFromFile(file);
  const largestSide = Math.max(Number(image.naturalWidth || image.width || 0), Number(image.naturalHeight || image.height || 0));

  if (!largestSide) {
    throw new Error('That background could not be loaded.');
  }

  let scale = Math.min(1, MAX_APPEARANCE_BACKGROUND_DIMENSION / largestSide);
  let quality = 0.86;
  let attempts = 0;

  while (attempts < 8) {
    const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('That background could not be processed.');
    }

    canvas.width = width;
    canvas.height = height;
    context.fillStyle = '#101317';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', quality);

    if (estimateDataUrlBytes(dataUrl) <= MAX_APPEARANCE_BACKGROUND_BYTES) {
      return dataUrl;
    }

    if (scale > 0.52) {
      scale *= 0.86;
    } else {
      quality -= 0.12;
    }

    attempts += 1;
  }

  throw new Error('That background is still too large after optimization. Try a smaller image.');
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  const hostname = String(window.location.hostname || '').trim().toLowerCase();
  const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(hostname);
  const isPrivateIpv4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname);
  const isLocalDevelopmentHost = isLocalhost || isPrivateIpv4 || hostname.endsWith('.local');

  if (isLocalDevelopmentHost) {
    window.addEventListener('load', async () => {
      const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
      await Promise.all(registrations.map((registration) => registration.unregister().catch(() => false)));

      if ('caches' in window) {
        const keys = await window.caches.keys().catch(() => []);
        await Promise.all(
          keys
            .filter((key) => key.startsWith('socialera-mobile-'))
            .map((key) => window.caches.delete(key).catch(() => false))
        );
      }

      if (!window.sessionStorage.getItem('socialera-local-cache-reset')) {
        window.sessionStorage.setItem('socialera-local-cache-reset', '1');
        window.location.reload();
      }
    });

    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {
      return null;
    });
  });
}

function ensureActorId() {
  const existing = loadText(STORAGE_KEYS.actorId);

  if (existing) {
    return existing;
  }

  const next = `socialera-app-${getUuid()}`;
  persistText(STORAGE_KEYS.actorId, next);
  return next;
}

function loadProfile() {
  const stored = loadJson(STORAGE_KEYS.profile);
  const storedPhotoUrl = loadProfilePhotoOverride(initialGuestActorId);

  if (stored && stored.displayName && stored.userName && stored.avatar) {
    return {
      ...stored,
      photoUrl: normalizeProfilePhotoValue(stored.photoUrl || storedPhotoUrl)
    };
  }

  const profile = {
    displayName: 'SocialEra Member',
    userName: '@socialera.member',
    avatar: 'SM',
    photoUrl: normalizeProfilePhotoValue(storedPhotoUrl)
  };

  persistJson(STORAGE_KEYS.profile, profile);
  return profile;
}

function buildProfileFromAuthUser(user, syncedProfile = null) {
  const metadata = user && typeof user.user_metadata === 'object' ? user.user_metadata : {};
  const actorId = user && user.id ? String(user.id) : '';
  const emailBase = String(user && user.email ? user.email : '')
    .split('@')[0]
    .trim() || 'socialera.member';
  const displayName = String((syncedProfile && syncedProfile.displayName) || metadata.full_name || emailBase || 'SocialEra Member').trim() || 'SocialEra Member';
  const userName = normalizeUserName((syncedProfile && syncedProfile.userName) || metadata.username || emailBase || '@socialera.member');
  const photoUrl = normalizeProfilePhotoValue(
    (syncedProfile && syncedProfile.photoUrl)
      || metadata.avatar_url
      || metadata.picture
      || metadata.avatar
      || metadata.photo_url
      || metadata.photoUrl
      || loadProfilePhotoOverride(actorId)
  );

  return {
    displayName,
    userName,
    avatar: getInitials(displayName || getAuthEmail(user)),
    photoUrl
  };
}

function normalizeSyncedAccountProfile(profile) {
  if (!profile || typeof profile !== 'object') {
    return null;
  }

  const displayName = String(profile.display_name || profile.displayName || '').trim();
  const rawUserName = String(profile.username || profile.userName || '').trim();
  const photoUrl = normalizeProfilePhotoValue(profile.avatar_url || profile.photoUrl || profile.photo_url || '');

  if (!displayName && !rawUserName && !photoUrl) {
    return null;
  }

  return {
    displayName,
    userName: rawUserName ? normalizeUserName(rawUserName) : '',
    photoUrl
  };
}

async function loadSyncedAccountProfile(userId = state.authUser && state.authUser.id ? String(state.authUser.id).trim() : '') {
  const supabase = supabaseSessionService.getSupabaseClient();
  const normalizedUserId = String(userId || '').trim();

  if (!supabase || !normalizedUserId) {
    return null;
  }

  const result = await supabase
    .from('chat_profiles')
    .select('user_id, display_name, username, avatar_url')
    .eq('user_id', normalizedUserId)
    .maybeSingle();

  if (result.error) {
    if (isChatProfileRlsError(result.error)) {
      console.warn('Skipping synced account profile load because chat_profiles is blocked by RLS.', result.error);
      return null;
    }

    throw result.error;
  }

  return normalizeSyncedAccountProfile(result.data || null);
}

function loadProfilePhotoOverride(actorId = loadText(STORAGE_KEYS.actorId) || initialGuestActorId) {
  return String(loadText(getActorStorageKey(STORAGE_KEYS.profilePhoto, actorId)) || '').trim();
}

function persistProfilePhotoOverride(value, actorId = state.actorId) {
  persistText(getActorStorageKey(STORAGE_KEYS.profilePhoto, actorId), normalizeProfilePhotoValue(value));
}

function getAuthMetadataPhotoValue(user = state.authUser) {
  const metadata = user && typeof user.user_metadata === 'object' ? user.user_metadata : {};

  return normalizeProfilePhotoValue(
    metadata.avatar_url
      || metadata.picture
      || metadata.avatar
      || metadata.photo_url
      || metadata.photoUrl
      || ''
  );
}

function hasOversizedAuthProfileMetadata(user = state.authUser) {
  const photoValue = getAuthMetadataPhotoValue(user);
  return Boolean(photoValue && (photoValue.startsWith('data:') || photoValue.length > 1500));
}

function hasOversizedAuthSession(session = state.authSession, user = state.authUser) {
  const accessToken = String(session && session.access_token ? session.access_token : '').trim();
  return accessToken.length > 7000 || hasOversizedAuthProfileMetadata(user);
}

async function repairOversizedAuthProfileMetadata() {
  if (!supabaseClient || !state.authUser || !hasOversizedAuthSession(state.authSession, state.authUser)) {
    return false;
  }

  const metadata = state.authUser && typeof state.authUser.user_metadata === 'object'
    ? state.authUser.user_metadata
    : {};
  const localPhotoUrl = normalizeProfilePhotoValue(state.profile.photoUrl || loadProfilePhotoOverride(state.actorId));
  const remoteSafePhotoUrl = localPhotoUrl && !localPhotoUrl.startsWith('data:') ? localPhotoUrl : '';

  const { data, error } = await supabaseClient.auth.updateUser({
    data: {
      ...metadata,
      avatar_url: remoteSafePhotoUrl,
      picture: remoteSafePhotoUrl,
      avatar: remoteSafePhotoUrl,
      photo_url: remoteSafePhotoUrl,
      photoUrl: remoteSafePhotoUrl
    }
  });

  if (error) {
    throw error;
  }

  persistProfilePhotoOverride(localPhotoUrl.startsWith('data:') ? localPhotoUrl : '', state.actorId);

  const refreshedSession = await supabaseSessionService.ensureSupabaseSessionState({ forceRefresh: true }).catch(() => null);

  if (refreshedSession) {
    await syncAuthSession(refreshedSession, {
      renderNow: false,
      refreshNow: false
    });
  } else if (data && data.user) {
    state.authUser = data.user;
    state.profile = buildProfileFromAuthUser(state.authUser);
  }

  return true;
}

async function maybeRepairOversizedAuthSession() {
  if (authMetadataRepairPromise) {
    return authMetadataRepairPromise;
  }

  if (!hasOversizedAuthSession(state.authSession, state.authUser)) {
    return false;
  }

  authMetadataRepairPromise = repairOversizedAuthProfileMetadata()
    .catch((error) => {
      console.error('Could not repair oversized auth session metadata:', error);
      return false;
    })
    .finally(() => {
      authMetadataRepairPromise = null;
    });

  return authMetadataRepairPromise;
}

async function persistAccountProfilePhoto(photoUrl) {
  if (!supabaseClient || !state.authUser) {
    throw new Error('Account sync is unavailable right now.');
  }

  const metadata = state.authUser && typeof state.authUser.user_metadata === 'object'
    ? state.authUser.user_metadata
    : {};
  const nextPhotoUrl = normalizeProfilePhotoValue(photoUrl);
  const remoteSafePhotoUrl = nextPhotoUrl && !nextPhotoUrl.startsWith('data:') ? nextPhotoUrl : '';
  const { data, error } = await supabaseClient.auth.updateUser({
    data: {
      ...metadata,
      avatar_url: remoteSafePhotoUrl,
      picture: remoteSafePhotoUrl,
      avatar: remoteSafePhotoUrl,
      photo_url: remoteSafePhotoUrl,
      photoUrl: remoteSafePhotoUrl
    }
  });

  if (error) {
    throw error;
  }

  persistProfilePhotoOverride(nextPhotoUrl.startsWith('data:') ? nextPhotoUrl : '', state.actorId);
  return data && data.user ? data.user : state.authUser;
}

function normalizeProfilePhotoValue(value) {
  return String(value || '').trim();
}

function getAuthEmail(user = state.authUser) {
  return String(user && user.email ? user.email : 'No email connected').trim() || 'No email connected';
}

function shortenIdentifier(value) {
  const text = String(value || '').trim();

  if (!text) {
    return 'No ID';
  }

  if (text.length <= 18) {
    return text;
  }

  return `${text.slice(0, 8)}...${text.slice(-4)}`;
}

function formatCalendarDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Unavailable';
  }

  return date.toLocaleDateString('en-NZ', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function getAllAppearancePageIds() {
  return [...APPEARANCE_PAGE_IDS];
}

function normalizeAppearancePage(value) {
  const normalized = normalizeView(value);
  return APPEARANCE_PAGE_IDS.includes(normalized) ? normalized : '';
}

function normalizeAppearanceSelectedPages(values, fallback = getAllAppearancePageIds(), { allowEmpty = false } = {}) {
  const selected = Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => normalizeAppearancePage(value))
      .filter(Boolean)
  ));

  if (selected.length || allowEmpty) {
    return selected;
  }

  return Array.from(new Set(
    (Array.isArray(fallback) ? fallback : getAllAppearancePageIds())
      .map((value) => normalizeAppearancePage(value))
      .filter(Boolean)
  ));
}

function createDefaultAppearanceSettings(theme = loadTheme()) {
  return {
    theme: normalizeTheme(theme),
    backgroundUrl: '',
    backgroundMode: 'all',
    selectedPages: getAllAppearancePageIds(),
    backgroundEnabled: false
  };
}

function normalizeAppearanceSettings(input = {}, fallback = createDefaultAppearanceSettings()) {
  const selectedPagesProvided = Boolean(
    input
    && (
      Object.prototype.hasOwnProperty.call(input, 'selectedPages')
      || Object.prototype.hasOwnProperty.call(input, 'selected_pages')
    )
  );
  const normalizedTheme = normalizeTheme(
    input && Object.prototype.hasOwnProperty.call(input, 'theme')
      ? input.theme
      : fallback.theme
  );
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
  const selectedPages = normalizeAppearanceSelectedPages(
    input && (input.selectedPages || input.selected_pages),
    fallback.selectedPages,
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
    theme: normalizedTheme,
    backgroundUrl,
    backgroundMode,
    selectedPages,
    backgroundEnabled
  };
}

function cloneAppearanceSettings(settings) {
  const themeFallback = settings && settings.theme ? settings.theme : loadTheme();
  return normalizeAppearanceSettings(settings, createDefaultAppearanceSettings(themeFallback));
}

function getComparableAppearanceSettings(settings) {
  const normalized = normalizeAppearanceSettings(settings, createDefaultAppearanceSettings());

  return {
    theme: normalized.theme,
    backgroundUrl: normalized.backgroundUrl,
    backgroundMode: normalized.backgroundMode,
    backgroundEnabled: normalized.backgroundEnabled,
    selectedPages: [...normalized.selectedPages].sort()
  };
}

function areAppearanceSettingsEqual(left, right) {
  return JSON.stringify(getComparableAppearanceSettings(left)) === JSON.stringify(getComparableAppearanceSettings(right));
}

function hasUnsavedAppearanceDraft() {
  return !areAppearanceSettingsEqual(getAppearanceDraftWithPendingBackground(), state.appearanceSettings);
}

function getAppearanceStorageKey(actorId = state.actorId) {
  return getActorStorageKey(STORAGE_KEYS.appearanceSettings, actorId);
}

function loadCachedAppearanceSettings(
  actorId = loadText(STORAGE_KEYS.actorId) || initialGuestActorId,
  { themeFallback = loadTheme() } = {}
) {
  const stored = loadJson(getAppearanceStorageKey(actorId));
  return normalizeAppearanceSettings(stored || {}, createDefaultAppearanceSettings(themeFallback));
}

function persistCachedAppearanceSettings(settings, actorId = state.actorId) {
  const normalized = normalizeAppearanceSettings(settings, createDefaultAppearanceSettings(settings && settings.theme ? settings.theme : loadTheme()));
  try {
    persistJson(getAppearanceStorageKey(actorId), normalized);
  } catch (error) {
    console.warn('Could not persist the full appearance settings locally. Retrying with a lighter cache.', error);
    persistJson(getAppearanceStorageKey(actorId), {
      ...normalized,
      backgroundUrl: '',
      backgroundEnabled: false
    });
  }
  persistText(STORAGE_KEYS.theme, normalized.theme);
  return normalized;
}

function getAppearanceTargetView(view = state.activeView) {
  const normalized = normalizeView(view);

  if (normalized === 'settings' || normalized === 'auth') {
    return 'profile';
  }

  if (normalized === 'bag' || normalized === 'search') {
    return 'shop';
  }

  if (normalized === 'post') {
    return getAppearanceTargetView(getPostReturnView());
  }

  return normalizeAppearancePage(normalized) || 'home';
}

function hasAppearanceBackground(settings = state.appearanceSettings) {
  const normalized = normalizeAppearanceSettings(settings, state.appearanceSettings);
  return Boolean(normalized.backgroundEnabled && normalized.backgroundUrl);
}

function shouldApplyAppearanceBackground(settings = getEffectiveAppearanceSettings(), view = state.activeView) {
  const normalized = normalizeAppearanceSettings(settings, state.appearanceSettings);

  if (!hasAppearanceBackground(normalized)) {
    return false;
  }

  if (normalized.backgroundMode === 'all') {
    return true;
  }

  return normalized.selectedPages.includes(getAppearanceTargetView(view));
}

function getAppearanceDraftWithPendingBackground() {
  const pendingBackgroundUrl = String(state.appearancePendingBackgroundUrl || '').trim();

  if (!pendingBackgroundUrl) {
    return state.appearanceDraft;
  }

  return normalizeAppearanceSettings({
    ...state.appearanceDraft,
    backgroundUrl: state.appearanceDraft.backgroundUrl || pendingBackgroundUrl,
    backgroundEnabled: true
  }, state.appearanceSettings);
}

function getEffectiveAppearanceSettings() {
  return normalizeAppearanceSettings(
    normalizeView(state.activeView) === 'settings'
      ? getAppearanceDraftWithPendingBackground()
      : state.appearanceSettings,
    state.appearanceSettings
  );
}

function applyAppearanceSettings(settings, { syncDraft = true, persistLocal = true } = {}) {
  const normalized = normalizeAppearanceSettings(settings, state.appearanceSettings);
  state.appearanceSettings = normalized;
  state.theme = normalized.theme;

  if (syncDraft) {
    state.appearancePendingBackgroundUrl = '';
    state.appearanceDraft = cloneAppearanceSettings(normalized);
  }

  if (persistLocal) {
    persistCachedAppearanceSettings(normalized, state.actorId);
  }

  return normalized;
}

function updateAppearanceDraft(updates = {}) {
  state.appearanceDraft = normalizeAppearanceSettings({
    ...state.appearanceDraft,
    ...updates
  }, state.appearanceSettings);
  state.theme = state.appearanceDraft.theme;
}

function toggleAppearanceDraftPage(pageId) {
  const normalizedPage = normalizeAppearancePage(pageId);

  if (!normalizedPage) {
    return;
  }

  const nextPages = new Set(state.appearanceDraft.selectedPages);

  if (nextPages.has(normalizedPage)) {
    nextPages.delete(normalizedPage);
  } else {
    nextPages.add(normalizedPage);
  }

  updateAppearanceDraft({
    selectedPages: Array.from(nextPages)
  });
}

function removeAppearanceDraftBackground() {
  state.appearancePendingBackgroundUrl = '';
  updateAppearanceDraft({
    backgroundUrl: '',
    backgroundEnabled: false
  });
}

function discardAppearanceDraft() {
  state.appearancePendingBackgroundUrl = '';
  state.appearanceDraft = cloneAppearanceSettings(state.appearanceSettings);
  state.theme = state.appearanceSettings.theme;
}

function resetAppearanceDraft() {
  discardAppearanceDraft();
}

function prepareAppearanceSettingsForSave(draft) {
  const normalized = cloneAppearanceSettings(draft);
  const selectedPages = normalizeAppearanceSelectedPages(normalized.selectedPages, [], { allowEmpty: true });
  const hasPartialPageSelection = selectedPages.length > 0 && selectedPages.length < APPEARANCE_PAGE_IDS.length;
  const backgroundMode = normalized.backgroundMode === 'selected' || hasPartialPageSelection ? 'selected' : 'all';

  return normalizeAppearanceSettings({
    ...normalized,
    backgroundMode,
    selectedPages: backgroundMode === 'all' ? getAllAppearancePageIds() : selectedPages
  }, state.appearanceSettings);
}

async function getAppearanceAccessToken({ forceRefresh = false } = {}) {
  if (state.authSession && state.authSession.access_token) {
    await maybeRepairOversizedAuthSession();
  }

  let session = await supabaseSessionService.ensureSupabaseSessionState({ forceRefresh }).catch((error) => {
    console.error('Could not read appearance settings session:', error);
    return null;
  });

  if ((!session || !session.access_token) && !forceRefresh) {
    session = await supabaseSessionService.ensureSupabaseSessionState({ forceRefresh: true }).catch((error) => {
      console.error('Could not refresh appearance settings session:', error);
      return null;
    });
  }

  return String(session && session.access_token ? session.access_token : '').trim();
}

async function createAuthenticatedAppearanceBody(payload = {}, options = {}) {
  const accessToken = await getAppearanceAccessToken(options);

  if (!accessToken) {
    throw new Error('Authentication required');
  }

  return JSON.stringify({
    ...payload,
    accessToken
  });
}

async function fetchAppearanceSettingsFromBackend(options = {}) {
  return apiService.fetchJson('/appearance-settings/read', {
    method: 'POST',
    omitAuth: true,
    body: await createAuthenticatedAppearanceBody({}, options)
  });
}

async function saveAppearanceSettingsToBackend(settings, options = {}) {
  return apiService.fetchJson('/appearance-settings', {
    method: 'PUT',
    omitAuth: true,
    body: await createAuthenticatedAppearanceBody(settings, options)
  });
}

async function loadAppearanceSettings({ quiet = false, syncDraft = false } = {}) {
  if (!state.authUser) {
    return state.appearanceSettings;
  }

  if (!quiet) {
    state.appearanceLoading = true;
    render();
  } else {
    state.appearanceLoading = true;
  }

  try {
    if (!state.authSession || !state.authSession.access_token) {
      if (quiet) {
        return state.appearanceSettings;
      }

      const redirected = await supabaseSessionService.recoverSupabaseSessionOrRedirect('settings', 'Sign in again to load your appearance settings.');

      if (redirected) {
        return state.appearanceSettings;
      }
    }

    const payload = await fetchAppearanceSettingsFromBackend();
    const shouldSyncDraft = syncDraft && !(normalizeView(state.activeView) === 'settings' && hasUnsavedAppearanceDraft());
    return applyAppearanceSettings(payload && payload.settings ? payload.settings : createDefaultAppearanceSettings(state.theme), {
      syncDraft: shouldSyncDraft,
      persistLocal: true
    });
  } catch (error) {
    if (isAuthRequestError(error)) {
      if (quiet) {
        console.warn('Skipping background appearance settings refresh because the signed-in session is not ready yet.', error);
        return state.appearanceSettings;
      }

      const redirected = await supabaseSessionService.recoverSupabaseSessionOrRedirect('settings', 'Sign in again to load your appearance settings.');

      if (!redirected) {
        try {
          const retryPayload = await fetchAppearanceSettingsFromBackend({ forceRefresh: true });
          const shouldSyncDraft = syncDraft && !(normalizeView(state.activeView) === 'settings' && hasUnsavedAppearanceDraft());
          return applyAppearanceSettings(retryPayload && retryPayload.settings ? retryPayload.settings : createDefaultAppearanceSettings(state.theme), {
            syncDraft: shouldSyncDraft,
            persistLocal: true
          });
        } catch (retryError) {
          console.error('Could not retry appearance settings load:', retryError);
        }
      }

      return state.appearanceSettings;
    }

    console.error('Could not load appearance settings:', error);
    return state.appearanceSettings;
  } finally {
    state.appearanceLoading = false;

    if (!quiet) {
      render();
    }
  }
}

async function saveAppearanceSettings(retried = false, draftOverride = null) {
  if (ensureSignedIn('settings', 'Sign in to save your appearance settings.')) {
    return;
  }

  const draftToSave = prepareAppearanceSettingsForSave(draftOverride || getAppearanceDraftWithPendingBackground());

  if (draftToSave.backgroundMode === 'selected' && !draftToSave.selectedPages.length) {
    showToast('Choose at least one page for the background.');
    return;
  }

  state.appearanceSaving = true;
  render();

  try {
    if (!state.authSession || !state.authSession.access_token) {
      const redirected = await supabaseSessionService.recoverSupabaseSessionOrRedirect('settings', 'Sign in again to save your appearance settings.');

      if (redirected) {
        return;
      }
    }

    let nextSettings = prepareAppearanceSettingsForSave(draftToSave);
    let nextBackgroundUrl = String(nextSettings.backgroundUrl || '').trim();

    if (!nextBackgroundUrl || !nextSettings.backgroundEnabled) {
      nextBackgroundUrl = '';
    }

    nextSettings = normalizeAppearanceSettings({
      ...nextSettings,
      backgroundUrl: nextBackgroundUrl,
      backgroundEnabled: Boolean(nextBackgroundUrl)
    }, state.appearanceSettings);

    let response = null;

    try {
      response = await saveAppearanceSettingsToBackend(nextSettings);
    } catch (saveError) {
      if (!retried && Number(saveError && saveError.status ? saveError.status : 0) === 431) {
        try {
          const repaired = await maybeRepairOversizedAuthSession();

          if (repaired) {
            state.appearanceSaving = false;
            await saveAppearanceSettings(true, draftToSave);
            return;
          }
        } catch (repairError) {
          console.error('Could not repair oversized auth metadata before retrying appearance save:', repairError);
        }
      }

      if (!retried && isAuthRequestError(saveError)) {
        const redirected = await supabaseSessionService.recoverSupabaseSessionOrRedirect('settings', 'Sign in again to save your appearance settings.', {
          forceRefresh: true
        });

        if (!redirected) {
          response = await saveAppearanceSettingsToBackend(nextSettings, { forceRefresh: true });
          applyAppearanceSettings(response && response.settings ? response.settings : nextSettings, {
            syncDraft: true,
            persistLocal: true
          });
          showToast('Appearance settings saved.');
          return;
        }
      }

      throw new Error(`Settings save failed: ${getRequestErrorMessage(saveError, 'The appearance settings could not be saved.')}`);
    }

    applyAppearanceSettings(response && response.settings ? response.settings : nextSettings, {
      syncDraft: true,
      persistLocal: true
    });
    showToast('Appearance settings saved.');
  } catch (error) {
    if (!retried && isAuthRequestError(error)) {
      const redirected = await supabaseSessionService.recoverSupabaseSessionOrRedirect('settings', 'Sign in again to save your appearance settings.');

      if (!redirected) {
        state.appearanceSaving = false;
        await saveAppearanceSettings(true, draftToSave);
        return;
      }
    }

    console.error('Could not save appearance settings:', error);
    showToast(getRequestErrorMessage(error, 'Settings could not be saved right now.'));
  } finally {
    state.appearanceSaving = false;
    render();
  }
}

function loadTheme() {
  return normalizeTheme(loadText(STORAGE_KEYS.theme) || 'socialera');
}

function getActorStorageKey(baseKey, actorId = loadText(STORAGE_KEYS.actorId) || initialGuestActorId) {
  return `${baseKey}:${actorId || initialGuestActorId}`;
}

function loadNotificationSeenAt(actorId = loadText(STORAGE_KEYS.actorId) || initialGuestActorId) {
  return String(loadText(getActorStorageKey(STORAGE_KEYS.notificationSeenAt, actorId)) || '').trim();
}

function persistNotificationSeenAt(value) {
  persistText(getActorStorageKey(STORAGE_KEYS.notificationSeenAt, state.actorId), String(value || '').trim());
}

function loadSharedPosts(actorId = loadText(STORAGE_KEYS.actorId) || initialGuestActorId) {
  const stored = loadJson(getActorStorageKey(STORAGE_KEYS.sharedPosts, actorId));
  return stored && typeof stored === 'object' ? stored : {};
}

function persistSharedPosts() {
  persistJson(getActorStorageKey(STORAGE_KEYS.sharedPosts, state.actorId), state.sharedPosts);
}

function loadThreadReadState() {
  const stored = loadJson(getActorStorageKey(STORAGE_KEYS.threadReadState, state.actorId));
  return stored && typeof stored === 'object' ? stored : {};
}

function persistThreadReadState(value) {
  persistJson(getActorStorageKey(STORAGE_KEYS.threadReadState, state.actorId), value);
}

function loadMutedThreadIds(actorId = loadText(STORAGE_KEYS.actorId) || initialGuestActorId) {
  const stored = loadJson(getActorStorageKey(STORAGE_KEYS.mutedThreads, actorId));
  return Array.isArray(stored) ? stored.map(String) : [];
}

function persistMutedThreadIds(value) {
  persistJson(getActorStorageKey(STORAGE_KEYS.mutedThreads, state.actorId), Array.isArray(value) ? value.map(String) : []);
}

function loadForcedUnreadThreadIds(actorId = loadText(STORAGE_KEYS.actorId) || initialGuestActorId) {
  const stored = loadJson(getActorStorageKey(STORAGE_KEYS.forcedUnreadThreads, actorId));
  return Array.isArray(stored) ? stored.map(String) : [];
}

function persistForcedUnreadThreadIds(value) {
  persistJson(getActorStorageKey(STORAGE_KEYS.forcedUnreadThreads, state.actorId), Array.isArray(value) ? value.map(String) : []);
}

function loadMessageReplyDecorations(actorId = loadText(STORAGE_KEYS.actorId) || initialGuestActorId) {
  const stored = loadJson(getActorStorageKey(STORAGE_KEYS.messageReplyDecorations, actorId));
  return stored && typeof stored === 'object' ? stored : {};
}

function persistMessageReplyDecorations(value) {
  persistJson(getActorStorageKey(STORAGE_KEYS.messageReplyDecorations, state.actorId), value && typeof value === 'object' ? value : {});
}

function loadBag() {
  const stored = loadJson(STORAGE_KEYS.bag);
  return stored && typeof stored === 'object' ? stored : {};
}

function persistBag() {
  persistJson(STORAGE_KEYS.bag, state.bag);
}

function persistText(key, value) {
  localStorage.setItem(key, value);
}

function loadText(key) {
  return localStorage.getItem(key);
}

function persistJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadJson(key) {
  const raw = localStorage.getItem(key);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function normalizeApiBase(value) {
  const text = String(value || '').trim();
  return text.startsWith('/') ? text.replace(/\/+$/, '') : text.replace(/\/+$/, '');
}

function normalizeUserName(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '@socialera.member';
  }
  return text.startsWith('@') ? text : `@${text.replace(/^@+/, '')}`;
}

function normalizeAccountUserName(value) {
  const clean = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9._-]/g, '');

  return clean || 'socialera.member';
}

function getInitials(value) {
  const words = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!words.length) {
    return 'SE';
  }

  return words.map((word) => word.charAt(0).toUpperCase()).join('').slice(0, 2);
}

function formatCompactNumber(value) {
  return new Intl.NumberFormat('en-NZ', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(Number(value || 0));
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: 'NZD',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function formatFileSize(value) {
  const bytes = Math.max(0, Number(value || 0));

  if (!bytes) {
    return 'File';
  }

  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  }

  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${bytes} B`;
}

function formatRelativeTime(value) {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < hour) {
    const minutes = Math.max(1, Math.round(diff / minute));
    return `${minutes}m ago`;
  }

  if (diff < day) {
    const hours = Math.max(1, Math.round(diff / hour));
    return `${hours}h ago`;
  }

  const days = Math.max(1, Math.round(diff / day));
  return `${days}d ago`;
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add('visible');

  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove('visible');
  }, 2200);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createPoster(label, startColor, endColor) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 960" role="img" aria-label="${escapeSvg(label)}">
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${escapeSvg(startColor)}"/>
          <stop offset="100%" stop-color="${escapeSvg(endColor)}"/>
        </linearGradient>
      </defs>
      <rect width="800" height="960" fill="url(#grad)"/>
      <circle cx="640" cy="160" r="160" fill="rgba(255,255,255,0.14)"/>
      <circle cx="160" cy="760" r="220" fill="rgba(255,255,255,0.1)"/>
      <text x="72" y="760" fill="#fffaf4" font-family="Avenir Next, Segoe UI, sans-serif" font-size="72" font-weight="700">${escapeSvg(label)}</text>
      <text x="72" y="828" fill="rgba(255,250,244,0.72)" font-family="Avenir Next, Segoe UI, sans-serif" font-size="28">SocialEra mobile preview</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeSvg(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getUuid() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
