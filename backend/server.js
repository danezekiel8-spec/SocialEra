const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
const PRODUCTS_FILE = path.join(__dirname, 'products.json');
const SUPPORT_WORKSPACE_FILE = path.join(__dirname, 'support-workspace.json');
const SOCIAL_POSTS_FILE = path.join(__dirname, 'social-posts.json');
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || '').trim();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '');
const CHECKOUT_ENABLED = String(process.env.CHECKOUT_ENABLED || '').trim().toLowerCase() === 'true';
const ADMIN_CONFIGURED = Boolean(ADMIN_USERNAME && ADMIN_PASSWORD);
const SUPPORT_ACCESS_CODE = String(process.env.SUPPORT_ACCESS_CODE || ADMIN_PASSWORD || '').trim();
const SUPPORT_CONFIGURED = Boolean(SUPPORT_ACCESS_CODE);

const activeTokens = new Set();
const supportTokens = new Map();

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(FRONTEND_DIR));

function ensureProductsFile() {
  if (!fs.existsSync(PRODUCTS_FILE)) {
    fs.writeFileSync(PRODUCTS_FILE, '[]', 'utf8');
  }
}

function readProducts() {
  ensureProductsFile();
  const raw = fs.readFileSync(PRODUCTS_FILE, 'utf8').trim();

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Error parsing products.json:', error);
    return [];
  }
}

function writeProducts(products) {
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2), 'utf8');
}

function ensureSupportWorkspaceFile() {
  if (!fs.existsSync(SUPPORT_WORKSPACE_FILE)) {
    fs.writeFileSync(SUPPORT_WORKSPACE_FILE, JSON.stringify({ threads: {} }, null, 2), 'utf8');
  }
}

function readSupportWorkspace() {
  ensureSupportWorkspaceFile();
  const raw = fs.readFileSync(SUPPORT_WORKSPACE_FILE, 'utf8').trim();

  if (!raw) {
    return { threads: {} };
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object'
      ? { threads: parsed.threads && typeof parsed.threads === 'object' ? parsed.threads : {} }
      : { threads: {} };
  } catch (error) {
    console.error('Error parsing support-workspace.json:', error);
    return { threads: {} };
  }
}

function writeSupportWorkspace(workspace) {
  fs.writeFileSync(
    SUPPORT_WORKSPACE_FILE,
    JSON.stringify({
      threads: workspace && typeof workspace.threads === 'object' ? workspace.threads : {}
    }, null, 2),
    'utf8'
  );
}

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

