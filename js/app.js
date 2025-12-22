(() => {
  // utilities and storage helpers from other files
  const {
    formatDate,
    toInputDate,
    normalizeShotAt,
    escapeLatex,
    formatLatexValue,
    buildHoloParamsLatex,
    fileToDataUrl,
    copyTextToClipboard,
  } = window.holoUtils;

  const pageSize = 12;
  const { loadState, saveState, loadActiveTab, saveActiveTab } = window.holoState;
  let state = loadState();

  const tabs = [
    { key: "test", label: "露光テスト", color: getComputedStyle(document.documentElement).getPropertyValue("--accent-test") },
    { key: "product", label: "作成ホログラム", color: getComputedStyle(document.documentElement).getPropertyValue("--accent-prod") },
  ];

  let activeTab = loadActiveTab() || tabs[0].key;
  let pageByTab = { test: 1, product: 1 };
  let pendingImages = { 1: null, 2: null };
  let openId = null;
  let measurementMode = "shutter";

  const tabBar = document.getElementById("tab-bar");
  const nextNumberEl = document.getElementById("next-number");
  const titleInput = document.getElementById("title");
  const shotAtInput = document.getElementById("shotAt");
  const shotAtPicker = document.getElementById("shotAtPicker");
  const shotAtCalendarBtn = document.getElementById("shotAt-calendar");
  const shotAtLabel = shotAtCalendarBtn ? shotAtCalendarBtn.closest("label") : null;
  const memoInput = document.getElementById("memo");
  const photoInputs = [1, 2].map((n) => document.getElementById(`photo-${n}`));
  const previewEls = [1, 2].map((n) => document.getElementById(`preview-${n}`));
  const uploadBoxes = [1, 2].map((n) => document.getElementById(`upload-box-${n}`));
  const saveBtn = document.getElementById("save-btn");
  const listEl = document.getElementById("list");
  const countLabel = document.getElementById("count-label");
  const listTitle = document.getElementById("list-title");
  const pageInfo = document.getElementById("page-info");
  const pagePrevBtn = document.getElementById("page-prev");
  const pageNextBtn = document.getElementById("page-next");
  const formPanel = document.getElementById("form-panel");
  const listPanel = listEl ? listEl.closest(".panel") : null;
  const formTitle = document.getElementById("form-title");
  const formResetBtn = document.getElementById("form-reset");
  const productParamsBlock = document.getElementById("product-params-block");
  const paramInputs = Array.from(document.querySelectorAll("[data-param]"));
  const captureParamsBlock = document.getElementById("capture-params-block");
  const captureInputs = Array.from(document.querySelectorAll("[data-capture]"));
  const captureShutterRow = document.getElementById("capture-shutter-row");
  const measurementBlock = document.getElementById("measurement-block");
  const measurementTabs = document.getElementById("measurement-tabs");
  const measurementContent = document.getElementById("measurement-content");

  const modal = document.getElementById("modal");
  const modalBadge = document.getElementById("modal-badge");
  const modalMeta = document.getElementById("modal-meta");
  const modalMemo = document.getElementById("modal-memo");
  const modalShotAt = document.getElementById("modal-shotAt");
  const modalImageBox = document.getElementById("modal-image-box");
  const modalParams = document.getElementById("modal-params");
  const modalCapture = document.getElementById("modal-capture");
  const modalMeasurement = document.getElementById("modal-measurement");
  const modalCopyHoloBtn = document.querySelector('[data-action="copy-holo-latex"]');
  const toast = document.getElementById("toast");
  const removeButtons = Array.from(document.querySelectorAll("[data-remove-slot]"));
  let toastTimer = null;
  const listHeightByTab = { test: 1510, product: 1175 };

  function entries(key = activeTab) {
    if (!state[key]) state[key] = [];
    return state[key];
  }

  function nextNumber(key = activeTab) {
    const list = entries(key);
    if (!list.length) return 1;
    return Math.max(...list.map((e) => e.number || 0)) + 1;
  }

  function renderTabs() {
    tabBar.innerHTML = "";
    tabs.forEach((tab) => {
      const btn = document.createElement("button");
      btn.className = "tab";
      btn.dataset.active = tab.key === activeTab;
      btn.innerHTML = `<span class="dot" style="background:${tab.color}"></span>${tab.label}`;
      btn.onclick = () => {
        activeTab = tab.key;
        pageByTab[activeTab] = 1;
        saveActiveTab(activeTab);
        resetForm();
        updateNextNumber();
        renderTabs();
        renderList();
        toggleParamsBlock();
        toggleCaptureShutter();
        updateFormTitle();
        renderMeasurementTabs();
        applyShutterPlaceholder();
      };
      tabBar.appendChild(btn);
    });
  }

  function resetForm() {
    titleInput.value = "";
    shotAtInput.value = "";
    if (shotAtPicker) shotAtPicker.value = "";
    memoInput.value = "";
    pendingImages = { 1: null, 2: null };
    photoInputs.forEach((inp) => {
      if (inp) inp.value = "";
    });
    previewEls.forEach((img) => {
      if (img) img.src = "";
    });
    uploadBoxes.forEach((box) => box && box.classList.remove("has-image"));
    paramInputs.forEach((inp) => (inp.value = ""));
    captureInputs.forEach((inp) => (inp.value = ""));
    measurementMode = "shutter";
    renderMeasurementTabs();
  }

  function updateFormTitle() {
    formTitle.textContent = activeTab === "test" ? "露光テスト結果を追加" : "作成ホログラムを追加";
  }

  function updateNextNumber() {
    nextNumberEl.textContent = `#${nextNumber()}`;
  }

  async function setPendingImage(file, slot) {
    if (!file) return;
    if (file.type && !file.type.startsWith("image/")) {
      alert("画像ファイルを選択してください。");
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    pendingImages[slot] = dataUrl;
    const preview = previewEls[slot - 1];
    const box = uploadBoxes[slot - 1];
    if (preview) preview.src = dataUrl;
    if (box) box.classList.add("has-image");
  }

  function clearImage(slot) {
    pendingImages[slot] = null;
    const preview = previewEls[slot - 1];
    const box = uploadBoxes[slot - 1];
    const input = photoInputs[slot - 1];
    if (preview) preview.src = "";
    if (box) box.classList.remove("has-image");
    if (input) input.value = "";
  }

  photoInputs.forEach((input, idx) => {
    if (!input) return;
    const slot = idx + 1;
    input.addEventListener("change", async (e) => {
      await setPendingImage(e.target.files[0], slot);
    });
  });

  uploadBoxes.forEach((box, idx) => {
    if (!box) return;
    const slot = idx + 1;
    box.addEventListener("click", () => photoInputs[idx]?.click());
    box.addEventListener("dragover", (e) => {
      e.preventDefault();
      box.classList.add("dragover");
    });
    box.addEventListener("dragleave", (e) => {
      e.preventDefault();
      box.classList.remove("dragover");
    });
    box.addEventListener("drop", async (e) => {
      e.preventDefault();
      box.classList.remove("dragover");
      const file = e.dataTransfer?.files?.[0];
      await setPendingImage(file, slot);
    });
  });

  removeButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const slot = Number(btn.dataset.removeSlot);
      clearImage(slot);
    });
  });

  let shotAtScrollPos = 0;
  if (shotAtCalendarBtn && shotAtPicker && shotAtLabel) {
    shotAtLabel.style.position = "relative";
    const hidePicker = () => {
      shotAtPicker.style.pointerEvents = "none";
      shotAtPicker.style.left = "-9999px";
      shotAtPicker.style.top = "-9999px";
      shotAtPicker.style.position = "absolute";
      window.scrollTo({ top: shotAtScrollPos });
      shotAtCalendarBtn.focus({ preventScroll: true });
    };

    shotAtCalendarBtn.addEventListener("click", () => {
      shotAtScrollPos = window.scrollY || document.documentElement.scrollTop || 0;
      const btnRect = shotAtCalendarBtn.getBoundingClientRect();
      const labelRect = shotAtLabel.getBoundingClientRect();
      const leftWithinLabel = btnRect.left - labelRect.left;
      shotAtPicker.style.position = "absolute";
      shotAtPicker.style.left = `${leftWithinLabel}px`;
      shotAtPicker.style.top = `320px`;
      shotAtPicker.style.pointerEvents = "auto";
      shotAtPicker.focus({ preventScroll: true });
      if (shotAtPicker.showPicker) {
        shotAtPicker.showPicker();
      } else {
        shotAtPicker.click();
      }
    });
    shotAtPicker.addEventListener("change", () => {
      shotAtInput.value = shotAtPicker.value;
      hidePicker();
    });
    shotAtPicker.addEventListener("blur", () => {
      if (shotAtPicker.style.pointerEvents === "auto") hidePicker();
    });
  }
  formResetBtn.addEventListener("click", () => resetForm());

  saveBtn.addEventListener("click", async () => {
    const title = titleInput.value.trim();
    const memo = memoInput.value.trim();
    const shotAtRaw = shotAtInput.value.trim();
    const shotAtNormalized = normalizeShotAt(shotAtRaw);
    const params =
      activeTab === "product"
        ? paramInputs.reduce((acc, input) => {
            acc[input.dataset.param] = input.value.trim();
            return acc;
          }, {})
        : {};
    const captureParams = captureInputs.reduce((acc, input) => {
      acc[input.dataset.capture] = input.value.trim();
      return acc;
    }, {});
    const imageData = {};
    for (let slot = 1; slot <= 2; slot++) {
      const input = photoInputs[slot - 1];
      let img = pendingImages[slot];
      if (input && input.files && input.files[0] && !img) {
        img = await fileToDataUrl(input.files[0]);
      }
      imageData[slot] = img || "";
    }

    const shotDisplay = shotAtNormalized ? formatDate(shotAtNormalized) : "ー";

    const entry = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      number: nextNumber(),
      title: title || `${tabs.find((t) => t.key === activeTab).label}`,
      memo,
      shotAt: shotAtNormalized,
      shotDisplay,
      params,
      captureParams,
      measurement: collectMeasurement(),
      image1: imageData[1],
      image2: imageData[2],
      createdAt: new Date().toISOString(),
    };

    const list = entries();
    list.unshift(entry);
    saveState(state);
    pageByTab[activeTab] = 1;
    renderList();
    updateNextNumber();
    showToast("保存しました");
  });

  function toggleParamsBlock() {
    productParamsBlock.style.display = activeTab === "product" ? "block" : "none";
  }
  function toggleCaptureShutter() {
    captureShutterRow.style.display = "";
  }

  function collectMeasurement() {
    if (activeTab !== "test") return null;
    const rows = Array.from(measurementContent.querySelectorAll("tbody tr")).map((tr) => {
      const cells = {};
      tr.querySelectorAll("input").forEach((inp) => {
        const key = inp.dataset.measureKey || "";
        cells[key || "value"] = inp.value.trim();
      });
      return cells;
    });
    return { mode: measurementMode, rows };
  }

  function renderMeasurementTabs() {
    if (activeTab !== "test") {
      measurementBlock.style.display = "none";
      return;
    }
    measurementBlock.style.display = "block";
    Array.from(measurementTabs.querySelectorAll("button")).forEach((btn) => {
      btn.dataset.active = btn.dataset.measure === measurementMode;
    });
    applyShutterPlaceholder();
    renderMeasurementTable();
  }

  function adjustListHeight() {
    if (!listEl) return;
    const isThreeCols = !window.matchMedia("(max-width: 1100px)").matches;
    if (isThreeCols) {
      listEl.style.maxHeight = "none";
      listEl.style.overflowY = "visible";
    } else {
      const h = listHeightByTab[activeTab] || 1175;
      listEl.style.maxHeight = `${h}px`;
      listEl.style.overflowY = "auto";
    }
  }

  async function copyHoloLatex() {
    if (activeTab !== "product") {
      alert("ホロパラメータは作成ホログラムタブのみコピーできます。");
      return;
    }
    if (!openId) return;
    const { item } = findEntryById(openId);
    if (!item) return;
    const latex = buildHoloParamsLatex(item);
    const ok = await copyTextToClipboard(latex);
    if (ok) {
      showToast("ホロパラメータをコピーしました");
    } else {
      alert("コピーに失敗しました。手動でコピーしてください。");
    }
  }

  function renderList() {
    const list = entries();
    listTitle.textContent = activeTab === "test" ? "露光テスト結果一覧" : "作成ホログラム一覧";
    countLabel.textContent = `${list.length} 件`;
    const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
    let page = pageByTab[activeTab] || 1;
    if (page > totalPages) page = totalPages;
    if (page < 1) page = 1;
    pageByTab[activeTab] = page;
    const startIdx = (page - 1) * pageSize;
    const sliced = list.slice(startIdx, startIdx + pageSize);

    if (!list.length) {
      listEl.innerHTML = `<div class="meta" style="grid-column: 1 / -1;">まだ登録がありません。</div>`;
    } else if (!sliced.length) {
      listEl.innerHTML = `<div class="meta" style="grid-column: 1 / -1;">ページにデータがありません。</div>`;
    } else {
      listEl.innerHTML = "";
      sliced.forEach((item) => {
        const card = document.createElement("div");
        card.className = "card";
        card.dataset.id = item.id;
        const shotLabel =
          item.shotDisplay ||
          formatDate(item.shotAt) ||
          formatDate(item.createdAt) ||
          "ー";
        const params = item.params || {};
        const paramSummary =
          activeTab === "product"
            ? `<div class="meta">種類: ${params.type || "-"}</div>`
            : "";
        const measureLabel =
          activeTab === "test" && item.measurement
            ? item.measurement.mode === "distance"
              ? "L3-Holoplate間計測"
              : "シャッター時間計測"
            : "";
        const mainImage = item.image1 || item.image || item.image2 || "";
        card.innerHTML = `
          <div class="top">
            <div>
              <div class="badge">#${item.number} ${item.title || "(無題)"}</div>
              <div class="meta">撮影日: ${shotLabel}</div>
              ${measureLabel ? `<div class="meta">${measureLabel}</div>` : ""}
              ${paramSummary}
            </div>
            <button class="ghost" data-action="delete">削除</button>
          </div>
          <div class="thumb">${mainImage ? `<img src="${mainImage}" alt="photo" />` : "写真なし"}</div>
          <div class="actions">
            <button class="ghost" data-action="open">開く</button>
          </div>
        `;
        listEl.appendChild(card);
      });
    }

    if (pageInfo) pageInfo.textContent = `${page} / ${totalPages}`;
    if (pagePrevBtn) pagePrevBtn.disabled = page <= 1;
    if (pageNextBtn) pageNextBtn.disabled = page >= totalPages;
    adjustListHeight();
  }

  measurementTabs.addEventListener("click", (e) => {
    const mode = e.target.dataset.measure;
    if (!mode) return;
    measurementMode = mode;
    renderMeasurementTabs();
  });

  measurementContent.addEventListener("click", (e) => {
    const cell = e.target.closest(".decision-cell");
    if (!cell) return;
    const dot = cell.querySelector(".decision-dot");
    const hidden = cell.querySelector('input[data-measure-key="decision"]');
    if (!dot) return;
    if (dot.classList.contains("active")) {
      dot.classList.remove("active");
      if (hidden) hidden.value = "";
      return;
    }
    measurementContent.querySelectorAll(".decision-dot").forEach((d) => d.classList.remove("active"));
    measurementContent.querySelectorAll('input[data-measure-key="decision"]').forEach((inp) => (inp.value = ""));
    dot.classList.add("active");
    if (hidden) hidden.value = "selected";
  });

  function renderMeasurementTable() {
    if (measurementMode === "shutter") {
      const values = Array.from({ length: 16 }, (_, i) => 50 * (i + 1)); // 50,100,...,800
      measurementContent.innerHTML =
        buildTable(
          16,
          ["最適露光量[μJ/cm2]", "シャッター時間[μs]", "決定値"],
          [values, [], []],
          ["e", "shutter", "decision"]
        ) +
        `<div style="margin-top:6px; text-align:right;"><button class="ghost" id="shutter-calc-btn">シャッター時間計算</button></div>`;
      const calcBtn = document.getElementById("shutter-calc-btn");
      if (calcBtn) calcBtn.onclick = calculateShutterTimes;
    } else {
      measurementContent.innerHTML = buildTable(16, ["L3-Holoplate間[mm]", "決定値"], [], ["distance", "decision"]);
    }
  }

  function buildTable(rows, headers, columnPreset = [], colKeys = []) {
    const thead = `<thead><tr>${headers
      .map((h, idx) => {
        const key = colKeys[idx] || "";
        const cls = key === "decision" ? ' class="decision-col"' : "";
        return `<th${cls}>${h}</th>`;
      })
      .join("")}</tr></thead>`;
    const bodyRows = Array.from({ length: rows }, (_, rowIdx) => {
      const cells = headers.map((_, colIdx) => {
        const presetCol = columnPreset[colIdx] || [];
        const val = presetCol[rowIdx] !== undefined ? presetCol[rowIdx] : "";
        const key = colKeys[colIdx] || "";
        const readonly = "";
        if (key === "decision") {
          const active = val === "selected";
          return `<td class="decision-cell"><span class="decision-dot ${active ? "active" : ""}" data-decision="true"></span><input type="hidden" data-measure-key="${key}" value="${val || ""}" /></td>`;
        }
        return `<td><input type="text" data-measure-key="${key}" value="${val}" ${readonly} /></td>`;
      });
      return `<tr>${cells.join("")}</tr>`;
    }).join("");
    return `<table class="params-table measurement-table">${thead}<tbody>${bodyRows}</tbody></table>`;
  }

  function calculateShutterTimes() {
    const eInputs = measurementContent.querySelectorAll('input[data-measure-key="e"]');
    const shutterInputs = measurementContent.querySelectorAll('input[data-measure-key="shutter"]');
    const area = parseFloat(document.querySelector('[data-capture="exposureArea"]').value) || 0;
    const power = parseFloat(document.querySelector('[data-capture="exposurePower"]').value) || 0;
    if (!power || !area) {
      shutterInputs.forEach((inp) => (inp.value = ""));
      return;
    }
    eInputs.forEach((inp, idx) => {
      const eVal = parseFloat(inp.value);
      const out = isNaN(eVal) ? "" : Math.round((eVal * area) / power * 1e6);
      if (shutterInputs[idx]) shutterInputs[idx].value = out;
    });
  }

  function applyShutterPlaceholder() {
    const shutterInput = document.querySelector('[data-capture="shutterTime"]');
    const l3Input = document.querySelector('[data-capture="l3Holoplate"]');

    const setDash = (input, enable) => {
      if (!input) return;
      if (enable) {
        if (!input.value) input.value = "－";
        input.readOnly = true;
        input.classList.add("dash-placeholder");
      } else {
        if (input.value === "－") input.value = "";
        input.readOnly = false;
        input.classList.remove("dash-placeholder");
      }
    };

    if (activeTab !== "test") {
      setDash(shutterInput, false);
      setDash(l3Input, false);
      return;
    }

    if (measurementMode === "shutter") {
      setDash(shutterInput, true);
      setDash(l3Input, false);
      return;
    }

    if (measurementMode === "distance") {
      setDash(shutterInput, false);
      setDash(l3Input, true);
      return;
    }

    setDash(shutterInput, false);
    setDash(l3Input, false);
  }

  function findEntryById(id) {
    const list = entries();
    const idx = list.findIndex((item) => item.id === id);
    return { list, idx, item: list[idx] };
  }

  function openModal(id) {
    const { item } = findEntryById(id);
    if (!item) return;
    openId = id;
    modalBadge.textContent = `#${item.number} ${item.title || "(無題)"}`;
    modalMeta.textContent = "";
    modalMemo.value = item.memo || "";
    modalShotAt.value =
      item.shotDisplay ||
      formatDate(item.shotAt) ||
      formatDate(item.createdAt) ||
      "ー";
    renderModalParams(item);
    renderModalCapture(item);
    renderModalMeasurement(item);
    lockModalFields();
    const modalImg1 = item.image1 || item.image || "";
    const modalImg2 = item.image2 || "";
    if (modalImg1 || modalImg2) {
      const renderImg = (src, label) => `
        <div style="display:grid; gap:6px;">
          <div class="meta">${label}</div>
          <div style="background:#f5f6f8;border:1px solid var(--border);border-radius:10px;min-height:200px;display:grid;place-items:center;overflow:hidden;">
            <img src="${src}" alt="${label}" style="width:100%;height:100%;object-fit:contain;" />
          </div>
        </div>
      `;
      modalImageBox.innerHTML = `
        <div style="display:grid; gap:10px; width:100%;">
          ${modalImg1 ? renderImg(modalImg1, "写真1") : ""}
          ${modalImg2 ? renderImg(modalImg2, "写真2") : ""}
        </div>
      `;
    } else {
      modalImageBox.textContent = "画像なし";
    }
    if (modalCopyHoloBtn) {
      modalCopyHoloBtn.style.display = activeTab === "product" ? "inline-flex" : "none";
    }
    modal.dataset.open = "true";
    modal.setAttribute("aria-hidden", "false");
    modal.classList.remove("hidden");
    modal.classList.add("show");
    document.body.classList.add("no-scroll");
  }

  function closeModal() {
    modal.dataset.open = "false";
    modal.setAttribute("aria-hidden", "true");
    modal.classList.remove("show");
    modal.classList.add("hidden");
    openId = null;
    document.body.classList.remove("no-scroll");
  }

  listEl.addEventListener("click", (e) => {
    const action = e.target.dataset.action;
    if (!action) {
      const card = e.target.closest(".card");
      if (card) openModal(card.dataset.id);
      return;
    }
    const card = e.target.closest(".card");
    const id = card.dataset.id;
    const { list, idx } = findEntryById(id);
    if (idx === -1) return;

    if (action === "delete") {
      const ok = window.confirm("この記録を削除しますか？");
      if (!ok) return;
      list.splice(idx, 1);
      saveState(state);
      renderList();
      updateNextNumber();
    }

    if (action === "open") {
      openModal(id);
    }
  });

  if (pagePrevBtn && pageNextBtn) {
    pagePrevBtn.addEventListener("click", () => {
      const current = pageByTab[activeTab] || 1;
      if (current > 1) {
        pageByTab[activeTab] = current - 1;
        renderList();
      }
    });
    pageNextBtn.addEventListener("click", () => {
      const list = entries();
      const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
      const current = pageByTab[activeTab] || 1;
      if (current < totalPages) {
        pageByTab[activeTab] = current + 1;
        renderList();
      }
    });
  }

  modal.addEventListener("click", (e) => {
    const action = e.target.dataset.action;
    if (action === "close") {
      closeModal();
      return;
    }
    if (action === "copy-holo-latex") {
      copyHoloLatex();
      return;
    }
    if (action === "save-modal") {
      if (!openId) return;
      const { list, idx } = findEntryById(openId);
      if (idx === -1) return;
      list[idx].memo = modalMemo.value.trim();
      saveState(state);
      renderList();
      closeModal();
    }
  });

  function lockModalFields() {
    modalShotAt.disabled = true;
    modalParams.querySelectorAll("input").forEach((inp) => (inp.disabled = true));
    modalCapture.querySelectorAll("input").forEach((inp) => (inp.disabled = true));
  }

  function renderModalParams(item) {
    if (activeTab !== "product") {
      modalParams.innerHTML = "";
      return;
    }
    const params = item.params || {};
    modalParams.innerHTML = `
      <label style="margin-top:10px;">ホロパラメータ</label>
      <table class="params-table">
        <tbody>
          <tr><th>ホログラムの種類</th><td><input data-modal-param="type" type="text" value="${params.type || ""}" disabled /></td></tr>
          <tr><th>視点数 (Viewpoints)</th><td><input data-modal-param="parallaxCount" type="text" value="${params.parallaxCount || ""}" disabled /></td></tr>
          <tr><th>ホログラムのサイズ (mm)</th><td><input data-modal-param="size" type="text" value="${params.size || ""}" disabled /></td></tr>
          <tr><th>解像度 (pixel)</th><td><input data-modal-param="resolution" type="text" value="${params.resolution || ""}" disabled /></td></tr>
          <tr><th>画素ピッチ (μm)</th><td><input data-modal-param="pitch" type="text" value="${params.pitch || ""}" disabled /></td></tr>
          <tr><th>視点距離 (m)</th><td><input data-modal-param="distance" type="text" value="${params.distance || ""}" disabled /></td></tr>
          <tr><th>参照光 (rad)</th><td><input data-modal-param="reference" type="text" value="${params.reference || ""}" disabled /></td></tr>
        </tbody>
      </table>
    `;
  }

  function renderModalCapture(item) {
    const c = item.captureParams || {};
    modalCapture.innerHTML = `
      <label style="margin-top:10px;">撮影パラメータ</label>
      <table class="params-table">
        <tbody>
          <tr><th>レーザーパワー[ｍW]</th><td><input data-modal-capture="laserPower" type="text" value="${c.laserPower || ""}" /></td></tr>
          <tr><th>露光パワー[μW]</th><td><input data-modal-capture="exposurePower" type="text" value="${c.exposurePower || ""}" /></td></tr>
          <tr><th>露光パワーの面積[cm2]</th><td><input data-modal-capture="exposureArea" type="text" value="${c.exposureArea || ""}" /></td></tr>
          <tr><th>セトリング時間[ms]</th><td><input data-modal-capture="settlingTime" type="text" value="${c.settlingTime || ""}" /></td></tr>
          <tr><th>シャッター時間[μs]</th><td><input data-modal-capture="shutterTime" type="text" value="${c.shutterTime || ""}" /></td></tr>
          <tr><th>L3-Holoplate間[mm]</th><td><input data-modal-capture="l3Holoplate" type="text" value="${c.l3Holoplate || ""}" /></td></tr>
        </tbody>
      </table>
    `;
  }

  function renderModalMeasurement(item) {
    if (activeTab !== "test" || !item.measurement) {
      modalMeasurement.innerHTML = "";
      return;
    }
    const { mode, rows } = item.measurement;
    if (mode === "shutter") {
      modalMeasurement.innerHTML = buildMeasurementView(
        ["最適露光量[μJ/cm2]", "シャッター時間[μs]", "決定値"],
        rows,
        ["e", "shutter", "decision"]
      );
    } else {
      modalMeasurement.innerHTML = buildMeasurementView(["L3-Holoplate間[mm]", "決定値"], rows, ["distance", "decision"]);
    }
  }

  function buildMeasurementView(headers, rows, keys) {
    const thead = `<thead><tr>${headers
      .map((h, idx) => {
        const key = keys[idx] || "";
        const cls = key === "decision" ? ' class="decision-col"' : "";
        return `<th${cls}>${h}</th>`;
      })
      .join("")}</tr></thead>`;
    const body = (rows || [])
      .map((row) => {
        const cells = keys.map((k) => {
          const val =
            row[k] !== undefined
              ? row[k]
              : row[k === "decision" ? "m3" : k] || row[k === "decision" ? "d2" : k] || "";
          if (k === "decision") {
            const active = val === "selected";
            return `<td class="decision-cell"><span class="decision-dot ${active ? "active" : ""}"></span></td>`;
          }
          return `<td>${val}</td>`;
        });
        return `<tr>${cells.join("")}</tr>`;
      })
      .join("");
    return `
      <label style="margin-top:10px;">計測データ</label>
      <table class="params-table measurement-table">
        ${thead}
        <tbody>${body}</tbody>
      </table>
    `;
  }

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, 1800);
  }

  renderTabs();
  renderList();
  updateNextNumber();
  toggleParamsBlock();
  toggleCaptureShutter();
  updateFormTitle();
  renderMeasurementTabs();
  applyShutterPlaceholder();
  window.addEventListener("resize", adjustListHeight);
})();
