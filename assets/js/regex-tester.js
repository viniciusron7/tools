const regexInputEl      = document.getElementById('regexInput');
const testTextEl        = document.getElementById('testText');
const highlightOutputEl = document.getElementById('highlightOutput');
const matchBadgeEl      = document.getElementById('matchBadge');
const regexErrorEl      = document.getElementById('regexError');
const regexWrapperEl    = document.getElementById('regexFieldWrapper');
const flagsDisplayEl    = document.getElementById('flagsDisplay');
const groupsBodyEl      = document.getElementById('groupsBody');
const testTextCountEl   = document.getElementById('testTextCount');
const toastEl           = document.getElementById('toast');

const MAX_DISPLAY_MATCHES = 100;

let toastTimer = null;

// ── Initialise flag label state ───────────────────────────

document.querySelectorAll('.flag-label').forEach(label => {
    const cb = label.querySelector('input[type="checkbox"]');
    label.classList.toggle('checked', cb.checked);

    cb.addEventListener('change', () => {
        label.classList.toggle('checked', cb.checked);
        updateFlagsDisplay();
        runTest();
    });
});

// ── Live update listeners ─────────────────────────────────

regexInputEl.addEventListener('input', runTest);
testTextEl.addEventListener('input', () => {
    testTextCountEl.textContent = testTextEl.value.length + ' caracteres';
    runTest();
});

// ── Helpers ───────────────────────────────────────────────

function getFlags() {
    return ['g', 'i', 'm', 's']
        .filter(f => document.getElementById('flag-' + f).checked)
        .join('');
}

