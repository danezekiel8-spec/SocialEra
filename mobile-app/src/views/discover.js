export function createDiscoverViewRenderService({
  escapeHtml,
  getBagCount,
  getCatalogContext,
  isSignedIn,
  renderCatalogResultsSection,
  renderCatalogSearchExperience,
  renderFilterChip
}) {
  function renderDiscoverView(products) {
    const catalogContext = getCatalogContext('shop');
    const channels = Array.from(new Set((Array.isArray(products) ? products : []).map((product) => product.category))).filter(Boolean);
    const signedIn = isSignedIn();
    const bagCount = signedIn ? getBagCount() : 0;
    const searchExperience = renderCatalogSearchExperience({
      view: 'shop',
      includeRecentWhenEmpty: false
    });

    return `
      <div class="shop-page-shell">
        <div class="shop-floating-utility">
          <button class="shop-bag-shortcut ${bagCount ? 'has-items' : ''}" type="button" data-open-view="bag" aria-label="${escapeHtml(signedIn ? 'Open bag' : 'Sign in to continue shopping')}">
            ${bagCount ? `<span class="live-indicator-badge shop-bag-badge" aria-hidden="true">${Math.min(bagCount, 99)}</span>` : ''}
            <svg class="shop-bag-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7.5 8.5V7.5a4.5 4.5 0 0 1 9 0v1"></path>
              <path d="M5.5 8.5H18.5L17.5 20.5H6.5Z"></path>
            </svg>
            <span>${escapeHtml(signedIn ? 'Bag' : 'Sign in')}</span>
          </button>
        </div>

        <section class="card search-card">
          <div>
            <p class="section-label">Shop</p>
            <h3 class="section-title">Shop from the floating bottom dock</h3>
          </div>
          <input
            class="field"
            type="search"
            name="discoverQuery"
            autocomplete="off"
            placeholder="Search product, category, or creator mood"
            value="${escapeHtml(catalogContext.query)}"
          >
          <div class="chip-row">
            ${renderFilterChip('all', catalogContext.filter, 'discover')}
            ${channels.map((channel) => renderFilterChip(channel, catalogContext.filter, 'discover')).join('')}
          </div>
        </section>

        <div data-catalog-search-experience="shop">${searchExperience}</div>

        ${renderCatalogResultsSection('shop')}
      </div>
    `;
  }

  return {
    renderDiscoverView
  };
}
