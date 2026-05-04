export function createSearchViewRenderService({
  escapeHtml,
  getCatalogContext,
  renderCatalogResultsSection
}) {
  function renderSearchView() {
    const catalogContext = getCatalogContext('search');

    return `
      <section class="card search-card">
        <input
          class="field"
          type="search"
          name="discoverQuery"
          autocomplete="off"
          placeholder="Search members, products, or posts"
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