function generateSeedSocialPosts() {
  const basePosts = [
    {
      id: 'post-1',
      channel: 'tech-luxe',
      userName: '@lovada.noir',
      displayName: 'SocialEra Noir',
      avatar: 'LN',
      mediaType: 'image',
      mediaUrl: 'assets/hero-1.jpg',
      captionTitle: 'Future tailoring for late city hours',
      captionText: 'Structured layers, dark textures, metallic accents and a premium silhouette designed to feel sharp without looking forced.',
      tags: ['women', 'accessories', 'watch', 'bag', 'heels', 'dress'],
      likes: 18400,
      commentsCount: 402,
      saves: 3100,
      createdAt: new Date(Date.now() - (2 * 60 * 60 * 1000)).toISOString(),
      matchTitle: 'Seen in this post',
      comments: []
    },
    {
      id: 'post-2',
      channel: 'minimal-mode',
      userName: '@cleanframe',
      displayName: 'Clean Frame',
      avatar: 'CF',
      mediaType: 'image',
      mediaUrl: 'assets/hero-2.jpg',
      captionTitle: 'Minimal mode with softer contrast',
      captionText: 'Quiet luxury, neutral lines and pieces that work in motion — made for a cleaner fashion-tech aesthetic.',
      tags: ['women', 'home', 'accessories', 'bag', 'clutch'],
      likes: 9700,
      commentsCount: 188,
      saves: 1400,
      createdAt: new Date(Date.now() - (4 * 60 * 60 * 1000)).toISOString(),
      matchTitle: 'Shop the match',
      comments: []
    },
    {
      id: 'post-3',
      channel: 'street-precision',
      userName: '@gridmotion',
      displayName: 'Grid Motion',
      avatar: 'GM',
      mediaType: 'image',
      mediaUrl: 'assets/hero-3.jpg',
      captionTitle: 'Street precision, stripped back',
      captionText: 'Tailored outerwear and sharper utilitarian details for a more engineered everyday uniform.',
      tags: ['men', 'watch', 'accessories', 'bag'],
      likes: 12900,
      commentsCount: 296,
      saves: 2000,
      createdAt: new Date(Date.now() - (6 * 60 * 60 * 1000)).toISOString(),
      matchTitle: 'Matched to this look',
      comments: []
    },
    {
      id: 'post-4',
      channel: 'night-code',
      userName: '@after.syntax',
      displayName: 'After Syntax',
      avatar: 'AS',
      mediaType: 'image',
      mediaUrl: 'assets/hero-4.jpg',
      captionTitle: 'Night code in polished layers',
      captionText: 'A colder palette, glossy edges and accessories that feel more like hardware than decoration.',
      tags: ['women', 'accessories', 'watch', 'heels', 'bag'],
      likes: 21300,
      commentsCount: 511,
      saves: 4600,
      createdAt: new Date(Date.now() - (9 * 60 * 60 * 1000)).toISOString(),
      matchTitle: 'SocialEra Matches',
      comments: []
    },
    {
      id: 'post-5',
      channel: 'soft-power',
      userName: '@silkoperator',
      displayName: 'Silk Operator',
      avatar: 'SO',
      mediaType: 'image',
      mediaUrl: 'assets/product-2.jpg',
      captionTitle: 'Soft power with strong finishing',
      captionText: 'Elegant shapes, fluid structure and subtle authority — a look that feels elevated without losing ease.',
      tags: ['women', 'dress', 'bag', 'accessories'],
      likes: 8800,
      commentsCount: 145,
      saves: 1200,
      createdAt: new Date(Date.now() - (12 * 60 * 60 * 1000)).toISOString(),
      matchTitle: 'Seen in this post',
      comments: []
    }
  ];

  const generatedProfiles = [
    { userName: '@velvetkernel', displayName: 'Velvet Kernel', avatar: 'VK' },
    { userName: '@modevector', displayName: 'Mode Vector', avatar: 'MV' },
    { userName: '@circuitmuse', displayName: 'Circuit Muse', avatar: 'CM' },
    { userName: '@lineatlas', displayName: 'Line Atlas', avatar: 'LA' },
    { userName: '@glasssyntax', displayName: 'Glass Syntax', avatar: 'GS' },
    { userName: '@codedrape', displayName: 'Code Drape', avatar: 'CD' },
    { userName: '@ateliergrid', displayName: 'Atelier Grid', avatar: 'AG' },
    { userName: '@softsignal', displayName: 'Soft Signal', avatar: 'SS' },
    { userName: '@monocodefit', displayName: 'Mono Code Fit', avatar: 'MC' },
    { userName: '@noirpixels', displayName: 'Noir Pixels', avatar: 'NP' }
  ];

  const generatedConcepts = [
    {
      title: 'Monochrome layers for precise mornings',
      text: 'A sharper uniform with quieter accessories, soft contrast, and a cleaner silhouette built for everyday movement.',
      tags: ['women', 'accessories', 'bag', 'watch'],
      matchTitle: 'Precision picks for this post'
    },
    {
      title: 'Structured neutrals with softer hardware',
      text: 'Crisp tailoring meets brushed metallic accents so the whole look stays elevated without feeling overdesigned.',
      tags: ['women', 'dress', 'bag', 'accessories'],
      matchTitle: 'Matched essentials'
    },
    {
      title: 'Evening tailoring with subtle shine',
      text: 'A darker palette, sculpted pieces, and a few reflective details that make the outfit feel modern after sunset.',
      tags: ['women', 'heels', 'watch', 'bag', 'accessories'],
      matchTitle: 'Shop this evening edit'
    },
    {
      title: 'Clean street layers with technical edge',
      text: 'Built around utility and proportion, this look keeps its energy through sharper outerwear and easy accessories.',
      tags: ['men', 'bag', 'watch', 'accessories'],
      matchTitle: 'Street-ready matches'
    },
    {
      title: 'Quiet luxury in motion',
      text: 'Soft structure, calm tones, and minimal styling choices that still feel confident when everything is moving fast.',
      tags: ['women', 'home', 'bag', 'accessories'],
      matchTitle: 'Seen in this look'
    },
    {
      title: 'Utility polish for the daily feed',
      text: 'Designed like a refined system: modular accessories, clean proportions, and pieces that stack without clutter.',
      tags: ['men', 'accessories', 'watch', 'bag'],
      matchTitle: 'SocialEra utility match'
    },
    {
      title: 'Soft power with brighter contrast',
      text: 'A lighter mood with premium texture and crisp styling details that keep the whole frame feeling intentional.',
      tags: ['women', 'dress', 'accessories', 'clutch'],
      matchTitle: 'Refined picks underneath'
    },
    {
      title: 'Minimal layers for colder hours',
      text: 'A winter-ready lineup of elegant basics, deeper tones, and compact accessories that stay visually clean.',
      tags: ['women', 'bag', 'heels', 'accessories'],
      matchTitle: 'Cold-hour product match'
    },
    {
      title: 'Gloss and structure for a night shift mood',
      text: 'Sharper lines, polished surfaces, and a darker visual rhythm make this feel closer to a luxury interface than a lookbook.',
      tags: ['women', 'watch', 'heels', 'bag', 'accessories'],
      matchTitle: 'Night-shift matches'
    },
    {
      title: 'Editorial basics with a social-first finish',
      text: 'Made to read well in-feed: simple shapes, precise accessories, and just enough contrast to stop the scroll.',
      tags: ['women', 'bag', 'accessories', 'watch'],
      matchTitle: 'Feed-first styling picks'
    }
  ];

  const channels = [
    { key: 'tech-luxe', label: 'Tech Luxe', tag: 'watch', likesBase: 8200, commentsBase: 120, savesBase: 980 },
    { key: 'minimal-mode', label: 'Minimal Mode', tag: 'home', likesBase: 7600, commentsBase: 108, savesBase: 840 },
    { key: 'street-precision', label: 'Street Precision', tag: 'bag', likesBase: 9100, commentsBase: 144, savesBase: 1100 },
    { key: 'night-code', label: 'Night Code', tag: 'heels', likesBase: 10400, commentsBase: 176, savesBase: 1320 },
    { key: 'soft-power', label: 'Soft Power', tag: 'dress', likesBase: 8800, commentsBase: 132, savesBase: 1020 }
  ];

  const generatedPosts = channels.flatMap((channel, channelIndex) => (
    generatedConcepts.map((concept, conceptIndex) => {
      const profile = generatedProfiles[(channelIndex * 2 + conceptIndex) % generatedProfiles.length];
      return {
        id: `post-${6 + channelIndex * generatedConcepts.length + conceptIndex}`,
        channel: channel.key,
        userName: profile.userName,
        displayName: profile.displayName,
        avatar: profile.avatar,
        mediaType: 'image',
        mediaUrl: SOCIAL_IMAGE_POOL[(channelIndex + conceptIndex) % SOCIAL_IMAGE_POOL.length],
        captionTitle: `${concept.title} · ${channel.label}`,
        captionText: concept.text,
        tags: [...new Set([...concept.tags, channel.tag])],
        likes: channel.likesBase + (conceptIndex * 470) + (channelIndex * 310),
        commentsCount: channel.commentsBase + (conceptIndex * 17) + (channelIndex * 9),
        saves: channel.savesBase + (conceptIndex * 66) + (channelIndex * 34),
        createdAt: new Date(Date.now() - ((14 + (channelIndex * 10) + conceptIndex) * 60 * 60 * 1000)).toISOString(),
        matchTitle: concept.matchTitle,
        comments: []
      };
    })
  ));

  return [...basePosts, ...generatedPosts].map((post) => ({
    ...post,
    likeActorIds: [],
    saveActorIds: [],
    comments: Array.isArray(post.comments) ? post.comments : []
  }));
}

