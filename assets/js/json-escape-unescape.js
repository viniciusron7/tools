const inputEl = document.getElementById("input");
const outputEl = document.getElementById("output");
const inputCount = document.getElementById("inputCount");
const outputCount = document.getElementById("outputCount");
const toast = document.getElementById("toast");

let toastTimer = null;

// Character counters
inputEl.addEventListener("input", () => {
  inputCount.textContent = inputEl.value.length + " caracteres";
});

outputEl.addEventListener("input", () => {
  outputCount.textContent = outputEl.value.length + " caracteres";
});

// Escape JSON
function escapeJson() {
  const text = inputEl.value;

  if (!text) {
    showToast("Insira algum texto para converter", "error");
    return;
  }

  try {
    // Match JSON string-escaping semantics (like JSON.stringify): escape the
    // backslash first, then the named escapes. Note: forward slash "/" is NOT
    // escaped — it is valid unescaped in JSON and escaping it corrupts URLs.
    let escaped = text
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t")
      .replace(/\f/g, "\\f")
      .replace(/[\b]/g, "\\b");

    // Escape remaining control characters as \uXXXX
    escaped = escaped.replace(/[\x00-\x1F\x7F-\x9F]/g, (ch) => {
      return (
        "\\u" + ("0000" + ch.charCodeAt(0).toString(16).toUpperCase()).slice(-4)
      );
    });

    outputEl.value = escaped;
    outputCount.textContent = escaped.length + " caracteres";
    showToast("Texto escapado com sucesso");
  } catch (err) {
    showToast("Erro ao escapar: " + err.message, "error");
  }
}

// Unescape JSON
function unescapeJson() {
  const text = inputEl.value;

  if (!text) {
    showToast("Insira algum texto para converter", "error");
    return;
  }

  try {
    // Single-pass scanner. A chained sequence of .replace() calls is buggy:
    // e.g. "\\n" (escaped backslash + the letter n) would wrongly turn into a
    // backslash followed by a newline. Scanning left-to-right consumes each
    // escape exactly once and avoids that ambiguity.
    let unescaped = "";
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch !== "\\") {
        unescaped += ch;
        continue;
      }

      const next = text[i + 1];
      switch (next) {
        case "n":
          unescaped += "\n";
          i++;
          break;
        case "r":
          unescaped += "\r";
          i++;
          break;
        case "t":
          unescaped += "\t";
          i++;
          break;
        case "f":
          unescaped += "\f";
          i++;
          break;
        case "b":
          unescaped += "\b";
          i++;
          break;
        case '"':
          unescaped += '"';
          i++;
          break;
        case "/":
          unescaped += "/";
          i++;
          break;
        case "\\":
          unescaped += "\\";
          i++;
          break;
        case "u": {
          const hex = text.slice(i + 2, i + 6);
          if (/^[0-9A-Fa-f]{4}$/.test(hex)) {
            unescaped += String.fromCharCode(parseInt(hex, 16));
            i += 5;
          } else {
            // Malformed \u sequence — keep the backslash literally
            unescaped += ch;
          }
          break;
        }
        default:
          // Lone or unknown escape — preserve the backslash as-is
          unescaped += ch;
      }
    }

    outputEl.value = unescaped;
    outputCount.textContent = unescaped.length + " caracteres";
    showToast("Texto desescapado com sucesso");
  } catch (err) {
    showToast("Erro ao desescapar: " + err.message, "error");
  }
}

// Clear all
function clearAll() {
  inputEl.value = "";
  outputEl.value = "";
  inputCount.textContent = "0 caracteres";
  outputCount.textContent = "0 caracteres";
}

// Copy output
async function copyOutput() {
  const text = outputEl.value;

  if (!text) {
    showToast("Nada para copiar", "error");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    showToast("Copiado para a área de transferência");
  } catch {
    // Fallback
    outputEl.select();
    outputEl.setSelectionRange(0, outputEl.value.length);
    document.execCommand("copy");
    showToast("Copiado para a área de transferência");
  }
}

// Toast notification
function showToast(message, type = "success") {
  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toast.textContent = message;
  toast.className = "toast" + (type === "error" ? " error" : "");

  // Force reflow for re-triggering animation
  void toast.offsetWidth;
  toast.classList.add("visible");

  toastTimer = setTimeout(() => {
    toast.classList.remove("visible");
    toastTimer = null;
  }, 2500);
}
