// ===== LaTeX to Image Converter =====
// Uses MathJax 3 for client-side rendering and Canvas for image export

const EXAMPLES = [
  {
    title: "Integral",
    latex: "\\frac{\\pi}{2} = \\int_{-1}^{1} \\sqrt{1-x^2}\\ dx",
  },
  {
    title: "Equação Quadrática",
    latex: "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}",
  },
  {
    title: "Série de Taylor",
    latex: "e^x = \\sum_{n=0}^{\\infty} \\frac{x^n}{n!}",
  },
  {
    title: "Identidade de Euler",
    latex: "e^{i\\pi} + 1 = 0",
  },
  {
    title: "Teorema de Pitágoras",
    latex: "a^2 + b^2 = c^2",
  },
  {
    title: "Matriz",
    latex:
      "A = \\begin{pmatrix} a_{11} & a_{12} \\\\ a_{21} & a_{22} \\end{pmatrix}",
  },
  {
    title: "Limite",
    latex: "\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1",
  },
  {
    title: "Equação de Maxwell",
    latex:
      "\\nabla \\times \\vec{E} = -\\frac{\\partial \\vec{B}}{\\partial t}",
  },
  {
    title: "Binômio de Newton",
    latex: "(x+y)^n = \\sum_{k=0}^{n} \\binom{n}{k} x^{n-k} y^k",
  },
];

// DOM Elements
const latexInput = document.getElementById("latexInput");
const tabImage = document.getElementById("tabImage");
const tabCode = document.getElementById("tabCode");
const imageView = document.getElementById("imageView");
const codeView = document.getElementById("codeView");
const latexCodeOutput = document.getElementById("latexCodeOutput");
const copyCodeBtn = document.getElementById("copyCodeBtn");
const outputFormat = document.getElementById("outputFormat");
const outputScale = document.getElementById("outputScale");
const textColor = document.getElementById("textColor");
const textColorLabel = document.getElementById("textColorLabel");
const bgColor = document.getElementById("bgColor");
const bgColorLabel = document.getElementById("bgColorLabel");
const bgColorWrapper = document.getElementById("bgColorWrapper");
const transparentBg = document.getElementById("transparentBg");
const autoAlign = document.getElementById("autoAlign");
const convertBtn = document.getElementById("convertBtn");
const convertSpinner = document.getElementById("convertSpinner");
const convertText = document.getElementById("convertText");
const exampleBtn = document.getElementById("exampleBtn");
const clearBtn = document.getElementById("clearBtn");
const previewArea = document.getElementById("previewArea");
const previewPlaceholder = document.getElementById("previewPlaceholder");
const previewContent = document.getElementById("previewContent");
const renderedOutput = document.getElementById("renderedOutput");
const resultActions = document.getElementById("resultActions");
const downloadBtn = document.getElementById("downloadBtn");
const copyBtn = document.getElementById("copyBtn");
const errorAlert = document.getElementById("errorAlert");
const hiddenRender = document.getElementById("hiddenRender");
const exportCanvas = document.getElementById("exportCanvas");

let currentSvgData = null;
let currentFormat = "PNG";
let currentLatexCode = "";

// ===== Initialization =====
function init() {
  bindEvents();
  updateCheckerboard();
}

function bindEvents() {
  convertBtn.addEventListener("click", convert);
  exampleBtn.addEventListener("click", loadExample);
  clearBtn.addEventListener("click", clearAll);
  downloadBtn.addEventListener("click", downloadImage);
  copyBtn.addEventListener("click", copyImage);

  // Preview tabs
  tabImage.addEventListener("click", () => switchPreviewTab("image"));
  tabCode.addEventListener("click", () => switchPreviewTab("code"));
  copyCodeBtn.addEventListener("click", copyLatexCode);

  textColor.addEventListener("input", () => {
    textColorLabel.textContent = textColor.value;
  });

  bgColor.addEventListener("input", () => {
    bgColorLabel.textContent = bgColor.value;
  });

  transparentBg.addEventListener("change", () => {
    bgColorWrapper.style.display = transparentBg.checked ? "none" : "flex";
    updateCheckerboard();
  });

  outputFormat.addEventListener("change", () => {
    updateCheckerboard();
  });

  // Ctrl+Enter to convert
  latexInput.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "Enter") {
      e.preventDefault();
      convert();
    }
  });
}

