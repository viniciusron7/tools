// ============================================================
// LaTeX Editor — Main Application (ES Module)
// MathLive ↔ KaTeX live preview ↔ MathJax export pipeline
// ============================================================

const DEFAULT_LATEX = '';
const PNG_SCALE = 4;

// ----- DOM References -----
const mathEditor  = document.getElementById('math-editor');
const latexCode   = document.querySelector('#latex-code code');
const previewEl   = document.getElementById('preview');
const copyBtn     = document.getElementById('copy-btn');
const copyImgBtn  = document.getElementById('copy-img-btn');
const exportSvgBtn = document.getElementById('export-svg');
const exportPngBtn = document.getElementById('export-png');
const exportPdfBtn = document.getElementById('export-pdf');
const exportStatus = document.getElementById('export-status');
const toastEl     = document.getElementById('toast');

// ----- Export Options Controls -----
const textColorInput   = document.getElementById('text-color');
const bgColorInput     = document.getElementById('bg-color');
const bgTransparentCb  = document.getElementById('bg-transparent');
const sizeSlider       = document.getElementById('size-slider');
const sizeValueLabel   = document.getElementById('size-value');

// ----- Toast Notification -----
let toastTimer = null;

function showToast(message, duration = 2000) {
  toastEl.textContent = message;
  toastEl.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('visible'), duration);
}

// ----- Apply Preview Styles (color + size) -----
function applyPreviewStyles() {
  const textColor = textColorInput.value;
  const bgTransparent = bgTransparentCb.checked;
  const bgColor = bgTransparent ? 'transparent' : bgColorInput.value;
  const sliderVal = parseInt(sizeSlider.value, 10);
  sizeValueLabel.textContent = sliderVal;
  // Map slider 1–10 to preview font size (0.6rem – 5rem)
  const size = 0.6 + (sliderVal - 1) * (4.4 / 9);

  previewEl.style.color = textColor;
  previewEl.style.fontSize = `${size.toFixed(2)}rem`;

  const previewBody = previewEl.closest('.preview-body');
  if (previewBody) {
    previewBody.style.backgroundColor = bgColor;
  }

  bgColorInput.disabled = bgTransparent;
  bgColorInput.style.opacity = bgTransparent ? '0.4' : '1';
}

// ----- KaTeX Live Preview -----
// MathLive may output commands KaTeX doesn't support; normalise them here.
function normalizeForKaTeX(latex) {
  let out = latex;
  // \displaylines{...} → \begin{gathered}...\end{gathered}
  out = out.replace(
    /\\displaylines\s*\{([\s\S]*)\}/,
    '\\begin{gathered}$1\\end{gathered}'
  );
  // \placeholder{} → □  (KaTeX doesn't know \placeholder)
  out = out.replace(/\\placeholder\s*(\{[^}]*\})?/g, '\\square');
  // MathLive non-standard commands → standard LaTeX equivalents
  out = out.replace(/\\differentialD\b/g, 'd');
  out = out.replace(/\\capitalDifferentialD\b/g, 'D');
  out = out.replace(/\\exponentialE\b/g, 'e');
  out = out.replace(/\\imaginaryI\b/g, 'i');
  out = out.replace(/\\imaginaryJ\b/g, 'j');
  return out;
}

function updatePreview(latex) {
  if (!latex.trim()) {
    previewEl.innerHTML = '<span style="color:var(--text-muted);font-style:italic">Digite uma equação no editor…</span>';
    return;
  }
  const normalized = normalizeForKaTeX(latex);
  try {
    katex.render(normalized, previewEl, {
      throwOnError: false,
      displayMode: true,
      fleqn: false,
      output: 'htmlAndMathml',
      trust: false,
      strict: false,
      macros: {
        '\\R': '\\mathbb{R}',
        '\\N': '\\mathbb{N}',
        '\\Z': '\\mathbb{Z}',
        '\\C': '\\mathbb{C}',
        '\\Q': '\\mathbb{Q}',
      },
    });
  } catch (e) {
    previewEl.innerHTML = `<span class="katex-error">${escapeHtml(e.message)}</span>`;
  }
}

// ----- Syntax-Highlighted Code Display -----
function updateCodeDisplay(latex) {
  latexCode.innerHTML = highlightLatex(latex);
}

function highlightLatex(raw) {
  const escaped = escapeHtml(raw);
  return escaped
    .replace(/(\\[a-zA-Z]+)/g, '<span class="hl-cmd">$1</span>')
    .replace(/([{}])/g, '<span class="hl-brace">$1</span>')
    .replace(/(\^)/g, '<span class="hl-sup">$1</span>')
    .replace(/(_)/g, '<span class="hl-sub">$1</span>')
    .replace(/(\d+(\.\d+)?)/g, '<span class="hl-num">$1</span>');
}

function escapeHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return str.replace(/[&<>"']/g, c => map[c]);
}

// ----- Clipboard Copy -----
async function copyLatex() {
  const latex = getLatex();
  if (!latex.trim()) { showToast('Nada para copiar'); return; }

  try {
    await navigator.clipboard.writeText(latex);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = latex;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  copyBtn.classList.add('copied');
  copyBtn.querySelector('.copy-label').textContent = 'Copiado!';
  showToast('LaTeX copiado para a área de transferência');
  setTimeout(() => {
    copyBtn.classList.remove('copied');
    copyBtn.querySelector('.copy-label').textContent = 'Copiar';
  }, 1500);
}

// ----- Copy Image (PNG) to Clipboard -----
async function copyImagePNG() {
  const latex = getLatex();
  if (!latex.trim()) { showToast('Nenhuma equação para copiar'); return; }

  copyImgBtn.classList.add('copied');
  copyImgBtn.querySelector('.copy-img-label').textContent = 'Copiando…';

  try {
    // Pass a Promise<Blob> to ClipboardItem so the user gesture is preserved
    // even across async MathJax loading / canvas rendering
    const blobPromise = (async () => {
      const svg = await latexToSVG(latex);
      const canvas = await svgToCanvas(svg, PNG_SCALE);
      return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    })();

    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blobPromise })
    ]);

    copyImgBtn.querySelector('.copy-img-label').textContent = 'Copiado!';
    showToast('Imagem copiada para a área de transferência');
  } catch (e) {
    showToast('Erro ao copiar imagem');
    console.error(e);
    copyImgBtn.querySelector('.copy-img-label').textContent = 'Copiar Imagem';
    copyImgBtn.classList.remove('copied');
    return;
  }

  setTimeout(() => {
    copyImgBtn.classList.remove('copied');
    copyImgBtn.querySelector('.copy-img-label').textContent = 'Copiar Imagem';
  }, 1500);
}

// ----- Get Current LaTeX -----
function getLatex() {
  return mathEditor.value || '';
}

// ============================================================
// MathJax — On-Demand Loading for Export
// ============================================================
let mathjaxReady = false;

async function loadMathJax() {
  if (mathjaxReady) return;

  window.MathJax = {
    tex: {
      inlineMath: [['$', '$']],
      displayMath: [['$$', '$$']],
      packages: { '[+]': ['ams', 'newcommand', 'configmacros'] },
    },
    svg: { fontCache: 'local', scale: 1 },
    startup: { typeset: false },
  };

  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = './libs/mathjax/tex-svg.js';
    script.async = true;
    script.onload = () => {
      MathJax.startup.promise.then(() => {
        mathjaxReady = true;
        resolve();
      });
    };
    script.onerror = () => reject(new Error('Falha ao carregar MathJax'));
    document.head.appendChild(script);
  });
}

async function latexToSVG(latex) {
  await loadMathJax();
  const wrapper = MathJax.tex2svg(latex, { display: true });
  const original = wrapper.querySelector('svg');

  // Clone so we never mutate MathJax's cached SVG node
  const svg = original.cloneNode(true);
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.removeAttribute('role');
  svg.removeAttribute('focusable');

  // Apply text color — set fill directly so standalone SVG renders correctly
  const textColor = textColorInput.value;
  svg.setAttribute('color', textColor);
  svg.style.color = textColor;

  // Convert ex-based dimensions to px for reliable canvas rendering.
  // MathJax outputs width/height in "ex" units (e.g. "20.765ex").
  // The slider (1–10) linearly scales the exported image dimensions.
  // Base factor ≈ 5/3 so slider 1 ≈ smallest, slider 10 ≈ 10× that.
  const sliderVal = parseInt(sizeSlider.value, 10) || 5;
  const EX_TO_PX = (5 / 3) * sliderVal;
  const widthAttr = svg.getAttribute('width') || '';
  const heightAttr = svg.getAttribute('height') || '';

  if (widthAttr.includes('ex')) {
    svg.setAttribute('width', (parseFloat(widthAttr) * EX_TO_PX) + 'px');
  }
  if (heightAttr.includes('ex')) {
    svg.setAttribute('height', (parseFloat(heightAttr) * EX_TO_PX) + 'px');
  }

  return svg;
}

// ----- Download Helper -----
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ----- Helper: SVG to self-contained data URL -----
function svgToDataURL(svg) {
  const svgString = new XMLSerializer().serializeToString(svg);
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
}

