(function () {
  const stateKey = "holo-manager-entries";
  const activeTabKey = "holo-active-tab";

  function loadState() {
    try {
      const raw = localStorage.getItem(stateKey);
      return raw ? JSON.parse(raw) : { test: [], product: [] };
    } catch (e) {
      return { test: [], product: [] };
    }
  }

  function loadActiveTab() {
    try {
      const raw = localStorage.getItem(activeTabKey);
      return raw || null;
    } catch (e) {
      return null;
    }
  }

  function saveActiveTab(tabKey) {
    try {
      localStorage.setItem(activeTabKey, tabKey);
    } catch (e) {}
  }

  function saveState(state) {
    localStorage.setItem(stateKey, JSON.stringify(state));
  }

  window.holoState = {
    stateKey,
    activeTabKey,
    loadState,
    saveState,
    loadActiveTab,
    saveActiveTab,
  };
})();
