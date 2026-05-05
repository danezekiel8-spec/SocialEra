const DEFAULT_SUPABASE_URL = 'https://kfunqpatayfkscilhncx.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ByM_npvMJj4LM_WVntb_aw_qwFPgoMj';

const DEFAULT_TABLES = {
  posts: 'social_posts',
  comments: 'social_post_comments'
};

function trimEnv(value) {
  return String(value || '').trim();
}

function buildQuery(params = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === '') {
      return;
    }

    searchParams.set(key, String(value));
  });

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

function quoteInValue(value) {
  return `"${String(value || '').replace(/"/g, '\\"')}"`;
}

function setInFilter(params, key, values) {
  const normalizedValues = Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  ));

  if (!normalizedValues.length) {
    return;
  }

  params[key] = `in.(${normalizedValues.map(quoteInValue).join(',')})`;
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function normalizeActorIds(value) {
  return Array.from(new Set(
    (Array.isArray(value) ? value : [])
      .map((entry) => String(entry || '').trim())
      .filter(Boolean)
  ));
}

function normalizeActorEntries(value, {
  defaultAuthorName = 'SocialEra Member',
  defaultUserName = '@socialera',
  defaultAvatar = 'SE'
} = {}) {
  return (Array.isArray(value) ? value : [])
    .map((actor) => ({
      actorId: String(actor && actor.actorId || '').trim(),
      authorName: String(actor && actor.authorName || defaultAuthorName).trim() || defaultAuthorName,
      userName: String(actor && actor.userName || defaultUserName).trim() || defaultUserName,
      avatar: String(actor && actor.avatar || defaultAvatar).trim().slice(0, 2).toUpperCase() || defaultAvatar,
      photoUrl: String(actor && actor.photoUrl || '').trim(),
      reactedAt: String(actor && (actor.reactedAt || actor.createdAt) || '').trim()
    }))
    .filter((actor) => actor.actorId);
}

function normalizeTags(value) {
  return (Array.isArray(value) ? value : [])
    .map((tag) => String(tag || '').trim())
    .filter(Boolean);
}

function normalizeLinkedProductIds(value) {
  return Array.from(new Set(
    (Array.isArray(value) ? value : [])
      .map((entry) => Number(entry))
      .filter((entry) => Number.isFinite(entry) && entry > 0)
  ));
}

function countNestedComments(comments) {
  return (Array.isArray(comments) ? comments : []).reduce((sum, comment) => {
    return sum + 1 + countNestedComments(comment.replies);
  }, 0);
}

function findCommentById(comments, commentId) {
  const normalizedCommentId = String(commentId || '').trim();

  for (const comment of Array.isArray(comments) ? comments : []) {
    if (comment.id === normalizedCommentId) {
      return comment;
    }

    const nested = findCommentById(comment.replies, normalizedCommentId);

    if (nested) {
      return nested;
    }
  }

  return null;
}

function normalizeCommentRow(row) {
  const authorName = String(row && (row.author_name || row.authorName) || 'SocialEra Member').trim() || 'SocialEra Member';

  return {
    id: String(row && row.id || '').trim(),
    postId: String(row && (row.post_id || row.postId) || '').trim(),
    parentCommentId: String(row && (row.parent_comment_id || row.parentCommentId) || '').trim(),
    actorId: String(row && (row.actor_id || row.actorId) || '').trim(),
    userId: String(row && (row.user_id || row.userId) || '').trim(),
    authorName,
    userName: String(row && (row.user_name || row.userName) || '@socialera').trim() || '@socialera',
    avatar: String(row && row.avatar || 'SE').trim().slice(0, 2).toUpperCase() || 'SE',
    photoUrl: String(row && (row.photo_url || row.photoUrl) || '').trim(),
    mediaUrl: String(row && (row.media_url || row.mediaUrl) || '').trim(),
    text: String(row && (row.body || row.text) || '').trim(),
    createdAt: String(row && (row.created_at || row.createdAt) || new Date().toISOString()).trim(),
    likeActorIds: normalizeActorIds(row && (row.like_actor_ids || row.likeActorIds)),
    likeActors: normalizeActorEntries(row && (row.like_actors || row.likeActors), {
      defaultAuthorName: authorName,
      defaultUserName: '@socialera',
      defaultAvatar: 'SE'
    }),
    likes: Math.max(0, Number(row && (row.likes_count ?? row.likesCount ?? row.likes) || 0)),
    replies: []
  };
}