// ----- Helper: SVG to sized canvas -----
function svgToCanvas(svg, scale) {
  const w = parseFloat(svg.getAttribute('width')) || 300;
  const h = parseFloat(svg.getAttribute('height')) || 150;
  const canvasW = Math.ceil(w * scale);
  const canvasH = Math.ceil(h * scale);
  const dataUrl = svgToDataURL(svg);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext('2d');

      if (!bgTransparentCb.checked) {
        ctx.fillStyle = bgColorInput.value;
        ctx.fillRect(0, 0, canvasW, canvasH);
      }

      ctx.drawImage(img, 0, 0, canvasW, canvasH);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error('Falha ao renderizar SVG como imagem'));
    img.src = dataUrl;
  });
}

// ----- SVG Export -----
async function exportSVG() {
  const latex = getLatex();
  if (!latex.trim()) { showToast('Nenhuma equação para exportar'); return; }

  setExportLoading(exportSvgBtn, true);
  try {
    const svg = await latexToSVG(latex);
    const serializer = new XMLSerializer();
    const svgString = '<?xml version="1.0" encoding="UTF-8"?>\n' + serializer.serializeToString(svg);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    downloadBlob(blob, 'equation.svg');
    showToast('SVG exportado com sucesso');
  } catch (e) {
    showToast('Erro ao exportar SVG');
    console.error(e);
  } finally {
    setExportLoading(exportSvgBtn, false);
  }
}

// ----- PNG Export -----
async function exportPNG() {
  const latex = getLatex();
  if (!latex.trim()) { showToast('Nenhuma equação para exportar'); return; }

  setExportLoading(exportPngBtn, true);
  try {
    const svg = await latexToSVG(latex);
    const canvas = await svgToCanvas(svg, PNG_SCALE);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Canvas toBlob retornou vazio');
    downloadBlob(blob, 'equation.png');
    showToast('PNG exportado com sucesso');
  } catch (e) {
    showToast('Erro ao exportar PNG');
    console.error(e);
  } finally {
    setExportLoading(exportPngBtn, false);
  }
}

// ----- PDF Export (jsPDF loaded on demand) -----
let jspdfLoaded = false;

async function loadJsPDF() {
  if (jspdfLoaded) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = './libs/jspdf/jspdf.umd.min.js';
    script.onload = () => { jspdfLoaded = true; resolve(); };
    script.onerror = () => reject(new Error('Falha ao carregar jsPDF'));
    document.head.appendChild(script);
  });
}

async function exportPDF() {
  const latex = getLatex();
  if (!latex.trim()) { showToast('Nenhuma equação para exportar'); return; }

  setExportLoading(exportPdfBtn, true);
  try {
    // Force opaque background for PDF
    const wasTrans = bgTransparentCb.checked;
    bgTransparentCb.checked = false;

    const svg = await latexToSVG(latex);
    const canvas = await svgToCanvas(svg, PNG_SCALE);

    bgTransparentCb.checked = wasTrans;

    const pngDataUrl = canvas.toDataURL('image/png');

    // Load jsPDF
    await loadJsPDF();
    const { jsPDF } = window.jspdf;

    const cw = canvas.width;
    const ch = canvas.height;
    const pdfW = cw / PNG_SCALE + 40;
    const pdfH = ch / PNG_SCALE + 40;

    const pdf = new jsPDF({
      orientation: pdfW > pdfH ? 'landscape' : 'portrait',
      unit: 'px',
      format: [pdfW, pdfH],
    });

    pdf.addImage(pngDataUrl, 'PNG', 20, 20, cw / PNG_SCALE, ch / PNG_SCALE);
    pdf.save('equation.pdf');
    showToast('PDF exportado com sucesso');
  } catch (e) {
    showToast('Erro ao exportar PDF');
    console.error(e);
  } finally {
    setExportLoading(exportPdfBtn, false);
  }
}

// ----- Export Loading State Helper -----
function setExportLoading(btn, loading) {
  btn.disabled = loading;
  btn.classList.toggle('loading', loading);
  exportStatus.textContent = loading ? 'Carregando MathJax…' : '';
}

