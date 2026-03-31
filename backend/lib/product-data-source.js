const DEFAULT_SUPABASE_URL = 'https://kfunqpatayfkscilhncx.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ByM_npvMJj4LM_WVntb_aw_qwFPgoMj';

function trimEnv(value) {
  return String(value || '').trim();
}

function createProductDataSource({
  readLocalProducts,
  writeLocalProducts,
  normalizeProductInput
}) {
  const supabaseUrl = trimEnv(process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL || DEFAULT_SUPABASE_URL);
  const supabasePublishableKey = trimEnv(
    process.env.SUPABASE_PUBLISHABLE_KEY
    || process.env.SUPABASE_ANON_KEY
    || DEFAULT_SUPABASE_PUBLISHABLE_KEY
  );
  const supabaseServiceRoleKey = trimEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

  function hasSupabaseWriteAccess() {
    return Boolean(supabaseUrl && supabaseServiceRoleKey);
  }

  function buildHeaders(key, includeJson) {
    const headers = {
      apikey: key,
      Authorization: 'Bearer ' + key
    };

    if (includeJson) {
      headers['Content-Type'] = 'application/json';
    }

    return headers;
  }

  function mapSupabaseRowToProduct(row) {
    return normalizeProductInput({
      id: row.id,
      name: row.name,
      price: row.price,
      category: row.category,
      image: row.image,
      stock: row.stock,
      featured: row.featured,
      description: row.description,
      fulfillmentType: row.fulfillment_type,
      supplierName: row.supplier_name,
      supplierSku: row.supplier_sku,
      supplierCost: row.supplier_cost,
      supplierLink: row.supplier_link,
      processingTime: row.processing_time,
      shippingTime: row.shipping_time,
      saleEnabled: row.sale_enabled,
      salePrice: row.sale_price,
      saleLabel: row.sale_label
    }, row.id);
  }

  function mapProductToSupabasePayload(product, includeId) {
    const normalized = normalizeProductInput(product, product.id, product);
    const payload = {
      name: normalized.name,
      price: normalized.price,
      category: normalized.category,
      image: normalized.image,
      stock: normalized.stock,
      featured: normalized.featured,
      description: normalized.description,
      fulfillment_type: normalized.fulfillmentType,
      supplier_name: normalized.supplierName,
      supplier_sku: normalized.supplierSku,
      supplier_cost: normalized.supplierCost,
      supplier_link: normalized.supplierLink,
      processing_time: normalized.processingTime,
      shipping_time: normalized.shippingTime,
      sale_enabled: normalized.saleEnabled,
      sale_price: normalized.salePrice,
      sale_label: normalized.saleLabel
    };

    if (includeId && normalized.id != null) {
      payload.id = normalized.id;
    }

    return payload;
  }

  async function requestSupabase(pathname, options) {
    const response = await fetch(supabaseUrl + '/rest/v1/' + pathname, options);

    if (!response.ok) {
      const errorText = await response.text();
      const message = errorText || (response.status + ' ' + response.statusText);
      throw new Error(message);
    }

    if (response.status === 204) {
      return null;
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async function listProductsFromSupabase() {
    const rows = await requestSupabase(
      'store_products?select=*&order=featured.desc,created_at.desc',
      {
        method: 'GET',
        headers: buildHeaders(supabaseServiceRoleKey || supabasePublishableKey, false)
      }
    );

    const products = Array.isArray(rows) ? rows.map(mapSupabaseRowToProduct) : [];
    writeLocalProducts(products);
    return products;
  }

  function listProductsFromLocal() {
    return readLocalProducts();
  }

  async function listProducts() {
    if (hasSupabaseWriteAccess()) {
      try {
        return await listProductsFromSupabase();
      } catch (error) {
        console.warn('Falling back to local product store:', error.message || error);
      }
    }

    return listProductsFromLocal();
  }

  async function getProductById(productId) {
    const normalizedId = Number(productId);

    if (!Number.isFinite(normalizedId)) {
      return null;
    }

    const products = await listProducts();
    return products.find((entry) => Number(entry.id) === normalizedId) || null;
  }

  async function createProduct(productInput) {
    const products = hasSupabaseWriteAccess()
      ? await listProductsFromSupabase()
      : listProductsFromLocal();
    const newId = products.length ? Math.max(...products.map((entry) => Number(entry.id) || 0)) + 1 : 1;
    const newProduct = normalizeProductInput(productInput, newId);

    products.push(newProduct);
    writeLocalProducts(products);

    if (hasSupabaseWriteAccess()) {
      try {
        const rows = await requestSupabase('store_products', {
          method: 'POST',
          headers: {
            ...buildHeaders(supabaseServiceRoleKey, true),
            Prefer: 'return=representation'
          },
          body: JSON.stringify([mapProductToSupabasePayload(newProduct, true)])
        });

        const row = Array.isArray(rows) && rows[0] ? rows[0] : null;

        if (row) {
          return mapSupabaseRowToProduct(row);
        }
      } catch (error) {
        console.warn('Supabase product create mirror failed:', error.message || error);
      }
    }

    return newProduct;
  }

  async function updateProduct(productId, productInput) {
    const products = hasSupabaseWriteAccess()
      ? await listProductsFromSupabase()
      : listProductsFromLocal();
    const normalizedId = Number(productId);
    const index = products.findIndex((entry) => Number(entry.id) === normalizedId);

    if (index === -1) {
      return null;
    }

    const updatedProduct = normalizeProductInput(productInput, products[index].id, products[index]);
    products[index] = updatedProduct;
    writeLocalProducts(products);

    if (hasSupabaseWriteAccess()) {
      try {
        const rows = await requestSupabase('store_products?id=eq.' + encodeURIComponent(String(normalizedId)), {
          method: 'PATCH',
          headers: {
            ...buildHeaders(supabaseServiceRoleKey, true),
            Prefer: 'return=representation'
          },
          body: JSON.stringify(mapProductToSupabasePayload(updatedProduct, false))
        });

        const row = Array.isArray(rows) && rows[0] ? rows[0] : null;

        if (row) {
          return mapSupabaseRowToProduct(row);
        }
      } catch (error) {
        console.warn('Supabase product update mirror failed:', error.message || error);
      }
    }

    return updatedProduct;
  }

  async function deleteProduct(productId) {
    const normalizedId = Number(productId);
    const products = hasSupabaseWriteAccess()
      ? await listProductsFromSupabase()
      : listProductsFromLocal();
    const filteredProducts = products.filter((entry) => Number(entry.id) !== normalizedId);

    if (filteredProducts.length === products.length) {
      return false;
    }

    writeLocalProducts(filteredProducts);

    if (hasSupabaseWriteAccess()) {
      try {
        await requestSupabase('store_products?id=eq.' + encodeURIComponent(String(normalizedId)), {
          method: 'DELETE',
          headers: buildHeaders(supabaseServiceRoleKey, false)
        });
      } catch (error) {
        console.warn('Supabase product delete mirror failed:', error.message || error);
      }
    }

    return true;
  }

  function getProductSourceStatus() {
    return {
      mode: hasSupabaseWriteAccess() ? 'supabase-hybrid' : 'local-json',
      supabaseConfigured: hasSupabaseWriteAccess()
    };
  }

  return {
    listProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
    getProductSourceStatus
  };
}

module.exports = {
  createProductDataSource
};