function nestComments(rows) {
  const normalizedComments = (Array.isArray(rows) ? rows : [])
    .map((row) => normalizeCommentRow(row))
    .filter((comment) => comment.id && comment.text)
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
  const commentMap = new Map();
  const roots = [];

  normalizedComments.forEach((comment) => {
    comment.replies = [];
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

function mapPostRowToSocialPost(row, hydratedComments) {
  const displayName = String(row && (row.display_name || row.displayName) || 'SocialEra Member').trim() || 'SocialEra Member';
  const shareActorIds = normalizeActorIds(
    row && (row.save_actor_ids || row.saveActorIds || row.share_actor_ids || row.shareActorIds)
  );
  const comments = Array.isArray(hydratedComments) ? hydratedComments : [];
  const nestedCommentsCount = countNestedComments(comments);
  const shareCount = Math.max(
    0,
    Number(row && (row.saves_count ?? row.savesCount ?? row.shares ?? row.saves) || 0)
  );

  return {
    id: String(row && row.id || '').trim(),
    actorId: String(row && (row.actor_id || row.actorId) || '').trim(),
    userId: String(row && (row.user_id || row.userId) || '').trim(),
    channel: String(row && row.channel || 'all').trim() || 'all',
    userName: String(row && (row.user_name || row.userName) || '@socialera').trim() || '@socialera',
    displayName,
    avatar: String(row && row.avatar || 'SE').trim().slice(0, 2).toUpperCase() || 'SE',
    photoUrl: String(row && (row.photo_url || row.photoUrl) || '').trim(),
    mediaType: String(row && (row.media_type || row.mediaType) || 'image').trim().toLowerCase() === 'video' ? 'video' : 'image',
    mediaUrl: String(row && (row.media_url || row.mediaUrl) || '').trim(),
    captionTitle: String(row && (row.caption_title || row.captionTitle) || '').trim(),
    captionText: String(row && (row.caption_text || row.captionText) || '').trim(),
    tags: normalizeTags(row && row.tags),
    linkedProductIds: normalizeLinkedProductIds(row && (row.linked_product_ids || row.linkedProductIds)),
    likes: Math.max(0, Number(row && (row.likes_count ?? row.likesCount ?? row.likes) || 0)),
    commentsCount: Math.max(
      Math.max(0, Number(row && (row.comments_count ?? row.commentsCount) || 0)),
      nestedCommentsCount
    ),
    shares: shareCount,
    saves: shareCount,
    createdAt: String(row && (row.created_at || row.createdAt) || new Date().toISOString()).trim(),
    matchTitle: String(row && (row.match_title || row.matchTitle) || 'Seen in this post').trim() || 'Seen in this post',
    promoteEnabled: Boolean(row && (row.promote_enabled || row.promoteEnabled)),
    promotedTitle: String(row && (row.promoted_title || row.promotedTitle) || '').trim(),
    promotedPrice: String(row && (row.promoted_price || row.promotedPrice) || '').trim(),
    promotedText: String(row && (row.promoted_text || row.promotedText) || '').trim(),
    likeActorIds: normalizeActorIds(row && (row.like_actor_ids || row.likeActorIds)),
    likeActors: normalizeActorEntries(row && (row.like_actors || row.likeActors), {
      defaultAuthorName: displayName,
      defaultUserName: String(row && (row.user_name || row.userName) || '@socialera').trim() || '@socialera',
      defaultAvatar: String(row && row.avatar || 'SE').trim().slice(0, 2).toUpperCase() || 'SE'
    }),
    shareActorIds,
    saveActorIds: [...shareActorIds],
    comments
  };
}

function mapCreatePostPayload(postInput = {}) {
  const displayName = String(postInput.displayName || 'SocialEra Member').trim() || 'SocialEra Member';
  const userId = String(postInput.userId || '').trim();
  const actorId = String(postInput.actorId || (userId ? `user-${userId}` : '')).trim();
  const mediaType = String(postInput.mediaType || 'image').trim().toLowerCase() === 'video' ? 'video' : 'image';
  const payload = {
    actor_id: actorId,
    user_id: isUuidLike(userId) ? userId : null,
    display_name: displayName,
    user_name: String(postInput.userName || '@socialera.member').trim() || '@socialera.member',
    avatar: String(postInput.avatar || displayName.slice(0, 2) || 'SE').trim().slice(0, 2).toUpperCase() || 'SE',
    photo_url: String(postInput.photoUrl || '').trim(),
    channel: String(postInput.channel || 'all').trim() || 'all',
    media_type: mediaType,
    media_url: String(postInput.mediaUrl || '').trim(),
    caption_title: String(postInput.captionTitle || '').trim(),
    caption_text: String(postInput.captionText || '').trim(),
    tags: normalizeTags(postInput.tags),
    linked_product_ids: normalizeLinkedProductIds(postInput.linkedProductIds),
    match_title: String(postInput.matchTitle || 'Fresh from the feed').trim() || 'Fresh from the feed',
    promote_enabled: Boolean(postInput.promoteEnabled),
    promoted_title: String(postInput.promotedTitle || '').trim(),
    promoted_price: String(postInput.promotedPrice || '').trim(),
    promoted_text: String(postInput.promotedText || '').trim(),
    created_at: String(postInput.createdAt || '').trim() || undefined
  };

  const requestedId = String(postInput.id || '').trim();

  if (isUuidLike(requestedId)) {
    payload.id = requestedId;
  }

  return payload;
}

function createSocialPostPersistenceAdapter(options = {}) {
  const supabaseUrl = trimEnv(
    options.supabaseUrl
    || process.env.SUPABASE_URL
    || process.env.SUPABASE_PROJECT_URL
    || DEFAULT_SUPABASE_URL
  ).replace(/\/+$/, '');
  const supabasePublishableKey = trimEnv(
    options.supabasePublishableKey
    || process.env.SUPABASE_PUBLISHABLE_KEY
    || process.env.SUPABASE_ANON_KEY
    || DEFAULT_SUPABASE_PUBLISHABLE_KEY
  );
  const supabaseServiceRoleKey = trimEnv(
    options.supabaseServiceRoleKey
    || process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const fetchImpl = typeof options.fetch === 'function' ? options.fetch : fetch;
  const tables = {
    ...DEFAULT_TABLES,
    ...(options.tables && typeof options.tables === 'object' ? options.tables : {})
  };

  function hasReadAccess() {
    return Boolean(supabaseUrl && (supabaseServiceRoleKey || supabasePublishableKey) && typeof fetchImpl === 'function');
  }

  function hasWriteAccess() {
    return Boolean(supabaseUrl && supabaseServiceRoleKey && typeof fetchImpl === 'function');
  }

  function assertReadConfigured() {
    if (!hasReadAccess()) {
      const error = new Error('Supabase social post persistence is not configured for reads.');
      error.statusCode = 503;
      throw error;
    }
  }

  function assertWriteConfigured() {
    if (!hasWriteAccess()) {
      const error = new Error('Supabase social post persistence is not configured for writes.');
      error.statusCode = 503;
      throw error;
    }
  }

  function buildHeaders(key, includeJson = false, extraHeaders = {}) {
    const headers = {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...extraHeaders
    };

    if (includeJson) {
      headers['Content-Type'] = 'application/json';
    }

    return headers;
  }

  async function requestSupabase(pathname, requestOptions = {}, { requireWriteAccess = false } = {}) {
    if (requireWriteAccess) {
      assertWriteConfigured();
    } else {
      assertReadConfigured();
    }

    const response = await fetchImpl(`${supabaseUrl}/rest/v1/${pathname}`, requestOptions);

    if (!response.ok) {
      const errorText = await response.text();
      const message = errorText || `${response.status} ${response.statusText}`;
      throw new Error(message);
    }

    if (response.status === 204) {
      return null;
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async function listCommentRows(postIds) {
    const normalizedPostIds = Array.from(new Set(
      (Array.isArray(postIds) ? postIds : [])
        .map((postId) => String(postId || '').trim())
        .filter(Boolean)
    ));

    if (!normalizedPostIds.length) {
      return [];
    }

    const params = {
      select: '*',
      order: 'created_at.asc'
    };

    if (normalizedPostIds.length === 1) {
      params.post_id = `eq.${normalizedPostIds[0]}`;
    } else {
      setInFilter(params, 'post_id', normalizedPostIds);
    }

    const requestPath = `${tables.comments}${buildQuery(params)}`;
    const key = supabaseServiceRoleKey || supabasePublishableKey;
    const response = await requestSupabase(requestPath, {
      method: 'GET',
      headers: buildHeaders(key, false)
    });

    return Array.isArray(response) ? response : [];
  }

  async function hydratePosts(rows) {
    const normalizedRows = Array.isArray(rows) ? rows : [];
    const postIds = normalizedRows
      .map((row) => String(row && row.id || '').trim())
      .filter(Boolean);
    const commentRows = await listCommentRows(postIds);
    const commentsByPostId = commentRows.reduce((accumulator, commentRow) => {
      const postId = String(commentRow && (commentRow.post_id || commentRow.postId) || '').trim();

      if (!postId) {
        return accumulator;
      }

      if (!accumulator[postId]) {
        accumulator[postId] = [];
      }

      accumulator[postId].push(commentRow);
      return accumulator;
    }, {});

    return normalizedRows.map((row) => mapPostRowToSocialPost(
      row,
      nestComments(commentsByPostId[String(row && row.id || '').trim()] || [])
    ));
  }

  async function listPosts() {
    const key = supabaseServiceRoleKey || supabasePublishableKey;
    const response = await requestSupabase(
      `${tables.posts}${buildQuery({
        select: '*',
        order: 'created_at.desc'
      })}`,
      {
        method: 'GET',
        headers: buildHeaders(key, false)
      }
    );

    return hydratePosts(Array.isArray(response) ? response : []);
  }

  async function getPostById(postId) {
    const normalizedPostId = String(postId || '').trim();

    if (!normalizedPostId) {
      return null;
    }

    const key = supabaseServiceRoleKey || supabasePublishableKey;
    const response = await requestSupabase(
      `${tables.posts}${buildQuery({
        select: '*',
        id: `eq.${normalizedPostId}`,
        limit: 1
      })}`,
      {
        method: 'GET',
        headers: buildHeaders(key, false)
      }
    );
    const rows = Array.isArray(response) ? response : [];

    if (!rows[0]) {
      return null;
    }

    const hydratedPosts = await hydratePosts([rows[0]]);
    return hydratedPosts[0] || null;
  }

  async function listHydratedComments(postId) {
    const normalizedPostId = String(postId || '').trim();

    if (!normalizedPostId) {
      return [];
    }

    const commentRows = await listCommentRows([normalizedPostId]);
    return nestComments(commentRows);
  }

  async function createPost(postInput = {}) {
    const payload = mapCreatePostPayload(postInput);
    const response = await requestSupabase(
      tables.posts,
      {
        method: 'POST',
        headers: buildHeaders(supabaseServiceRoleKey, true, {
          Prefer: 'return=representation'
        }),
        body: JSON.stringify([payload])
      },
      { requireWriteAccess: true }
    );
    const rows = Array.isArray(response) ? response : [];

    if (!rows[0]) {
      throw new Error('Supabase social post create did not return a row.');
    }

    const hydratedPost = await getPostById(rows[0].id);
    return hydratedPost || mapPostRowToSocialPost(rows[0], []);
  }

  async function createComment(postId, commentInput = {}) {
    const normalizedPostId = String(postId || '').trim();

    if (!normalizedPostId) {
      throw new Error('Post ID is required.');
    }

    const parentCommentId = String(commentInput.parentCommentId || '').trim();
    const userId = String(commentInput.userId || '').trim();
    const requestedId = String(commentInput.id || '').trim();
    const payload = {
      post_id: normalizedPostId,
      parent_comment_id: isUuidLike(parentCommentId) ? parentCommentId : null,
      actor_id: String(commentInput.actorId || '').trim(),
      user_id: isUuidLike(userId) ? userId : null,
      author_name: String(commentInput.authorName || 'SocialEra Member').trim() || 'SocialEra Member',
      user_name: String(commentInput.userName || '@socialera').trim() || '@socialera',
      avatar: String(commentInput.avatar || 'SE').trim().slice(0, 2).toUpperCase() || 'SE',
      photo_url: String(commentInput.photoUrl || '').trim(),
      media_url: String(commentInput.mediaUrl || '').trim(),
      body: String(commentInput.text || '').trim(),
      created_at: String(commentInput.createdAt || '').trim() || undefined
    };

    if (isUuidLike(requestedId)) {
      payload.id = requestedId;
    }

    const response = await requestSupabase(
      tables.comments,
      {
        method: 'POST',
        headers: buildHeaders(supabaseServiceRoleKey, true, {
          Prefer: 'return=representation'
        }),
        body: JSON.stringify([payload])
      },
      { requireWriteAccess: true }
    );
    const rows = Array.isArray(response) ? response : [];

    if (!rows[0]) {
      throw new Error('Supabase social comment create did not return a row.');
    }

    const hydratedPost = await getPostById(normalizedPostId);

    if (!hydratedPost) {
      throw new Error('Hydrated post could not be loaded after comment create.');
    }

    return {
      post: hydratedPost,
      comment: findCommentById(hydratedPost.comments, rows[0].id)
    };
  }

  async function togglePostReaction(postId, metric, actorInput = {}) {
    const post = await getPostById(postId);

    if (!post) {
      return null;
    }

    const actorId = String(actorInput.actorId || '').trim();

    if (!actorId) {
      throw new Error('Actor ID is required.');
    }

    const isLikeMetric = metric === 'likes';
    const currentIds = isLikeMetric
      ? normalizeActorIds(post.likeActorIds)
      : normalizeActorIds(post.saveActorIds || post.shareActorIds);
    const currentlyActive = currentIds.includes(actorId);
    const nextIds = currentlyActive
      ? currentIds.filter((entry) => entry !== actorId)
      : [...currentIds, actorId];
    const nextActors = isLikeMetric
      ? (() => {
          const currentActors = normalizeActorEntries(post.likeActors, {
            defaultAuthorName: post.displayName,
            defaultUserName: post.userName,
            defaultAvatar: post.avatar
          });
          const actorIndex = currentActors.findIndex((entry) => entry.actorId === actorId);

          if (currentlyActive) {
            if (actorIndex !== -1) {
              currentActors.splice(actorIndex, 1);
            }
            return currentActors;
          }

          const actorEntry = {
            actorId,
            authorName: String(actorInput.authorName || 'SocialEra Member').trim() || 'SocialEra Member',
            userName: String(actorInput.userName || '@socialera').trim() || '@socialera',
            avatar: String(actorInput.avatar || 'SE').trim().slice(0, 2).toUpperCase() || 'SE',
            photoUrl: String(actorInput.photoUrl || '').trim(),
            reactedAt: new Date().toISOString()
          };

          if (actorIndex === -1) {
            currentActors.unshift(actorEntry);
          } else {
            currentActors[actorIndex] = actorEntry;
          }

          return currentActors;
        })()
      : normalizeActorEntries([]);

    const payload = isLikeMetric
      ? {
          likes_count: nextIds.length,
          like_actor_ids: nextIds,
          like_actors: nextActors
        }
      : {
          saves_count: nextIds.length,
          save_actor_ids: nextIds
        };

    const response = await requestSupabase(
      `${tables.posts}${buildQuery({
        id: `eq.${String(post.id).trim()}`
      })}`,
      {
        method: 'PATCH',
        headers: buildHeaders(supabaseServiceRoleKey, true, {
          Prefer: 'return=representation'
        }),
        body: JSON.stringify(payload)
      },
      { requireWriteAccess: true }
    );
    const rows = Array.isArray(response) ? response : [];

    if (!rows[0]) {
      throw new Error('Supabase social post reaction update did not return a row.');
    }

    const hydratedPost = await getPostById(post.id);

    if (!hydratedPost) {
      throw new Error('Hydrated post could not be loaded after reaction update.');
    }

    return {
      post: hydratedPost,
      active: !currentlyActive,
      metric: metric === 'saves' ? 'shares' : metric,
      actors: isLikeMetric ? hydratedPost.likeActors : undefined,
      count: isLikeMetric ? hydratedPost.likes : hydratedPost.saves
    };
  }

  async function toggleCommentReaction(postId, commentId, actorInput = {}) {
    const post = await getPostById(postId);

    if (!post) {
      return { post: null, comment: null, active: false };
    }

    const comment = findCommentById(post.comments, commentId);

    if (!comment) {
      return { post, comment: null, active: false };
    }

    const actorId = String(actorInput.actorId || '').trim();

    if (!actorId) {
      throw new Error('Actor ID is required.');
    }

    const currentIds = normalizeActorIds(comment.likeActorIds);
    const currentlyActive = currentIds.includes(actorId);
    const nextIds = currentlyActive
      ? currentIds.filter((entry) => entry !== actorId)
      : [...currentIds, actorId];
    const nextActors = (() => {
      const currentActors = normalizeActorEntries(comment.likeActors, {
        defaultAuthorName: comment.authorName,
        defaultUserName: comment.userName,
        defaultAvatar: comment.avatar
      });
      const actorIndex = currentActors.findIndex((entry) => entry.actorId === actorId);

      if (currentlyActive) {
        if (actorIndex !== -1) {
          currentActors.splice(actorIndex, 1);
        }
        return currentActors;
      }

      const actorEntry = {
        actorId,
        authorName: String(actorInput.authorName || 'SocialEra Member').trim() || 'SocialEra Member',
        userName: String(actorInput.userName || '@socialera').trim() || '@socialera',
        avatar: String(actorInput.avatar || 'SE').trim().slice(0, 2).toUpperCase() || 'SE',
        photoUrl: String(actorInput.photoUrl || '').trim(),
        reactedAt: new Date().toISOString()
      };

      if (actorIndex === -1) {
        currentActors.unshift(actorEntry);
      } else {
        currentActors[actorIndex] = actorEntry;
      }

      return currentActors;
    })();

    const response = await requestSupabase(
      `${tables.comments}${buildQuery({
        id: `eq.${String(comment.id).trim()}`
      })}`,
      {
        method: 'PATCH',
        headers: buildHeaders(supabaseServiceRoleKey, true, {
          Prefer: 'return=representation'
        }),
        body: JSON.stringify({
          likes_count: nextIds.length,
          like_actor_ids: nextIds,
          like_actors: nextActors
        })
      },
      { requireWriteAccess: true }
    );
    const rows = Array.isArray(response) ? response : [];

    if (!rows[0]) {
      throw new Error('Supabase social comment reaction update did not return a row.');
    }

    const hydratedPost = await getPostById(post.id);

    if (!hydratedPost) {
      throw new Error('Hydrated post could not be loaded after comment reaction update.');
    }

    return {
      post: hydratedPost,
      comment: findCommentById(hydratedPost.comments, comment.id),
      active: !currentlyActive
    };
  }

  function getSourceStatus() {
    return {
      mode: hasWriteAccess() ? 'supabase' : (hasReadAccess() ? 'supabase-readonly' : 'unconfigured'),
      readConfigured: hasReadAccess(),
      writeConfigured: hasWriteAccess()
    };
  }

  return {
    isConfigured: hasReadAccess,
    hasWriteAccess,
    getSourceStatus,
    listPosts,
    getPostById,
    createPost,
    listHydratedComments,
    createComment,
    togglePostReaction,
    toggleCommentReaction
  };
}

module.exports = {
  createSocialPostPersistenceAdapter
};