// ===== Shorthand Pre-processing =====
// Converts shorthand notations like "sum ..." and "integral ..." to LaTeX
// before the normal detection pipeline runs.
function preprocessShorthand(text) {
  let result = text;

  // Helper: try to run a plain expression through mathjs→LaTeX.
  // Falls back to the original string on any error or if it already contains
  // LaTeX commands (starts with backslash tokens).
  function tryExprToTex(str) {
    if (!str || /\\[a-zA-Z]/.test(str)) return str;
    try {
      return parseSingleExpr(str);
    } catch (e) {
      return str;
    }
  }

  // Helper: detects and strips a trailing differential ("dx", " dt", etc.)
  // from the expression body BEFORE mathjs sees it, preventing "d*x" from
  // being folded into fractions or elsewhere.
  // Returns { expr: string_without_differential, variable: string_or_null }
  function stripDifferential(body) {
    // Match optional comma/backslash, optional spaces, then d<letter>
    const match = body.match(/^([\s\S]*?)\s*[\\,]?\s*d([a-zA-Z])\s*$/);
    if (match) {
      return { expr: match[1].trim(), variable: match[2] };
    }
    return { expr: body, variable: null };
  }

  // Helper: guess the integration variable from the expression.
  // Prefers 'x', then 't', then 'u', then first single-letter symbol found.
  function detectVariable(expr) {
    try {
      const node = math.parse(expr);
      const symbols = new Set();
      node.traverse(function (n) {
        if (n.isSymbolNode && /^[a-zA-Z]$/.test(n.name)) symbols.add(n.name);
      });
      const constants = new Set(["e", "i"]);
      const vars = [...symbols].filter((s) => !constants.has(s));
      for (const pref of ["x", "t", "u", "n", "k"]) {
        if (vars.includes(pref)) return pref;
      }
      return vars[0] || "x";
    } catch (e) {
      return "x";
    }
  }

  // Sum: sum <body>, <var>=<lower> to <upper>
  // e.g. "sum a_k, k=1 to n"   → "\sum_{k=1}^{n} a_k"
  // e.g. "sum 1/k^2, k=1 to n" → "\sum_{k=1}^{n} \dfrac{1}{k^{2}}"
  result = result.replace(
    /\bsum\s+(.+?)\s*,\s*([a-zA-Z_]\w*)\s*=\s*(.+?)\s+to\s+(.+)/gi,
    function (_, body, variable, lower, upper) {
      const bodyTex  = tryExprToTex(body.trim());
      const lowerTex = tryExprToTex(lower.trim());
      const upperTex = tryExprToTex(upper.trim());
      return `\\sum_{${variable}=${lowerTex}}^{${upperTex}} ${bodyTex}`;
    },
  );

  // Definite integral: integral <body>, <var> from|= <lower> to <upper>
  // e.g. "integral f(x), x from a to b"          → "\int_{a}^{b} f(x) \, dx"
  // e.g. "integral 1/x, x=a to b"                → "\int_{a}^{b} \dfrac{1}{x} \, dx"
  // e.g. "integral f(x), x=-1/2 to 1/2"          → "\int_{-\dfrac{1}{2}}^{\dfrac{1}{2}} f(x) \, dx"
  // e.g. "integral 1/(x^2+1) dx, x=a to b"       → trailing dx is stripped, re-added correctly
  result = result.replace(
    /\bintegral\s+(.+?)\s*,\s*([a-zA-Z_]\w*)\s*(?:from|=)\s*(.+?)\s+to\s+(.+)/gi,
    function (_, body, variable, lower, upper) {
      const lowerTex = tryExprToTex(lower.trim());
      const upperTex = tryExprToTex(upper.trim());

      // Strip any trailing differential the user may have written
      const { expr: bodyExpr } = stripDifferential(body.trim());
      const bodyTex = tryExprToTex(bodyExpr);
      return `\\int_{${lowerTex}}^{${upperTex}} ${bodyTex} \\, d${variable}`;
    },
  );

  // Indefinite integral: integral <body>  (no comma / no bounds)
  // e.g. "integral x"                → "\int x \, dx"
  // e.g. "integral 1/x"              → "\int \dfrac{1}{x} \, dx"
  // e.g. "integral 1/(x^2+1) dx"     → strips dx first, then re-adds it correctly
  // e.g. "integral 1/(x^2+1)"        → auto-detects variable x, adds \, dx
  result = result.replace(
    /\bintegral\s+([^,\n]+)$/gim,
    function (_, body) {
      const { expr: bodyExpr, variable: detectedVar } = stripDifferential(body.trim());
      const bodyTex = tryExprToTex(bodyExpr);
      const dvar = detectedVar || detectVariable(bodyExpr);
      return `\\int ${bodyTex} \\, d${dvar}`;
    },
  );

  return result;
}

// ===== Auto-detection & Expression Conversion =====
function isLatexInput(text) {
  return /\\[a-zA-Z]/.test(text);
}

function expressionToLatex(expr) {
  const parts = expr.split(/(?<=[^<>!])=(?!=)/);
  if (parts.length > 1) {
    return parts.map((p) => parseSingleExpr(p.trim())).join(" = ");
  }
  return parseSingleExpr(expr);
}