// ============================================================
// Symbol Palette — Custom Categories
// ============================================================
const SYMBOL_CATEGORIES = [
  {
    id: 'basico',
    label: 'Operators',
    symbols: [
      { latex: '\\frac{#?}{#?}',    display: '\\frac{a}{b}' },
      { latex: '\\sqrt{#?}',         display: '\\sqrt{x}' },
      { latex: '\\sqrt[#?]{#?}',     display: '\\sqrt[n]{x}' },
      { latex: '#?^{#?}',             display: 'x^n' },
      { latex: '#?_{#?}',             display: 'x_n' },
      { latex: '\\pm',               display: '\\pm' },
      { latex: '\\mp',               display: '\\mp' },
      { latex: '\\times',            display: '\\times' },
      { latex: '\\div',              display: '\\div' },
      { latex: '\\cdot',             display: '\\cdot' },
      { latex: '\\leq',              display: '\\leq' },
      { latex: '\\geq',              display: '\\geq' },
      { latex: '\\neq',              display: '\\neq' },
      { latex: '\\approx',           display: '\\approx' },
      { latex: '\\equiv',            display: '\\equiv' },
      { latex: '\\sim',              display: '\\sim' },
      { latex: '\\propto',           display: '\\propto' },
      { latex: '\\ll',               display: '\\ll' },
      { latex: '\\gg',               display: '\\gg' },
      { latex: '\\infty',            display: '\\infty' },
      { latex: '\\left(#?\\right)',  display: '(\\,)' },
      { latex: '\\left[#?\\right]',  display: '[\\,]' },
      { latex: '\\left\\{#?\\right\\}', display: '\\{\\,\\}' },
      { latex: '\\left|#?\\right|',  display: '|\\,|' },
      { latex: '\\binom{#?}{#?}',    display: '\\binom{n}{k}' },
      { latex: '\\log_{#?}',         display: '\\log' },
      { latex: '\\ln',               display: '\\ln' },
      { latex: '\\exp',              display: '\\exp' },
      { latex: '!',                   display: '!' },
    ],
  },
  {
    id: 'calculo',
    label: 'Calculus',
    symbols: [
      { latex: '\\int',                              display: '\\int' },
      { latex: '\\int_{#?}^{#?}',                     display: '\\int_a^b' },
      { latex: '\\iint',                              display: '\\iint' },
      { latex: '\\iiint',                             display: '\\iiint' },
      { latex: '\\oint',                              display: '\\oint' },
      { latex: '\\sum_{#?}^{#?}',                     display: '\\sum_{i}^{n}' },
      { latex: '\\prod_{#?}^{#?}',                    display: '\\prod_{i}^{n}' },
      { latex: '\\coprod',                            display: '\\coprod' },
      { latex: '\\lim_{#?}',                          display: '\\lim' },
      { latex: '\\lim_{#? \\to #?}',                  display: '\\lim_{x\\to a}' },
      { latex: '\\frac{d}{d#?}',                      display: '\\frac{d}{dx}' },
      { latex: '\\frac{\\partial}{\\partial #?}',    display: '\\frac{\\partial}{\\partial x}' },
      { latex: '\\partial',                           display: '\\partial' },
      { latex: '\\nabla',                             display: '\\nabla' },
      { latex: '\\Delta',                             display: '\\Delta' },
    ],
  },
  {
    id: 'trigonometria',
    label: 'Trigonometry',
    symbols: [
      { latex: '\\sin',    display: '\\sin' },
      { latex: '\\cos',    display: '\\cos' },
      { latex: '\\tan',    display: '\\tan' },
      { latex: '\\sec',    display: '\\sec' },
      { latex: '\\csc',    display: '\\csc' },
      { latex: '\\cot',    display: '\\cot' },
      { latex: '\\arcsin', display: '\\arcsin' },
      { latex: '\\arccos', display: '\\arccos' },
      { latex: '\\arctan', display: '\\arctan' },
      { latex: '\\sinh',   display: '\\sinh' },
      { latex: '\\cosh',   display: '\\cosh' },
      { latex: '\\tanh',   display: '\\tanh' },
    ],
  },
  {
    id: 'matrizes',
    label: 'Matrices',
    symbols: [
      { latex: '\\begin{pmatrix} #? & #? \\\\ #? & #? \\end{pmatrix}',                            display: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}' },
      { latex: '\\begin{bmatrix} #? & #? \\\\ #? & #? \\end{bmatrix}',                            display: '\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}' },
      { latex: '\\begin{vmatrix} #? & #? \\\\ #? & #? \\end{vmatrix}',                            display: '\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}' },
      { latex: '\\begin{Bmatrix} #? & #? \\\\ #? & #? \\end{Bmatrix}',                            display: '\\begin{Bmatrix} a & b \\\\ c & d \\end{Bmatrix}' },
      { latex: '\\begin{pmatrix} #? & #? & #? \\\\ #? & #? & #? \\\\ #? & #? & #? \\end{pmatrix}', display: '3{\\times}3' },
      { latex: '\\begin{cases} #? & #? \\\\ #? & #? \\end{cases}',                                display: '\\begin{cases} a \\\\ b \\end{cases}' },
      { latex: '\\vec{#?}',    display: '\\vec{v}' },
      { latex: '\\hat{#?}',    display: '\\hat{v}' },
      { latex: '\\bar{#?}',    display: '\\bar{x}' },
      { latex: '\\dot{#?}',    display: '\\dot{x}' },
      { latex: '\\ddot{#?}',   display: '\\ddot{x}' },
      { latex: '\\det',        display: '\\det' },
      { latex: '\\dim',        display: '\\dim' },
      { latex: '\\ker',        display: '\\ker' },
      { latex: '\\cdots',      display: '\\cdots' },
      { latex: '\\vdots',      display: '\\vdots' },
      { latex: '\\ddots',      display: '\\ddots' },
    ],
  },
  {
    id: 'grego',
    label: 'Greek',
    symbols: [
      { latex: '\\alpha' },
      { latex: '\\beta' },
      { latex: '\\gamma' },
      { latex: '\\delta' },
      { latex: '\\epsilon' },
      { latex: '\\varepsilon' },
      { latex: '\\zeta' },
      { latex: '\\eta' },
      { latex: '\\theta' },
      { latex: '\\vartheta' },
      { latex: '\\iota' },
      { latex: '\\kappa' },
      { latex: '\\lambda' },
      { latex: '\\mu' },
      { latex: '\\nu' },
      { latex: '\\xi' },
      { latex: '\\pi' },
      { latex: '\\rho' },
      { latex: '\\sigma' },
      { latex: '\\tau' },
      { latex: '\\upsilon' },
      { latex: '\\phi' },
      { latex: '\\varphi' },
      { latex: '\\chi' },
      { latex: '\\psi' },
      { latex: '\\omega' },
      { latex: '\\Gamma' },
      { latex: '\\Delta' },
      { latex: '\\Theta' },
      { latex: '\\Lambda' },
      { latex: '\\Xi' },
      { latex: '\\Pi' },
      { latex: '\\Sigma' },
      { latex: '\\Phi' },
      { latex: '\\Psi' },
      { latex: '\\Omega' },
    ],
  },
  {
    id: 'conjuntos',
    label: 'Sets',
    symbols: [
      { latex: '\\forall',      display: '\\forall' },
      { latex: '\\exists',      display: '\\exists' },
      { latex: '\\nexists',     display: '\\nexists' },
      { latex: '\\in',          display: '\\in' },
      { latex: '\\notin',       display: '\\notin' },
      { latex: '\\ni',          display: '\\ni' },
      { latex: '\\subset',      display: '\\subset' },
      { latex: '\\supset',      display: '\\supset' },
      { latex: '\\subseteq',    display: '\\subseteq' },
      { latex: '\\supseteq',    display: '\\supseteq' },
      { latex: '\\cup',         display: '\\cup' },
      { latex: '\\cap',         display: '\\cap' },
      { latex: '\\setminus',    display: '\\setminus' },
      { latex: '\\emptyset',    display: '\\emptyset' },
      { latex: '\\mathbb{R}',   display: '\\mathbb{R}' },
      { latex: '\\mathbb{N}',   display: '\\mathbb{N}' },
      { latex: '\\mathbb{Z}',   display: '\\mathbb{Z}' },
      { latex: '\\mathbb{Q}',   display: '\\mathbb{Q}' },
      { latex: '\\mathbb{C}',   display: '\\mathbb{C}' },
    ],
  },
  {
    id: 'setas',
    label: 'Arrows',
    symbols: [
      { latex: '\\to',              display: '\\to' },
      { latex: '\\gets',            display: '\\gets' },
      { latex: '\\Rightarrow',      display: '\\Rightarrow' },
      { latex: '\\Leftarrow',       display: '\\Leftarrow' },
      { latex: '\\Leftrightarrow',  display: '\\Leftrightarrow' },
      { latex: '\\rightarrow',      display: '\\rightarrow' },
      { latex: '\\leftarrow',       display: '\\leftarrow' },
      { latex: '\\leftrightarrow',  display: '\\leftrightarrow' },
      { latex: '\\uparrow',         display: '\\uparrow' },
      { latex: '\\downarrow',       display: '\\downarrow' },
      { latex: '\\mapsto',          display: '\\mapsto' },
      { latex: '\\implies',         display: '\\implies' },
      { latex: '\\iff',             display: '\\iff' },
    ],
  },
  {
    id: 'acentos',
    label: 'Accents',
    symbols: [
      { latex: '\\hat{#?}',       display: '\\hat{a}' },
      { latex: '\\bar{#?}',       display: '\\bar{a}' },
      { latex: '\\tilde{#?}',     display: '\\tilde{a}' },
      { latex: '\\vec{#?}',       display: '\\vec{a}' },
      { latex: '\\dot{#?}',       display: '\\dot{a}' },
      { latex: '\\ddot{#?}',      display: '\\ddot{a}' },
      { latex: '\\overline{#?}',  display: '\\overline{ab}' },
      { latex: '\\underline{#?}', display: '\\underline{ab}' },
      { latex: '\\overbrace{#?}', display: '\\overbrace{ab}' },
      { latex: '\\underbrace{#?}',display: '\\underbrace{ab}' },
      { latex: '\\widehat{#?}',   display: '\\widehat{ab}' },
      { latex: '\\widetilde{#?}', display: '\\widetilde{ab}' },
    ],
  },
];

