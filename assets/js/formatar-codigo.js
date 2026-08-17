// ── Constants ─────────────────────────────────────────────
const HTML_SKELETON = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Documento</title>
</head>
<body>
</body>
</html>
`;

// Script types that hold real JavaScript. Anything else (JSON, templates)
// is left untouched when splitting or stripping comments.
const JS_SCRIPT_TYPES = [
  "",
  "module",
  "text/javascript",
  "application/javascript",
  "text/ecmascript",
  "application/ecmascript",
  "text/babel",
];

// ── Low level scanners ────────────────────────────────────

// Index right after the string literal starting at src[i] (a quote char).
// HTML attribute values may span lines; JS/CSS literals may not, so bailing
// at the newline keeps an unbalanced quote from eating the whole file.
function scanString(src, i, multiline) {
  const quote = src[i++];
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === quote) return i + 1;
    if (c === "\n" && !multiline) return i;
    i++;
  }
  return i;
}

// Index right after the template literal starting at src[i] ("`").
// Substitutions are skipped whole — comments inside them survive, which is a
// fair trade for never mis-parsing nested templates.
function scanTemplate(src, i) {
  i++;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "`") return i + 1;
    if (c === "$" && src[i + 1] === "{") {
      i = scanBraces(src, i + 1);
      continue;
    }
    i++;
  }
  return i;
}

// Index right after the "}" matching the "{" at src[i].
function scanBraces(src, i) {
  let depth = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "{") {
      depth++;
      i++;
      continue;
    }
    if (c === "}") {
      depth--;
      i++;
      if (depth === 0) return i;
      continue;
    }
    if (c === '"' || c === "'") {
      i = scanString(src, i, false);
      continue;
    }
    if (c === "`") {
      i = scanTemplate(src, i);
      continue;
    }
    i++;
  }
  return i;
}

// Index right after the regex literal starting at src[i] ("/"), or -1 when
// the "/" turns out to be a division operator.
function scanRegex(src, i) {
  i++;
  let inClass = false;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "\n") return -1;
    if (c === "[") inClass = true;
    else if (c === "]") inClass = false;
    else if (c === "/" && !inClass) {
      i++;
      while (i < src.length && /[a-z]/i.test(src[i])) i++;
      return i;
    }
    i++;
  }
  return -1;
}

// A "/" starts a regex unless the previous token could end an expression.
// ponytail: "}" and ")" are ambiguous (`if (a) /re/.test(b)`); the common
// case wins. Wrap such a regex in parentheses if it ever bites.
function regexAllowed(prev) {
  return !(prev === ")" || prev === "]" || /[\w$]/.test(prev));
}

// Removes src[start..end) from the output stream. A comment sitting alone on
// its line takes the whole line with it; a comment between code collapses to
// a single space (or a newline, when it spanned lines) so tokens stay apart.
function dropComment(out, src, start, end) {
  const lineStart = out.lastIndexOf("\n") + 1;
  const aloneBefore = out.slice(lineStart).trim() === "";
  let after = end;
  while (src[after] === " " || src[after] === "\t") after++;
  const aloneAfter =
    after >= src.length || src[after] === "\n" || src[after] === "\r";

  if (aloneBefore && aloneAfter) {
    if (src[after] === "\r") after++;
    if (src[after] === "\n") after++;
    return [out.slice(0, lineStart), after];
  }
  if (aloneBefore) return [out, after];
  const trimmed = out.replace(/[ \t]+$/, "");
  if (aloneAfter) return [trimmed, after];
  return [trimmed + (src.slice(start, end).includes("\n") ? "\n" : " "), after];
}

// ── Comment stripping ─────────────────────────────────────

