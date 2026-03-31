const crypto = require('crypto');

const SOCIAL_IMAGE_POOL = [
  'assets/hero-1.jpg',
  'assets/hero-2.jpg',
  'assets/hero-3.jpg',
  'assets/hero-4.jpg',
  'assets/product-1.jpg',
  'assets/product-2.jpg',
  'assets/product-3.jpg',
  'assets/product-4.jpg',
  'assets/product-5.jpg'
];

function normalizeSocialComment(comment) {
  return {
    id: String(comment.id || crypto.randomUUID()),
    actorId: String(comment.actorId || '').trim(),
    userId: String(comment.userId || '').trim(),
    authorName: String(comment.authorName || 'SocialEra Member').trim() || 'SocialEra Member',
    userName: String(comment.userName || '@socialera').trim() || '@socialera',
    avatar: String(comment.avatar || 'SE').trim().slice(0, 2).toUpperCase() || 'SE',
    text: String(comment.text || '').trim(),
    createdAt: comment.createdAt || new Date().toISOString(),
    likeActorIds: Array.isArray(comment.likeActorIds) ? comment.likeActorIds.map((id) => String(id)) : [],
    likeActors: Array.isArray(comment.likeActors)
      ? comment.likeActors.map((actor) => ({
        actorId: String(actor.actorId || '').trim(),
        authorName: String(actor.authorName || 'SocialEra Member').trim() || 'SocialEra Member',
        userName: String(actor.userName || '@socialera').trim() || '@socialera',
        avatar: String(actor.avatar || 'SE').trim().slice(0, 2).toUpperCase() || 'SE',
        photoUrl: String(actor.photoUrl || '').trim(),
        reactedAt: String(actor.reactedAt || actor.createdAt || '').trim()
      })).filter((actor) => actor.actorId)
      : [],
    likes: Number(comment.likes || 0),
    replies: Array.isArray(comment.replies) ? comment.replies.map(normalizeSocialComment).filter((entry) => entry.text) : []
  };
}

function normalizeSocialPost(post) {
  const shareCount = Number(post.shares != null ? post.shares : (post.saves != null ? post.saves : 0));
  const shareActorIds = Array.isArray(post.shareActorIds)
    ? post.shareActorIds.map((id) => String(id))
    : Array.isArray(post.saveActorIds)
      ? post.saveActorIds.map((id) => String(id))
      : [];

  return {
    id: String(post.id || crypto.randomUUID()),
    actorId: String(post.actorId || '').trim(),
    userId: String(post.userId || '').trim(),
    channel: String(post.channel || 'all').trim() || 'all',
    userName: String(post.userName || '@socialera').trim() || '@socialera',
    displayName: String(post.displayName || 'SocialEra Member').trim() || 'SocialEra Member',
    avatar: String(post.avatar || 'SE').trim().slice(0, 2).toUpperCase() || 'SE',
    mediaType: String(post.mediaType || 'image').trim() || 'image',
    mediaUrl: String(post.mediaUrl || '').trim(),
    captionTitle: String(post.captionTitle || '').trim(),
    captionText: String(post.captionText || '').trim(),
    tags: Array.isArray(post.tags) ? post.tags.map((tag) => String(tag).trim()).filter(Boolean) : [],
    likes: Number(post.likes || 0),
    commentsCount: Number(post.commentsCount || 0),
    shares: shareCount,
    saves: shareCount,
    createdAt: post.createdAt || new Date().toISOString(),
    matchTitle: String(post.matchTitle || 'Seen in this post').trim() || 'Seen in this post',
    promoteEnabled: Boolean(post.promoteEnabled || false),
    promotedTitle: String(post.promotedTitle || '').trim(),
    promotedPrice: String(post.promotedPrice || '').trim(),
    promotedText: String(post.promotedText || '').trim(),
    likeActorIds: Array.isArray(post.likeActorIds) ? post.likeActorIds.map((id) => String(id)) : [],
    likeActors: Array.isArray(post.likeActors)
      ? post.likeActors.map((actor) => ({
          actorId: String(actor.actorId || '').trim(),
          authorName: String(actor.authorName || 'SocialEra Member').trim() || 'SocialEra Member',
          userName: String(actor.userName || '@socialera').trim() || '@socialera',
          avatar: String(actor.avatar || 'SE').trim().slice(0, 2).toUpperCase() || 'SE',
          photoUrl: String(actor.photoUrl || '').trim(),
          reactedAt: String(actor.reactedAt || actor.createdAt || '').trim()
        })).filter((actor) => actor.actorId)
      : [],
    shareActorIds,
    saveActorIds: [...shareActorIds],
    comments: Array.isArray(post.comments) ? post.comments.map(normalizeSocialComment).filter((comment) => comment.text) : []
  };
}

function flattenRecentComments(comments, limit = 3) {
  const flattened = [];

  function visit(list) {
    list.forEach((comment) => {
      flattened.push(comment);
      if (Array.isArray(comment.replies) && comment.replies.length) {
        visit(comment.replies);
      }
    });
  }

  visit(Array.isArray(comments) ? comments : []);
  return flattened.slice(-limit);
}

function countNestedComments(comments) {
  return (Array.isArray(comments) ? comments : []).reduce((sum, comment) => {
    const replyCount = Array.isArray(comment.replies) ? countNestedComments(comment.replies) : 0;
    return sum + 1 + replyCount;
  }, 0);
}

function findCommentById(comments, commentId) {
  for (const comment of Array.isArray(comments) ? comments : []) {
    if (comment.id === commentId) {
      return comment;
    }

    const nested = findCommentById(comment.replies, commentId);
    if (nested) {
      return nested;
    }
  }

  return null;
}

module.exports = {
  SOCIAL_IMAGE_POOL,
  normalizeSocialPost,
  flattenRecentComments,
  countNestedComments,
  findCommentById
};
