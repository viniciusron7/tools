const inputEl     = document.getElementById('input');
const outputEl    = document.getElementById('output');
const inputCount  = document.getElementById('inputCount');
const outputCount = document.getElementById('outputCount');
const inputBytes  = document.getElementById('inputBytes');
const outputBytes = document.getElementById('outputBytes');
const toast       = document.getElementById('toast');

function getByteLength(str) {
  return new TextEncoder().encode(str).length;
}

let currentMode = 'base64';
let toastTimer  = null;

// Character counters
inputEl.addEventListener('input', () => {
  inputCount.textContent = inputEl.value.length + ' caracteres';
  inputBytes.textContent = getByteLength(inputEl.value) + ' bytes';
});

// Switch between Base64 and URL modes
function switchMode(mode) {
  currentMode = mode;

  document.querySelectorAll('.tab').forEach(t => {
    t.classList.remove('active');
    t.setAttribute('aria-selected', 'false');
  });
  const activeTab = document.getElementById('tab-' + mode);
  activeTab.classList.add('active');
  activeTab.setAttribute('aria-selected', 'true');

  if (mode === 'base64') {
    inputEl.placeholder = 'Cole aqui o texto para encodar ou o Base64 para decodar...';
    document.getElementById('refBase64').style.display = 'block';
    document.getElementById('refUrl').style.display    = 'none';
  } else {
    inputEl.placeholder = 'Cole aqui o texto para encodar ou a string encoded para decodar...';
    document.getElementById('refBase64').style.display = 'none';
    document.getElementById('refUrl').style.display    = 'block';
  }
}

// Base64 encode — UTF-8 safe
function b64Encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

// Base64 decode — UTF-8 safe, strips whitespace before decoding
function b64Decode(str) {
  return decodeURIComponent(escape(atob(str.replace(/\s/g, ''))));
}

// Encode action
function encode() {
  const text = inputEl.value;

  if (!text) {
    showToast('Insira algum texto para encodar', 'error');
    return;
  }

  try {
    const result = currentMode === 'base64'
      ? b64Encode(text)
      : encodeURIComponent(text);

    outputEl.value = result;
    outputCount.textContent = result.length + ' caracteres';
    outputBytes.textContent = getByteLength(result) + ' bytes';
    showToast('Texto encodado com sucesso');
  } catch (err) {
    showToast('Erro ao encodar: ' + err.message, 'error');
  }
}

// Decode action
function decode() {
  const text = inputEl.value;

  if (!text) {
    showToast('Insira algum texto para decodar', 'error');
    return;
  }

  try {
    const result = currentMode === 'base64'
      ? b64Decode(text)
      : decodeURIComponent(text);

    outputEl.value = result;
    outputCount.textContent = result.length + ' caracteres';
    outputBytes.textContent = getByteLength(result) + ' bytes';
    showToast('Texto decodado com sucesso');
  } catch (_err) {
    if (currentMode === 'base64') {
      showToast('Base64 inválido. Verifique se a string contém apenas caracteres Base64 válidos.', 'error');
    } else {
      showToast('URL inválida ou malformada.', 'error');
    }
  }
}

// Clear all
function clearAll() {
  inputEl.value  = '';
  outputEl.value = '';
  inputCount.textContent  = '0 caracteres';
  outputCount.textContent = '0 caracteres';
  inputBytes.textContent  = '0 bytes';
  outputBytes.textContent = '0 bytes';
}

// Copy output
async function copyOutput() {
  const text = outputEl.value;

  if (!text) {
    showToast('Nada para copiar', 'error');
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    showToast('Copiado para a área de transferência');
  } catch {
    // Fallback for environments without clipboard API
    outputEl.select();
    outputEl.setSelectionRange(0, outputEl.value.length);
    document.execCommand('copy');
    showToast('Copiado para a área de transferência');
  }
}

// Auto-example on page load
inputEl.value = 'hello world';
inputCount.textContent = inputEl.value.length + ' caracteres';
inputBytes.textContent = getByteLength(inputEl.value) + ' bytes';
encode();

// Toast notification
function showToast(message, type = 'success') {
  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toast.textContent = message;
  toast.className = 'toast' + (type === 'error' ? ' error' : '');

  // Force reflow to re-trigger transition
  void toast.offsetWidth;
  toast.classList.add('visible');

  toastTimer = setTimeout(() => {
    toast.classList.remove('visible');
    toastTimer = null;
  }, 2500);
}
