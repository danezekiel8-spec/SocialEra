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
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me-admin-password';

const activeTokens = new Set();

app.use(cors());
app.use(express.json());
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

app.post('/api/admin/login', (req, res) => {
  try {
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

  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
    console.warn('Admin credentials are using fallback defaults. Set ADMIN_USERNAME and ADMIN_PASSWORD before launch.');
  }

  console.log(`Admin login username: ${ADMIN_USERNAME}`);
});
