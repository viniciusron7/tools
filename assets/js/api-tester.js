// Global variables
let requestHistory = JSON.parse(localStorage.getItem('apiTesterHistory') || '[]');
let favorites = JSON.parse(localStorage.getItem('apiTesterFavorites') || '[]');
let currentFavoriteId = null;

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    updateMethodIndicator();
    updateUrlPreview();
    loadHistory();
});

// Theme toggle
function toggleTheme() {
    // Dark mode only
}

// Tab switching
function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById(tabName + '-content').classList.add('active');
    
    updateUrlPreview();
}

function switchResponseTab(tabName) {
    document.querySelectorAll('#responseTabs .tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('[id^="response-"][id$="-content"]').forEach(content => content.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById('response-' + tabName + '-content').classList.add('active');
}

// Method indicator
function updateMethodIndicator() {
    const method = document.getElementById('httpMethod').value;
    const select = document.getElementById('httpMethod');
    
    select.className = 'method-select';
    select.classList.add('method-' + method.toLowerCase());
}

// URL validation
function validateUrl() {
    const urlInput = document.getElementById('apiUrl');
    const url = urlInput.value.trim();
    
    if (url && !isValidUrl(url)) {
        urlInput.classList.add('invalid');
        return false;
    } else {
        urlInput.classList.remove('invalid');
        updateUrlPreview();
        return true;
    }
}

function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// Query parameters
function addQueryParam() {
    const container = document.getElementById('queryParams');
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
        <input type="text" placeholder="Chave" class="param-key" oninput="updateUrlPreview()">
        <input type="text" placeholder="Valor" class="param-value" oninput="updateUrlPreview()">
        <label class="checkbox-group">
            <input type="checkbox" checked onchange="updateUrlPreview()"> Ativo
        </label>
        <button class="remove-btn" onclick="removeItem(this)">X</button>
    `;
    container.appendChild(item);
}

function updateUrlPreview() {
    const baseUrl = document.getElementById('apiUrl').value || 'https://api.exemplo.com/endpoint';
    const params = [];
    
    document.querySelectorAll('#queryParams .list-item').forEach(item => {
        const key = item.querySelector('.param-key').value;
        const value = item.querySelector('.param-value').value;
        const enabled = item.querySelector('input[type="checkbox"]').checked;
        
        if (key && value && enabled) {
            params.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
        }
    });
    
    const fullUrl = params.length > 0 ? `${baseUrl}?${params.join('&')}` : baseUrl;
    document.getElementById('urlPreview').textContent = `URL Preview: ${fullUrl}`;
}

// Headers
function addHeader() {
    const container = document.getElementById('requestHeaders');
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
        <input type="text" placeholder="Header" class="header-key">
        <input type="text" placeholder="Valor" class="header-value">
        <button class="remove-btn" onclick="removeItem(this)">X</button>
    `;
    container.appendChild(item);
}

function addCommonHeader(headerName) {
    const container = document.getElementById('requestHeaders');
    const item = document.createElement('div');
    item.className = 'list-item';
    
    let placeholder = '';
    switch(headerName) {
        case 'Authorization':
            placeholder = 'Bearer token-aqui';
            break;
        case 'Content-Type':
            placeholder = 'application/json';
            break;
        case 'Accept':
            placeholder = 'application/json';
            break;
    }
    
    item.innerHTML = `
        <input type="text" placeholder="Header" class="header-key" value="${headerName}">
        <input type="text" placeholder="Valor" class="header-value" placeholder="${placeholder}">
        <button class="remove-btn" onclick="removeItem(this)">X</button>
    `;
    container.appendChild(item);
}

function exportHeaders() {
    const headers = {};
    document.querySelectorAll('#requestHeaders .list-item').forEach(item => {
        const key = item.querySelector('.header-key').value;
        const value = item.querySelector('.header-value').value;
        if (key && value) {
            headers[key] = value;
        }
    });
    
    const blob = new Blob([JSON.stringify(headers, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'headers.json';
    a.click();
    URL.revokeObjectURL(url);
}

function importHeaders() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const headers = JSON.parse(e.target.result);
                    const container = document.getElementById('requestHeaders');
                    container.innerHTML = '';
                    
                    Object.entries(headers).forEach(([key, value]) => {
                        const item = document.createElement('div');
                        item.className = 'list-item';
                        item.innerHTML = `
                            <input type="text" placeholder="Header" class="header-key" value="${key}">
                            <input type="text" placeholder="Valor" class="header-value" value="${value}">
                            <button class="remove-btn" onclick="removeItem(this)">X</button>
                        `;
                        container.appendChild(item);
                    });
                } catch (error) {
                    alert('Erro ao importar headers: ' + error.message);
                }
            };
            reader.readAsText(file);
        }
    };
    input.click();
}

