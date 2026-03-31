const express = require('express');

function createProductRoutes({
  productDataSource,
  requireAdminAuth
}) {
  const router = express.Router();

  router.get('/products', async (req, res) => {
    try {
      return res.json(await productDataSource.listProducts());
    } catch (error) {
      console.error('Error reading products:', error);
      return res.status(500).json({ error: 'Failed to load products' });
    }
  });

  router.get('/products/source', (req, res) => {
    try {
      return res.json(productDataSource.getProductSourceStatus());
    } catch (error) {
      console.error('Error reading product source status:', error);
      return res.status(500).json({ error: 'Failed to load product source status' });
    }
  });

  router.get('/products/:id', async (req, res) => {
    try {
      const product = await productDataSource.getProductById(req.params.id);

      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      return res.json(product);
    } catch (error) {
      console.error('Error reading product:', error);
      return res.status(500).json({ error: 'Failed to load product' });
    }
  });

  router.post('/products', requireAdminAuth, async (req, res) => {
    try {
      if (!req.body.name || req.body.price === undefined || req.body.price === null || req.body.price === '') {
        return res.status(400).json({ error: 'Name and price are required' });
      }

      const newProduct = await productDataSource.createProduct(req.body);

      return res.status(201).json(newProduct);
    } catch (error) {
      console.error('Error creating product:', error);
      return res.status(500).json({ error: 'Failed to create product' });
    }
  });

  router.put('/products/:id', requireAdminAuth, async (req, res) => {
    try {
      const updatedProduct = await productDataSource.updateProduct(req.params.id, req.body);

      if (!updatedProduct) {
        return res.status(404).json({ error: 'Product not found' });
      }

      return res.json(updatedProduct);
    } catch (error) {
      console.error('Error updating product:', error);
      return res.status(500).json({ error: 'Failed to update product' });
    }
  });

  router.delete('/products/:id', requireAdminAuth, async (req, res) => {
    try {
      const deleted = await productDataSource.deleteProduct(req.params.id);

      if (!deleted) {
        return res.status(404).json({ error: 'Product not found' });
      }

      return res.json({ message: 'Product deleted successfully' });
    } catch (error) {
      console.error('Error deleting product:', error);
      return res.status(500).json({ error: 'Failed to delete product' });
    }
  });

  return router;
}

module.exports = createProductRoutes;
