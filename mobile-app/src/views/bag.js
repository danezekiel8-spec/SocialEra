export function createBagViewRenderService({
  formatCompactNumber,
  formatCurrency,
  getBagCount,
  getBagItems,
  renderBagItem,
  renderEmptyCard
}) {
  function renderBagView() {
    const bagItems = getBagItems();
    const subtotal = bagItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    const shipping = subtotal > 200 || subtotal === 0 ? 0 : 12;
    const total = subtotal + shipping;

    return `
      <section class="card summary-card">
        <div>
          <p class="section-label">Summary</p>
          <h3>Mobile bag, website untouched</h3>
          <p>The app keeps its own flow while the main SocialEra website remains exactly where it is.</p>
        </div>

        <div class="stat-grid">
          <div class="mini-stat">
            <strong>${formatCompactNumber(getBagCount())}</strong>
            <span>Items</span>
          </div>
          <div class="mini-stat">
            <strong>${formatCurrency(subtotal)}</strong>
            <span>Subtotal</span>
          </div>
          <div class="mini-stat">
            <strong>${formatCurrency(total)}</strong>
            <span>Total</span>
          </div>
        </div>

        <div class="summary-line">
          <strong>Shipping</strong>
          <span>${shipping === 0 ? 'Free' : formatCurrency(shipping)}</span>
        </div>
        <div class="summary-line">
          <strong>Checkout path</strong>
          <span>App prototype phase</span>
        </div>

        <div class="summary-actions">
          <button class="primary-button" type="button" data-open-view="shop">Add more</button>
          <button class="ghost-button" type="button" data-reset-bag="true">Clear bag</button>
        </div>
      </section>

      <section class="bag-list">
        ${bagItems.length ? bagItems.map(renderBagItem).join('') : renderEmptyCard('Your bag is empty', 'Save or add a product from the feed to start shaping the app checkout flow.')}
      </section>
    `;
  }

  return {
    renderBagView
  };
}