function parseSingleExpr(expr) {
  if (!expr) return "";
  let processed = expr
    .replace(/\binf\b/gi, "Infinity")
    .replace(/\binfty\b/gi, "Infinity");
  const node = math.parse(processed);
  let tex = node.toTex({ parenthesis: "auto", implicit: "hide" });
  tex = tex.replace(/\\frac\b/g, "\\dfrac");
  return tex;
}

// ===== Preview Tab Switching =====
function switchPreviewTab(tab) {
  if (tab === "image") {
    tabImage.classList.add("active");
    tabCode.classList.remove("active");
    imageView.style.display = "";
    codeView.style.display = "none";
  } else {
    tabCode.classList.add("active");
    tabImage.classList.remove("active");
    imageView.style.display = "none";
    codeView.style.display = "";
  }
}

function updateCodePreview() {
  latexCodeOutput.textContent = currentLatexCode || "\u2014";
}

function copyLatexCode() {
  if (!currentLatexCode) return;
  navigator.clipboard
    .writeText(currentLatexCode)
    .then(() => {
      showToast("Código LaTeX copiado!", "success");
    })
    .catch(() => {
      showToast("Erro ao copiar", "error");
    });
}

function updateCheckerboard() {
  const isTransparent = transparentBg.checked;
  const format = outputFormat.value;

  // JPG doesn't support transparency
  if (format === "JPG") {
    previewArea.classList.remove("checkerboard");
    previewArea.style.backgroundColor = isTransparent
      ? "#ffffff"
      : bgColor.value;
  } else if (isTransparent) {
    previewArea.classList.add("checkerboard");
    previewArea.style.backgroundColor = "";
  } else {
    previewArea.classList.remove("checkerboard");
    previewArea.style.backgroundColor = bgColor.value;
  }
}

// ===== Conversion =====
async function convert() {
  const rawInput = latexInput.value.trim();

  if (!rawInput) {
    showError("Nenhuma entrada fornecida.");
    return;
  }

  // Check MathJax is ready
  if (!window.MathJax || !window.mathjaxReady) {
    showError(
      "MathJax ainda está carregando. Tente novamente em alguns segundos.",
    );
    return;
  }

  setLoading(true);
  hideError();
  hideResult();

  try {
    // Pre-process shorthand (sum, integral) before detection
    const preprocessed = preprocessShorthand(rawInput);

    // Auto-detect: LaTeX commands vs plain expression
    let latex;
    if (isLatexInput(preprocessed)) {
      latex = preprocessed;
    } else {
      try {
        latex = expressionToLatex(preprocessed);
      } catch (e) {
        latex = preprocessed;
      }
    }

    // Store for code preview
    currentLatexCode = latex;
    updateCodePreview();

    if (autoAlign.checked) {
      latex = "\\begin{align*}\n" + latex + "\n\\end{align*}";
    }

    // Render with MathJax
    const svgNode = await MathJax.tex2svgPromise(latex, { display: true });
    const svgElement = svgNode.querySelector("svg");

    if (!svgElement) {
      throw new Error("Falha ao renderizar o LaTeX. Verifique a sintaxe.");
    }

    // Check for MathJax errors
    const mjxError = svgNode.querySelector('mjx-container[jax="output"]');
    const dataErrors = svgNode.querySelectorAll('[data-mml-node="merror"]');
    if (dataErrors.length > 0) {
      throw new Error("Erro na expressão LaTeX. Verifique a sintaxe.");
    }

    // Apply text color
    const color = textColor.value;
    svgElement.style.color = color;
    svgElement.setAttribute("color", color);

    // Apply scale
    const scale = parseFloat(outputScale.value);
    const origWidth = parseFloat(svgElement.getAttribute("width")) || 100;
    const origHeight = parseFloat(svgElement.getAttribute("height")) || 40;

    // Convert ex units to px (1ex ≈ 8px)
    const widthStr = svgElement.getAttribute("width") || "";
    const heightStr = svgElement.getAttribute("height") || "";
    let widthPx, heightPx;

    if (widthStr.includes("ex")) {
      widthPx = parseFloat(widthStr) * 8;
    } else {
      widthPx = parseFloat(widthStr) || 100;
    }

    if (heightStr.includes("ex")) {
      heightPx = parseFloat(heightStr) * 8;
    } else {
      heightPx = parseFloat(heightStr) || 40;
    }

    const scaledWidth = widthPx * scale;
    const scaledHeight = heightPx * scale;

    // Set SVG dimensions
    svgElement.setAttribute("width", scaledWidth + "px");
    svgElement.setAttribute("height", scaledHeight + "px");

    // Store SVG data
    const serializer = new XMLSerializer();
    currentSvgData = serializer.serializeToString(svgElement);
    currentFormat = outputFormat.value;

    // Show in preview
    renderedOutput.innerHTML = "";
    const previewSvg = svgElement.cloneNode(true);
    // For preview, limit max size
    previewSvg.style.maxWidth = "100%";
    previewSvg.style.height = "auto";
    renderedOutput.appendChild(previewSvg);

    showResult();
    updateCheckerboard();
  } catch (err) {
    showError(err.message || "Erro ao converter LaTeX. Verifique a sintaxe.");
  } finally {
    setLoading(false);
    // Clear MathJax internal document
    MathJax.startup.document.clear();
    MathJax.startup.document.updateDocument();
  }
}