function updateFlagsDisplay() {
    flagsDisplayEl.textContent = getFlags();
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function truncateDisplay(str, max) {
    if (str.length <= max) return escapeHtml(str);
    return escapeHtml(str.slice(0, max)) + '<em class="group-val" style="color:var(--text-muted)">…</em>';
}

// ── Core: run regex test ──────────────────────────────────

function runTest() {
    const pattern = regexInputEl.value;
    const text    = testTextEl.value;
    const flags   = getFlags();

    clearError();

    if (!pattern) {
        renderHighlight(text, []);
        updateStats([]);
        return;
    }

    let re;
    try {
        re = new RegExp(pattern, flags);
    } catch (err) {
        showError('Regex inválida: ' + err.message);
        renderHighlight(text, []);
        updateStats([]);
        return;
    }

    const matches = collectMatches(re, text, flags);
    renderHighlight(text, matches);
    updateStats(matches);
}

function collectMatches(re, text, flags) {
    const matches = [];

    if (flags.includes('g')) {
        // matchAll requires the g flag
        try {
            for (const m of text.matchAll(re)) {
                matches.push(m);
            }
        } catch (_) {
            // matchAll can throw on pathological patterns — return empty silently
        }
    } else {
        // exec once without global flag
        try {
            const m = re.exec(text);
            if (m) matches.push(m);
        } catch (_) {
            // no-op
        }
    }

    return matches;
}

// ── Render: highlighted output ────────────────────────────

function renderHighlight(text, matches) {
    if (!text) {
        highlightOutputEl.innerHTML = '<span class="placeholder-text">Os destaques aparecerão aqui...</span>';
        return;
    }

    if (!matches.length) {
        highlightOutputEl.innerHTML = escapeHtml(text);
        return;
    }

    let html      = '';
    let lastIndex = 0;

    for (const match of matches) {
        const start     = match.index;
        const matchText = match[0];
        const end       = start + matchText.length;

        // Skip if this match overlaps a previous one
        if (start < lastIndex) continue;

        // Text before this match
        html += escapeHtml(text.slice(lastIndex, start));

        if (matchText.length === 0) {
            // Zero-length match: render a thin cursor mark and advance by 1
            html += '<mark class="match-empty"></mark>';
            // Emit the character at 'start' as plain text so it is not lost
            if (start < text.length) {
                html += escapeHtml(text[start]);
            }
            lastIndex = start + 1;
        } else {
            html += '<mark class="match-hl">' + escapeHtml(matchText) + '</mark>';
            lastIndex = end;
        }
    }

    // Remaining text after the last match
    html += escapeHtml(text.slice(lastIndex));

    highlightOutputEl.innerHTML = html;
}

// ── Render: stats / groups panel ─────────────────────────

function updateStats(matches) {
    const count = matches.length;

    // Update badge
    matchBadgeEl.textContent = count === 1
        ? '1 correspondência'
        : count + ' correspondências';
    matchBadgeEl.classList.toggle('zero', count === 0);

    if (count === 0) {
        groupsBodyEl.innerHTML = '<span class="no-groups-msg">Nenhuma correspondência encontrada</span>';
        return;
    }

    // Check whether any match has capture groups
    const hasGroups = matches.some(m => m.length > 1);

    if (!hasGroups) {
        groupsBodyEl.innerHTML = '<span class="no-groups-msg">A regex encontrou correspondências, mas não há grupos capturados. Use parênteses <code>()</code> para capturar partes do match.</span>';
        return;
    }

    // Render group details (cap at MAX_DISPLAY_MATCHES for performance)
    const displayMatches = matches.slice(0, MAX_DISPLAY_MATCHES);
    let html = '<div class="groups-list">';

    displayMatches.forEach((match, i) => {
        // Only render items that actually have capture groups
        if (match.length <= 1) return;

        html += '<div class="match-item">';
        html += '<div class="match-item-header">';
        html += '<span class="match-num">#' + (i + 1) + '</span>';
        html += '<span class="match-val">' + truncateDisplay(match[0] || '(vazio)', 60) + '</span>';
        html += '<span class="match-pos">pos&nbsp;' + match.index + '</span>';
        html += '</div>';

        for (let g = 1; g < match.length; g++) {
            const val = match[g];
            html += '<div class="group-row">';
            html += '<span class="group-key">grupo&nbsp;' + g + '</span>';
            if (val === undefined) {
                html += '<span class="group-val"><em>undefined</em></span>';
            } else {
                html += '<span class="group-val">' + truncateDisplay(val, 80) + '</span>';
            }
            html += '</div>';
        }

        html += '</div>';
    });

    html += '</div>';

    if (matches.length > MAX_DISPLAY_MATCHES) {
        html += '<p class="more-matches-msg">… e mais ' + (matches.length - MAX_DISPLAY_MATCHES) + ' correspondências</p>';
    }

    groupsBodyEl.innerHTML = html;
}

// ── Actions ───────────────────────────────────────────────

function copyRegex() {
    const pattern = regexInputEl.value;
    if (!pattern) {
        showToast('Nenhuma regex para copiar', 'error');
        return;
    }

    navigator.clipboard.writeText(pattern)
        .then(() => showToast('Regex copiada'))
        .catch(() => {
            const tmp = document.createElement('textarea');
            tmp.value = pattern;
            tmp.style.cssText = 'position:fixed;opacity:0;';
            document.body.appendChild(tmp);
            tmp.select();
            try { document.execCommand('copy'); } catch (_) { /* ignore */ }
            document.body.removeChild(tmp);
            showToast('Regex copiada');
        });
}

function clearAll() {
    regexInputEl.value  = '';
    testTextEl.value    = '';
    testTextCountEl.textContent = '0 caracteres';

    clearError();

    highlightOutputEl.innerHTML = '<span class="placeholder-text">Os destaques aparecerão aqui...</span>';
    matchBadgeEl.textContent    = '0 correspondências';
    matchBadgeEl.classList.add('zero');
    groupsBodyEl.innerHTML      = '<span class="no-groups-msg">Nenhum grupo capturado</span>';
    flagsDisplayEl.textContent  = 'g';

    // Reset flags: only g checked
    document.querySelectorAll('.flag-label').forEach(label => {
        const cb = label.querySelector('input[type="checkbox"]');
        cb.checked = (cb.value === 'g');
        label.classList.toggle('checked', cb.checked);
    });
}

// ── Example ───────────────────────────────────────────

function loadExample() {
    regexInputEl.value  = '\\d+';
    testTextEl.value    = 'Pedido 123 valor 456 desconto 10';
    testTextCountEl.textContent = testTextEl.value.length + ' caracteres';
    runTest();
}

// ── Help toggle ───────────────────────────────────────

function toggleHelp() {
    const sec = document.getElementById('helpSection');
    const btn = document.getElementById('helpToggleBtn');
    const open = sec.style.display === 'block';
    sec.style.display = open ? 'none' : 'block';
    btn.textContent = open ? 'Ajuda rápida de regex ▸' : 'Ajuda rápida de regex ▾';
}

// ── Error helpers ─────────────────────────────────────────

function showError(msg) {
    regexErrorEl.textContent = msg;
    regexWrapperEl.classList.add('has-error');
}

function clearError() {
    regexErrorEl.textContent = '';
    regexWrapperEl.classList.remove('has-error');
}

// ── Toast ─────────────────────────────────────────────────

function showToast(message, type) {
    if (toastTimer) clearTimeout(toastTimer);

    toastEl.textContent = message;
    toastEl.className   = 'toast' + (type === 'error' ? ' error' : '');

    void toastEl.offsetWidth; // force reflow to restart transition
    toastEl.classList.add('visible');

    toastTimer = setTimeout(() => {
        toastEl.classList.remove('visible');
        toastTimer = null;
    }, 2500);
}

// ── Init ──────────────────────────────────────────────

loadExample();
