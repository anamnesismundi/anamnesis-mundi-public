/* Monad-only public transfer of the canonical source-tradition provenance component. */
(() => {
  const markup = `
    <span class="source-tradition-markers" aria-label="Source tradition: Sethian Gnostic">
      <span class="source-tradition-marker">
        <span class="source-tradition-book" aria-hidden="true"></span>
        <span>Sethian Gnostic</span>
      </span>
    </span>
  `;

  function applyMonadProvenance() {
    const monad = document.querySelector('.event[data-entity-id="entity-monad"]');
    if (!monad || monad.querySelector('.source-tradition-markers')) return false;
    monad.insertAdjacentHTML('afterbegin', markup);
    return true;
  }

  if (applyMonadProvenance()) return;

  const observer = new MutationObserver(() => {
    if (applyMonadProvenance()) observer.disconnect();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