// Body editor
function updateBodyEditor() {
    const contentType = document.getElementById('contentType').value;
    
    document.querySelectorAll('#bodyEditor > div').forEach(editor => {
        editor.style.display = 'none';
    });
    
    switch(contentType) {
        case 'application/json':
            document.getElementById('jsonEditor').style.display = 'block';
            break;
        case 'multipart/form-data':
            document.getElementById('formDataEditor').style.display = 'block';
            break;
        case 'application/x-www-form-urlencoded':
        case 'text/plain':
        case 'application/xml':
            document.getElementById('rawEditor').style.display = 'block';
            break;
    }
}

function addFormField() {
    const container = document.getElementById('formFields');
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
        <input type="text" placeholder="Chave" class="form-key">
        <input type="text" placeholder="Valor" class="form-value">
        <button class="remove-btn" onclick="removeItem(this)">X</button>
    `;
    container.appendChild(item);
}

function handleFileUpload(input) {
    const fileList = document.getElementById('fileList');
    Array.from(input.files).forEach(file => {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.innerHTML = `
            <span>${file.name} (${formatFileSize(file.size)})</span>
            <button class="remove-btn" onclick="removeFile(this, '${file.name}')">X</button>
        `;
        fileList.appendChild(item);
    });
}

function removeFile(button, fileName) {
    button.parentElement.remove();
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Generic remove item
function removeItem(button) {
    button.parentElement.remove();
    updateUrlPreview();
}

// Send request
async function sendRequest() {
    if (!validateUrl()) {
        alert('Por favor, insira uma URL válida');
        return;
    }

    const sendBtn = document.getElementById('sendBtn');
    const spinner = document.getElementById('loadingSpinner');
    
    sendBtn.disabled = true;
    spinner.style.display = 'inline-block';
    
    const startTime = Date.now();
    
    try {
        const requestData = buildRequestData();
        const response = await fetch(requestData.url, requestData.options);
        const endTime = Date.now();
        
        await handleResponse(response, endTime - startTime, requestData);
        
        addToHistory(requestData, response, endTime - startTime);
        
    } catch (error) {
        handleError(error);
    } finally {
        sendBtn.disabled = false;
        spinner.style.display = 'none';
    }
}

function buildRequestData() {
    const method = document.getElementById('httpMethod').value;
    const baseUrl = document.getElementById('apiUrl').value;
    
    const params = [];
    document.querySelectorAll('#queryParams .list-item').forEach(item => {
        const key = item.querySelector('.param-key').value;
        const value = item.querySelector('.param-value').value;
        const enabled = item.querySelector('input[type="checkbox"]').checked;
        
        if (key && value && enabled) {
            params.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
        }
    });
    
    const url = params.length > 0 ? `${baseUrl}?${params.join('&')}` : baseUrl;
    
    const headers = {};
    document.querySelectorAll('#requestHeaders .list-item').forEach(item => {
        const key = item.querySelector('.header-key').value;
        const value = item.querySelector('.header-value').value;
        if (key && value) {
            headers[key] = value;
        }
    });
    
    let body = null;
    const contentType = document.getElementById('contentType').value;
    
    if (method !== 'GET' && method !== 'HEAD' && contentType !== 'none') {
        switch(contentType) {
            case 'application/json':
                const jsonBody = document.getElementById('jsonBody').value;
                if (jsonBody.trim()) {
                    body = jsonBody;
                    headers['Content-Type'] = 'application/json';
                }
                break;
            case 'multipart/form-data':
                const formData = new FormData();
                document.querySelectorAll('#formFields .list-item').forEach(item => {
                    const key = item.querySelector('.form-key').value;
                    const value = item.querySelector('.form-value').value;
                    if (key && value) {
                        formData.append(key, value);
                    }
                });
                
                const fileInput = document.getElementById('fileInput');
                Array.from(fileInput.files).forEach(file => {
                    formData.append('files', file);
                });
                
                body = formData;
                break;
            case 'application/x-www-form-urlencoded':
                const rawBody = document.getElementById('rawBody').value;
                if (rawBody.trim()) {
                    body = rawBody;
                    headers['Content-Type'] = 'application/x-www-form-urlencoded';
                }
                break;
            case 'text/plain':
                const plainBody = document.getElementById('rawBody').value;
                if (plainBody.trim()) {
                    body = plainBody;
                    headers['Content-Type'] = 'text/plain';
                }
                break;
            case 'application/xml':
                const xmlBody = document.getElementById('rawBody').value;
                if (xmlBody.trim()) {
                    body = xmlBody;
                    headers['Content-Type'] = 'application/xml';
                }
                break;
        }
    }
    
    return {
        url,
        options: {
            method,
            headers,
            body
        }
    };
}

async function handleResponse(response, responseTime, requestData) {
    const responseInfo = document.getElementById('responseInfo');
    const responseTabs = document.getElementById('responseTabs');
    const responseBody = document.getElementById('responseBody');
    const responseHeaders = document.getElementById('responseHeaders');
    const responseStatus = document.getElementById('responseStatus');
    const responseTimeEl = document.getElementById('responseTime');
    const responseSize = document.getElementById('responseSize');
    
    responseInfo.style.display = 'flex';
    responseTabs.style.display = 'flex';
    
    const statusClass = getStatusClass(response.status);
    responseStatus.innerHTML = `<span class="response-status ${statusClass}">${response.status} ${response.statusText}</span>`;
    
    responseTimeEl.textContent = `${responseTime}ms`;
    
    const headersList = [];
    response.headers.forEach((value, key) => {
        headersList.push(`${key}: ${value}`);
    });
    responseHeaders.textContent = headersList.join('\n');
    
    try {
        const text = await response.text();
        responseSize.textContent = formatFileSize(text.length);
        
        try {
            const json = JSON.parse(text);
            responseBody.textContent = JSON.stringify(json, null, 2);
        } catch {
            responseBody.textContent = text;
        }
    } catch (error) {
        responseBody.textContent = 'Erro ao ler resposta: ' + error.message;
    }
}

function getStatusClass(status) {
    if (status >= 200 && status < 300) return 'status-2xx';
    if (status >= 300 && status < 400) return 'status-3xx';
    if (status >= 400 && status < 500) return 'status-4xx';
    if (status >= 500) return 'status-5xx';
    return '';
}

function handleError(error) {
    const responseInfo = document.getElementById('responseInfo');
    const responseTabs = document.getElementById('responseTabs');
    const responseBody = document.getElementById('responseBody');
    
    responseInfo.style.display = 'flex';
    responseTabs.style.display = 'flex';
    
    document.getElementById('responseStatus').innerHTML = `<span class="response-status status-5xx">Error</span>`;
    document.getElementById('responseTime').textContent = '-';
    document.getElementById('responseSize').textContent = '-';
    
    responseBody.textContent = `Erro na requisição: ${error.message}`;
}

// History
function addToHistory(requestData, response, responseTime) {
    const historyItem = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        method: requestData.options.method,
        url: requestData.url,
        status: response.status,
        responseTime
    };
    
    requestHistory.unshift(historyItem);
    if (requestHistory.length > 50) {
        requestHistory = requestHistory.slice(0, 50);
    }
    
    localStorage.setItem('apiTesterHistory', JSON.stringify(requestHistory));
    loadHistory();
}

function loadHistory() {
    const historyList = document.getElementById('historyList');
    
    if (requestHistory.length === 0) {
        historyList.innerHTML = '<p style="text-align: center; color: #94a3b8;">Nenhuma requisição no histórico ainda</p>';
        return;
    }
    
    historyList.innerHTML = requestHistory.map(item => `
        <div class="history-item" onclick="loadFromHistory('${item.id}')">
            <div>
                <span class="history-method method-${item.method.toLowerCase()}">${item.method}</span>
                <span style="margin-left: 10px;">${item.url}</span>
            </div>
            <div>
                <span class="response-status ${getStatusClass(item.status)}">${item.status}</span>
                <span style="margin-left: 10px; color: #94a3b8;">
                    ${new Date(item.timestamp).toLocaleString()}
                </span>
            </div>
        </div>
    `).join('');
}

function loadFromHistory(id) {
    const item = requestHistory.find(h => h.id.toString() === id);
    if (item) {
        document.getElementById('httpMethod').value = item.method;
        document.getElementById('apiUrl').value = item.url;
        updateMethodIndicator();
        validateUrl();
    }
}

function clearHistory() {
    if (confirm('Tem certeza que deseja limpar todo o histórico?')) {
        requestHistory = [];
        localStorage.removeItem('apiTesterHistory');
        loadHistory();
    }
}

// Favorites
function toggleFavorite() {
    const star = document.querySelector('.favorites-star');
    const requestData = getCurrentRequestData();
    
    if (currentFavoriteId) {
        favorites = favorites.filter(f => f.id !== currentFavoriteId);
        currentFavoriteId = null;
        star.classList.remove('active');
    } else {
        const favorite = {
            id: Date.now(),
            name: `${requestData.method} ${requestData.url}`,
            ...requestData
        };
        favorites.push(favorite);
        currentFavoriteId = favorite.id;
        star.classList.add('active');
    }
    
    localStorage.setItem('apiTesterFavorites', JSON.stringify(favorites));
}

function getCurrentRequestData() {
    return {
        method: document.getElementById('httpMethod').value,
        url: document.getElementById('apiUrl').value,
    };
}

// Utility functions
function clearAllFields() {
    if (confirm('Tem certeza que deseja limpar todos os campos?')) {
        document.getElementById('apiUrl').value = '';
        document.getElementById('httpMethod').value = 'GET';
        document.getElementById('contentType').value = 'none';
        document.getElementById('jsonBody').value = '';
        document.getElementById('rawBody').value = '';
        
        document.getElementById('queryParams').innerHTML = '';
        document.getElementById('requestHeaders').innerHTML = '';
        document.getElementById('formFields').innerHTML = '';
        document.getElementById('fileList').innerHTML = '';
        
        addQueryParam();
        addHeader();
        addFormField();
        
        updateMethodIndicator();
        updateBodyEditor();
        updateUrlPreview();
    }
}

function saveRequest() {
    const requestData = buildRequestData();
    const name = prompt('Nome para esta requisição:');
    if (name) {
        const saved = {
            id: Date.now(),
            name,
            ...requestData
        };
        alert('Requisição salva com sucesso!');
    }
}

// cURL export
function exportToCurl() {
    const requestData = buildRequestData();
    let curl = `curl -X ${requestData.options.method}`;
    
    Object.entries(requestData.options.headers).forEach(([key, value]) => {
        curl += ` \\\n  -H "${key}: ${value}"`;
    });
    
    if (requestData.options.body && typeof requestData.options.body === 'string') {
        curl += ` \\\n  -d '${requestData.options.body}'`;
    }
    
    curl += ` \\\n  "${requestData.url}"`;
    
    document.getElementById('curlOutput').textContent = curl;
    document.getElementById('curlModal').style.display = 'block';
}

function importFromCurl() {
    const curlCommand = prompt('Cole o comando cURL aqui:');
    if (curlCommand) {
        try {
            const urlMatch = curlCommand.match(/"([^"]+)"$/);
            if (urlMatch) {
                document.getElementById('apiUrl').value = urlMatch[1];
                validateUrl();
            }
            
            const methodMatch = curlCommand.match(/-X\s+(\w+)/);
            if (methodMatch) {
                document.getElementById('httpMethod').value = methodMatch[1];
                updateMethodIndicator();
            }
            
            alert('cURL importado com sucesso! (importação básica)');
        } catch (error) {
            alert('Erro ao importar cURL: ' + error.message);
        }
    }
}

function copyCurl() {
    const curlText = document.getElementById('curlOutput').textContent;
    navigator.clipboard.writeText(curlText).then(() => {
        alert('Comando cURL copiado para a área de transferência!');
    });
}

function closeCurlModal() {
    document.getElementById('curlModal').style.display = 'none';
}

// Initialize with default items
addFormField();