// ===== Export Functions =====
async function downloadImage() {
  if (!currentSvgData) return;

  const format = outputFormat.value;
  let blob, filename;

  try {
    if (format === "SVG") {
      blob = svgToBlob();
      filename = "latex-image.svg";
    } else if (format === "PNG") {
      blob = await rasterize("image/png");
      filename = "latex-image.png";
    } else {
      blob = await rasterize("image/jpeg");
      filename = "latex-image.jpg";
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast("Imagem baixada com sucesso!", "success");
  } catch (err) {
    showToast("Erro ao gerar imagem: " + err.message, "error");
  }
}

async function copyImage() {
  if (!currentSvgData) return;

  try {
    const format = outputFormat.value;

    if (format === "SVG") {
      await navigator.clipboard.writeText(currentSvgData);
      showToast("SVG copiado para a área de transferência!", "success");
    } else {
      const blob = await rasterize("image/png");
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      showToast("Imagem copiada para a área de transferência!", "success");
    }
  } catch (err) {
    showToast("Erro ao copiar: " + err.message, "error");
  }
}

function svgToBlob() {
  return new Blob([currentSvgData], { type: "image/svg+xml;charset=utf-8" });
}

function rasterize(mimeType) {
  return new Promise((resolve, reject) => {
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(currentSvgData, "image/svg+xml");
    const svgEl = svgDoc.documentElement;

    const width = parseFloat(svgEl.getAttribute("width")) || 300;
    const height = parseFloat(svgEl.getAttribute("height")) || 150;

    // Add padding
    const padding = 20;
    const totalWidth = Math.ceil(width + padding * 2);
    const totalHeight = Math.ceil(height + padding * 2);

    const canvas = exportCanvas;
    canvas.width = totalWidth;
    canvas.height = totalHeight;
    const ctx = canvas.getContext("2d");

    // Background
    const isTransparent = transparentBg.checked && mimeType !== "image/jpeg";
    if (isTransparent) {
      ctx.clearRect(0, 0, totalWidth, totalHeight);
    } else {
      const bg =
        mimeType === "image/jpeg" && transparentBg.checked
          ? "#ffffff"
          : bgColor.value;
      ctx.fillStyle =
        mimeType === "image/jpeg"
          ? transparentBg.checked
            ? "#ffffff"
            : bgColor.value
          : bgColor.value;
      ctx.fillRect(0, 0, totalWidth, totalHeight);
    }

    // Encode SVG as data URL
    const svgBlob = new Blob([currentSvgData], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, padding, padding, width, height);
      URL.revokeObjectURL(url);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Falha ao gerar blob da imagem"));
          }
        },
        mimeType,
        0.95,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Falha ao carregar SVG na imagem"));
    };

    img.src = url;
  });
}

// ===== UI Helpers =====
function setLoading(loading) {
  convertBtn.disabled = loading;
  exampleBtn.disabled = loading;
  convertSpinner.style.display = loading ? "inline-block" : "none";
  convertText.textContent = loading ? "Convertendo..." : "Converter";
}

function showResult() {
  previewPlaceholder.style.display = "none";
  previewContent.style.display = "flex";
  resultActions.style.display = "flex";
}

function hideResult() {
  previewPlaceholder.style.display = "flex";
  previewContent.style.display = "none";
  resultActions.style.display = "none";
}

function showError(msg) {
  errorAlert.textContent = msg;
  errorAlert.style.display = "block";
}

function hideError() {
  errorAlert.style.display = "none";
}

function loadExample() {
  const randomIdx = Math.floor(Math.random() * EXAMPLES.length);
  latexInput.value = EXAMPLES[randomIdx].latex;
  convert();
}

function clearAll() {
  latexInput.value = "";
  hideResult();
  hideError();
  renderedOutput.innerHTML = "";
  currentSvgData = null;
  currentLatexCode = "";
  updateCodePreview();
  previewArea.classList.remove("checkerboard");
  previewArea.style.backgroundColor = "#ffffff";
  latexInput.focus();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Toast notification
let toastTimeout;
function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = "toast show " + type;

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.className = "toast";
  }, 3000);
}

// ===== Init =====
init();
