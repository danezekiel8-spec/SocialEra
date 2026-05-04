export const STORAGE_KEYS = {
  actorId: 'socialera.mobile.actor-id',
  activeView: 'socialera.mobile.active-view',
  appearanceSettings: 'socialera.mobile.appearance-settings',
  bag: 'socialera.mobile.bag',
  notificationSeenAt: 'socialera.mobile.notification-seen-at',
  profile: 'socialera.mobile.profile',
  profilePhoto: 'socialera.mobile.profile-photo',
  recentSearches: 'socialera.mobile.recent-searches',
  sharedPosts: 'socialera.mobile.shared-posts',
  selectedThread: 'socialera.mobile.selected-thread',
  threadReadState: 'socialera.mobile.thread-read-state',
  forcedUnreadThreads: 'socialera.mobile.forced-unread-threads',
  messageReplyDecorations: 'socialera.mobile.message-reply-decorations',
  mutedThreads: 'socialera.mobile.muted-threads',
  theme: 'socialera.mobile.theme'
};

export const PRIMARY_SWIPE_VIEWS = ['home', 'shop', 'videos', 'upload'];

export const FEED_RENDER_BATCH = {
  home: 8,
  videos: 6
};

export const DEFAULT_UPLOAD_CHANNELS = ['night-code', 'soft-power', 'studio-note', 'drop-alert'];
export const GUEST_ACCESSIBLE_VIEWS = new Set(['auth', 'shop']);
export const MAX_PROFILE_PHOTO_BYTES = 512 * 1024;
export const MAX_PROFILE_PHOTO_DIMENSION = 720;
export const MAX_APPEARANCE_BACKGROUND_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_APPEARANCE_BACKGROUND_BYTES = 900 * 1024;
export const MAX_APPEARANCE_BACKGROUND_DIMENSION = 1440;
export const USAPP_LIVE_EFFECT_WINDOW_MS = 2200;
export const USAPP_PREVIEW_REPLY_DELAY_MS = 950;
export const USAPP_MESSAGE_LONG_PRESS_MS = 420;
export const MAX_VOICE_MESSAGE_BYTES = 4 * 1024 * 1024;
export const MESSAGE_COMPOSER_EMOJIS = ['🙂', '🔥', '✨', '🖤', '🙌', '😍', '👌', '🙏'];
export const MESSAGE_REACTION_EMOJIS = ['❤️', '🔥', '😂', '👏', '🙌', '😍'];
export const APP_THEME_IDS = ['socialera', 'editorial', 'coast', 'midnight', 'terracotta', 'moss', 'sunroom'];
export const APPEARANCE_PAGE_IDS = ['home', 'shop', 'videos', 'upload', 'profile', 'inbox'];

export const UPLOAD_STEPS = [
  {
    id: 'media',
    label: 'Media',
    title: 'Add media if you want it',
    note: 'Photo or video is optional now, so text-only posts stay text-only.'
  },
  {
    id: 'caption',
    label: 'Caption',
    title: 'Write the post',
    note: 'Set the title and caption so the card lands with the right voice.'
  },
  {
    id: 'placement',
    label: 'Placement',
    title: 'Choose where it lands',
    note: 'Pick the channel, tags, and any linked products for the post.'
  },
  {
    id: 'review',
    label: 'Review',
    title: 'Review before publishing',
    note: 'Check the final card, linked products, and publish when it feels right.'
  }
];

export const APP_THEMES = [
  {
    id: 'socialera',
    label: 'SocialEra',
    note: 'Warm ivory and gold',
    swatches: ['#f8f5f0', '#c8a96b', '#111111']
  },
  {
    id: 'editorial',
    label: 'Editorial',
    note: 'Rose paper and oxblood',
    swatches: ['#f5ece7', '#b77468', '#24171a']
  },
  {
    id: 'coast',
    label: 'Coast',
    note: 'Porcelain and blue slate',
    swatches: ['#eef5f7', '#7ea6bb', '#11202b']
  },
  {
    id: 'midnight',
    label: 'Midnight',
    note: 'Ink black and champagne',
    swatches: ['#171a20', '#d2b06d', '#f3ecdf']
  },
  {
    id: 'terracotta',
    label: 'Terracotta',
    note: 'Clay, sand, and ember',
    swatches: ['#f4e7df', '#d27b55', '#3a241f']
  },
  {
    id: 'moss',
    label: 'Moss',
    note: 'Stone and pine green',
    swatches: ['#edf1ea', '#7d9071', '#1f2a22']
  },
  {
    id: 'sunroom',
    label: 'Sunroom',
    note: 'Pearl and saffron',
    swatches: ['#fbf6e9', '#d7a43a', '#352919']
  }
];

export const APPEARANCE_PAGE_OPTIONS = [
  { id: 'home', label: 'Home' },
  { id: 'shop', label: 'Shop' },
  { id: 'videos', label: 'Videos' },
  { id: 'upload', label: 'Composer' },
  { id: 'profile', label: 'Profile' },
  { id: 'inbox', label: 'Usapp' }
];