// ----- Build Palette UI -----
const paletteTabsEl = document.querySelector('.palette-tabs');
const paletteGridEl = document.querySelector('.palette-grid');
let activeCategory = SYMBOL_CATEGORIES[0].id;

function buildPalette() {
  // Tabs
  paletteTabsEl.innerHTML = '';
  for (const cat of SYMBOL_CATEGORIES) {
    const btn = document.createElement('button');
    btn.className = 'palette-tab' + (cat.id === activeCategory ? ' active' : '');
    btn.textContent = cat.label;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', cat.id === activeCategory);
    btn.dataset.catId = cat.id;
    btn.addEventListener('click', () => selectCategory(cat.id));
    paletteTabsEl.appendChild(btn);
  }

  // Grid
  renderCategoryGrid(activeCategory);
}

function selectCategory(catId) {
  activeCategory = catId;
  for (const tab of paletteTabsEl.children) {
    const isActive = tab.dataset.catId === catId;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', isActive);
  }
  renderCategoryGrid(catId);
}

function renderCategoryGrid(catId) {
  const cat = SYMBOL_CATEGORIES.find(c => c.id === catId);
  if (!cat) return;
  paletteGridEl.innerHTML = '';

  for (const sym of cat.symbols) {
    const btn = document.createElement('button');
    btn.className = 'sym-btn';
    btn.title = sym.latex.replace(/#\?/g, '□');
    btn.dataset.latex = sym.latex;

    // Render preview with KaTeX
    const displayLatex = sym.display || sym.latex;
    try {
      btn.innerHTML = katex.renderToString(displayLatex, {
        throwOnError: false,
        displayMode: false,
        trust: false,
        strict: false,
      });
    } catch {
      btn.textContent = displayLatex;
    }

    btn.addEventListener('click', () => insertSymbol(sym.latex));
    paletteGridEl.appendChild(btn);
  }
}

function insertSymbol(latex) {
  mathEditor.executeCommand(['insert', latex]);
  mathEditor.focus();
}

// ============================================================
// Resizable Panels — Drag Handles
// ============================================================
function initResizableHandles() {
  const panelsEl = document.getElementById('app');
  const handles = panelsEl.querySelectorAll('.resize-handle');
  const panels = panelsEl.querySelectorAll('.panel');
  const MIN_PANEL_PCT = 15; // minimum 15% per panel

  // Initialize sizes as percentages (editor gets more space)
  let sizes = [55, 45];

  function applySizes() {
    panelsEl.style.gridTemplateColumns =
      `${sizes[0]}fr 6px ${sizes[1]}fr`;
  }

  handles.forEach((handle) => {
    const handleIndex = parseInt(handle.dataset.handle, 10);

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startDrag(handleIndex, e.clientX);
    });

    handle.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      startDrag(handleIndex, touch.clientX, true);
    }, { passive: false });
  });

  function startDrag(handleIndex, startX, isTouch = false) {
    const handle = handles[handleIndex];
    handle.classList.add('dragging');
    document.body.classList.add('resizing');

    const totalWidth = panelsEl.getBoundingClientRect().width - 6; // minus 1 handle × 6px
    const startSizes = [...sizes];

    function onMove(clientX) {
      const deltaX = clientX - startX;
      const deltaPct = (deltaX / totalWidth) * 100;

      let newLeft = startSizes[0] + deltaPct;
      let newRight = startSizes[1] - deltaPct;

      // Clamp
      if (newLeft < MIN_PANEL_PCT) {
        newRight -= (MIN_PANEL_PCT - newLeft);
        newLeft = MIN_PANEL_PCT;
      }
      if (newRight < MIN_PANEL_PCT) {
        newLeft -= (MIN_PANEL_PCT - newRight);
        newRight = MIN_PANEL_PCT;
      }

      newLeft = Math.max(MIN_PANEL_PCT, newLeft);
      newRight = Math.max(MIN_PANEL_PCT, newRight);

      sizes[0] = newLeft;
      sizes[1] = newRight;
      applySizes();
    }

    function onMouseMove(e) { onMove(e.clientX); }
    function onTouchMove(e) { onMove(e.touches[0].clientX); }

    function onEnd() {
      handle.classList.remove('dragging');
      document.body.classList.remove('resizing');
      if (isTouch) {
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onEnd);
      } else {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onEnd);
      }
    }

    if (isTouch) {
      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', onEnd);
    } else {
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onEnd);
    }
  }
}

