const express = require('express');
const crypto = require('crypto');

function createSocialRoutes({
  readSocialPosts,
  writeSocialPosts,
  normalizeSocialPost,
  SOCIAL_IMAGE_POOL,
  findCommentById,
  countNestedComments,
  flattenRecentComments
}) {
  const router = express.Router();

  router.get('/social/posts', (req, res) => {
    try {
      const posts = readSocialPosts()
        .map((post) => ({
          ...post,
          commentsCount: Math.max(Number(post.commentsCount || 0), Array.isArray(post.comments) ? post.comments.length : 0),
          commentPreview: post.comments.slice(-3)
        }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return res.json(posts);
    } catch (error) {
      console.error('Error reading social posts:', error);
      return res.status(500).json({ error: 'Failed to load social posts' });
    }
  });

  router.post('/social/posts', (req, res) => {
    try {
      const displayName = String(req.body.displayName || '').trim();
      const captionTitle = String(req.body.captionTitle || '').trim();
      const captionText = String(req.body.captionText || '').trim();

      if (!displayName) {
        return res.status(400).json({ error: 'Display name is required' });
      }

      if (!captionTitle || !captionText) {
        return res.status(400).json({ error: 'Post title and caption are required' });
      }

      const posts = readSocialPosts();
      const mediaUrl = String(req.body.mediaUrl || '').trim();
      const mediaType = String(req.body.mediaType || 'image').trim().toLowerCase() === 'video' ? 'video' : 'image';
      const userName = String(req.body.userName || '@socialera.member').trim() || '@socialera.member';
      const channel = String(req.body.channel || 'all').trim() || 'all';
      const tags = Array.isArray(req.body.tags)
        ? req.body.tags.map((tag) => String(tag).trim()).filter(Boolean)
        : String(req.body.tags || '')
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean);

      const newPost = normalizeSocialPost({
        id: String(req.body.id || crypto.randomUUID()).trim() || crypto.randomUUID(),
        actorId: String(req.body.actorId || '').trim(),
        userId: String(req.body.userId || '').trim(),
        channel,
        userName,
        displayName,
        avatar: String(req.body.avatar || displayName.slice(0, 2) || 'SE'),
        mediaType,
        mediaUrl,
        captionTitle,
        captionText,
        tags,
        likes: 0,
        commentsCount: 0,
        shares: 0,
        createdAt: String(req.body.createdAt || new Date().toISOString()).trim() || new Date().toISOString(),
        matchTitle: String(req.body.matchTitle || 'Fresh from the feed').trim() || 'Fresh from the feed',
        promoteEnabled: Boolean(req.body.promoteEnabled),
        promotedTitle: String(req.body.promotedTitle || '').trim(),
        promotedPrice: String(req.body.promotedPrice || '').trim(),
        promotedText: String(req.body.promotedText || '').trim(),
        likeActorIds: [],
        shareActorIds: [],
        comments: []
      });

      posts.unshift(newPost);
      writeSocialPosts(posts);

      return res.status(201).json({
        ...newPost,
        commentsCount: 0,
        commentPreview: []
      });
    } catch (error) {
      console.error('Error creating social post:', error);
      return res.status(500).json({ error: 'Failed to create social post' });
    }
  });

  router.post('/social/posts/:id/reactions', (req, res) => {
    try {
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

      const posts = readSocialPosts();
      const post = posts.find((entry) => entry.id === postId);

      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }

      const { actorKey, countKey, actorListKey } = allowed[metric];
      const actorIds = Array.isArray(post[actorKey]) ? post[actorKey] : [];
      const existingIndex = actorIds.indexOf(actorId);
      const actorName = String(req.body.authorName || 'SocialEra Member').trim() || 'SocialEra Member';
      const actorUserName = String(req.body.userName || '@socialera').trim() || '@socialera';
      const actorAvatar = String(req.body.avatar || 'SE').trim().slice(0, 2).toUpperCase() || 'SE';
      const actorPhotoUrl = String(req.body.photoUrl || '').trim();
      const reactedAt = new Date().toISOString();

      if (existingIndex === -1) {
        actorIds.push(actorId);
      } else {
        actorIds.splice(existingIndex, 1);
      }

      post[actorKey] = actorIds;
      post[countKey] = Math.max(0, Number(post[countKey] || 0) + (existingIndex === -1 ? 1 : -1));
      if (countKey === 'shares') {
        post.saves = post.shares;
      }
      if (actorKey === 'shareActorIds') {
        post.saveActorIds = [...actorIds];
      }

      if (actorListKey) {
        const actorList = Array.isArray(post[actorListKey]) ? post[actorListKey] : [];
        const actorListIndex = actorList.findIndex((entry) => entry.actorId === actorId);

        if (existingIndex === -1) {
          if (actorListIndex === -1) {
            actorList.unshift({
              actorId,
              authorName: actorName,
              userName: actorUserName,
              avatar: actorAvatar,
              photoUrl: actorPhotoUrl,
              reactedAt
            });
          } else {
            actorList[actorListIndex] = {
              actorId,
              authorName: actorName,
              userName: actorUserName,
              avatar: actorAvatar,
              photoUrl: actorPhotoUrl,
              reactedAt
            };
          }
        } else if (actorListIndex !== -1) {
          actorList.splice(actorListIndex, 1);
        }

        post[actorListKey] = actorList;
      }

      writeSocialPosts(posts);

      return res.json({
        postId,
        metric: metric === 'saves' ? 'shares' : metric,
        count: post[countKey],
        active: existingIndex === -1,
        actors: actorListKey ? post[actorListKey] : undefined
      });
    } catch (error) {
      console.error('Error updating social reaction:', error);
      return res.status(500).json({ error: 'Failed to update reaction' });
    }
  });

  router.post('/social/posts/:id/comments', (req, res) => {
    try {
      const postId = String(req.params.id || '').trim();
      const text = String(req.body.text || '').trim();
      const parentCommentId = String(req.body.parentCommentId || '').trim();

      if (!postId || !text) {
        return res.status(400).json({ error: 'Post ID and comment text are required' });
      }

      const posts = readSocialPosts();
      const post = posts.find((entry) => entry.id === postId);

      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }

      const newComment = {
        id: String(req.body.id || crypto.randomUUID()).trim() || crypto.randomUUID(),
        actorId: String(req.body.actorId || '').trim(),
        userId: String(req.body.userId || '').trim(),
        authorName: String(req.body.authorName || 'SocialEra Member').trim() || 'SocialEra Member',
        userName: String(req.body.userName || '@socialera').trim() || '@socialera',
        avatar: String(req.body.avatar || 'SE').trim().slice(0, 2).toUpperCase() || 'SE',
        text,
        createdAt: String(req.body.createdAt || new Date().toISOString()).trim() || new Date().toISOString(),
        likes: 0,
        likeActorIds: [],
        likeActors: [],
        replies: []
      };

      if (parentCommentId) {
        const parentComment = findCommentById(post.comments, parentCommentId);

        if (!parentComment) {
          return res.status(404).json({ error: 'Parent comment not found' });
        }

        parentComment.replies = Array.isArray(parentComment.replies) ? parentComment.replies : [];
        parentComment.replies.push(newComment);
      } else {
        post.comments.push(newComment);
      }

      post.commentsCount = countNestedComments(post.comments);
      writeSocialPosts(posts);

      return res.status(201).json({
        postId,
        comment: newComment,
        commentsCount: post.commentsCount,
        commentPreview: flattenRecentComments(post.comments, 3),
        comments: post.comments
      });
    } catch (error) {
      console.error('Error creating social comment:', error);
      return res.status(500).json({ error: 'Failed to create comment' });
    }
  });

  router.post('/social/posts/:postId/comments/:commentId/reactions', (req, res) => {
    try {
      const postId = String(req.params.postId || '').trim();
      const commentId = String(req.params.commentId || '').trim();
      const actorId = String(req.body.actorId || '').trim();

      if (!postId || !commentId || !actorId) {
        return res.status(400).json({ error: 'Post, comment, and actor are required' });
      }

      const posts = readSocialPosts();
      const post = posts.find((entry) => entry.id === postId);

      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }

      const comment = findCommentById(post.comments, commentId);

      if (!comment) {
        return res.status(404).json({ error: 'Comment not found' });
      }

      const actorName = String(req.body.authorName || 'SocialEra Member').trim() || 'SocialEra Member';
      const actorUserName = String(req.body.userName || '@socialera').trim() || '@socialera';
      const actorAvatar = String(req.body.avatar || 'SE').trim().slice(0, 2).toUpperCase() || 'SE';
      const actorPhotoUrl = String(req.body.photoUrl || '').trim();
      const reactedAt = new Date().toISOString();
      const actorIds = Array.isArray(comment.likeActorIds) ? comment.likeActorIds : [];
      const actorList = Array.isArray(comment.likeActors) ? comment.likeActors : [];
      const existingIndex = actorIds.indexOf(actorId);
      const actorListIndex = actorList.findIndex((entry) => entry.actorId === actorId);

      if (existingIndex === -1) {
        actorIds.push(actorId);
        if (actorListIndex === -1) {
          actorList.unshift({
            actorId,
            authorName: actorName,
            userName: actorUserName,
            avatar: actorAvatar,
            photoUrl: actorPhotoUrl,
            reactedAt
          });
        }
      } else {
        actorIds.splice(existingIndex, 1);
        if (actorListIndex !== -1) {
          actorList.splice(actorListIndex, 1);
        }
      }

      comment.likeActorIds = actorIds;
      comment.likeActors = actorList;
      comment.likes = Math.max(0, Number(comment.likes || 0) + (existingIndex === -1 ? 1 : -1));
      writeSocialPosts(posts);

      return res.json({
        postId,
        commentId,
        count: comment.likes,
        active: existingIndex === -1,
        actors: comment.likeActors,
        comments: post.comments
      });
    } catch (error) {
      console.error('Error updating comment reaction:', error);
      return res.status(500).json({ error: 'Failed to update comment reaction' });
    }
  });

  return router;
}

module.exports = createSocialRoutes;
