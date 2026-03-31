const cartRoot = document.getElementById('cart-root');
const cartCount = document.getElementById('cart-count');

let cart = JSON.parse(localStorage.getItem('lovadaCart')) || [];

const imageList = [
  'assets/product-1.jpg',
  'assets/product-2.jpg',
  'assets/product-3.jpg',
  'assets/product-4.jpg',
  'assets/product-5.jpg'
];

function updateCartCount() {
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  cartCount.textContent = totalItems;
}

function saveCart() {
  localStorage.setItem('lovadaCart', JSON.stringify(cart));
  updateCartCount();
  renderCart();
}

function getCartItemKey(item, index) {
  return item.variantKey || `${item.id}::legacy::${index}`;
}

function findCartItemIndexByKey(key) {
  return cart.findIndex((item, index) => getCartItemKey(item, index) === key);
}

function changeQuantity(key, change) {
  const itemIndex = findCartItemIndexByKey(key);

  if (itemIndex === -1) return;

  const item = cart[itemIndex];
  item.quantity += change;

  if (item.quantity <= 0) {
    cart.splice(itemIndex, 1);
  }

  saveCart();
}

function removeItem(key) {
  const itemIndex = findCartItemIndexByKey(key);

  if (itemIndex === -1) return;

  cart.splice(itemIndex, 1);
  saveCart();
}

function clearCart() {
  cart = [];
  saveCart();
}

function getSubtotal() {
  return cart.reduce((sum, item) => sum + (Number(item.price) * item.quantity), 0);
}

function getItemImage(item, index) {
  if (item.image && String(item.image).trim() !== '') {
    return String(item.image);
  }

  return imageList[index % imageList.length];
}

function renderVariantTags(item) {
  const tags = [];

  if (item.selectedColor) {
    tags.push(`<span class="meta-tag">Color: ${item.selectedColor}</span>`);
  }

  if (item.selectedSize) {
    tags.push(`<span class="meta-tag">Size: ${item.selectedSize}</span>`);
  }

  return tags.length ? `<div class="meta-tags">${tags.join('')}</div>` : '';
}

function isCartItemOnSale(item) {
  const originalPrice = Number(item.originalPrice || 0);
  const currentPrice = Number(item.price || 0);

  return originalPrice > 0 && currentPrice > 0 && currentPrice < originalPrice;
}

function getCartDiscountPercent(item) {
  const originalPrice = Number(item.originalPrice || 0);
  const currentPrice = Number(item.price || 0);

  if (!isCartItemOnSale(item) || originalPrice <= 0) {
    return 0;
  }

  return ((originalPrice - currentPrice) / originalPrice) * 100;
}

function renderItemPrice(item) {
  const currentPrice = Number(item.price || 0);
  const originalPrice = Number(item.originalPrice || 0);
  const discountPercent = getCartDiscountPercent(item);

  if (isCartItemOnSale(item)) {
    return `
      <div class="price-stack">
        <div class="cart-price-row">
          <div class="cart-price">$${currentPrice.toFixed(2)}</div>
          <div class="cart-old-price">$${originalPrice.toFixed(2)}</div>
        </div>
        <div class="cart-sale-chip">${discountPercent.toFixed(0)}% OFF</div>
      </div>
    `;
  }

  return `
    <div class="price-stack">
      <div class="cart-price-row">
        <div class="cart-price">$${currentPrice.toFixed(2)}</div>
      </div>
    </div>
  `;
}

function renderCart() {
  if (cart.length === 0) {
    cartRoot.innerHTML = `
      <div class="cart-list-card empty-cart">
        <h2>Your cart is empty</h2>
        <p>
          Start exploring the SocialEra collection and add your favorite pieces to build your curated cart.
        </p>
        <a href="shop.html" class="btn btn-gold">Shop Now</a>
      </div>
    `;
    return;
  }

  const subtotal = getSubtotal();
  const shipping = subtotal > 0 ? 15 : 0;
  const total = subtotal + shipping;

  cartRoot.innerHTML = `
    <section class="cart-layout">
      <div class="cart-list-card">
        ${cart.map((item, index) => `
          <div class="cart-item">
            <div class="cart-item-image">
              <img src="${getItemImage(item, index)}" alt="${item.name}" onerror="this.onerror=null;this.src='${imageList[index % imageList.length]}'">
            </div>

            <div class="cart-item-info">
              <h3>${item.name}</h3>
              ${renderVariantTags(item)}
              <div class="cart-meta">
                ${isCartItemOnSale(item) ? 'Sale price applied' : 'Premium SocialEra selection'}<br>
                Curated storefront presentation
              </div>

              ${renderItemPrice(item)}

              <div class="qty-controls">
                <button onclick="changeQuantity('${getCartItemKey(item, index)}', -1)">−</button>
                <span>${item.quantity}</span>
                <button onclick="changeQuantity('${getCartItemKey(item, index)}', 1)">+</button>
              </div>
            </div>

            <div class="item-side">
              <div class="item-total">$${(Number(item.price) * item.quantity).toFixed(2)}</div>
              <button class="remove-btn" onclick="removeItem('${getCartItemKey(item, index)}')">Remove</button>
            </div>
          </div>
        `).join('')}
      </div>

      <aside class="summary-card">
        <h2>Order Summary</h2>

        <div class="summary-row">
          <span>Items</span>
          <span>${cart.reduce((sum, item) => sum + item.quantity, 0)}</span>
        </div>

        <div class="summary-row">
          <span>Subtotal</span>
          <span>$${subtotal.toFixed(2)}</span>
        </div>

        <div class="summary-row">
          <span>Shipping</span>
          <span>$${shipping.toFixed(2)}</span>
        </div>

        <div class="summary-row total">
          <span>Total</span>
          <span>$${total.toFixed(2)}</span>
        </div>

        <div class="summary-actions">
          <a href="checkout.html" class="btn btn-gold">Proceed to Checkout</a>
          <a href="shop.html" class="btn btn-light">Continue Shopping</a>
          <button class="btn btn-dark" onclick="clearCart()">Clear Cart</button>
        </div>
      </aside>
    </section>
  `;
}

window.changeQuantity = changeQuantity;
window.removeItem = removeItem;
window.clearCart = clearCart;

updateCartCount();
renderCart();