// ============================================================
// MathLive Configuration — Keyboard & Interactivity
// ============================================================
function configureMathField() {
  // Disable MathLive context menu
  mathEditor.menuItems = [];

  // Core behaviour
  mathEditor.smartMode = false;   // Keep pure math mode — avoids text-mode confusion
  mathEditor.smartFence = true;
  mathEditor.smartSuperscript = true;
  mathEditor.keypressSound = null;
  mathEditor.plonkSound = null;
  // On touch devices, allow MathLive's virtual keyboard; on desktop, use our palette only
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  mathEditor.mathVirtualKeyboardPolicy = isTouchDevice ? 'auto' : 'manual';

  // Space key: insert thin math-space instead of just moving the cursor
  mathEditor.mathModeSpace = '\\;';

  // Inline shortcuts — typed text auto-converts to LaTeX commands.
  // MathLive already ships defaults; we merge extras to ensure full coverage.
  const extraShortcuts = {
    'sqrt':     '\\sqrt{#0}',
    'cbrt':     '\\sqrt[3]{#0}',
    'root':     '\\sqrt[#0]{#0}',
    'frac':     '\\frac{#0}{#0}',
    'sum':      '\\sum_{#0}^{#0}',
    'prod':     '\\prod_{#0}^{#0}',
    'int':      '\\int',
    'iint':     '\\iint',
    'iiint':    '\\iiint',
    'oint':     '\\oint',
    'lim':      '\\lim_{#0}',
    'inf':      '\\infty',
    'part':     '\\partial',
    'nabla':    '\\nabla',
    'del':      '\\partial',
    'pm':       '\\pm',
    'mp':       '\\mp',
    'times':    '\\times',
    'cross':    '\\times',
    'cdot':     '\\cdot',
    'div':      '\\div',
    'neq':      '\\neq',
    'leq':      '\\leq',
    'geq':      '\\geq',
    'approx':   '\\approx',
    'equiv':    '\\equiv',
    'prop':     '\\propto',
    'sim':      '\\sim',
    'cong':     '\\cong',
    // Greek (lowercase)
    'alpha':    '\\alpha',
    'beta':     '\\beta',
    'gamma':    '\\gamma',
    'delta':    '\\delta',
    'eps':      '\\epsilon',
    'epsilon':  '\\epsilon',
    'zeta':     '\\zeta',
    'eta':      '\\eta',
    'theta':    '\\theta',
    'iota':     '\\iota',
    'kappa':    '\\kappa',
    'lambda':   '\\lambda',
    'mu':       '\\mu',
    'nu':       '\\nu',
    'xi':       '\\xi',
    'omicron':  'o',
    'rho':      '\\rho',
    'sigma':    '\\sigma',
    'tau':      '\\tau',
    'upsilon':  '\\upsilon',
    'phi':      '\\phi',
    'chi':      '\\chi',
    'psi':      '\\psi',
    'omega':    '\\omega',
    // Greek (uppercase)
    'Gamma':    '\\Gamma',
    'Delta':    '\\Delta',
    'Theta':    '\\Theta',
    'Lambda':   '\\Lambda',
    'Xi':       '\\Xi',
    'Pi':       '\\Pi',
    'Sigma':    '\\Sigma',
    'Phi':      '\\Phi',
    'Psi':      '\\Psi',
    'Omega':    '\\Omega',
    // Trig / functions
    'sin':      '\\sin',
    'cos':      '\\cos',
    'tan':      '\\tan',
    'sec':      '\\sec',
    'csc':      '\\csc',
    'cot':      '\\cot',
    'arcsin':   '\\arcsin',
    'arccos':   '\\arccos',
    'arctan':   '\\arctan',
    'sinh':     '\\sinh',
    'cosh':     '\\cosh',
    'tanh':     '\\tanh',
    'log':      '\\log',
    'ln':       '\\ln',
    'exp':      '\\exp',
    'det':      '\\det',
    'dim':      '\\dim',
    'ker':      '\\ker',
    'deg':      '\\deg',
    'gcd':      '\\gcd',
    'min':      '\\min',
    'max':      '\\max',
    'mod':      '\\mod',
    // Logic & sets
    'forall':   '\\forall',
    'exists':   '\\exists',
    'nexists':  '\\nexists',
    'land':     '\\land',
    'lor':      '\\lor',
    'neg':      '\\neg',
    'implies':  '\\implies',
    'iff':      '\\iff',
    'subset':   '\\subset',
    'supset':   '\\supset',
    'cup':      '\\cup',
    'cap':      '\\cap',
    'empty':    '\\emptyset',
    'inn':      '\\in',
    'notin':    '\\notin',
    'union':    '\\cup',
    'inter':    '\\cap',
    // Arrows
    'to':       '\\to',
    'gets':     '\\gets',
    'mapsto':   '\\mapsto',
    'uarr':     '\\uparrow',
    'darr':     '\\downarrow',
    'larr':     '\\leftarrow',
    'rarr':     '\\rightarrow',
    'lrarr':    '\\leftrightarrow',
    'Rarr':     '\\Rightarrow',
    'Larr':     '\\Leftarrow',
    'Lrarr':    '\\Leftrightarrow',
    // Misc
    'binom':    '\\binom{#0}{#0}',
    'vec':      '\\vec{#0}',
    'hat':      '\\hat{#0}',
    'bar':      '\\bar{#0}',
    'tilde':    '\\tilde{#0}',
    'dot':      '\\dot{#0}',
    'ddot':     '\\ddot{#0}',
    'obar':     '\\overline{#0}',
    'ubar':     '\\underline{#0}',
    'abs':      '\\left|#0\\right|',
    'norm':     '\\left\\|#0\\right\\|',
    'ceil':     '\\lceil#0\\rceil',
    'floor':    '\\lfloor#0\\rfloor',
    'RR':       '\\mathbb{R}',
    'NN':       '\\mathbb{N}',
    'ZZ':       '\\mathbb{Z}',
    'QQ':       '\\mathbb{Q}',
    'CC':       '\\mathbb{C}',
    'OO':       '\\emptyset',
    // Override MathLive non-standard differential shortcuts
    'dx':       'd x',
    'dy':       'd y',
    'dt':       'd t',
    'dr':       'd r',
    'ds':       'd s',
    'dz':       'd z',
  };

  const builtIn = mathEditor.inlineShortcuts ?? {};
  mathEditor.inlineShortcuts = { ...builtIn, ...extraShortcuts };

  // Keybindings: Shift+Enter inserts a line break (\\)
  mathEditor.keybindings = [
    ...(mathEditor.keybindings ?? []),
    { key: 'shift+[Enter]', command: ['insert', '\\\\'] },
  ];
}