function stripJsComments(src) {
  let out = "";
  let prev = "";
  let i = 0;

  while (i < src.length) {
    const c = src[i];
    const c2 = src[i + 1];

    if (c === "/" && c2 === "/") {
      const nl = src.indexOf("\n", i);
      [out, i] = dropComment(out, src, i, nl === -1 ? src.length : nl);
      continue;
    }
    if (c === "/" && c2 === "*") {
      const end = src.indexOf("*/", i + 2);
      [out, i] = dropComment(out, src, i, end === -1 ? src.length : end + 2);
      continue;
    }
    if (c === '"' || c === "'") {
      const j = scanString(src, i, false);
      out += src.slice(i, j);
      i = j;
      prev = "x";
      continue;
    }
    if (c === "`") {
      const j = scanTemplate(src, i);
      out += src.slice(i, j);
      i = j;
      prev = "x";
      continue;
    }
    if (c === "/" && regexAllowed(prev)) {
      const j = scanRegex(src, i);
      if (j !== -1) {
        out += src.slice(i, j);
        i = j;
        prev = "x";
        continue;
      }
    }
    out += c;
    i++;
    if (!/\s/.test(c)) prev = c;
  }
  return out;
}

function stripCssComments(src) {
  let out = "";
  let i = 0;

  while (i < src.length) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      [out, i] = dropComment(out, src, i, end === -1 ? src.length : end + 2);
      continue;
    }
    if (c === '"' || c === "'") {
      const j = scanString(src, i, false);
      out += src.slice(i, j);
      i = j;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function stripHtmlCommentsOnly(src) {
  let out = "";
  let i = 0;

  while (i < src.length) {
    if (src.startsWith("<!--", i)) {
      const end = src.indexOf("-->", i + 4);
      [out, i] = dropComment(out, src, i, end === -1 ? src.length : end + 3);
      continue;
    }
    out += src[i];
    i++;
  }
  return out;
}

// Strips HTML comments plus the comments inside <script> and <style>.
// Contents of <pre>/<textarea> are literal text and stay untouched.
function stripHtmlComments(src) {
  const blocks = findBlocks(src, ["script", "style", "pre", "textarea"]);
  let out = "";
  let cursor = 0;

  for (const b of blocks) {
    out += stripHtmlCommentsOnly(src.slice(cursor, b.contentStart));
    if (b.tag === "script" && isJsScript(b.attrs))
      out += stripJsComments(b.content);
    else if (b.tag === "style") out += stripCssComments(b.content);
    else out += b.content;
    cursor = b.contentEnd;
  }
  return out + stripHtmlCommentsOnly(src.slice(cursor));
}

function stripComments(code, lang) {
  if (lang === "html") return stripHtmlComments(code);
  if (lang === "css") return stripCssComments(code);
  return stripJsComments(code);
}

// ── HTML tag helpers ──────────────────────────────────────

// Index right after the ">" that closes the tag opening at src[i] ("<").
function endOfOpenTag(src, i) {
  i++;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") {
      i = scanString(src, i, true);
      continue;
    }
    if (c === ">") return i + 1;
    i++;
  }
  return i;
}

function getAttr(attrs, name) {
  const re = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`,
    "i",
  );
  const m = re.exec(attrs);
  if (m) return m[2] ?? m[3] ?? m[4] ?? "";
  return new RegExp(`(?:^|\\s)${name}(?=[\\s/>]|$)`, "i").test(attrs)
    ? ""
    : null;
}

function isJsScript(attrs) {
  const type = (getAttr(attrs, "type") || "").trim().toLowerCase();
  return JS_SCRIPT_TYPES.includes(type.split(";")[0]);
}

// Locates every <tag>…</tag> block of the given tags, in document order.
function findBlocks(src, tags) {
  const re = new RegExp(`<(${tags.join("|")})(?=[\\s/>])`, "gi");
  const blocks = [];
  let m;

  while ((m = re.exec(src))) {
    const tag = m[1].toLowerCase();
    const contentStart = endOfOpenTag(src, m.index);
    const attrs = src.slice(m.index + tag.length + 1, contentStart - 1);
    const closeRe = new RegExp(`</${tag}\\s*>`, "i");
    const found = closeRe.exec(src.slice(contentStart));
    const contentEnd = found ? contentStart + found.index : src.length;
    const end = found ? contentEnd + found[0].length : src.length;

    blocks.push({
      tag,
      attrs,
      start: m.index,
      contentStart,
      contentEnd,
      end,
      content: src.slice(contentStart, contentEnd),
    });
    re.lastIndex = end;
  }
  return blocks;
}

// A closing tag inside a string would end the block early — escape it.
function safeInline(code, tag) {
  return code.replace(new RegExp(`</(${tag})`, "gi"), "<\\/$1");
}

// Inserts a chunk right before the last </head> or </body> of the document.
function insertBefore(doc, tag, chunk) {
  const re = new RegExp(`</${tag}\\s*>`, "gi");
  let at = -1;
  let m;
  while ((m = re.exec(doc))) at = m.index;
  if (at === -1) return doc + "\n" + chunk + "\n";
  return doc.slice(0, at) + chunk + "\n" + doc.slice(at);
}

function innerOf(html, tag) {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*)</${tag}\\s*>`, "i").exec(html);
  return m ? m[1] : null;
}

