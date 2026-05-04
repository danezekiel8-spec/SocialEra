export function createInitialFeedVisibleCount(feedRenderBatch) {
  return {
    home: feedRenderBatch.home,
    videos: feedRenderBatch.videos
  };
}

export function getMessagingSignature(threads = []) {
  return (Array.isArray(threads) ? threads : []).map((thread) => {
    const latestMessage = Array.isArray(thread.messages) && thread.messages.length
      ? thread.messages[thread.messages.length - 1]
      : null;

    return [
      thread.id,
      thread.updatedAt || '',
      thread.unread ? '1' : '0',
      latestMessage ? latestMessage.id || '' : '',
      latestMessage ? latestMessage.createdAt || '' : '',
      latestMessage ? latestMessage.text || '' : '',
      latestMessage ? latestMessage.senderActorId || '' : ''
    ].join('|');
  }).join('||');
}

export function getMessageContactsSignature(contacts = []) {
  return (Array.isArray(contacts) ? contacts : []).map((contact) => {
    return [
      contact.actorId || '',
      contact.displayName || '',
      contact.userName || '',
      contact.updatedAt || '',
      contact.lastActiveAt || ''
    ].join('|');
  }).join('||');
}

export function shouldRenderMainViewForMessaging(activeView, normalizeView) {
  return normalizeView(activeView) === 'inbox';
}

export function normalizeView(value) {
  return String(value || '').trim().toLowerCase();
}

export function getNotificationSignature(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => {
    return [
      item.id || '',
      item.kind || '',
      item.unread ? '1' : '0',
      item.postId || '',
      item.threadId || '',
      item.createdAt || ''
    ].join('|');
  }).join('||');
}

export function getPostActivitySignature(posts = []) {
  return (Array.isArray(posts) ? posts : []).map((post) => {
    return [
      post.id || '',
      post.updatedAt || '',
      post.likes || 0,
      post.shares || 0,
      post.comments || 0
    ].join('|');
  }).join('||');
}

export function getUnreadNotificationCount(items = []) {
  return (Array.isArray(items) ? items : []).filter((item) => item.unread).length;
}

export function titleCase(value) {
  return String(value || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
