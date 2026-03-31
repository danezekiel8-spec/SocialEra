(function () {
  if (window.SocialEraStorefrontShared) {
    return;
  }

  var cachedIdentity = null;
  var API_PRODUCTS_ENDPOINT = '/api/products';
  var API_SOCIAL_POSTS_ENDPOINT = '/api/social/posts';

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getDisplayInitials(value) {
    var words = String(value || 'SE')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);

    if (!words.length) {
      return 'SE';
    }

    return words.map(function (word) {
      return word.charAt(0);
    }).join('').toUpperCase();
  }

  function normalizeUserName(value, fallback) {
    var seed = String(value || fallback || 'socialera.member')
      .trim()
      .replace(/^@+/, '');

    return '@' + (seed || 'socialera.member');
  }

  function getSupabaseClient() {
    return window.supabase && typeof window.supabase.from === 'function'
      ? window.supabase
      : null;
  }

  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizeActorList(value) {
    return ensureArray(value).map(function (entry) {
      return String(entry || '').trim();
    }).filter(Boolean);
  }

  function getLocalSocialActorId() {
    var actorId = localStorage.getItem('socialeraActorId') || localStorage.getItem('socialeraLocalActorId');

    if (actorId) {
      localStorage.setItem('socialeraActorId', actorId);
      localStorage.setItem('socialeraLocalActorId', actorId);
      return actorId;
    }

    actorId = 'guest-' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('socialeraActorId', actorId);
    localStorage.setItem('socialeraLocalActorId', actorId);
    return actorId;
  }

  function buildFallbackIdentity() {
    return {
      actorId: getLocalSocialActorId(),
      userId: '',
      displayName: 'SocialEra Member',
      userName: '@socialera.member',
      avatar: 'SE',
      photoUrl: '',
      mode: 'local'
    };
  }

  async function loadSocialIdentity() {
    var fallback = buildFallbackIdentity();

    if (!window.supabase || !window.supabase.auth) {
      cachedIdentity = fallback;
      return fallback;
    }

    try {
      var result = await window.supabase.auth.getUser();
      var user = result && result.data ? result.data.user : null;

      if (!user) {
        cachedIdentity = fallback;
        return fallback;
      }

      var meta = user.user_metadata || {};
      var fullName = String(meta.full_name || meta.display_name || user.email || 'SocialEra Member').trim() || 'SocialEra Member';
      var usernameBase = String(meta.username || user.email || 'socialera.member')
        .split('@')[0]
        .trim()
        .replace(/^@+/, '') || 'socialera.member';

      cachedIdentity = {
        actorId: 'user-' + String(user.id || '').trim(),
        userId: String(user.id || '').trim(),
        displayName: fullName,
        userName: '@' + usernameBase,
        avatar: getDisplayInitials(fullName),
        photoUrl: String(meta.avatar_url || meta.picture || meta.avatar || '').trim(),
        mode: 'account'
      };

      return cachedIdentity;
    } catch (error) {
      console.warn('Failed to load storefront identity:', error);
      cachedIdentity = fallback;
      return fallback;
    }
  }

  function getSocialIdentity() {
    if (cachedIdentity) {
      return cachedIdentity;
    }

    cachedIdentity = buildFallbackIdentity();
    return cachedIdentity;
  }

  function renderHeaderProfile(profileLink, identity) {
    if (!profileLink) {
      return;
    }

    var safeLabel = escapeHtml(identity && identity.displayName || 'Profile');
    var safeInitials = escapeHtml(getDisplayInitials(identity && (identity.displayName || identity.avatar) || 'SE'));
    var rawPhoto = String(identity && identity.photoUrl || '').trim();
    var safePhoto = rawPhoto.replace(/"/g, '&quot;');

    profileLink.setAttribute('title', safeLabel);
    profileLink.setAttribute('aria-label', safeLabel);
    profileLink.innerHTML = rawPhoto
      ? '<img src="' + safePhoto + '" alt="' + safeLabel + '" class="header-profile-avatar-image">'
      : '<span class="header-profile-avatar-fallback">' + safeInitials + '</span>';
  }

  async function updateAuthNavigation(profileLink) {
    var identity = await loadSocialIdentity();

    if (profileLink) {
      profileLink.setAttribute('href', identity.mode === 'account' ? 'account.html' : 'login.html');
      renderHeaderProfile(profileLink, identity);
    }

    return identity;
  }

  function mapProductRecord(product, index) {
    var record = product || {};

    return {
      id: record.id != null ? record.id : index + 1,
      name: record.name != null ? record.name : 'Untitled Product',
      price: Number(record.price != null ? record.price : 0),
      category: record.category != null ? record.category : '',
      description: record.description != null ? record.description : '',
      image: record.image != null ? record.image : '',
      stock: Number(record.stock != null ? record.stock : 0),
      featured: Boolean(record.featured),
      saleEnabled: Boolean(record.saleEnabled != null ? record.saleEnabled : record.sale_enabled),
      salePrice: Number(record.salePrice != null ? record.salePrice : (record.sale_price != null ? record.sale_price : 0)),
      saleLabel: record.saleLabel != null ? record.saleLabel : (record.sale_label != null ? record.sale_label : 'Sale'),
      fulfillmentType: record.fulfillmentType != null ? record.fulfillmentType : (record.fulfillment_type != null ? record.fulfillment_type : 'inhouse'),
      supplierName: record.supplierName != null ? record.supplierName : (record.supplier_name != null ? record.supplier_name : ''),
      supplierSku: record.supplierSku != null ? record.supplierSku : (record.supplier_sku != null ? record.supplier_sku : ''),
      supplierCost: Number(record.supplierCost != null ? record.supplierCost : (record.supplier_cost != null ? record.supplier_cost : 0)),
      supplierLink: record.supplierLink != null ? record.supplierLink : (record.supplier_link != null ? record.supplier_link : ''),
      processingTime: record.processingTime != null ? record.processingTime : (record.processing_time != null ? record.processing_time : ''),
      shippingTime: record.shippingTime != null ? record.shippingTime : (record.shipping_time != null ? record.shipping_time : '')
    };
  }

  async function fetchProductsFromApi() {
    var response = await fetch(API_PRODUCTS_ENDPOINT, {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      throw new Error('Request failed: ' + response.status + ' ' + response.statusText);
    }

    var data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error('API did not return an array of products.');
    }

    return data;
  }

  async function fetchProductsFromSupabase() {
    var supabase = getSupabaseClient();

    if (!supabase) {
      throw new Error('Supabase is not available for products.');
    }

    var result = await supabase
      .from('store_products')
      .select('*')
      .order('featured', { ascending: false })
      .order('created_at', { ascending: false });

    if (result.error) {
      throw result.error;
    }

    return ensureArray(result.data);
  }

  async function fetchProductsArray() {
    try {
      return await fetchProductsFromApi();
    } catch (apiError) {
      console.warn('Falling back to Supabase products:', apiError);
      return fetchProductsFromSupabase();
    }
  }

  function mapSocialCommentRecord(comment) {
    var record = comment || {};
    var authorName = String(record.authorName != null ? record.authorName : (record.author_name != null ? record.author_name : 'SocialEra Member')).trim() || 'SocialEra Member';

    return {
      id: String(record.id || ''),
      postId: String(record.postId != null ? record.postId : (record.post_id != null ? record.post_id : '')).trim(),
      parentCommentId: String(record.parentCommentId != null ? record.parentCommentId : (record.parent_comment_id != null ? record.parent_comment_id : '')).trim(),
      actorId: String(record.actorId != null ? record.actorId : (record.actor_id != null ? record.actor_id : '')).trim(),
      userId: String(record.userId != null ? record.userId : (record.user_id != null ? record.user_id : '')).trim(),
      authorName: authorName,
      userName: normalizeUserName(record.userName != null ? record.userName : (record.user_name != null ? record.user_name : ''), authorName),
      avatar: getDisplayInitials(record.avatar != null ? record.avatar : authorName),
      text: String(record.text != null ? record.text : (record.body != null ? record.body : '')).trim(),
      likes: Number(record.likes != null ? record.likes : (record.likesCount != null ? record.likesCount : (record.likes_count != null ? record.likes_count : 0))),
      likeActorIds: normalizeActorList(record.likeActorIds != null ? record.likeActorIds : record.like_actor_ids),
      likeActors: ensureArray(record.likeActors != null ? record.likeActors : record.like_actors),
      createdAt: String(record.createdAt != null ? record.createdAt : (record.created_at != null ? record.created_at : new Date().toISOString())),
      replies: []
    };
  }

  function nestSocialComments(comments) {
    var normalizedComments = ensureArray(comments)
      .map(mapSocialCommentRecord)
      .filter(function (comment) {
        return comment && comment.id;
      })
      .sort(function (left, right) {
        return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      });

    var commentMap = new Map();
    var roots = [];

    normalizedComments.forEach(function (comment) {
      comment.replies = [];
      commentMap.set(comment.id, comment);
    });

    normalizedComments.forEach(function (comment) {
      if (comment.parentCommentId && commentMap.has(comment.parentCommentId)) {
        commentMap.get(comment.parentCommentId).replies.push(comment);
        return;
      }

      roots.push(comment);
    });

    return roots;
  }

  function mapSocialPostRecord(post, comments) {
    var record = post || {};
    var displayName = String(record.displayName != null ? record.displayName : (record.display_name != null ? record.display_name : 'SocialEra Member')).trim() || 'SocialEra Member';
    var commentsData = nestSocialComments(comments);
    var mediaUrl = String(record.mediaUrl != null ? record.mediaUrl : (record.media_url != null ? record.media_url : '')).trim();
    var shareCount = Number(
      record.shares != null
        ? record.shares
        : (record.sharesCount != null
            ? record.sharesCount
            : (record.saves != null
                ? record.saves
                : (record.savesCount != null ? record.savesCount : (record.saves_count != null ? record.saves_count : 0))))
    );
    var shareActorIds = normalizeActorList(
      record.shareActorIds != null
        ? record.shareActorIds
        : (record.share_actor_ids != null
            ? record.share_actor_ids
            : (record.saveActorIds != null ? record.saveActorIds : record.save_actor_ids))
    );

    return {
      id: String(record.id || ''),
      actorId: String(record.actorId != null ? record.actorId : (record.actor_id != null ? record.actor_id : '')).trim(),
      userId: String(record.userId != null ? record.userId : (record.user_id != null ? record.user_id : '')).trim(),
      displayName: displayName,
      userName: normalizeUserName(record.userName != null ? record.userName : (record.user_name != null ? record.user_name : ''), displayName),
      avatar: getDisplayInitials(record.avatar != null ? record.avatar : displayName),
      photoUrl: String(record.photoUrl != null ? record.photoUrl : (record.photo_url != null ? record.photo_url : '')).trim(),
      channel: String(record.channel != null ? record.channel : '').trim(),
      mediaType: String(record.mediaType != null ? record.mediaType : (record.media_type != null ? record.media_type : 'image')).trim() || 'image',
      mediaUrl: mediaUrl,
      mediaGallery: ensureArray(record.mediaGallery != null ? record.mediaGallery : record.media_gallery).filter(Boolean).length
        ? ensureArray(record.mediaGallery != null ? record.mediaGallery : record.media_gallery).filter(Boolean)
        : (mediaUrl ? [mediaUrl] : []),
      posterUrl: String(record.posterUrl != null ? record.posterUrl : (record.poster_url != null ? record.poster_url : '')).trim(),
      captionTitle: String(record.captionTitle != null ? record.captionTitle : (record.caption_title != null ? record.caption_title : '')).trim(),
      captionText: String(record.captionText != null ? record.captionText : (record.caption_text != null ? record.caption_text : '')).trim(),
      tags: ensureArray(record.tags).map(function (tag) { return String(tag || '').trim(); }).filter(Boolean),
      matchTitle: String(record.matchTitle != null ? record.matchTitle : (record.match_title != null ? record.match_title : 'Seen in this post')).trim() || 'Seen in this post',
      promoteEnabled: Boolean(record.promoteEnabled != null ? record.promoteEnabled : record.promote_enabled),
      promotedTitle: String(record.promotedTitle != null ? record.promotedTitle : (record.promoted_title != null ? record.promoted_title : '')).trim(),
      promotedPrice: String(record.promotedPrice != null ? record.promotedPrice : (record.promoted_price != null ? record.promoted_price : '')).trim(),
      promotedText: String(record.promotedText != null ? record.promotedText : (record.promoted_text != null ? record.promoted_text : '')).trim(),
      likes: Number(record.likes != null ? record.likes : (record.likesCount != null ? record.likesCount : (record.likes_count != null ? record.likes_count : 0))),
      comments: Number(record.comments != null ? record.comments : (record.commentsCount != null ? record.commentsCount : (record.comments_count != null ? record.comments_count : commentsData.length))),
      commentsData: commentsData,
      commentPreview: commentsData.slice(-3),
      shares: shareCount,
      saves: shareCount,
      likeActorIds: normalizeActorList(record.likeActorIds != null ? record.likeActorIds : record.like_actor_ids),
      likeActors: ensureArray(record.likeActors != null ? record.likeActors : record.like_actors),
      shareActorIds: shareActorIds,
      saveActorIds: shareActorIds.slice(),
      createdAt: String(record.createdAt != null ? record.createdAt : (record.created_at != null ? record.created_at : new Date().toISOString())),
      updatedAt: String(record.updatedAt != null ? record.updatedAt : (record.updated_at != null ? record.updated_at : new Date().toISOString()))
    };
  }

  async function fetchSocialPostsFromApi() {
    var response = await fetch(API_SOCIAL_POSTS_ENDPOINT, {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      throw new Error('Request failed: ' + response.status + ' ' + response.statusText);
    }

    var data = await response.json();
    return Array.isArray(data) ? data : [];
  }

  async function fetchSocialPostsFromSupabase() {
    var supabase = getSupabaseClient();

    if (!supabase) {
      throw new Error('Supabase is not available for social posts.');
    }

    var postsResult = await supabase
      .from('social_posts')
      .select('*')
      .order('created_at', { ascending: false });

    if (postsResult.error) {
      throw postsResult.error;
    }

    var commentsResult = await supabase
      .from('social_post_comments')
      .select('*')
      .order('created_at', { ascending: true });

    if (commentsResult.error) {
      throw commentsResult.error;
    }

    var commentsByPostId = {};

    ensureArray(commentsResult.data).forEach(function (comment) {
      var normalizedComment = mapSocialCommentRecord(comment);

      if (!normalizedComment.postId) {
        return;
      }

      if (!commentsByPostId[normalizedComment.postId]) {
        commentsByPostId[normalizedComment.postId] = [];
      }

      commentsByPostId[normalizedComment.postId].push(normalizedComment);
    });

    return ensureArray(postsResult.data).map(function (post) {
      return mapSocialPostRecord(post, commentsByPostId[String(post.id || '')] || []);
    });
  }

  async function fetchSocialPostsArray() {
    try {
      return await fetchSocialPostsFromApi();
    } catch (apiError) {
      console.warn('Falling back to Supabase social posts:', apiError);
      return fetchSocialPostsFromSupabase();
    }
  }

  async function syncSocialPostToSupabase(post) {
    var supabase = getSupabaseClient();
    var socialPost = post || {};

    if (!supabase || !socialPost.userId || !socialPost.actorId) {
      return null;
    }

    var result = await supabase
      .from('social_posts')
      .insert({
        id: String(socialPost.id || '').trim() || undefined,
        actor_id: String(socialPost.actorId || '').trim(),
        user_id: String(socialPost.userId || '').trim(),
        display_name: String(socialPost.displayName || 'SocialEra Member').trim() || 'SocialEra Member',
        user_name: normalizeUserName(socialPost.userName, socialPost.displayName),
        avatar: getDisplayInitials(socialPost.avatar || socialPost.displayName || 'SE'),
        channel: String(socialPost.channel || 'all').trim() || 'all',
        media_type: String(socialPost.mediaType || 'image').trim() || 'image',
        media_url: String(socialPost.mediaUrl || '').trim(),
        caption_title: String(socialPost.captionTitle || '').trim(),
        caption_text: String(socialPost.captionText || '').trim(),
        tags: ensureArray(socialPost.tags).map(function (tag) {
          return String(tag || '').trim();
        }).filter(Boolean),
        match_title: String(socialPost.matchTitle || 'Fresh from the feed').trim() || 'Fresh from the feed',
        promote_enabled: Boolean(socialPost.promoteEnabled),
        promoted_title: String(socialPost.promotedTitle || '').trim(),
        promoted_price: String(socialPost.promotedPrice || '').trim(),
        promoted_text: String(socialPost.promotedText || '').trim(),
        created_at: String(socialPost.createdAt || '').trim() || undefined
      })
      .select('*')
      .single();

    if (result.error) {
      throw result.error;
    }

    return mapSocialPostRecord(result.data, []);
  }

  async function syncSocialCommentToSupabase(postId, comment) {
    var supabase = getSupabaseClient();
    var socialComment = comment || {};
    var normalizedPostId = String(postId || '').trim();

    if (!supabase || !normalizedPostId || !socialComment.userId || !socialComment.actorId) {
      return null;
    }

    var result = await supabase
      .from('social_post_comments')
      .insert({
        id: String(socialComment.id || '').trim() || undefined,
        post_id: normalizedPostId,
        parent_comment_id: String(socialComment.parentCommentId || '').trim() || null,
        actor_id: String(socialComment.actorId || '').trim(),
        user_id: String(socialComment.userId || '').trim(),
        author_name: String(socialComment.authorName || 'SocialEra Member').trim() || 'SocialEra Member',
        user_name: normalizeUserName(socialComment.userName, socialComment.authorName),
        avatar: getDisplayInitials(socialComment.avatar || socialComment.authorName || 'SE'),
        body: String(socialComment.text || '').trim(),
        created_at: String(socialComment.createdAt || '').trim() || undefined
      })
      .select('*')
      .single();

    if (result.error) {
      throw result.error;
    }

    return mapSocialCommentRecord(result.data);
  }

  async function syncSocialPostReactionsToSupabase(post, identity) {
    var supabase = getSupabaseClient();
    var socialPost = post || {};
    var actorIdentity = identity || {};
    var shareCount = Number(socialPost.shares != null ? socialPost.shares : (socialPost.saves != null ? socialPost.saves : 0));
    var shareActorIds = normalizeActorList(socialPost.shareActorIds != null ? socialPost.shareActorIds : socialPost.saveActorIds);

    if (!supabase || !socialPost.id || !actorIdentity.userId) {
      return null;
    }

    var result = await supabase.rpc('sync_social_post_reactions', {
      p_post_id: String(socialPost.id || '').trim(),
      p_likes_count: Number(socialPost.likes || 0),
      p_like_actor_ids: normalizeActorList(socialPost.likeActorIds),
      p_like_actors: ensureArray(socialPost.likeActors),
      p_saves_count: shareCount,
      p_save_actor_ids: shareActorIds
    });

    if (result.error) {
      throw result.error;
    }

    return result.data ? mapSocialPostRecord(result.data, []) : null;
  }

  async function syncSocialCommentReactionsToSupabase(comment, identity) {
    var supabase = getSupabaseClient();
    var socialComment = comment || {};
    var actorIdentity = identity || {};

    if (!supabase || !socialComment.id || !actorIdentity.userId) {
      return null;
    }

    var result = await supabase.rpc('sync_social_comment_reactions', {
      p_comment_id: String(socialComment.id || '').trim(),
      p_likes_count: Number(socialComment.likes || 0),
      p_like_actor_ids: normalizeActorList(socialComment.likeActorIds),
      p_like_actors: ensureArray(socialComment.likeActors)
    });

    if (result.error) {
      throw result.error;
    }

    return result.data ? mapSocialCommentRecord(result.data) : null;
  }

  window.SocialEraStorefrontShared = {
    escapeHtml: escapeHtml,
    getDisplayInitials: getDisplayInitials,
    normalizeUserName: normalizeUserName,
    getLocalSocialActorId: getLocalSocialActorId,
    loadSocialIdentity: loadSocialIdentity,
    getSocialIdentity: getSocialIdentity,
    renderHeaderProfile: renderHeaderProfile,
    updateAuthNavigation: updateAuthNavigation,
    mapProductRecord: mapProductRecord,
    mapSocialCommentRecord: mapSocialCommentRecord,
    mapSocialPostRecord: mapSocialPostRecord,
    fetchProductsArray: fetchProductsArray,
    fetchSocialPostsArray: fetchSocialPostsArray,
    syncSocialPostToSupabase: syncSocialPostToSupabase,
    syncSocialCommentToSupabase: syncSocialCommentToSupabase,
    syncSocialPostReactionsToSupabase: syncSocialPostReactionsToSupabase,
    syncSocialCommentReactionsToSupabase: syncSocialCommentReactionsToSupabase
  };
})();