function baseName(path) {
  return path.split(/[?#]/)[0].split("/").pop().toLowerCase();
}

// Pulls the file whose name matches a href/src reference out of the list.
function takeMatching(list, url) {
  const target = baseName(url);
  const at = list.findIndex((f) => baseName(f.name) === target);
  return at === -1 ? null : list.splice(at, 1)[0];
}

// ── Merge: many files → one HTML ──────────────────────────

function mergeToHtml(files) {
  const htmls = files.filter((f) => f.lang === "html");
  const pendingCss = files.filter((f) => f.lang === "css");
  const pendingJs = files.filter((f) => f.lang === "js");

  let doc = htmls.length ? htmls[0].code : HTML_SKELETON;

  // Extra documents are folded into the first one: head extras (minus the
  // duplicated <title>/<meta>) into <head>, everything else into <body>.
  for (const extra of htmls.slice(1)) {
    const head = innerOf(extra.code, "head");
    const body = innerOf(extra.code, "body");
    if (head) {
      const kept = head
        .replace(/<title[\s\S]*?<\/title\s*>|<meta\b[^>]*>/gi, "")
        .trim();
      if (kept) doc = insertBefore(doc, "head", kept);
    }
    doc = insertBefore(doc, "body", body === null ? extra.code : body);
  }

  // Inline the stylesheets/scripts the document already points at.
  doc = doc.replace(/<link\b[^>]*>/gi, (tag) => {
    const href = getAttr(tag, "href");
    if (!/stylesheet/i.test(getAttr(tag, "rel") || "") || !href) return tag;
    const file = takeMatching(pendingCss, href);
    return file ? styleTag(file) : tag;
  });
  doc = inlineScriptRefs(doc, pendingJs);

  // Whatever was not referenced is appended in the order it was given.
  for (const file of pendingCss)
    doc = insertBefore(doc, "head", styleTag(file));
  for (const file of pendingJs)
    doc = insertBefore(doc, "body", scriptTag(file, ""));

  return doc;
}

function styleTag(file) {
  return `<style>\n/* ${file.name} */\n${safeInline(file.code.trim(), "style")}\n</style>`;
}

function scriptTag(file, attrs) {
  const type = /^module$/i.test((getAttr(attrs, "type") || "").trim())
    ? ' type="module"'
    : "";
  return `<script${type}>\n// ${file.name}\n${safeInline(file.code.trim(), "script")}\n</script>`;
}

function inlineScriptRefs(doc, pendingJs) {
  let out = "";
  let cursor = 0;

  for (const b of findBlocks(doc, ["script"])) {
    const src = getAttr(b.attrs, "src");
    const file = src ? takeMatching(pendingJs, src) : null;
    out += doc.slice(cursor, b.start);
    out += file ? scriptTag(file, b.attrs) : doc.slice(b.start, b.end);
    cursor = b.end;
  }
  return out + doc.slice(cursor);
}

// ── Split: one HTML → many files ──────────────────────────

function sanitizeName(name, fallback) {
  const clean = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean || fallback;
}

function splitHtml(src, granular) {
  const blocks = findBlocks(src, ["script", "style"]).filter(
    (b) =>
      b.content.trim() &&
      (b.tag === "style" || (!getAttr(b.attrs, "src") && isJsScript(b.attrs))),
  );
  const styles = blocks.filter((b) => b.tag === "style");
  const scripts = blocks.filter((b) => b.tag === "script");
  const isModule = scripts.some((b) =>
    /^module$/i.test((getAttr(b.attrs, "type") || "").trim()),
  );

  // One file per block, or everything concatenated into styles.css/script.js.
  const named = new Map();
  const used = new Set();

  for (const b of blocks) {
    const css = b.tag === "style";
    if (!granular) {
      named.set(b, css ? "styles.css" : "script.js");
      continue;
    }
    const ext = css ? ".css" : ".js";
    const n = (css ? styles : scripts).indexOf(b) + 1;
    const id = getAttr(b.attrs, "id");
    let name = sanitizeName(
      id ? id + ext : "",
      `${css ? "styles" : "script"}-${n}${ext}`,
    );
    while (used.has(name)) name = name.replace(/(\.\w+)$/, `-${n}$1`);
    used.add(name);
    named.set(b, name);
  }

  // In 3-file mode only one tag survives per language: the <link> where the
  // first <style> was, the <script> where the last one was — the latest spot
  // that still runs every statement in its original order.
  const files = [];
  let out = "";
  let cursor = 0;

  for (const b of blocks) {
    const css = b.tag === "style";
    const name = named.get(b);
    const keep =
      granular || b === (css ? styles[0] : scripts[scripts.length - 1]);
    const type = granular ? moduleAttr(b) : isModule ? ' type="module"' : "";
    const tag = css
      ? `<link rel="stylesheet" href="${name}">`
      : `<script${type} src="${name}"></script>`;

    out += src.slice(cursor, b.start) + (keep ? tag : "");
    cursor = b.end;

    const existing = files.find((f) => f.name === name);
    if (existing) existing.code += "\n\n" + b.content.trim();
    else files.push({ name, lang: css ? "css" : "js", code: b.content.trim() });
  }
  out += src.slice(cursor);

  return [{ name: "index.html", lang: "html", code: out }, ...files];
}

function moduleAttr(block) {
  return /^module$/i.test((getAttr(block.attrs, "type") || "").trim())
    ? ' type="module"'
    : "";
}

// ── Beautify ──────────────────────────────────────────────

function beautify(code, lang, indent) {
  const opts = {
    indent_size: indent === "tab" ? 1 : Number(indent),
    indent_with_tabs: indent === "tab",
    end_with_newline: true,
    preserve_newlines: true,
    max_preserve_newlines: 2,
    wrap_line_length: 0,
  };
  if (lang === "html") {
    return beautifier.html(code, {
      ...opts,
      indent_inner_html: true,
      extra_liners: [],
    });
  }
  return lang === "css"
    ? beautifier.css(code, opts)
    : beautifier.js(code, opts);
}

function detectLang(code) {
  const text = code.trim();
  if (/^</.test(text) || /<\/(html|body|head|div|p|span|table)\s*>/i.test(text))
    return "html";
  if (
    /(^|[\s;{(])(function\b|=>|const\s|let\s|var\s|class\s|return\b|console\.)/.test(
      text,
    )
  )
    return "js";
  if (/@media|@import|[^{};]*\{[^{}]*[a-z-]+\s*:/i.test(text)) return "css";
  return "js";
}

// Applies the shared output options to one file.
function applyOptions(file, opts) {
  let code = file.code;
  if (opts.strip) code = stripComments(code, file.lang);
  if (opts.format) code = beautify(code, file.lang, opts.indent);
  return { ...file, code };
}

// ── UI: state ─────────────────────────────────────────────

const editorsEl = document.getElementById("editors");
const resultsEl = document.getElementById("results");
const splitInputEl = document.getElementById("splitInput");
const formatInputEl = document.getElementById("formatInput");
const toastEl = document.getElementById("toast");

const PLACEHOLDERS = {
  html: "<div>...</div>",
  css: ".classe { color: #e0a040; }",
  js: "function ola() { ... }",
};

let toastTimer = null;
let editorSeq = 0;

function currentOptions() {
  return {
    format: document.getElementById("optFormat").checked,
    strip: document.getElementById("optStrip").checked,
    indent: document.getElementById("optIndent").value,
  };
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => {
    const on = t.id === "tab-" + name;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", String(on));
  });
  document.querySelectorAll(".pane").forEach((p) => {
    p.classList.toggle("active", p.id === "pane-" + name);
  });
  resultsEl.innerHTML = "";
}

// ── UI: merge editors ─────────────────────────────────────

function addEditor(lang, name, code) {
  const card = document.createElement("div");
  card.className = "editor-card";
  card.dataset.lang = lang;
  card.innerHTML = `
    <div class="editor-head">
      <span class="lang-badge lang-${lang}">${lang.toUpperCase()}</span>
      <input class="editor-name" spellcheck="false" />
      <button class="icon-btn" title="Mover para cima" onclick="moveEditor(this, -1)">↑</button>
      <button class="icon-btn" title="Mover para baixo" onclick="moveEditor(this, 1)">↓</button>
      <button class="icon-btn danger" title="Remover" onclick="this.closest('.editor-card').remove()">✕</button>
    </div>
    <textarea class="editor-code" spellcheck="false"></textarea>`;

  const ext = lang === "js" ? "js" : lang === "css" ? "css" : "html";
  card.querySelector(".editor-name").value =
    name || `arquivo-${++editorSeq}.${ext}`;
  card.querySelector(".editor-code").value = code || "";
  card.querySelector(".editor-code").placeholder = PLACEHOLDERS[lang];
  editorsEl.appendChild(card);
  if (!code) card.querySelector(".editor-code").focus();
  return card;
}

function moveEditor(btn, dir) {
  const card = btn.closest(".editor-card");
  const sibling =
    dir < 0 ? card.previousElementSibling : card.nextElementSibling;
  if (sibling)
    editorsEl.insertBefore(dir < 0 ? card : sibling, dir < 0 ? sibling : card);
}

function clearEditors() {
  editorsEl.innerHTML = "";
  resultsEl.innerHTML = "";
  editorSeq = 0;
}

function readEditors() {
  return [...editorsEl.querySelectorAll(".editor-card")].map((card) => ({
    lang: card.dataset.lang,
    name: card.querySelector(".editor-name").value.trim() || "arquivo",
    code: card.querySelector(".editor-code").value,
  }));
}

function langFromFile(file, code) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (["css", "scss"].includes(ext)) return "css";
  if (["js", "mjs", "cjs"].includes(ext)) return "js";
  if (["html", "htm"].includes(ext)) return "html";
  return detectLang(code);
}

async function loadMergeFiles(input) {
  for (const file of input.files) {
    const code = await file.text();
    addEditor(langFromFile(file, code), file.name, code);
  }
  input.value = "";
  showToast("Arquivos carregados");
}

async function loadSplitFile(input) {
  const file = input.files[0];
  if (!file) return;
  splitInputEl.value = await file.text();
  input.value = "";
  showToast("Arquivo carregado");
}

// ── UI: actions ───────────────────────────────────────────

function runMerge() {
  const files = readEditors().filter((f) => f.code.trim());
  if (!files.length) {
    showToast("Adicione ao menos um arquivo com código", "error");
    return;
  }
  try {
    const merged = {
      name: "index.html",
      lang: "html",
      code: mergeToHtml(files),
    };
    renderResults([applyOptions(merged, currentOptions())]);
    showToast(`${files.length} arquivo(s) mesclados`);
  } catch (err) {
    showToast("Erro ao mesclar: " + err.message, "error");
  }
}

function runSplit() {
  const code = splitInputEl.value;
  if (!code.trim()) {
    showToast("Cole o HTML que deseja dividir", "error");
    return;
  }
  try {
    const granular = document.getElementById("splitGranular").checked;
    const opts = currentOptions();
    const files = splitHtml(code, granular).map((f) => applyOptions(f, opts));
    renderResults(files);
    if (files.length === 1)
      showToast("Nenhum <style> ou <script> embutido encontrado", "error");
    else showToast(`Dividido em ${files.length} arquivos`);
  } catch (err) {
    showToast("Erro ao dividir: " + err.message, "error");
  }
}

function runFormat() {
  const code = formatInputEl.value;
  if (!code.trim()) {
    showToast("Cole o código que deseja formatar", "error");
    return;
  }
  const opts = currentOptions();
  if (!opts.format && !opts.strip) {
    showToast("Marque formatar e/ou remover comentários", "error");
    return;
  }
  const picked = document.getElementById("formatLang").value;
  const lang = picked === "auto" ? detectLang(code) : picked;
  try {
    const file = { name: `formatado.${lang}`, lang, code };
    renderResults([applyOptions(file, opts)]);
    showToast("Código formatado (" + lang.toUpperCase() + ")");
  } catch (err) {
    showToast("Erro ao formatar: " + err.message, "error");
  }
}

// ── UI: results ───────────────────────────────────────────

function renderResults(files) {
  resultsEl.innerHTML = "";
  if (!files.length) return;

  const head = document.createElement("div");
  head.className = "results-head";
  head.innerHTML = `<span class="panel-title">Resultado</span>`;
  if (files.length > 1) {
    const all = document.createElement("button");
    all.className = "btn-primary";
    all.textContent = "Baixar todos";
    all.onclick = () =>
      files.forEach((f, i) =>
        setTimeout(() => downloadFile(f.name, f.code), i * 150),
      );
    head.appendChild(all);
  }
  resultsEl.appendChild(head);

  for (const file of files) {
    const card = document.createElement("div");
    card.className = "result-card";
    card.innerHTML = `
      <div class="result-head">
        <span class="lang-badge lang-${file.lang}">${file.lang.toUpperCase()}</span>
        <span class="result-name"></span>
        <span class="result-size"></span>
        <button class="btn-copy">Copiar</button>
        <button class="btn-download">Baixar</button>
      </div>
      <textarea class="result-code" spellcheck="false" readonly></textarea>`;
    card.querySelector(".result-name").textContent = file.name;
    card.querySelector(".result-size").textContent = formatBytes(file.code);
    card.querySelector(".result-code").value = file.code;
    card.querySelector(".btn-copy").onclick = () => copyText(file.code);
    card.querySelector(".btn-download").onclick = () =>
      downloadFile(file.name, file.code);
    resultsEl.appendChild(card);
  }
  resultsEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function formatBytes(text) {
  const bytes = new TextEncoder().encode(text).length;
  return bytes < 1024 ? bytes + " B" : (bytes / 1024).toFixed(1) + " KB";
}

function downloadFile(name, code) {
  const url = URL.createObjectURL(
    new Blob([code], { type: "text/plain;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("Copiado para a área de transferência");
  } catch {
    showToast("Não foi possível copiar", "error");
  }
}

function showToast(message, type = "success") {
  if (toastTimer) clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.className = "toast" + (type === "error" ? " error" : "");
  void toastEl.offsetWidth;
  toastEl.classList.add("visible");
  toastTimer = setTimeout(() => {
    toastEl.classList.remove("visible");
    toastTimer = null;
  }, 2500);
}

// ── Self test ─────────────────────────────────────────────
// Open the page with ?selftest to run the core checks in the console.

function selfTest() {
  const fails = [];
  let ran = 0;
  const check = (label, got, want) => {
    ran++;
    if (got !== want) fails.push({ label, got, want });
  };

  check(
    "js: line comment",
    stripJsComments("a = 1; // nota\nb = 2;"),
    "a = 1;\nb = 2;",
  );
  check("js: whole line", stripJsComments("a;\n// nota\nb;"), "a;\nb;");
  check(
    "js: url in string",
    stripJsComments('u = "http://x.com";'),
    'u = "http://x.com";',
  );
  check(
    "js: url in template",
    stripJsComments("u = `http://x/${a}`;"),
    "u = `http://x/${a}`;",
  );
  check(
    "js: regex with slashes",
    stripJsComments("r = /a\\/\\/b/g;"),
    "r = /a\\/\\/b/g;",
  );
  check("js: division stays", stripJsComments("x = a / b; // c"), "x = a / b;");
  check(
    "js: block inline",
    stripJsComments("a = 1 /* c */ + 2;"),
    "a = 1 + 2;",
  );
  check(
    "js: comment marker in string",
    stripJsComments("s = '/* nao */';"),
    "s = '/* nao */';",
  );
  check(
    "css: comment",
    stripCssComments("a {\n  /* c */\n  color: red;\n}"),
    "a {\n  color: red;\n}",
  );
  check(
    "css: content string",
    stripCssComments("a { content: '/*'; }"),
    "a { content: '/*'; }",
  );
  check(
    "html: comment",
    stripHtmlComments("<p>a</p>\n<!-- c -->\n<p>b</p>"),
    "<p>a</p>\n<p>b</p>",
  );
  check(
    "html: keeps pre",
    stripHtmlComments("<pre><!-- c --></pre>"),
    "<pre><!-- c --></pre>",
  );
  check(
    "html: strips inside script",
    stripHtmlComments("<script>a; // c\n</script>"),
    "<script>a;\n</script>",
  );
  check(
    "html: keeps json script",
    stripHtmlComments('<script type="application/json">{"a": 1}</script>'),
    '<script type="application/json">{"a": 1}</script>',
  );

  const merged = mergeToHtml([
    {
      lang: "html",
      name: "i.html",
      code: '<html><head><link rel="stylesheet" href="css/a.css"></head><body><p>x</p><script src="b.js"></script></body></html>',
    },
    { lang: "css", name: "a.css", code: "p { color: red; }" },
    { lang: "js", name: "b.js", code: "console.log(1);" },
    { lang: "js", name: "extra.js", code: "console.log(2);" },
  ]);
  check("merge: css inlined", merged.includes("p { color: red; }"), true);
  check("merge: link removed", merged.includes("<link"), false);
  check("merge: script inlined", merged.includes("console.log(1);"), true);
  check("merge: src removed", merged.includes('src="b.js"'), false);
  check("merge: extra appended", merged.includes("console.log(2);"), true);

  const split = splitHtml(
    '<html><head><style>p{color:red}</style></head><body><script>a();</script><script src="x.js"></script></body></html>',
    false,
  );
  check("split: file count", split.length, 3);
  check(
    "split: link added",
    split[0].code.includes('<link rel="stylesheet" href="styles.css">'),
    true,
  );
  check(
    "split: script added",
    split[0].code.includes('<script src="script.js"></script>'),
    true,
  );
  check(
    "split: external kept",
    split[0].code.includes('<script src="x.js"></script>'),
    true,
  );
  check("split: css content", split[1].code, "p{color:red}");
  check("split: js content", split[2].code, "a();");

  const granular = splitHtml(
    "<body><script>a();</script><script>b();</script></body>",
    true,
  );
  check("split: one file per block", granular.length, 3);
  check("split: numbered names", granular[2].name, "script-2.js");

  const roundTrip = mergeToHtml(
    splitHtml(
      "<html><body><style>p{color:red}</style><script>a();</script></body></html>",
      false,
    ),
  );
  check("round trip: css back", roundTrip.includes("p{color:red}"), true);
  check("round trip: js back", roundTrip.includes("a();"), true);
  check("round trip: no leftover link", roundTrip.includes("<link"), false);
  check(
    "merge: closing tag escaped",
    mergeToHtml([
      { lang: "js", name: "a.js", code: 'd.write("</script>");' },
    ]).includes('d.write("<\\/script>");'),
    true,
  );

  if (fails.length)
    console.error(`Autoteste: ${fails.length} de ${ran} falharam`, fails);
  else console.log(`Autoteste: todos os ${ran} casos passaram`);
  showToast(
    fails.length
      ? `Autoteste: ${fails.length} falha(s) — veja o console`
      : "Autoteste: tudo passou",
    fails.length ? "error" : "success",
  );
}

// ── Init ──────────────────────────────────────────────────

addEditor("html", "index.html", "");
addEditor("css", "styles.css", "");
addEditor("js", "script.js", "");

if (location.search.includes("selftest")) selfTest();