function ensureSocialPostsFile() {
  if (!fs.existsSync(SOCIAL_POSTS_FILE)) {
    fs.writeFileSync(SOCIAL_POSTS_FILE, JSON.stringify(generateSeedSocialPosts(), null, 2), 'utf8');
  }
}

function normalizeSocialPost(post) {
  return {
    id: String(post.id || crypto.randomUUID()),
    channel: String(post.channel || 'all').trim() || 'all',
    userName: String(post.userName || '@socialera').trim() || '@socialera',
    displayName: String(post.displayName || 'SocialEra Member').trim() || 'SocialEra Member',
    avatar: String(post.avatar || 'SE').trim().slice(0, 2).toUpperCase() || 'SE',
    mediaType: String(post.mediaType || 'image').trim() || 'image',
    mediaUrl: String(post.mediaUrl || SOCIAL_IMAGE_POOL[0]).trim() || SOCIAL_IMAGE_POOL[0],
    captionTitle: String(post.captionTitle || '').trim(),
    captionText: String(post.captionText || '').trim(),
    tags: Array.isArray(post.tags) ? post.tags.map((tag) => String(tag).trim()).filter(Boolean) : [],
    likes: Number(post.likes || 0),
    commentsCount: Number(post.commentsCount || 0),
    saves: Number(post.saves || 0),
    createdAt: post.createdAt || new Date().toISOString(),
    matchTitle: String(post.matchTitle || 'Seen in this post').trim() || 'Seen in this post',
    promoteEnabled: Boolean(post.promoteEnabled || false),
    promotedTitle: String(post.promotedTitle || '').trim(),
    promotedPrice: String(post.promotedPrice || '').trim(),
    promotedText: String(post.promotedText || '').trim(),
    likeActorIds: Array.isArray(post.likeActorIds) ? post.likeActorIds.map((id) => String(id)) : [],
    saveActorIds: Array.isArray(post.saveActorIds) ? post.saveActorIds.map((id) => String(id)) : [],
    comments: Array.isArray(post.comments) ? post.comments.map((comment) => ({
      id: String(comment.id || crypto.randomUUID()),
      actorId: String(comment.actorId || '').trim(),
      authorName: String(comment.authorName || 'SocialEra Member').trim() || 'SocialEra Member',
      userName: String(comment.userName || '@socialera').trim() || '@socialera',
      avatar: String(comment.avatar || 'SE').trim().slice(0, 2).toUpperCase() || 'SE',
      text: String(comment.text || '').trim(),
      createdAt: comment.createdAt || new Date().toISOString()
    })).filter((comment) => comment.text) : []
  };
}

