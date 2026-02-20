const inputEl = document.getElementById('input');
const outputEl = document.getElementById('output');
const inputCount = document.getElementById('inputCount');
const outputCount = document.getElementById('outputCount');
const toast = document.getElementById('toast');

let toastTimer = null;

// Character counters
inputEl.addEventListener('input', () => {
  inputCount.textContent = inputEl.value.length + ' caracteres';
});

outputEl.addEventListener('input', () => {
  outputCount.textContent = outputEl.value.length + ' caracteres';
});

// Escape JSON
function escapeJson() {
  const text = inputEl.value;

  if (!text) {
    showToast('Insira algum texto para converter', 'error');
    return;
  }

  try {
    let escaped = text
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\//g, '\\/')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      .replace(/\f/g, '\\f');

    // Escape remaining control characters
    escaped = escaped.replace(/[\x00-\x1F\x7F-\x9F]/g, (ch) => {
      return '\\u' + ('0000' + ch.charCodeAt(0).toString(16).toUpperCase()).slice(-4);
    });

    outputEl.value = escaped;
    outputCount.textContent = escaped.length + ' caracteres';
    showToast('Texto escapado com sucesso');
  } catch (err) {
    showToast('Erro ao escapar: ' + err.message, 'error');
  }
}

// Unescape JSON
function unescapeJson() {
  const text = inputEl.value;

  if (!text) {
    showToast('Insira algum texto para converter', 'error');
    return;
  }

  try {
    let unescaped = text
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\f/g, '\f')
      .replace(/\\"/g, '"')
      .replace(/\\\//g, '/')
      .replace(/\\\\/g, '\\');

    // Unescape Unicode sequences
    unescaped = unescaped.replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });

    outputEl.value = unescaped;
    outputCount.textContent = unescaped.length + ' caracteres';
    showToast('Texto desescapado com sucesso');
  } catch (err) {
    showToast('Erro ao desescapar: ' + err.message, 'error');
  }
}

// Clear all
function clearAll() {
  inputEl.value = '';
  outputEl.value = '';
  inputCount.textContent = '0 caracteres';
  outputCount.textContent = '0 caracteres';
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
    // Fallback
    outputEl.select();
    outputEl.setSelectionRange(0, outputEl.value.length);
    document.execCommand('copy');
    showToast('Copiado para a área de transferência');
  }
}

// Toast notification
function showToast(message, type = 'success') {
  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toast.textContent = message;
  toast.className = 'toast' + (type === 'error' ? ' error' : '');

  // Force reflow for re-triggering animation
  void toast.offsetWidth;
  toast.classList.add('visible');

  toastTimer = setTimeout(() => {
    toast.classList.remove('visible');
    toastTimer = null;
  }, 2500);
}
