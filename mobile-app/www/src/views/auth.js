export function createAuthViewRenderService({
  renderAuthCard
}) {
  function renderAuthView() {
    return `
      <section class="auth-page-shell">
        <section class="card connection-card auth-card auth-page-card">
          ${renderAuthCard({ standalone: true })}
        </section>
      </section>
    `;
  }

  return {
    renderAuthView
  };
}