function readSocialPosts() {
  ensureSocialPostsFile();
  const raw = fs.readFileSync(SOCIAL_POSTS_FILE, 'utf8').trim();

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeSocialPost) : [];
  } catch (error) {
    console.error('Error parsing social-posts.json:', error);
    return generateSeedSocialPosts();
  }
}

function writeSocialPosts(posts) {
  fs.writeFileSync(SOCIAL_POSTS_FILE, JSON.stringify(posts.map(normalizeSocialPost), null, 2), 'utf8');
}

function createToken() {
  return crypto.randomBytes(32).toString('hex');
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || '';

  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.slice(7).trim();
}

function requireAdminAuth(req, res, next) {
  const token = getBearerToken(req);

  if (!token || !activeTokens.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

function requireSupportAuth(req, res, next) {
  const token = getBearerToken(req);

  if (!token || !supportTokens.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  req.supportRep = supportTokens.get(token);
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

app.get('/api/storefront-config', (req, res) => {
  res.json({
    adminConfigured: ADMIN_CONFIGURED,
    checkoutEnabled: CHECKOUT_ENABLED,
    supportConfigured: SUPPORT_CONFIGURED
  });
});

app.post('/api/support/login', (req, res) => {
  try {
    if (!SUPPORT_CONFIGURED) {
      return res.status(503).json({
        error: 'Support access is disabled until SUPPORT_ACCESS_CODE is configured on the server.'
      });
    }

    const repName = String(req.body.repName || '').trim();
    const accessCode = String(req.body.accessCode || '').trim();

    if (!repName) {
      return res.status(400).json({ error: 'Representative name is required' });
    }

    if (accessCode !== SUPPORT_ACCESS_CODE) {
      return res.status(401).json({ error: 'Invalid support access code' });
    }

    const token = createToken();
    supportTokens.set(token, {
      name: repName,
      loginAt: new Date().toISOString()
    });

    res.json({
      message: 'Support login successful',
      token,
      rep: {
        name: repName
      }
    });
  } catch (error) {
    console.error('Support login error:', error);
    res.status(500).json({ error: 'Support login failed' });
  }
});

app.get('/api/support/verify', requireSupportAuth, (req, res) => {
  res.json({
    valid: true,
    rep: {
      name: req.supportRep.name
    }
  });
});

app.post('/api/support/logout', requireSupportAuth, (req, res) => {
  try {
    const token = getBearerToken(req);

    if (token) {
      supportTokens.delete(token);
    }

    res.json({ message: 'Support logout successful' });
  } catch (error) {
    console.error('Support logout error:', error);
    res.status(500).json({ error: 'Support logout failed' });
  }
});

app.get('/api/support/workspace', requireSupportAuth, (req, res) => {
  try {
    res.json(readSupportWorkspace());
  } catch (error) {
    console.error('Support workspace read error:', error);
    res.status(500).json({ error: 'Failed to load support workspace' });
  }
});

app.put('/api/support/workspace/:threadId', requireSupportAuth, (req, res) => {
  try {
    const threadId = String(req.params.threadId || '').trim();

    if (!threadId) {
      return res.status(400).json({ error: 'Thread ID is required' });
    }

    const workspace = readSupportWorkspace();
    const existing = workspace.threads[threadId] || {};
    const nextEntry = {
      assignedRep: String(req.body.assignedRep ?? existing.assignedRep ?? '').trim(),
      status: String(req.body.status ?? existing.status ?? 'open').trim() || 'open',
      notes: String(req.body.notes ?? existing.notes ?? '').trim(),
      customerEmail: String(req.body.customerEmail ?? existing.customerEmail ?? '').trim(),
      subject: String(req.body.subject ?? existing.subject ?? '').trim(),
      updatedAt: new Date().toISOString(),
      updatedBy: req.supportRep.name
    };

    workspace.threads[threadId] = nextEntry;
    writeSupportWorkspace(workspace);

    res.json({
      threadId,
      entry: nextEntry
    });
  } catch (error) {
    console.error('Support workspace update error:', error);
    res.status(500).json({ error: 'Failed to update support workspace' });
  }
});

app.post('/api/admin/login', (req, res) => {
  try {
    if (!ADMIN_CONFIGURED) {
      return res.status(503).json({
        error: 'Admin access is disabled until ADMIN_USERNAME and ADMIN_PASSWORD are configured on the server.'
      });
    }

    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = createToken();
    activeTokens.add(token);

    res.json({
      message: 'Login successful',
      token,
      admin: {
        username: ADMIN_USERNAME
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/admin/verify', (req, res) => {
  try {
    if (!ADMIN_CONFIGURED) {
      return res.status(503).json({
        error: 'Admin access is disabled until server credentials are configured.'
      });
    }

    const token = getBearerToken(req);

    if (!token || !activeTokens.has(token)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    res.json({
      valid: true,
      admin: {
        username: ADMIN_USERNAME
      }
    });
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  try {
    const token = getBearerToken(req);

    if (token && activeTokens.has(token)) {
      activeTokens.delete(token);
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

app.get('/api/products', (req, res) => {
  try {
    const products = readProducts();
    res.json(products);
  } catch (error) {
    console.error('Error reading products:', error);
    res.status(500).json({ error: 'Failed to load products' });
  }
});

app.get('/api/products/:id', (req, res) => {
  try {
    const products = readProducts();
    const productId = Number(req.params.id);
    const product = products.find((p) => Number(p.id) === productId);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    console.error('Error reading product:', error);
    res.status(500).json({ error: 'Failed to load product' });
  }
});

app.get('/api/social/posts', (req, res) => {
  try {
    const posts = readSocialPosts()
      .map((post) => ({
        ...post,
        commentsCount: Math.max(Number(post.commentsCount || 0), Array.isArray(post.comments) ? post.comments.length : 0),
        commentPreview: post.comments.slice(-3)
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json(posts);
  } catch (error) {
    console.error('Error reading social posts:', error);
    res.status(500).json({ error: 'Failed to load social posts' });
  }
});

app.post('/api/social/posts', (req, res) => {
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
    const mediaUrl = String(req.body.mediaUrl || '').trim() || SOCIAL_IMAGE_POOL[posts.length % SOCIAL_IMAGE_POOL.length];
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
      id: `post-${Date.now()}`,
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
      saves: 0,
      createdAt: new Date().toISOString(),
      matchTitle: String(req.body.matchTitle || 'Fresh from the feed').trim() || 'Fresh from the feed',
      promoteEnabled: Boolean(req.body.promoteEnabled),
      promotedTitle: String(req.body.promotedTitle || '').trim(),
      promotedPrice: String(req.body.promotedPrice || '').trim(),
      promotedText: String(req.body.promotedText || '').trim(),
      likeActorIds: [],
      saveActorIds: [],
      comments: []
    });

    posts.unshift(newPost);
    writeSocialPosts(posts);

    res.status(201).json({
      ...newPost,
      commentsCount: 0,
      commentPreview: []
    });
  } catch (error) {
    console.error('Error creating social post:', error);
    res.status(500).json({ error: 'Failed to create social post' });
  }
});

app.post('/api/social/posts/:id/reactions', (req, res) => {
  try {
    const postId = String(req.params.id || '').trim();
    const metric = String(req.body.metric || '').trim();
    const actorId = String(req.body.actorId || '').trim();
    const allowed = {
      likes: { actorKey: 'likeActorIds', countKey: 'likes' },
      saves: { actorKey: 'saveActorIds', countKey: 'saves' }
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

    const { actorKey, countKey } = allowed[metric];
    const actorIds = Array.isArray(post[actorKey]) ? post[actorKey] : [];
    const existingIndex = actorIds.indexOf(actorId);

    if (existingIndex === -1) {
      actorIds.push(actorId);
    } else {
      actorIds.splice(existingIndex, 1);
    }

    post[actorKey] = actorIds;
    post[countKey] = Math.max(0, Number(post[countKey] || 0) + (existingIndex === -1 ? 1 : -1));

    writeSocialPosts(posts);

    res.json({
      postId,
      metric,
      count: post[countKey],
      active: existingIndex === -1
    });
  } catch (error) {
    console.error('Error updating social reaction:', error);
    res.status(500).json({ error: 'Failed to update reaction' });
  }
});

app.post('/api/social/posts/:id/comments', (req, res) => {
  try {
    const postId = String(req.params.id || '').trim();
    const text = String(req.body.text || '').trim();

    if (!postId || !text) {
      return res.status(400).json({ error: 'Post ID and comment text are required' });
    }

    const posts = readSocialPosts();
    const post = posts.find((entry) => entry.id === postId);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const newComment = {
      id: crypto.randomUUID(),
      actorId: String(req.body.actorId || '').trim(),
      authorName: String(req.body.authorName || 'SocialEra Member').trim() || 'SocialEra Member',
      userName: String(req.body.userName || '@socialera').trim() || '@socialera',
      avatar: String(req.body.avatar || 'SE').trim().slice(0, 2).toUpperCase() || 'SE',
      text,
      createdAt: new Date().toISOString()
    };

    post.comments.push(newComment);
    post.commentsCount = Math.max(Number(post.commentsCount || 0), 0) + 1;

    writeSocialPosts(posts);

    res.status(201).json({
      postId,
      comment: newComment,
      commentsCount: post.commentsCount,
      commentPreview: post.comments.slice(-3)
    });
  } catch (error) {
    console.error('Error creating social comment:', error);
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

app.post('/api/products', requireAdminAuth, (req, res) => {
  try {
    const products = readProducts();

    if (!req.body.name || req.body.price === undefined || req.body.price === null || req.body.price === '') {
      return res.status(400).json({ error: 'Name and price are required' });
    }

    const newId = products.length ? Math.max(...products.map((p) => Number(p.id) || 0)) + 1 : 1;
    const newProduct = normalizeProductInput(req.body, newId);

    products.push(newProduct);
    writeProducts(products);

    res.status(201).json(newProduct);
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

app.put('/api/products/:id', requireAdminAuth, (req, res) => {
  try {
    const products = readProducts();
    const productId = Number(req.params.id);
    const index = products.findIndex((p) => Number(p.id) === productId);

    if (index === -1) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const existingProduct = products[index];
    const updatedProduct = normalizeProductInput(req.body, existingProduct.id, existingProduct);

    products[index] = updatedProduct;
    writeProducts(products);

    res.json(updatedProduct);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

app.delete('/api/products/:id', requireAdminAuth, (req, res) => {
  try {
    const products = readProducts();
    const productId = Number(req.params.id);
    const filteredProducts = products.filter((p) => Number(p.id) !== productId);

    if (filteredProducts.length === products.length) {
      return res.status(404).json({ error: 'Product not found' });
    }

    writeProducts(filteredProducts);
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

app.listen(PORT, () => {
  console.log(`SocialEra backend running at http://localhost:${PORT}`);

  if (!ADMIN_CONFIGURED) {
    console.warn('Admin access is disabled. Set ADMIN_USERNAME and ADMIN_PASSWORD before launch.');
  }

  if (!CHECKOUT_ENABLED) {
    console.warn('Checkout is disabled. Set CHECKOUT_ENABLED=true after a real payment or order workflow is ready.');
  }

  if (ADMIN_CONFIGURED) {
    console.log(`Admin login username: ${ADMIN_USERNAME}`);
  }
});