// ============================================================
// Initialization
// ============================================================
function init() {
  // Wait for MathLive custom element to be ready
  customElements.whenDefined('math-field').then(() => {
    configureMathField();

    // Build the symbol palette
    buildPalette();

    // Init resizable panels
    initResizableHandles();

    // Init view toggle (code / preview)
    initViewToggle();

    // Live sync: MathLive → Code + Preview
    mathEditor.addEventListener('input', () => {
      const latex = getLatex();
      updateCodeDisplay(latex);
      updatePreview(latex);
    });

    // Initial render with default equation
    const initialLatex = getLatex();
    updateCodeDisplay(initialLatex);
    updatePreview(initialLatex);

    // Apply initial preview styles
    applyPreviewStyles();
  });

  // Export options event listeners
  textColorInput.addEventListener('input', applyPreviewStyles);
  bgColorInput.addEventListener('input', applyPreviewStyles);
  bgTransparentCb.addEventListener('change', applyPreviewStyles);
  sizeSlider.addEventListener('input', applyPreviewStyles);

  // Copy buttons
  copyBtn.addEventListener('click', copyLatex);
  copyImgBtn.addEventListener('click', copyImagePNG);

  // Export buttons
  exportSvgBtn.addEventListener('click', exportSVG);
  exportPngBtn.addEventListener('click', exportPNG);
  exportPdfBtn.addEventListener('click', exportPDF);
}

// ============================================================
// View Toggle — Code / Preview
// ============================================================
function initViewToggle() {
  const toggleTabs = document.querySelectorAll('.toggle-tab');
  const viewContents = document.querySelectorAll('.view-content');
  const copyBtnEl = document.getElementById('copy-btn');
  const copyImgBtnEl = document.getElementById('copy-img-btn');

  toggleTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const view = tab.dataset.view;

      toggleTabs.forEach(t => {
        const isActive = t.dataset.view === view;
        t.classList.toggle('active', isActive);
        t.setAttribute('aria-selected', isActive);
      });

      viewContents.forEach(vc => {
        vc.classList.toggle('active', vc.dataset.view === view);
      });

      // Show copy button only in code view, copy image only in preview
      copyBtnEl.style.display = view === 'code' ? '' : 'none';
      copyImgBtnEl.style.display = view === 'preview' ? '' : 'none';
    });
  });

  // Initialize: show copy image in preview, hide copy code
  copyBtnEl.style.display = 'none';
  copyImgBtnEl.style.display = '';
}

init();
