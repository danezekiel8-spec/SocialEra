const productsContainer = document.getElementById('products');

async function loadProducts() {
  try {
    const response = await fetch('/api/products');
    const products = await response.json();

    productsContainer.innerHTML = products.map(product => `
      <div class="product-card">
        <img src="assets/product-1.jpg" alt="${product.name}">
        <h3>${product.name}</h3>
        <p>$${product.price.toFixed(2)}</p>
      </div>
    `).join('');
  } catch (error) {
    productsContainer.innerHTML = '<p>Failed to load products.</p>';
    console.error(error);
  }
}

loadProducts();
