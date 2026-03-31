(function () {
  if (window.SocialEraMessageWidgetUtils) {
    return;
  }

  var COMPOSER_EMOJIS = ['❤️', '😂', '🔥', '😍', '👍', '🎉', '😮', '😢'];
  var REACTION_EMOJIS = ['❤️', '😂', '🔥', '👍', '🎉', '😮'];

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeText(value) {
    return String(value || '').trim().toLowerCase();
  }

  function normalizeMessageAttachment(attachment) {
    if (!attachment || typeof attachment !== 'object') {
      return null;
    }

    var dataUrl = String(attachment.dataUrl || attachment.url || '').trim();

    if (!dataUrl) {
      return null;
    }

    var type = String(attachment.type || '').trim();
    var kind = String(attachment.kind || (type.indexOf('image/') === 0 ? 'image' : 'file')).trim() === 'image'
      ? 'image'
      : 'file';

    return {
      id: String(attachment.id || ('attachment-' + Math.random().toString(36).slice(2))),
      name: String(attachment.name || 'Attachment').trim() || 'Attachment',
      type: type,
      size: Math.max(0, Number(attachment.size || 0) || 0),
      kind: kind,
      dataUrl: dataUrl
    };
  }

  function normalizeReaction(reaction) {
    if (!reaction || typeof reaction !== 'object') {
      return null;
    }

    var emoji = Array.from(String(reaction.emoji || '').trim()).slice(0, 2).join('');

    if (!emoji) {
      return null;
    }

    return {
      emoji: emoji,
      actorIds: Array.isArray(reaction.actorIds)
        ? reaction.actorIds.map(function (actorId) {
            return String(actorId || '').trim();
          }).filter(Boolean)
        : []
    };
  }

  function getInitials(value) {
    var parts = String(value || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);

    if (!parts.length) {
      return 'SE';
    }

    return parts.map(function (part) {
      return part.charAt(0).toUpperCase();
    }).join('').slice(0, 2) || 'SE';
  }

  function normalizeUserName(value, fallback) {
    var seed = String(value || fallback || 'socialera.member').trim().replace(/^@+/, '');
    return '@' + (seed || 'socialera.member');
  }

  function getLocalActorId() {
    var existing = localStorage.getItem('socialeraActorId') || localStorage.getItem('socialeraLocalActorId');

    if (existing) {
      localStorage.setItem('socialeraActorId', existing);
      localStorage.setItem('socialeraLocalActorId', existing);
      return existing;
    }

    var created = 'guest-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('socialeraActorId', created);
    localStorage.setItem('socialeraLocalActorId', created);
    return created;
  }

  function getActorIdFromUserId(userId) {
    var normalized = String(userId || '').trim();
    return normalized ? 'user-' + normalized : '';
  }

  function extractSupabaseRecord(record) {
    return Array.isArray(record) ? (record[0] || {}) : (record || {});
  }

  function getSupabaseClient() {
    return window.supabase && typeof window.supabase.from === 'function'
      ? window.supabase
      : null;
  }

  function getUserIdFromActorId(actorId) {
    var normalized = String(actorId || '').trim();
    return normalized.indexOf('user-') === 0 ? normalized.slice(5) : '';
  }

  function getSupabaseSetupMessage(error) {
    var message = String(error && error.message || '').trim();
    var code = String(error && error.code || '').trim();

    if (code === '42P01' || code === '42883' || code === 'PGRST205') {
      return 'Run supabase/socialera-messaging.sql in Supabase to finish member chat setup.';
    }

    if (/chat_profiles|conversation_participants|conversations|messages|open_direct_conversation/i.test(message)) {
      return 'Run supabase/socialera-messaging.sql in Supabase to finish member chat setup.';
    }

    return message || 'Member chat could not connect to Supabase right now.';
  }

  function formatShortTime(value) {
    var date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return 'Now';
    }

    if ((Date.now() - date.getTime()) < (24 * 60 * 60 * 1000)) {
      return date.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit'
      });
    }

    return date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric'
    });
  }

  function formatLongTime(value) {
    var date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return 'Just now';
    }

    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  function readJsonStorage(key) {
    if (!key) {
      return {};
    }

    try {
      var parsed = JSON.parse(localStorage.getItem(key) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function writeJsonStorage(key, value) {
    if (!key) {
      return;
    }

    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      // no-op
    }
  }

  function buildIcon() {
    return [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true">',
      '<path d="M3.5 2A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H4v2.293L6.293 11H12.5A1.5 1.5 0 0 0 14 9.5v-6A1.5 1.5 0 0 0 12.5 2z"/>',
      '</svg>'
    ].join('');
  }

  function buildSearchIcon() {
    return [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" aria-hidden="true">',
      '<circle cx="8.5" cy="8.5" r="4.75" fill="none" stroke="currentColor" stroke-width="1.9"/>',
      '<path d="M12.2 12.2 16 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
      '</svg>'
    ].join('');
  }

  function buildEmojiIcon() {
    return [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" aria-hidden="true">',
      '<circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.8"/>',
      '<circle cx="7.2" cy="8" r="1" fill="currentColor"/>',
      '<circle cx="12.8" cy="8" r="1" fill="currentColor"/>',
      '<path d="M6.7 11.8c.8 1.1 1.9 1.7 3.3 1.7s2.5-.6 3.3-1.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
      '</svg>'
    ].join('');
  }

  function buildAttachIcon() {
    return [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" aria-hidden="true">',
      '<path d="M7.4 10.9 12 6.3a2.4 2.4 0 1 1 3.4 3.4l-5.8 5.8a4 4 0 1 1-5.7-5.6L10 3.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
      '</svg>'
    ].join('');
  }

  function formatFileSize(size) {
    var bytes = Math.max(0, Number(size || 0) || 0);

    if (!bytes) {
      return 'File';
    }

    if (bytes >= 1024 * 1024) {
      return (bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1) + ' MB';
    }

    if (bytes >= 1024) {
      return Math.round(bytes / 1024) + ' KB';
    }

    return bytes + ' B';
  }

  function createAvatarMarkup(entity) {
    var photoUrl = String(entity && entity.photoUrl || '').trim();
    var label = escapeHtml(entity && entity.displayName || 'SocialEra Contact');
    var initials = escapeHtml(String(entity && entity.avatar || getInitials(entity && entity.displayName)).slice(0, 2).toUpperCase());

    return photoUrl
      ? '<img src="' + escapeHtml(photoUrl) + '" alt="' + label + '">'
      : initials;
  }

  function isMemberContact(contact) {
    return Boolean(contact && (contact.provider === 'member' || contact.role === 'member'));
  }

  function getRoleLabel(contactOrRole) {
    var role = typeof contactOrRole === 'string'
      ? contactOrRole
      : String(contactOrRole && contactOrRole.role || '').trim();

    if (isMemberContact(contactOrRole)) {
      return 'Member';
    }

    if (role === 'support') {
      return 'Support';
    }

    if (role === 'creator') {
      return 'Creator';
    }

    return 'Member';
  }

  function getChatModeLabel(contact) {
    if (isMemberContact(contact)) {
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

  function getChatIntro(contact) {
    if (!contact) {
      return 'Talk without leaving the page.';
    }

    if (isMemberContact(contact)) {
      return 'This is a direct Usapp conversation between signed-in members.';
    }

    if (contact.role === 'support') {
      return 'Use this thread for order help, account questions, and platform support.';
    }

    if (contact.topic) {
      return 'Talk about "' + contact.topic + '", the featured look, or the product drop tied to the post.';
    }

    return contact.intro || 'Start the conversation here.';
  }

  function getComposerPlaceholder(contact) {
    if (!contact) {
      return 'Write a message...';
    }

    if (isMemberContact(contact)) {
      return 'Message ' + (contact.displayName || 'member') + '...';
    }

    if (contact.role === 'support') {
      return 'Message support...';
    }

    return 'Message creator...';
  }

  function getThreadPreview(thread) {
    var lastMessage = Array.isArray(thread && thread.messages) && thread.messages.length
      ? thread.messages[thread.messages.length - 1]
      : null;

    if (lastMessage && lastMessage.text) {
      return lastMessage.text;
    }

    if (lastMessage && Array.isArray(lastMessage.attachments) && lastMessage.attachments.length) {
      var firstAttachment = lastMessage.attachments[0];
      return firstAttachment.kind === 'image'
        ? 'Sent a photo'
        : ('Sent ' + String(firstAttachment.name || 'a file'));
    }

    return thread && thread.contact && thread.contact.intro
      ? thread.contact.intro
      : 'Start the conversation here.';
  }

  window.SocialEraMessageWidgetUtils = {
    COMPOSER_EMOJIS: COMPOSER_EMOJIS,
    REACTION_EMOJIS: REACTION_EMOJIS,
    escapeHtml: escapeHtml,
    normalizeText: normalizeText,
    normalizeMessageAttachment: normalizeMessageAttachment,
    normalizeReaction: normalizeReaction,
    getInitials: getInitials,
    normalizeUserName: normalizeUserName,
    getLocalActorId: getLocalActorId,
    getActorIdFromUserId: getActorIdFromUserId,
    extractSupabaseRecord: extractSupabaseRecord,
    getSupabaseClient: getSupabaseClient,
    getUserIdFromActorId: getUserIdFromActorId,
    getSupabaseSetupMessage: getSupabaseSetupMessage,
    formatShortTime: formatShortTime,
    formatLongTime: formatLongTime,
    readJsonStorage: readJsonStorage,
    writeJsonStorage: writeJsonStorage,
    buildIcon: buildIcon,
    buildSearchIcon: buildSearchIcon,
    buildEmojiIcon: buildEmojiIcon,
    buildAttachIcon: buildAttachIcon,
    formatFileSize: formatFileSize,
    createAvatarMarkup: createAvatarMarkup,
    isMemberContact: isMemberContact,
    getRoleLabel: getRoleLabel,
    getChatModeLabel: getChatModeLabel,
    getChatIntro: getChatIntro,
    getComposerPlaceholder: getComposerPlaceholder,
    getThreadPreview: getThreadPreview
  };
})();
