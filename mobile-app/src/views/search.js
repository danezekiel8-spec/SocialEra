export function createSearchViewRenderService({
  escapeHtml,
  getCatalogContext,
  renderCatalogResultsSection
}) {
  function renderSearchView() {
    const catalogContext = getCatalogContext('search');

    return `
      <section class="card search-card">
        <div>
          <p class="section-label">Search</p>
          <h3 class="section-title">Search members, products, and posts</h3>
        </div>
        <input
          class="field"
          type="search"
          name="discoverQuery"
          autocomplete="off"
          placeholder="Search by member, product, post, or style"
          value="${escapeHtml(catalogContext.query)}"
        >
      </section>

      ${renderCatalogResultsSection('search')}
    `;
  }

  return {
    renderSearchView
  };
}
