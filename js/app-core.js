(() => {
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
  const { loadState, saveState, loadActiveTab, saveActiveTab } = window.holoState;

  const pageSize = 12;
  const tabs = [
    { key: "test", label: "露光テスト", color: getComputedStyle(document.documentElement).getPropertyValue("--accent-test") },
    { key: "product", label: "作成ホログラム", color: getComputedStyle(document.documentElement).getPropertyValue("--accent-prod") },
  ];

  let state = loadState();
  let activeTab = loadActiveTab() || tabs[0].key;
  let pageByTab = { test: 1, product: 1 };
  let pendingImages = { 1: null, 2: null };
  let openId = null;
  let measurementMode = "shutter";
  let elements = {};
  let toastTimer = null;
  const listHeightByTab = { test: 1510, product: 1175 };

  function setElements(el) {
    elements = el;
  }

  function entries(key = activeTab) {
    if (!state[key]) state[key] = [];
    return state[key];
  }

  function nextNumber(key = activeTab) {
    const list = entries(key);
    if (!list.length) return 1;
    return Math.max(...list.map((e) => e.number || 0)) + 1;
  }

  function updateNextNumber() {
    if (elements.nextNumberEl) elements.nextNumberEl.textContent = `#${nextNumber()}`;
  }

  function resetForm() {
    const { titleInput, shotAtInput, shotAtPicker, memoInput, paramInputs, captureInputs, uploadBoxes, previewEls, photoInputs } = elements;
    if (titleInput) titleInput.value = "";
    if (shotAtInput) shotAtInput.value = "";
    if (shotAtPicker) shotAtPicker.value = "";
    if (memoInput) memoInput.value = "";
    pendingImages = { 1: null, 2: null };
    (photoInputs || []).forEach((inp) => inp && (inp.value = ""));
    (previewEls || []).forEach((img) => img && (img.src = ""));
    (uploadBoxes || []).forEach((box) => box && box.classList.remove("has-image"));
    (paramInputs || []).forEach((inp) => (inp.value = ""));
    (captureInputs || []).forEach((inp) => (inp.value = ""));
    measurementMode = "shutter";
    renderMeasurementTabs();
  }

  function renderTabs() {
    const { tabBar } = elements;
    if (!tabBar) return;
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

  function updateFormTitle() {
    if (!elements.formTitle) return;
    elements.formTitle.textContent = activeTab === "test" ? "露光テスト結果を追加" : "作成ホログラムを追加";
  }

  async function setPendingImage(file, slot) {
    if (!file) return;
    if (file.type && !file.type.startsWith("image/")) {
      alert("画像ファイルを選択してください。");
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    pendingImages[slot] = dataUrl;
    const preview = elements.previewEls?.[slot - 1];
    const box = elements.uploadBoxes?.[slot - 1];
    if (preview) preview.src = dataUrl;
    if (box) box.classList.add("has-image");
  }

  function clearImage(slot) {
    pendingImages[slot] = null;
    const preview = elements.previewEls?.[slot - 1];
    const box = elements.uploadBoxes?.[slot - 1];
    const input = elements.photoInputs?.[slot - 1];
    if (preview) preview.src = "";
    if (box) box.classList.remove("has-image");
    if (input) input.value = "";
  }

  function collectMeasurement() {
    if (activeTab !== "test") return null;
    const rows = Array.from(elements.measurementContent?.querySelectorAll("tbody tr") || []).map((tr) => {
      const cells = {};
      tr.querySelectorAll("input").forEach((inp) => {
        const key = inp.dataset.measureKey || "";
        cells[key || "value"] = inp.value.trim();
      });
      return cells;
    });
    return { mode: measurementMode, rows };
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
        if (key === "decision") {
          const active = val === "selected";
          return `<td class="decision-cell"><span class="decision-dot ${active ? "active" : ""}" data-decision="true"></span><input type="hidden" data-measure-key="${key}" value="${val || ""}" /></td>`;
        }
        return `<td><input type="text" data-measure-key="${key}" value="${val}" /></td>`;
      });
      return `<tr>${cells.join("")}</tr>`;
    }).join("");
    return `<table class="params-table measurement-table">${thead}<tbody>${bodyRows}</tbody></table>`;
  }

  function renderMeasurementTable() {
    if (!elements.measurementContent) return;
    if (measurementMode === "shutter") {
      const values = Array.from({ length: 16 }, (_, i) => 50 * (i + 1)); // 50,100,...,800
      elements.measurementContent.innerHTML =
        buildTable(16, ["最適露光量[μJ/cm2]", "シャッター時間[μs]", "決定値"], [values, [], []], ["e", "shutter", "decision"]) +
        `<div style="margin-top:6px; text-align:right;"><button class="ghost" id="shutter-calc-btn">シャッター時間計算</button></div>`;
    } else {
      elements.measurementContent.innerHTML = buildTable(16, ["L3-Holoplate間[mm]", "決定値"], [], ["distance", "decision"]);
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
          const val = row[k] !== undefined ? row[k] : row[k === "decision" ? "m3" : k] || row[k === "decision" ? "d2" : k] || "";
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

  function calculateShutterTimes() {
    const area = parseFloat(elements.captureInputs?.find((i) => i.dataset.capture === "exposureArea")?.value || 0);
    const power = parseFloat(elements.captureInputs?.find((i) => i.dataset.capture === "exposurePower")?.value || 0);
    const eInputs = elements.measurementContent?.querySelectorAll('input[data-measure-key="e"]') || [];
    const shutterInputs = elements.measurementContent?.querySelectorAll('input[data-measure-key="shutter"]') || [];
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

  function renderMeasurementTabs() {
    if (activeTab !== "test") {
      if (elements.measurementBlock) elements.measurementBlock.style.display = "none";
      return;
    }
    if (elements.measurementBlock) elements.measurementBlock.style.display = "block";
    Array.from(elements.measurementTabs?.querySelectorAll("button") || []).forEach((btn) => {
      btn.dataset.active = btn.dataset.measure === measurementMode;
    });
    applyShutterPlaceholder();
    renderMeasurementTable();
  }

  function applyShutterPlaceholder() {
    const shutterInput = elements.captureInputs?.find((i) => i.dataset.capture === "shutterTime");
    const l3Input = elements.captureInputs?.find((i) => i.dataset.capture === "l3Holoplate");
    const setDash = (input, enable, forceDash = false) => {
      if (!input) return;
      if (enable) {
        if (forceDash || !input.value || input.value === "－") input.value = "－";
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
      setDash(shutterInput, true, true);
      setDash(l3Input, false);
      return;
    }
    if (measurementMode === "distance") {
      setDash(shutterInput, false);
      setDash(l3Input, true, true);
      return;
    }
    setDash(shutterInput, false);
    setDash(l3Input, false);
  }

  function toggleParamsBlock() {
    if (elements.productParamsBlock) elements.productParamsBlock.style.display = activeTab === "product" ? "block" : "none";
  }
  function toggleCaptureShutter() {
    if (elements.captureShutterRow) elements.captureShutterRow.style.display = "";
  }

  function adjustListHeight() {
    const { listEl } = elements;
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

  function findEntryById(id) {
    const list = entries();
    const idx = list.findIndex((item) => item.id === id);
    return { list, idx, item: list[idx] };
  }

  function renderList() {
    const { listEl, listTitle, countLabel, pageInfo, pagePrevBtn, pageNextBtn } = elements;
    if (!listEl) return;
    const list = entries();
    if (listTitle) listTitle.textContent = activeTab === "test" ? "露光テスト結果一覧" : "作成ホログラム一覧";
    if (countLabel) countLabel.textContent = `${list.length} 件`;
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
        const shotLabel = item.shotDisplay || formatDate(item.shotAt) || formatDate(item.createdAt) || "ー";
        const params = item.params || {};
        const paramSummary = activeTab === "product" ? `<div class="meta">種類: ${params.type || "-"}</div>` : "";
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

  function renderMeasurement() {
    if (!elements.modalMeasurement) return;
  }

  function renderModalParams(item) {
    if (activeTab !== "product" || !elements.modalParams) {
      if (elements.modalParams) elements.modalParams.innerHTML = "";
      return;
    }
    const params = item.params || {};
    elements.modalParams.innerHTML = `
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
    if (!elements.modalCapture) return;
    const c = item.captureParams || {};
    elements.modalCapture.innerHTML = `
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
    if (activeTab !== "test" || !item.measurement || !elements.modalMeasurement) {
      if (elements.modalMeasurement) elements.modalMeasurement.innerHTML = "";
      return;
    }
    const { mode, rows } = item.measurement;
    if (mode === "shutter") {
      elements.modalMeasurement.innerHTML = buildMeasurementView(
        ["最適露光量[μJ/cm2]", "シャッター時間[μs]", "決定値"],
        rows,
        ["e", "shutter", "decision"]
      );
    } else {
      elements.modalMeasurement.innerHTML = buildMeasurementView(["L3-Holoplate間[mm]", "決定値"], rows, ["distance", "decision"]);
    }
  }

  function lockModalFields() {
    if (elements.modalShotAt) elements.modalShotAt.disabled = true;
    elements.modalParams?.querySelectorAll("input").forEach((inp) => (inp.disabled = true));
    elements.modalCapture?.querySelectorAll("input").forEach((inp) => (inp.disabled = true));
  }

  function openModal(id) {
    const { item } = findEntryById(id);
    if (!item || !elements.modal) return;
    openId = id;
    if (elements.modalBadge) elements.modalBadge.textContent = `#${item.number} ${item.title || "(無題)"}`;
    if (elements.modalMeta) elements.modalMeta.textContent = "";
    if (elements.modalMemo) elements.modalMemo.value = item.memo || "";
    if (elements.modalShotAt)
      elements.modalShotAt.value = item.shotDisplay || formatDate(item.shotAt) || formatDate(item.createdAt) || "ー";
    renderModalParams(item);
    renderModalCapture(item);
    renderModalMeasurement(item);
    lockModalFields();
    const modalImg1 = item.image1 || item.image || "";
    const modalImg2 = item.image2 || "";
    if (elements.modalImageBox) {
      if (modalImg1 || modalImg2) {
        const renderImg = (src, label) => `
          <div style="display:grid; gap:6px;">
            <div class="meta">${label}</div>
            <div style="background:#f5f6f8;border:1px solid var(--border);border-radius:10px;min-height:200px;display:grid;place-items:center;overflow:hidden;">
              <img src="${src}" alt="${label}" style="width:100%;height:100%;object-fit:contain;" />
            </div>
          </div>
        `;
        elements.modalImageBox.innerHTML = `
          <div style="display:grid; gap:10px; width:100%;">
            ${modalImg1 ? renderImg(modalImg1, "写真1") : ""}
            ${modalImg2 ? renderImg(modalImg2, "写真2") : ""}
          </div>
        `;
      } else {
        elements.modalImageBox.textContent = "画像なし";
      }
    }
    if (elements.modalCopyHoloBtn) {
      elements.modalCopyHoloBtn.style.display = activeTab === "product" ? "inline-flex" : "none";
    }
    elements.modal.dataset.open = "true";
    elements.modal.setAttribute("aria-hidden", "false");
    elements.modal.classList.remove("hidden");
    elements.modal.classList.add("show");
    document.body.classList.add("no-scroll");
  }

  function closeModal() {
    if (!elements.modal) return;
    elements.modal.dataset.open = "false";
    elements.modal.setAttribute("aria-hidden", "true");
    elements.modal.classList.remove("show");
    elements.modal.classList.add("hidden");
    openId = null;
    document.body.classList.remove("no-scroll");
  }

  function showToast(message) {
    if (!elements.toast) return;
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      elements.toast.classList.remove("show");
    }, 1800);
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

  function saveEntry() {
    const { titleInput, memoInput, shotAtInput, paramInputs, captureInputs, photoInputs } = elements;
    const title = titleInput?.value.trim() || "";
    const memo = memoInput?.value.trim() || "";
    const shotAtRaw = shotAtInput?.value.trim() || "";
    const shotAtNormalized = normalizeShotAt(shotAtRaw);
    const params =
      activeTab === "product"
        ? (paramInputs || []).reduce((acc, input) => {
            acc[input.dataset.param] = input.value.trim();
            return acc;
          }, {})
        : {};
    const captureParams = (captureInputs || []).reduce((acc, input) => {
      acc[input.dataset.capture] = input.value.trim();
      return acc;
    }, {});
    const imageData = {};
    const photoSlots = photoInputs || [];
    return (async () => {
      for (let slot = 1; slot <= 2; slot++) {
        const input = photoSlots[slot - 1];
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
    })();
  }

  function deleteEntry(id) {
    const { list, idx } = findEntryById(id);
    if (idx === -1) return;
    const ok = window.confirm("この記録を削除しますか？");
    if (!ok) return;
    list.splice(idx, 1);
    saveState(state);
    renderList();
    updateNextNumber();
  }

  function exportData() {
    try {
      const dataStr = JSON.stringify(state, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const now = new Date();
      const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
      a.href = url;
      a.download = `hologram-data-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("エクスポートしました");
    } catch (e) {
      alert("エクスポートに失敗しました。");
    }
  }

  function importData(json) {
    const nextState = {
      test: Array.isArray(json?.test) ? json.test : [],
      product: Array.isArray(json?.product) ? json.product : [],
    };
    state = nextState;
    saveState(state);
    pageByTab = { test: 1, product: 1 };
    renderTabs();
    renderList();
    updateNextNumber();
    toggleParamsBlock();
    toggleCaptureShutter();
    updateFormTitle();
    renderMeasurementTabs();
    showToast("インポートしました");
  }

  window.appCore = {
    get pageSize() {
      return pageSize;
    },
    get state() {
      return state;
    },
    get tabs() {
      return tabs;
    },
    get activeTab() {
      return activeTab;
    },
    set activeTab(val) {
      activeTab = val;
    },
    get measurementMode() {
      return measurementMode;
    },
    set measurementMode(val) {
      measurementMode = val;
    },
    get openId() {
      return openId;
    },
    set openId(val) {
      openId = val;
    },
    pageByTab,
    setPendingImage,
    clearImage,
    renderTabs,
    renderList,
    resetForm,
    updateNextNumber,
    updateFormTitle,
    collectMeasurement,
    renderMeasurementTabs,
    renderMeasurementTable,
    calculateShutterTimes,
    applyShutterPlaceholder,
    toggleParamsBlock,
    toggleCaptureShutter,
    adjustListHeight,
    openModal,
    closeModal,
    copyHoloLatex,
    showToast,
    saveEntry,
    deleteEntry,
    setElements,
    exportData,
    importData,
    buildMeasurementView,
    renderModalParams,
    renderModalCapture,
    renderModalMeasurement,
    findEntryById,
  };
})();
