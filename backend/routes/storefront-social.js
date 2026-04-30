const express = require('express');
const crypto = require('crypto');

function createSocialRoutes({
  readSocialPosts,
  writeSocialPosts,
  socialPostPersistence,
  normalizeSocialPost,
  SOCIAL_IMAGE_POOL,
  findCommentById,
  countNestedComments,
  flattenRecentComments
}) {
  const router = express.Router();

  function ensureSocialPostPersistence() {
    if (!socialPostPersistence || typeof socialPostPersistence.listPosts !== 'function') {
      const error = new Error('Social post persistence is not available.');
      error.statusCode = 503;
      throw error;
    }
  }

  async function refreshSocialPostMirror() {
    if (!socialPostPersistence || typeof socialPostPersistence.listPosts !== 'function') {
      return [];
    }

    const posts = await socialPostPersistence.listPosts();
    writeSocialPosts(posts);
    return posts;
  }

  router.get('/social/posts', async (req, res) => {
    try {
      ensureSocialPostPersistence();

      const posts = (await socialPostPersistence.listPosts())
        .map((post) => ({
          ...post,
          commentsCount: Math.max(Number(post.commentsCount || 0), Array.isArray(post.comments) ? post.comments.length : 0),
          commentPreview: post.comments.slice(-3)
        }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      writeSocialPosts(posts);

      return res.json(posts);
    } catch (error) {
      console.error('Error reading social posts:', error);
      return res.status(Number(error && error.statusCode) || 500).json({ error: 'Failed to load social posts' });
    }
  });

  router.post('/social/posts', async (req, res) => {
    try {
      ensureSocialPostPersistence();

      const displayName = String(req.body.displayName || '').trim();
      const captionTitle = String(req.body.captionTitle || '').trim();
      const captionText = String(req.body.captionText || '').trim();

      if (!displayName) {
        return res.status(400).json({ error: 'Display name is required' });
      }

      if (!captionTitle || !captionText) {
        return res.status(400).json({ error: 'Post title and caption are required' });
      }

      const newPost = await socialPostPersistence.createPost({
        id: String(req.body.id || '').trim(),
        actorId: String(req.body.actorId || '').trim(),
        userId: String(req.body.userId || '').trim(),
        channel: String(req.body.channel || 'all').trim() || 'all',
        userName: String(req.body.userName || '@socialera.member').trim() || '@socialera.member',
        displayName,
        avatar: String(req.body.avatar || displayName.slice(0, 2) || 'SE'),
        photoUrl: String(req.body.photoUrl || '').trim(),
        mediaType: String(req.body.mediaType || 'image').trim().toLowerCase() === 'video' ? 'video' : 'image',
        mediaUrl: String(req.body.mediaUrl || '').trim(),
        captionTitle,
        captionText,
        tags: Array.isArray(req.body.tags)
          ? req.body.tags.map((tag) => String(tag).trim()).filter(Boolean)
          : String(req.body.tags || '')
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean),
        linkedProductIds: Array.isArray(req.body.linkedProductIds) ? req.body.linkedProductIds : [],
        matchTitle: String(req.body.matchTitle || 'Fresh from the feed').trim() || 'Fresh from the feed',
        promoteEnabled: Boolean(req.body.promoteEnabled),
        promotedTitle: String(req.body.promotedTitle || '').trim(),
        promotedPrice: String(req.body.promotedPrice || '').trim(),
        promotedText: String(req.body.promotedText || '').trim(),
        createdAt: String(req.body.createdAt || new Date().toISOString()).trim() || new Date().toISOString()
      });
      await refreshSocialPostMirror();

      return res.status(201).json({
        ...newPost,
        commentsCount: 0,
        commentPreview: []
      });
    } catch (error) {
      console.error('Error creating social post:', error);
      return res.status(Number(error && error.statusCode) || 500).json({ error: 'Failed to create social post' });
    }
  });

  router.post('/social/posts/:id/reactions', async (req, res) => {
    try {
      ensureSocialPostPersistence();

      const postId = String(req.params.id || '').trim();
      const metric = String(req.body.metric || '').trim();
      const actorId = String(req.body.actorId || '').trim();
      const allowed = {
        likes: { actorKey: 'likeActorIds', countKey: 'likes', actorListKey: 'likeActors' },
        shares: { actorKey: 'shareActorIds', countKey: 'shares' },
        saves: { actorKey: 'shareActorIds', countKey: 'shares' }
      };

      if (!postId || !allowed[metric]) {
        return res.status(400).json({ error: 'Invalid reaction target' });
      }

      if (!actorId) {
        return res.status(400).json({ error: 'Actor ID is required' });
      }

      const result = await socialPostPersistence.togglePostReaction(postId, metric, {
        actorId,
        authorName: String(req.body.authorName || 'SocialEra Member').trim() || 'SocialEra Member',
        userName: String(req.body.userName || '@socialera').trim() || '@socialera',
        avatar: String(req.body.avatar || 'SE').trim().slice(0, 2).toUpperCase() || 'SE',
        photoUrl: String(req.body.photoUrl || '').trim()
      });

      if (!result || !result.post) {
        return res.status(404).json({ error: 'Post not found' });
      }
      await refreshSocialPostMirror();

      return res.json({
        postId,
        metric: result.metric,
        count: result.count,
        active: result.active,
        actors: result.actors
      });
    } catch (error) {
      console.error('Error updating social reaction:', error);
      return res.status(Number(error && error.statusCode) || 500).json({ error: 'Failed to update reaction' });
    }
  });

  router.post('/social/posts/:id/comments', async (req, res) => {
    try {
      ensureSocialPostPersistence();

      const postId = String(req.params.id || '').trim();
      const text = String(req.body.text || '').trim();
      const parentCommentId = String(req.body.parentCommentId || '').trim();

      if (!postId || !text) {
        return res.status(400).json({ error: 'Post ID and comment text are required' });
      }

      const result = await socialPostPersistence.createComment(postId, {
        id: String(req.body.id || crypto.randomUUID()).trim() || crypto.randomUUID(),
        actorId: String(req.body.actorId || '').trim(),
        userId: String(req.body.userId || '').trim(),
        authorName: String(req.body.authorName || 'SocialEra Member').trim() || 'SocialEra Member',
        userName: String(req.body.userName || '@socialera').trim() || '@socialera',
        avatar: String(req.body.avatar || 'SE').trim().slice(0, 2).toUpperCase() || 'SE',
        photoUrl: String(req.body.photoUrl || '').trim(),
        text,
        parentCommentId,
        createdAt: String(req.body.createdAt || new Date().toISOString()).trim() || new Date().toISOString()
      });

      if (!result || !result.post) {
        return res.status(404).json({ error: 'Post not found' });
      }
      await refreshSocialPostMirror();

      return res.status(201).json({
        postId,
        comment: result.comment,
        commentsCount: result.post.commentsCount,
        commentPreview: flattenRecentComments(result.post.comments, 3),
        comments: result.post.comments
      });
    } catch (error) {
      console.error('Error creating social comment:', error);
      return res.status(Number(error && error.statusCode) || 500).json({ error: 'Failed to create comment' });
    }
  });

  router.post('/social/posts/:postId/comments/:commentId/reactions', async (req, res) => {
    try {
      ensureSocialPostPersistence();

      const postId = String(req.params.postId || '').trim();
      const commentId = String(req.params.commentId || '').trim();
      const actorId = String(req.body.actorId || '').trim();

      if (!postId || !commentId || !actorId) {
        return res.status(400).json({ error: 'Post, comment, and actor are required' });
      }

      const result = await socialPostPersistence.toggleCommentReaction(postId, commentId, {
        actorId,
        authorName: String(req.body.authorName || 'SocialEra Member').trim() || 'SocialEra Member',
        userName: String(req.body.userName || '@socialera').trim() || '@socialera',
        avatar: String(req.body.avatar || 'SE').trim().slice(0, 2).toUpperCase() || 'SE',
        photoUrl: String(req.body.photoUrl || '').trim()
      });

      if (!result || !result.post) {
        return res.status(404).json({ error: 'Post not found' });
      }
      if (!result.comment) {
        return res.status(404).json({ error: 'Comment not found' });
      }
      await refreshSocialPostMirror();

      return res.json({
        postId,
        commentId,
        count: result.comment.likes,
        active: result.active,
        actors: result.comment.likeActors,
        comments: result.post.comments
      });
    } catch (error) {
      console.error('Error updating comment reaction:', error);
      return res.status(Number(error && error.statusCode) || 500).json({ error: 'Failed to update comment reaction' });
    }
  });

  return router;
}

module.exports = createSocialRoutes;
