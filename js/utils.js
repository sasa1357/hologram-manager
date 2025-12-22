(function () {
  function formatDate(value) {
    if (!value) return "";
    const str = String(value).trim();
    const yOnly = /^(\d{4})$/;
    const yM = /^(\d{4})[-/](\d{1,2})$/;
    const yMd = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/;
    if (yOnly.test(str)) {
      const [, y] = str.match(yOnly);
      return y;
    }
    if (yM.test(str)) {
      const [, y, m] = str.match(yM);
      return `${y}/${m.padStart(2, "0")}`;
    }
    if (yMd.test(str)) {
      const [, y, m, d] = str.match(yMd);
      return `${y}/${m.padStart(2, "0")}/${d.padStart(2, "0")}`;
    }
    const dObj = new Date(str);
    if (!isNaN(dObj.getTime())) {
      const yyyy = dObj.getFullYear();
      const mm = String(dObj.getMonth() + 1).padStart(2, "0");
      const dd = String(dObj.getDate()).padStart(2, "0");
      return `${yyyy}/${mm}/${dd}`;
    }
    return str;
  }

  function toInputDate(value) {
    if (!value) return "";
    const str = String(value).trim();
    const yOnly = /^(\d{4})$/;
    const yM = /^(\d{4})[-/](\d{1,2})$/;
    const yMd = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/;
    if (yOnly.test(str)) {
      const [, y] = str.match(yOnly);
      return y;
    }
    if (yM.test(str)) {
      const [, y, m] = str.match(yM);
      return `${y}-${m.padStart(2, "0")}`;
    }
    if (yMd.test(str)) {
      const [, y, m, d] = str.match(yMd);
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    const dObj = new Date(str);
    if (!isNaN(dObj.getTime())) {
      const yyyy = dObj.getFullYear();
      const mm = String(dObj.getMonth() + 1).padStart(2, "0");
      const dd = String(dObj.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
    return str;
  }

  function normalizeShotAt(value) {
    if (!value) return "";
    const str = String(value).trim();
    const yOnly = /^(\d{4})$/;
    const yM = /^(\d{4})[-/](\d{1,2})$/;
    const yMd = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/;
    if (yOnly.test(str)) {
      const [, y] = str.match(yOnly);
      return y;
    }
    if (yM.test(str)) {
      const [, y, m] = str.match(yM);
      return `${y}-${m.padStart(2, "0")}`;
    }
    if (yMd.test(str)) {
      const [, y, m, d] = str.match(yMd);
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    return str;
  }

  function escapeLatex(value) {
    if (value === null || value === undefined || value === "") return "-";
    return String(value)
      .replace(/\\/g, "\\textbackslash{}")
      .replace(/%/g, "\\%")
      .replace(/&/g, "\\&")
      .replace(/\$/g, "\\$")
      .replace(/#/g, "\\#")
      .replace(/_/g, "\\_")
      .replace(/{/g, "\\{")
      .replace(/}/g, "\\}")
      .replace(/~/g, "\\textasciitilde{}")
      .replace(/\^/g, "\\textasciicircum{}")
      .replace(/\r?\n/g, " ");
  }

  function formatLatexValue(value) {
    if (value === null || value === undefined || value === "") return "-";
    const str = String(value).trim();
    const removeComma = (s) => s.replace(/[,\uFF0C]/g, "");
    const formatNumber = (s) => {
      const [intPart, decPart] = s.split(".");
      const intWithComma = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return decPart ? `${intWithComma}.${decPart}` : intWithComma;
    };

    const cleaned = removeComma(str);
    const isNumeric = /^[-+]?\d+(?:\.\d+)?$/.test(cleaned);
    if (cleaned && isNumeric) {
      return escapeLatex(formatNumber(cleaned));
    }

    const replaced = cleaned.replace(/\d+(?:\.\d+)?/g, (m) => formatNumber(m));
    return escapeLatex(replaced);
  }

  function buildHoloParamsLatex(item) {
    const p = item.params || {};
    const rows = [
      ["視点数 (Viewpoints)", p.parallaxCount],
      ["ホログラムのサイズ (mm)", p.size],
      ["解像度 (pixel)", p.resolution],
      ["画素ピッチ ({\\textmu}m)", p.pitch],
      ["視点距離 (m)", p.distance],
      ["参照光 (rad)", p.reference],
    ];
    const filledRows = rows.filter(([, val]) => val !== undefined && val !== null && String(val).trim() !== "");
    const body =
      filledRows.length > 0
        ? filledRows.map(([label, val]) => `${label} & ${formatLatexValue(val)} \\\\`).join("\n\\hline\n")
        : "\\multicolumn{2}{|c|}{データなし} \\\\";
    return (
      "\\begin{table}[h]\n" +
      "\\centering\n" +
      "\\caption{ホログラムのパラメータ}\n" +
      "\\label{tab:holo-params}\n" +
      "\\begin{tabular}{|c|c|}\n" +
      "\\hline\n" +
      body +
      "\n\\hline\n" +
      "\\end{tabular}\n" +
      "\\end{table}"
    );
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) {}
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    let success = false;
    try {
      success = document.execCommand("copy");
    } catch (e) {
      success = false;
    }
    document.body.removeChild(textarea);
    return success;
  }

  window.holoUtils = {
    formatDate,
    toInputDate,
    normalizeShotAt,
    escapeLatex,
    formatLatexValue,
    buildHoloParamsLatex,
    fileToDataUrl,
    copyTextToClipboard,
  };
})();
