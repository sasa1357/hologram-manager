(() => {
  const core = window.appCore;

  const elements = {
    tabBar: document.getElementById("tab-bar"),
    nextNumberEl: document.getElementById("next-number"),
    titleInput: document.getElementById("title"),
    shotAtInput: document.getElementById("shotAt"),
    shotAtPicker: document.getElementById("shotAtPicker"),
    shotAtCalendarBtn: document.getElementById("shotAt-calendar"),
    shotAtLabel: document.getElementById("shotAt-calendar")?.closest("label"),
    memoInput: document.getElementById("memo"),
    photoInputs: [1, 2].map((n) => document.getElementById(`photo-${n}`)),
    previewEls: [1, 2].map((n) => document.getElementById(`preview-${n}`)),
    uploadBoxes: [1, 2].map((n) => document.getElementById(`upload-box-${n}`)),
    saveBtn: document.getElementById("save-btn"),
    listEl: document.getElementById("list"),
    countLabel: document.getElementById("count-label"),
    listTitle: document.getElementById("list-title"),
    pageInfo: document.getElementById("page-info"),
    pagePrevBtn: document.getElementById("page-prev"),
    pageNextBtn: document.getElementById("page-next"),
    formPanel: document.getElementById("form-panel"),
    formTitle: document.getElementById("form-title"),
    formResetBtn: document.getElementById("form-reset"),
    exportBtn: document.getElementById("export-btn"),
    importBtn: document.getElementById("import-btn"),
    importFileInput: document.getElementById("import-file"),
    productParamsBlock: document.getElementById("product-params-block"),
    paramInputs: Array.from(document.querySelectorAll("[data-param]")),
    captureParamsBlock: document.getElementById("capture-params-block"),
    captureInputs: Array.from(document.querySelectorAll("[data-capture]")),
    captureShutterRow: document.getElementById("capture-shutter-row"),
    measurementBlock: document.getElementById("measurement-block"),
    measurementTabs: document.getElementById("measurement-tabs"),
    measurementContent: document.getElementById("measurement-content"),
    modal: document.getElementById("modal"),
    modalBadge: document.getElementById("modal-badge"),
    modalMeta: document.getElementById("modal-meta"),
    modalMemo: document.getElementById("modal-memo"),
    modalShotAt: document.getElementById("modal-shotAt"),
    modalImageBox: document.getElementById("modal-image-box"),
    modalParams: document.getElementById("modal-params"),
    modalCapture: document.getElementById("modal-capture"),
    modalMeasurement: document.getElementById("modal-measurement"),
    modalCopyHoloBtn: document.querySelector('[data-action="copy-holo-latex"]'),
    toast: document.getElementById("toast"),
  };

  core.setElements(elements);

  // File import/export
  if (elements.exportBtn) {
    elements.exportBtn.addEventListener("click", () => core.exportData());
  }
  if (elements.importBtn && elements.importFileInput) {
    elements.importBtn.addEventListener("click", () => elements.importFileInput.click());
    elements.importFileInput.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const json = JSON.parse(reader.result);
          core.importData(json);
        } catch (err) {
          alert("JSONの読み込みに失敗しました。");
        } finally {
          elements.importFileInput.value = "";
        }
      };
      reader.onerror = () => {
        alert("ファイルの読み込みに失敗しました。");
        elements.importFileInput.value = "";
      };
      reader.readAsText(file);
    });
  }

  // Photo handling
  (elements.photoInputs || []).forEach((input, idx) => {
    if (!input) return;
    const slot = idx + 1;
    input.addEventListener("change", async (e) => {
      await core.setPendingImage(e.target.files[0], slot);
    });
  });

  (elements.uploadBoxes || []).forEach((box, idx) => {
    if (!box) return;
    const slot = idx + 1;
    box.addEventListener("click", () => elements.photoInputs?.[idx]?.click());
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
      await core.setPendingImage(file, slot);
    });
  });

  Array.from(document.querySelectorAll("[data-remove-slot]")).forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const slot = Number(btn.dataset.removeSlot);
      core.clearImage(slot);
    });
  });

  // Date picker positioning (top fixed 320px)
  let shotAtScrollPos = 0;
  if (elements.shotAtCalendarBtn && elements.shotAtPicker && elements.shotAtLabel) {
    elements.shotAtLabel.style.position = "relative";
    const hidePicker = () => {
      elements.shotAtPicker.style.pointerEvents = "none";
      elements.shotAtPicker.style.left = "-9999px";
      elements.shotAtPicker.style.top = "-9999px";
      elements.shotAtPicker.style.position = "absolute";
      window.scrollTo({ top: shotAtScrollPos });
      elements.shotAtCalendarBtn.focus({ preventScroll: true });
    };

    elements.shotAtCalendarBtn.addEventListener("click", () => {
      shotAtScrollPos = window.scrollY || document.documentElement.scrollTop || 0;
      const btnRect = elements.shotAtCalendarBtn.getBoundingClientRect();
      const labelRect = elements.shotAtLabel.getBoundingClientRect();
      const leftWithinLabel = btnRect.left - labelRect.left;
      elements.shotAtPicker.style.position = "absolute";
      elements.shotAtPicker.style.left = `${leftWithinLabel}px`;
      elements.shotAtPicker.style.top = `320px`;
      elements.shotAtPicker.style.pointerEvents = "auto";
      elements.shotAtPicker.focus({ preventScroll: true });
      if (elements.shotAtPicker.showPicker) {
        elements.shotAtPicker.showPicker();
      } else {
        elements.shotAtPicker.click();
      }
    });
    elements.shotAtPicker.addEventListener("change", () => {
      elements.shotAtInput.value = elements.shotAtPicker.value;
      hidePicker();
    });
    elements.shotAtPicker.addEventListener("blur", () => {
      if (elements.shotAtPicker.style.pointerEvents === "auto") hidePicker();
    });
  }

  // Measurement tabs and decision dots
  if (elements.measurementTabs) {
    elements.measurementTabs.addEventListener("click", (e) => {
      const mode = e.target.dataset.measure;
      if (!mode) return;
      core.measurementMode = mode;
      core.renderMeasurementTabs();
    });
  }

  // Arrow-down to next field (capture/param inputs)
  const paramNavInputs = [...(elements.captureInputs || []), ...(elements.paramInputs || [])].filter(Boolean);
  paramNavInputs.forEach((inp, idx) => {
    inp.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        const next = paramNavInputs[idx + 1];
        if (next) {
          e.preventDefault();
          next.focus();
        }
      }
      if (e.key === "ArrowUp") {
        const prev = paramNavInputs[idx - 1];
        if (prev) {
          e.preventDefault();
          prev.focus();
        }
      }
    });
  });

  if (elements.measurementContent) {
    elements.measurementContent.addEventListener("click", (e) => {
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
      elements.measurementContent.querySelectorAll(".decision-dot").forEach((d) => d.classList.remove("active"));
      elements.measurementContent.querySelectorAll('input[data-measure-key="decision"]').forEach((inp) => (inp.value = ""));
      dot.classList.add("active");
      if (hidden) hidden.value = "selected";
    });
  }

  document.addEventListener("click", (e) => {
    if (e.target?.id === "shutter-calc-btn") {
      core.calculateShutterTimes();
    }
  });

  // Pagination
  if (elements.pagePrevBtn && elements.pageNextBtn) {
    elements.pagePrevBtn.addEventListener("click", () => {
      const current = core.pageByTab[core.activeTab] || 1;
      if (current > 1) {
        core.pageByTab[core.activeTab] = current - 1;
        core.renderList();
      }
    });
    elements.pageNextBtn.addEventListener("click", () => {
      const list = core.state[core.activeTab] || [];
      const totalPages = Math.max(1, Math.ceil(list.length / (core.pageSize || 12)));
      const current = core.pageByTab[core.activeTab] || 1;
      if (current < totalPages) {
        core.pageByTab[core.activeTab] = current + 1;
        core.renderList();
      }
    });
  }

  // List click (open/delete)
  if (elements.listEl) {
    elements.listEl.addEventListener("click", (e) => {
      const action = e.target.dataset.action;
      if (!action) {
        const card = e.target.closest(".card");
        if (card) core.openModal(card.dataset.id);
        return;
      }
      const card = e.target.closest(".card");
      if (!card) return;
      const id = card.dataset.id;
      if (action === "delete") {
        core.deleteEntry(id);
      }
      if (action === "open") {
        core.openModal(id);
      }
    });
  }

  // Modal click
  if (elements.modal) {
    elements.modal.addEventListener("click", (e) => {
      const action = e.target.dataset.action;
      if (action === "close") {
        core.closeModal();
        return;
      }
      if (action === "copy-holo-latex") {
        core.copyHoloLatex();
        return;
      }
      if (action === "save-modal") {
        if (!core.findEntryById(core.openId)) return;
        const { list, idx } = core.findEntryById(core.openId);
        if (idx === -1) return;
        if (elements.modalMemo) list[idx].memo = elements.modalMemo.value.trim();
        window.holoState.saveState(core.state);
        core.renderList();
        core.closeModal();
      }
    });
  }

  // Form actions
  if (elements.formResetBtn) elements.formResetBtn.addEventListener("click", () => core.resetForm());
  if (elements.saveBtn) elements.saveBtn.addEventListener("click", () => core.saveEntry());
  if (elements.modalCopyHoloBtn) elements.modalCopyHoloBtn.addEventListener("click", () => core.copyHoloLatex());

  // Initial render
  core.renderTabs();
  core.renderList();
  core.updateNextNumber();
  core.toggleParamsBlock();
  core.toggleCaptureShutter();
  core.updateFormTitle();
  core.renderMeasurementTabs();
  core.applyShutterPlaceholder();
  window.addEventListener("resize", () => core.adjustListHeight());
})();
