        let jsonStructure = {};
        let currentPath = [];
        let history = [];
        let historyIndex = -1;
        let elementIdCounter = 0;
        let moveData = null;
        let selectedDestination = null;
        
        // Variáveis para seleção múltipla
        let selectionMode = false;
        let selectedElements = [];
        let multiMoveData = [];

        // Variáveis para drag-and-drop
        let dragSourcePath = null;
        let dragSourceKey = null;

        // Limite de histórico para evitar uso excessivo de memória
        const MAX_HISTORY = 100;

        // Helper para escapar HTML em exibições
        function escapeHtml(str) {
            return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        // Salvar estado no histórico
        function saveState() {
            history = history.slice(0, historyIndex + 1);
            history.push({
                structure: JSON.parse(JSON.stringify(jsonStructure)),
                path: [...currentPath]
            });
            historyIndex++;
            // Limitar tamanho do histórico
            if (history.length > MAX_HISTORY) {
                history = history.slice(history.length - MAX_HISTORY);
                historyIndex = history.length - 1;
            }
            updateUndoRedoButtons();
        }

        // Atualizar botões de desfazer/refazer
        function updateUndoRedoButtons() {
            document.getElementById('undoBtn').disabled = historyIndex <= 0;
            document.getElementById('redoBtn').disabled = historyIndex >= history.length - 1;
        }

        // Desfazer
        function undo() {
            if (historyIndex > 0) {
                historyIndex--;
                const state = history[historyIndex];
                jsonStructure = JSON.parse(JSON.stringify(state.structure));
                currentPath = [...state.path];
                updateBuilder();
                updatePreview();
                updateUndoRedoButtons();
            }
        }

        // Refazer
        function redo() {
            if (historyIndex < history.length - 1) {
                historyIndex++;
                const state = history[historyIndex];
                jsonStructure = JSON.parse(JSON.stringify(state.structure));
                currentPath = [...state.path];
                updateBuilder();
                updatePreview();
                updateUndoRedoButtons();
            }
        }

        // Funções de seleção múltipla
        function toggleSelectionMode() {
            selectionMode = !selectionMode;
            const btn = document.getElementById('selectionBtn');
            const controls = document.getElementById('multiSelectionControls');
            
            if (selectionMode) {
                btn.textContent = 'Sair Seleção';
                btn.classList.add('selection-mode');
                controls.classList.add('active');
                selectedElements = [];
                updateSelectedCount();
                showToast('Modo seleção múltipla ativado. Clique nos elementos para selecioná-los.', 'success');
            } else {
                btn.textContent = 'Seleção Múltipla';
                btn.classList.remove('selection-mode');
                controls.classList.remove('active');
                clearSelection();
                showToast('Modo seleção múltipla desativado.', 'success');
            }
        }

        function selectElement(elementId, path, key) {
            if (!selectionMode) return;
            
            const element = document.getElementById(elementId);
            if (!element) return;
            
            const index = selectedElements.findIndex(sel => sel.elementId === elementId);
            
            if (index > -1) {
                // Desselecionar este e todos os filhos dentro dele
                selectedElements.splice(index, 1);
                element.classList.remove('selected');
                // Desselecionar filhos aninhados
                const childElements = element.querySelectorAll('.json-element');
                childElements.forEach(child => {
                    const childId = child.getAttribute('data-element-id');
                    const childIdx = selectedElements.findIndex(sel => sel.elementId === childId);
                    if (childIdx > -1) {
                        selectedElements.splice(childIdx, 1);
                        child.classList.remove('selected');
                    }
                });
            } else {
                // Selecionar este elemento
                selectedElements.push({ 
                    elementId, 
                    path: path, 
                    key: key 
                });
                element.classList.add('selected');
                // Selecionar todos os filhos aninhados automaticamente
                const childElements = element.querySelectorAll('.json-element');
                childElements.forEach(child => {
                    const childId = child.getAttribute('data-element-id');
                    const childPathStr = child.getAttribute('data-element-path');
                    const childKey = child.getAttribute('data-element-key');
                    if (childId && !selectedElements.find(sel => sel.elementId === childId)) {
                        try {
                            const childPath = JSON.parse(childPathStr);
                            selectedElements.push({ elementId: childId, path: childPath, key: childKey });
                            child.classList.add('selected');
                        } catch(e) {}
                    }
                });
            }
            
            updateSelectedCount();
        }

        function updateSelectedCount() {
            const count = selectedElements.length;
            document.getElementById('selectedCount').textContent = `${count} elemento${count !== 1 ? 's' : ''} selecionado${count !== 1 ? 's' : ''}`;
        }

        function clearSelection() {
            selectedElements.forEach(sel => {
                const element = document.getElementById(sel.elementId);
                if (element) element.classList.remove('selected');
            });
            selectedElements = [];
            updateSelectedCount();
        }

        function selectAll() {
            if (!selectionMode) return;
            
            clearSelection();
            document.querySelectorAll('.json-element').forEach(element => {
                const elementId = element.getAttribute('data-element-id');
                const pathStr = element.getAttribute('data-element-path');
                const key = element.getAttribute('data-element-key');
                
                if (elementId && pathStr && key !== null) {
                    try {
                        const path = JSON.parse(pathStr);
                        
                        selectedElements.push({ 
                            elementId, 
                            path: path, 
                            key: key 
                        });
                        element.classList.add('selected');
                    } catch (error) {
                        console.error('Erro ao selecionar elemento:', error);
                    }
                }
            });
            updateSelectedCount();
        }

        function removeSelectedElements() {
            if (selectedElements.length === 0) {
                showToast('Nenhum elemento selecionado.', 'error');
                return;
            }

            if (confirm(`Tem certeza que deseja remover ${selectedElements.length} elemento(s) selecionado(s)?`)) {
                saveState();
                
                try {
                    // Filtrar: só remover pais de nível mais alto (filhos vão junto)
                    const topLevel = filterTopLevelSelected();
                    // Ordenar por profundidade para remover do mais profundo para o mais raso
                    // e por índice decrescente para arrays
                    const sortedElements = topLevel.sort((a, b) => {
                        const depthDiff = b.path.length - a.path.length;
                        if (depthDiff !== 0) return depthDiff;
                        
                        // Se estão na mesma profundidade e são arrays, ordenar por índice decrescente
                        const aParent = getParentObject(a.path);
                        if (Array.isArray(aParent)) {
                            return parseInt(b.key) - parseInt(a.key);
                        }
                        return 0;
                    });
                    
                    sortedElements.forEach(sel => {
                        try {
                            removeElementFromStructure(sel.path, sel.key);
                        } catch (error) {
                            console.error('Erro ao remover elemento:', error, sel);
                        }
                    });
                    
                    clearSelection();
                    updateBuilder();
                    updatePreview();
                    showToast(`${sortedElements.length} elemento(s) removido(s) com sucesso.`, 'success');
                    
                } catch (error) {
                    console.error('Erro na remoção múltipla:', error);
                    showToast('Erro ao remover alguns elementos.', 'error');
                }
            }
        }

        // Função auxiliar para obter o objeto pai
        function getParentObject(path) {
            let obj = jsonStructure;
            for (let i = 0; i < path.length; i++) {
                obj = obj[path[i]];
            }
            return obj;
        }

        // Filtra elementos selecionados removendo filhos de pais que já estão selecionados
        function filterTopLevelSelected() {
            return selectedElements.filter(sel => {
                const selFullPath = [...sel.path, sel.key];
                // Verificar se algum outro selecionado é ancestral deste
                return !selectedElements.some(other => {
                    if (other.elementId === sel.elementId) return false;
                    const otherFullPath = [...other.path, other.key];
                    // other é ancestral de sel se otherFullPath é prefixo de selFullPath
                    if (otherFullPath.length >= selFullPath.length) return false;
                    return otherFullPath.every((part, i) => String(part) === String(selFullPath[i]));
                });
            });
        }

        function moveSelectedElements() {
            if (selectedElements.length === 0) {
                showToast('Nenhum elemento selecionado.', 'error');
                return;
            }

            // Filtrar: só mover pais de nível mais alto (filhos vão junto)
            const topLevel = filterTopLevelSelected();

            // Preparar dados para movimento múltiplo
            multiMoveData = topLevel.map(sel => {
                try {
                    return {
                        path: sel.path,
                        key: sel.key,
                        element: getElementByPath(sel.path, sel.key)
                    };
                } catch (error) {
                    console.error('Erro ao obter elemento:', error, sel);
                    return null;
                }
            }).filter(item => item !== null); // Filtrar itens inválidos

            if (multiMoveData.length === 0) {
                showToast('Erro ao preparar elementos para movimento.', 'error');
                return;
            }

            // Limpar dados de movimento único
            moveData = null;
            
            showMultiMoveModal();
        }

        function showMultiMoveModal() {
            const modal = document.getElementById('moveModal');
            const breadcrumb = document.getElementById('moveBreadcrumb');
            const selector = document.getElementById('locationSelector');
            
            breadcrumb.textContent = `Movendo ${multiMoveData.length} elemento(s) selecionado(s)`;
            generateLocationOptions(selector);
            modal.style.display = 'flex';
        }

        function confirmMultiMove() {
            if (!multiMoveData || multiMoveData.length === 0 || !selectedDestination) return;
            
            try {
                saveState();
                
                // Coletar elementos e remover do local original (ordenar por profundidade decrescente para evitar problemas de índice)
                const sortedData = multiMoveData.sort((a, b) => {
                    // Primeiro por profundidade (mais profundo primeiro)
                    const depthDiff = b.path.length - a.path.length;
                    if (depthDiff !== 0) return depthDiff;
                    
                    // Depois por índice (maior primeiro, se forem arrays)
                    const aParent = getParentObject(a.path);
                    if (Array.isArray(aParent)) {
                        return parseInt(b.key) - parseInt(a.key);
                    }
                    return 0;
                });
                
                const elementsToMove = sortedData.map(data => ({
                    key: data.key,
                    element: JSON.parse(JSON.stringify(data.element))
                }));
                
                // Remover elementos originais
                sortedData.forEach(data => {
                    removeElementFromStructure(data.path, data.key);
                });
                
                // Adicionar elementos no novo destino
                elementsToMove.forEach(item => {
                    addElementToDestination(selectedDestination, item.key, item.element);
                });
                
                clearSelection();
                multiMoveData = [];
                updateBuilder();
                updatePreview();
                closeModal('moveModal');
                showToast(`${elementsToMove.length} elemento(s) movido(s) com sucesso!`, 'success');
                
            } catch (error) {
                console.error('Erro ao mover elementos:', error);
                showToast('Erro ao mover elementos: ' + error.message, 'error');
            }
        }

        function startMove(path, key, elementType) {
            moveData = {
                path: path,
                key: key,
                type: elementType,
                element: getElementByPath(path, key)
            };
            
            showMoveModal();
        }

        // Obter elemento por caminho
        function getElementByPath(path, key) {
            try {
                let obj = jsonStructure;
                for (let i = 0; i < path.length; i++) {
                    if (obj === null || obj === undefined) {
                        throw new Error(`Caminho inválido no índice ${i}`);
                    }
                    obj = obj[path[i]];
                }
                
                if (obj === null || obj === undefined) {
                    throw new Error('Objeto pai não encontrado');
                }
                
                // Verificar se key é um número (para arrays) ou string
                const keyToUse = Array.isArray(obj) ? parseInt(key) : key;
                
                return obj[keyToUse];
            } catch (error) {
                console.error('Erro em getElementByPath:', error, { path, key });
                throw error;
            }
        }

        // Mostrar modal de movimento
        function showMoveModal() {
            if (!moveData) return;
            
            const modal = document.getElementById('moveModal');
            const breadcrumb = document.getElementById('moveBreadcrumb');
            const selector = document.getElementById('locationSelector');
            
            // Atualizar breadcrumb
            const pathStr = moveData.path.length > 0 ? moveData.path.join(' → ') : 'Raiz';
            breadcrumb.textContent = `Movendo: ${pathStr} → ${moveData.key}`;
            
            // Gerar opções de destino
            generateLocationOptions(selector);
            
            modal.style.display = 'flex';
        }

        // Gerar opções de localização
        function generateLocationOptions(container) {
            container.innerHTML = '';
            selectedDestination = null;
            document.getElementById('confirmMoveBtn').disabled = true;
            
            // Adicionar opção de raiz
            const rootOption = document.createElement('div');
            rootOption.className = 'location-option';
            rootOption.textContent = 'Raiz do JSON';
            rootOption.onclick = () => selectDestination([], 'root', rootOption);
            container.appendChild(rootOption);
            
            // Adicionar outras opções recursivamente
            addLocationOptionsRecursive(jsonStructure, [], container, 0);
        }

        // Adicionar opções de localização recursivamente
        function addLocationOptionsRecursive(obj, path, container, depth) {
            const indent = '　'.repeat(depth);
            
            Object.keys(obj).forEach(key => {
                const value = obj[key];
                const currentPath = [...path, key];
                
                // Verificar se não é o próprio elemento sendo movido (movimento único)
                if (moveData && JSON.stringify(currentPath) === JSON.stringify([...moveData.path, moveData.key])) {
                    return;
                }
                
                // Verificar se não é um dos elementos sendo movidos (movimento múltiplo)
                if (multiMoveData && multiMoveData.length > 0) {
                    const isBeingMoved = multiMoveData.some(data => 
                        JSON.stringify(currentPath) === JSON.stringify([...data.path, data.key])
                    );
                    if (isBeingMoved) return;
                }
                
                // Verificar se não é um caminho pai do elemento sendo movido (movimento único)
                if (moveData) {
                    const movePath = [...moveData.path, moveData.key];
                    const isChildOfMoved = currentPath.length > movePath.length ? false :
                        movePath.slice(0, currentPath.length).every((p, i) => String(p) === String(currentPath[i]));
                    // Não bloquear pais, apenas o próprio elemento (já filtrado acima)
                }
                
                // Verificar se não é um caminho pai de algum elemento sendo movido (movimento múltiplo)
                if (multiMoveData && multiMoveData.length > 0) {
                    const isParentOfAny = multiMoveData.some(data => {
                        const movePath = [...data.path, data.key];
                        return currentPath.length < movePath.length &&
                            movePath.slice(0, currentPath.length).every((p, i) => String(p) === String(currentPath[i]));
                    });
                    // Pais não são bloqueados como destino
                }
                
                if (Array.isArray(value)) {
                    const option = document.createElement('div');
                    option.className = 'location-option';
                    option.innerHTML = `${indent}${escapeHtml(key)} (Array)`;
                    option.onclick = () => selectDestination(currentPath, 'array', option);
                    container.appendChild(option);
                    
                    // Adicionar opções dos elementos do array
                    value.forEach((item, index) => {
                        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
                            const itemPath = [...currentPath, index];
                            const itemOption = document.createElement('div');
                            itemOption.className = 'location-option';
                            itemOption.innerHTML = `${indent}　[${index}] (Objeto)`;
                            itemOption.onclick = () => selectDestination(itemPath, 'object', itemOption);
                            container.appendChild(itemOption);
                            
                            // Recursão para objetos dentro de arrays
                            addLocationOptionsRecursive(item, itemPath, container, depth + 2);
                        } else if (Array.isArray(item)) {
                            const itemPath = [...currentPath, index];
                            const itemOption = document.createElement('div');
                            itemOption.className = 'location-option';
                            itemOption.innerHTML = `${indent}　[${index}] (Array)`;
                            itemOption.onclick = () => selectDestination(itemPath, 'array', itemOption);
                            container.appendChild(itemOption);
                            
                            // Recursão para arrays aninhados
                            addLocationOptionsRecursive(item, itemPath, container, depth + 2);
                        }
                    });
                    
                } else if (typeof value === 'object' && value !== null) {
                    const option = document.createElement('div');
                    option.className = 'location-option';
                    option.innerHTML = `${indent}${escapeHtml(key)} (Objeto)`;
                    option.onclick = () => selectDestination(currentPath, 'object', option);
                    container.appendChild(option);
                    
                    // Recursão para objetos aninhados
                    addLocationOptionsRecursive(value, currentPath, container, depth + 1);
                }
            });
        }

        // Selecionar destino
        function selectDestination(path, type, element) {
            // Remover seleção anterior
            document.querySelectorAll('.location-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            
            // Adicionar seleção atual
            element.classList.add('selected');
            
            selectedDestination = { path, type };
            document.getElementById('confirmMoveBtn').disabled = false;
        }

        // Confirmar movimento
        function confirmMove() {
            // Despachar para movimento múltiplo se necessário
            if (multiMoveData && multiMoveData.length > 0 && selectedDestination) {
                confirmMultiMove();
                return;
            }
            if (!moveData || !selectedDestination) return;
            
            try {
                saveState();
                
                // Obter o elemento a ser movido
                const elementToMove = JSON.parse(JSON.stringify(moveData.element));
                
                // Remover do local original
                removeElementFromStructure(moveData.path, moveData.key);
                
                // Adicionar no novo local
                addElementToDestination(selectedDestination, moveData.key, elementToMove);
                
                // Atualizar interface
                updateBuilder();
                updatePreview();
                closeModal('moveModal');
                showToast('Elemento movido com sucesso!', 'success');
                
            } catch (error) {
                showToast('Erro ao mover elemento: ' + error.message, 'error');
            }
            
            moveData = null;
            selectedDestination = null;
        }

        // Remover elemento da estrutura
        function removeElementFromStructure(path, key) {
            try {
                let obj = jsonStructure;
                for (let i = 0; i < path.length; i++) {
                    obj = obj[path[i]];
                }
                
                if (Array.isArray(obj)) {
                    const index = parseInt(key);
                    if (index >= 0 && index < obj.length) {
                        obj.splice(index, 1);
                    }
                } else {
                    delete obj[key];
                }
            } catch (error) {
                console.error('Erro ao remover elemento:', error, { path, key });
                throw error;
            }
        }

        // Adicionar elemento ao destino
        function addElementToDestination(destination, originalKey, element) {
            try {
                let targetObj = jsonStructure;
                
                // Navegar até o destino
                for (let i = 0; i < destination.path.length; i++) {
                    targetObj = targetObj[destination.path[i]];
                }
                
                if (destination.type === 'array') {
                    if (Array.isArray(targetObj)) {
                        targetObj.push(element);
                    } else {
                        throw new Error('Destino não é um array');
                    }
                } else if (destination.type === 'object') {
                    if (typeof targetObj === 'object' && targetObj !== null && !Array.isArray(targetObj)) {
                        // Verificar se a chave já existe e gerar uma nova se necessário
                        let newKey = originalKey;
                        let counter = 1;
                        while (targetObj[newKey] !== undefined) {
                            newKey = `${originalKey}_${counter}`;
                            counter++;
                        }
                        targetObj[newKey] = element;
                    } else {
                        throw new Error('Destino não é um objeto');
                    }
                } else if (destination.type === 'root') {
                    // Adicionar na raiz
                    let newKey = originalKey;
                    let counter = 1;
                    while (jsonStructure[newKey] !== undefined) {
                        newKey = `${originalKey}_${counter}`;
                        counter++;
                    }
                    jsonStructure[newKey] = element;
                }
            } catch (error) {
                console.error('Erro ao adicionar elemento ao destino:', error, { destination, originalKey, element });
                throw error;
            }
        }

        // Mostrar modal de importação
        function showImportModal() {
            document.getElementById('importModal').style.display = 'flex';
            document.getElementById('jsonInput').value = '';
            document.getElementById('fileName').textContent = '';
            document.getElementById('importError').style.display = 'none';
            document.getElementById('jsonInput').focus();
        }

        // Lidar com seleção de arquivo
        function handleFileSelect(event) {
            const file = event.target.files[0];
            if (file) {
                document.getElementById('fileName').textContent = file.name;
                
                const reader = new FileReader();
                reader.onload = function(e) {
                    document.getElementById('jsonInput').value = e.target.result;
                };
                reader.onerror = function() {
                    showImportError('Erro ao ler o arquivo');
                };
                reader.readAsText(file);
            }
        }

        // Mostrar erro de importação
        function showImportError(message) {
            const errorDiv = document.getElementById('importError');
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        }

        // Importar JSON
        function importJSON() {
            const jsonInput = document.getElementById('jsonInput').value.trim();
            
            if (!jsonInput) {
                showImportError('Por favor, cole um JSON ou selecione um arquivo');
                return;
            }

            try {
                const parsedJSON = JSON.parse(jsonInput);
                
                if (typeof parsedJSON !== 'object' || parsedJSON === null) {
                    showImportError('O JSON deve ser um objeto ou array');
                    return;
                }
                
                if (Object.keys(jsonStructure).length > 0 && !Array.isArray(jsonStructure) && !Array.isArray(parsedJSON)) {
                    if (confirm('Deseja substituir o JSON atual? Clique em "Cancelar" para mesclar com o existente.')) {
                        saveState();
                        jsonStructure = parsedJSON;
                    } else {
                        saveState();
                        Object.assign(jsonStructure, parsedJSON);
                    }
                } else {
                    saveState();
                    jsonStructure = parsedJSON;
                }
                
                currentPath = [];
                closeModal('importModal');
                updateBuilder();
                updatePreview();
                showToast('JSON importado com sucesso!', 'success');
                
            } catch (error) {
                showImportError('JSON inválido: ' + error.message);
            }
        }

        // Obter objeto atual baseado no caminho
        function getCurrentObject() {
            let obj = jsonStructure;
            for (let key of currentPath) {
                obj = obj[key];
            }
            return obj;
        }

        // Mostrar modais de adição
        function showAddArrayModal() {
            document.getElementById('arrayModal').style.display = 'flex';
            document.getElementById('arrayName').value = '';
            document.getElementById('arrayName').focus();
        }

        function showAddKeyValueModal() {
            document.getElementById('keyValueModal').style.display = 'flex';
            document.getElementById('keyName').value = '';
            document.getElementById('valueType').value = 'string';
            updateValueInput();
            document.getElementById('keyName').focus();
        }

        function showAddObjectModal() {
            const modal = document.getElementById('objectModal');
            const current = getCurrentObject();
            const isArray = Array.isArray(current);
            
            // Ajustar o modal baseado no contexto
            const modalBody = modal.querySelector('.modal-body');
            if (isArray) {
                modalBody.innerHTML = `
                    <p style="color: #666; font-size: 14px;">
                        Um objeto vazio será adicionado ao array. Você pode adicionar propriedades a ele posteriormente.
                    </p>
                `;
            } else {
                modalBody.innerHTML = `
                    <div class="input-group">
                        <input type="text" id="objectName" placeholder="Nome do objeto (ex: usuario, config)">
                    </div>
                    <p style="margin-top: 10px; color: #666; font-size: 14px;">
                        Um objeto vazio será adicionado. Você pode adicionar propriedades a ele posteriormente.
                    </p>
                `;
            }
            
            modal.style.display = 'flex';
            
            if (!isArray) {
                document.getElementById('objectName').value = '';
                document.getElementById('objectName').focus();
            }
        }

        // Fechar modal
        function closeModal(modalId) {
            document.getElementById(modalId).style.display = 'none';
            
            // Limpar dados de movimento quando fechar modal de movimento
            if (modalId === 'moveModal') {
                moveData = null;
                multiMoveData = [];
                selectedDestination = null;
            }
        }

        // Atualizar input de valor baseado no tipo
        function updateValueInput() {
            const type = document.getElementById('valueType').value;
            const valueInputGroup = document.getElementById('valueInputGroup');
            const valueInputContainer = document.getElementById('valueInputGroup');
            valueInputContainer.style.display = 'flex';

            let newHtml = '';
            if (type === 'null') {
                valueInputContainer.style.display = 'none';
            } else if (type === 'boolean') {
                newHtml = `
                    <select id="valueInput" class="edit-input" style="flex: 1;">
                        <option value="true">true</option>
                        <option value="false">false</option>
                    </select>
                `;
            } else if (type === 'number') {
                newHtml = `<input type="number" id="valueInput" placeholder="Valor numérico" step="any" class="edit-input" style="flex: 1;">`;
            } else { // string
                newHtml = `<input type="text" id="valueInput" placeholder="Valor" class="edit-input" style="flex: 1;">`;
            }
            valueInputGroup.innerHTML = newHtml;
        }

        // Adicionar array
        function addArray() {
            const arrayName = document.getElementById('arrayName').value.trim();
            if (!arrayName) {
                showToast('Por favor, insira um nome para o array', 'error');
                return;
            }

            const current = getCurrentObject();
            if (current[arrayName] !== undefined) {
                showToast('Já existe uma propriedade com esse nome', 'error');
                return;
            }

            saveState();
            current[arrayName] = [];
            closeModal('arrayModal');
            updateBuilder();
            updatePreview();
            showToast('Array adicionado com sucesso', 'success');
        }

        // Adicionar objeto vazio na raiz ou contexto atual
        function addObject() {
            const objectNameEl = document.getElementById('objectName');
            const objectName = objectNameEl ? objectNameEl.value.trim() : '';
            
            const current = getCurrentObject();
            
            if (Array.isArray(current)) {
                // Se o contexto atual for um array, adicionar objeto sem nome
                saveState();
                current.push({});
                closeModal('objectModal');
                updateBuilder();
                updatePreview();
                showToast('Objeto vazio adicionado ao array', 'success');
            } else {
                // Se for um objeto, necessário nome
                if (!objectName) {
                    showToast('Por favor, insira um nome para o objeto', 'error');
                    return;
                }

                if (current[objectName] !== undefined) {
                    showToast('Já existe uma propriedade com esse nome', 'error');
                    return;
                }

                saveState();
                current[objectName] = {};
                closeModal('objectModal');
                updateBuilder();
                updatePreview();
                showToast('Objeto adicionado com sucesso', 'success');
            }
        }

        // Adicionar key-value
        function addKeyValue() {
            const keyName = document.getElementById('keyName').value.trim();
            const valueType = document.getElementById('valueType').value;
            
            if (!keyName) {
                showToast('Por favor, insira um nome para a chave', 'error');
                return;
            }
            
            let value;
            if (valueType === 'null') {
                value = null;
            } else {
                const valueInput = document.getElementById('valueInput');
                if (valueType === 'number') {
                    value = parseFloat(valueInput.value) || 0;
                } else if (valueType === 'boolean') {
                    value = valueInput.value === 'true';
                } else {
                    value = valueInput.value;
                }
            }

            const current = getCurrentObject();
            if (Array.isArray(current)) {
                const newObj = {};
                newObj[keyName] = value;
                saveState();
                current.push(newObj);
            } else {
                if (current[keyName] !== undefined) {
                    showToast('Já existe uma propriedade com esse nome', 'error');
                    return;
                }
                saveState();
                current[keyName] = value;
            }

            closeModal('keyValueModal');
            updateBuilder();
            updatePreview();
            showToast('Propriedade adicionada com sucesso', 'success');
        }

        // Adicionar valor primitivo diretamente a um array
        function showAddValueToArrayModal(path) {
            currentPath = path;
            document.getElementById('addValueModal').style.display = 'flex';
            document.getElementById('arrayValueType').value = 'string';
            updateArrayValueInput();
            const input = document.getElementById('arrayValueInput');
            if (input) input.focus();
        }

        function updateArrayValueInput() {
            const type = document.getElementById('arrayValueType').value;
            const container = document.getElementById('arrayValueInputGroup');
            container.style.display = 'flex';

            let html = '';
            if (type === 'null') {
                container.style.display = 'none';
            } else if (type === 'boolean') {
                html = `<select id="arrayValueInput" class="edit-input" style="flex: 1;">
                    <option value="true">true</option>
                    <option value="false">false</option>
                </select>`;
            } else if (type === 'number') {
                html = `<input type="number" id="arrayValueInput" placeholder="Valor numérico" step="any" class="edit-input" style="flex: 1;">`;
            } else {
                html = `<input type="text" id="arrayValueInput" placeholder="Valor" class="edit-input" style="flex: 1;">`;
            }
            container.innerHTML = html;
        }

        function addValueToArray() {
            const type = document.getElementById('arrayValueType').value;
            let value;

            if (type === 'null') {
                value = null;
            } else {
                const input = document.getElementById('arrayValueInput');
                if (type === 'number') {
                    value = parseFloat(input.value) || 0;
                } else if (type === 'boolean') {
                    value = input.value === 'true';
                } else {
                    value = input.value;
                }
            }

            const current = getCurrentObject();
            if (Array.isArray(current)) {
                saveState();
                current.push(value);
                closeModal('addValueModal');
                currentPath = [];
                updateBuilder();
                updatePreview();
                showToast('Valor adicionado ao array', 'success');
            } else {
                showToast('O contexto atual não é um array', 'error');
            }
        }

        // Adicionar objeto vazio a um array ou dentro de um objeto existente
        function addEmptyObject() {
            const current = getCurrentObject();
            if (Array.isArray(current)) {
                saveState();
                current.push({});
                closeModal('objectModal');
                updateBuilder();
                updatePreview();
                showToast('Objeto vazio adicionado com sucesso', 'success');
            } else {
                // Se não for array, tratar como adição de objeto nomeado
                addObject();
            }
        }
        
        // Funções de atalho para adicionar elementos aninhados
        function addToArray(path) {
            currentPath = path;
            showAddKeyValueModal();
        }
        function addObjectToArray(path) {
            currentPath = path;
            showAddObjectModal();
        }
        function addNestedArray(path) {
            currentPath = path;
            showAddArrayModal();
        }

        // Remover elemento
        function removeElement(path, key) {
            let obj = jsonStructure;
            for (let i = 0; i < path.length; i++) {
                obj = obj[path[i]];
            }
            
            saveState();
            
            if (Array.isArray(obj)) {
                obj.splice(parseInt(key), 1);
            } else {
                delete obj[key];
            }
            
            updateBuilder();
            updatePreview();
            showToast('Elemento removido', 'success');
        }

        // Atualizar construtor visual
        function updateBuilder() {
            const builder = document.getElementById('jsonBuilder');
            builder.innerHTML = '';
            
            if (Object.keys(jsonStructure).length === 0 && !Array.isArray(jsonStructure)) {
                builder.innerHTML = `
                    <div style="text-align: center; color: #999; padding: 50px;">
                        Clique nos botões acima para começar a construir seu JSON
                    </div>
                `;
                updateElementCount();
                return;
            }

            renderObject(jsonStructure, builder, []);
            updateElementCount();
            
            // Limpar seleção se o modo de seleção estiver ativo
            if (selectionMode) {
                selectedElements = [];
                updateSelectedCount();
            }
        }
        
        // --- INÍCIO DA NOVA LÓGICA DE EDIÇÃO UNIFICADA ---

        // Inicia o processo de edição para qualquer par chave-valor ou item de array.
        function startEditing(button) {
            const elementNode = button.closest('.json-element');
            if (!elementNode) {
                showToast('Não foi possível encontrar o elemento para editar.', 'error');
                return;
            }

            const pathStr = elementNode.getAttribute('data-element-path');
            const keyOrIndex = elementNode.getAttribute('data-element-key');
            const path = JSON.parse(pathStr);

            let parentObject = jsonStructure;
            for (const p of path) {
                parentObject = parentObject[p];
            }
            
            const isArrayItem = Array.isArray(parentObject);
            const currentValue = parentObject[keyOrIndex];
            
            // Verificar se o valor é um objeto ou array complexo
            const isComplexValue = typeof currentValue === 'object' && currentValue !== null;
            
            if (isComplexValue) {
                // Para objetos e arrays, apenas permitir edição do nome/chave
                if (isArrayItem) {
                    showToast('Não é possível editar diretamente arrays ou objetos dentro de arrays. Use os botões específicos para adicionar/remover elementos.', 'error');
                    return;
                }
                startEditingComplexValue(elementNode, path, keyOrIndex, currentValue);
            } else {
                // Para valores primitivos
                startEditingPrimitiveValue(elementNode, path, keyOrIndex, currentValue, isArrayItem);
            }
        }

        // Edição de valores complexos (objetos/arrays) - apenas o nome da chave
        function startEditingComplexValue(elementNode, path, keyOrIndex, currentValue) {
            const elementHeader = elementNode.querySelector('.element-header');
            if (!elementHeader) return;

            elementHeader.setAttribute('data-original-html', elementHeader.innerHTML);

            const valueType = Array.isArray(currentValue) ? 'array' : 'object';
            const valueDisplay = Array.isArray(currentValue) ? `Array [${currentValue.length} items]` : 'Objeto';

            const editControlsHtml = `
                <div class="edit-controls" style="margin-top: 10px;">
                    <button class="mini-btn btn-success" onclick='saveComplexChanges(this, ${JSON.stringify(path)}, "${escapeHtml(keyOrIndex)}")'>✓ Salvar Nome</button>
                    <button class="mini-btn btn-secondary" onclick="cancelChanges(this)">✗ Cancelar</button>
                </div>`;

            elementHeader.innerHTML = `
                <div style="width: 100%;">
                    <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                        <input type="text" class="edit-input" id="edit-key-input" value="${escapeHtml(keyOrIndex)}" placeholder="Nome" style="width: 200px;">
                        <span>: ${valueDisplay}</span>
                    </div>
                    ${editControlsHtml}
                </div>`;
            
            const keyInput = document.getElementById('edit-key-input');
            if (keyInput) {
                keyInput.focus();
                keyInput.select();
            }
        }

        // Edição de valores primitivos
        function startEditingPrimitiveValue(elementNode, path, keyOrIndex, currentValue, isArrayItem) {
            const elementHeader = elementNode.querySelector('.element-header');
            if (!elementHeader) return;

            elementHeader.setAttribute('data-original-html', elementHeader.innerHTML);

            // A chave (nome da propriedade) é editável em objetos, mas o índice não é em arrays.
            const keyInputHtml = !isArrayItem
                ? `<input type="text" class="edit-input" id="edit-key-input" value="${escapeHtml(keyOrIndex)}" placeholder="Chave" style="width: 150px;"> : `
                : `<span>[${keyOrIndex}]:</span>`;

            // Determina o tipo do valor atual
            let valueType = 'string';
            if (currentValue === null) valueType = 'null';
            else if (typeof currentValue === 'boolean') valueType = 'boolean';
            else if (typeof currentValue === 'number') valueType = 'number';

            // Cria o campo de input apropriado para o valor
            let valueInputHtml = '';
            if (valueType === 'null') {
                valueInputHtml = '<span id="edit-value-container" style="color: #666;">null</span>';
            } else if (valueType === 'boolean') {
                valueInputHtml = `
                    <span id="edit-value-container">
                        <select class="edit-input" id="edit-value-input">
                            <option value="true" ${currentValue === true ? 'selected' : ''}>true</option>
                            <option value="false" ${currentValue === false ? 'selected' : ''}>false</option>
                        </select>
                    </span>`;
            } else { // string ou número
                const escapedValue = String(currentValue).replace(/"/g, '&quot;');
                valueInputHtml = `
                    <span id="edit-value-container">
                        <input type="${valueType === 'number' ? 'number' : 'text'}" 
                               class="edit-input" 
                               id="edit-value-input" 
                               value="${escapedValue}" 
                               ${valueType === 'number' ? 'step="any"' : ''}
                               style="flex: 1;">
                    </span>`;
            }

            // Cria os botões de Salvar/Cancelar
            const editControlsHtml = `
                <div class="edit-controls" style="margin-top: 10px;">
                    <button class="mini-btn btn-success" onclick='saveChanges(this, ${JSON.stringify(path)}, "${escapeHtml(keyOrIndex)}")'>✓ Salvar</button>
                    <button class="mini-btn btn-secondary" onclick="cancelChanges(this)">✗ Cancelar</button>
                </div>`;

            // Monta a interface de edição completa
            elementHeader.innerHTML = `
                <div style="width: 100%;">
                    <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                        ${keyInputHtml}
                        ${valueInputHtml}
                        <select class="edit-input" id="edit-type-select" onchange="updateEditInputType()" style="width: 100px;">
                            <option value="string" ${valueType === 'string' ? 'selected' : ''}>String</option>
                            <option value="number" ${valueType === 'number' ? 'selected' : ''}>Número</option>
                            <option value="boolean" ${valueType === 'boolean' ? 'selected' : ''}>Boolean</option>
                            <option value="null" ${valueType === 'null' ? 'selected' : ''}>Null</option>
                        </select>
                    </div>
                    ${editControlsHtml}
                </div>`;
            
            // Foca no primeiro campo de input disponível
            const keyInput = document.getElementById('edit-key-input');
            if (keyInput) {
                keyInput.focus();
                keyInput.select();
            } else {
                const valueInput = document.getElementById('edit-value-input');
                if (valueInput) {
                    valueInput.focus();
                    if(valueInput.select) valueInput.select();
                }
            }
        }

        // Salvar alterações para valores complexos (apenas nome)
        function saveComplexChanges(button, path, oldKey) {
            const elementHeader = button.closest('.element-header');
            if (!elementHeader) return;

            let parentObject = jsonStructure;
            for (const p of path) {
                parentObject = parentObject[p];
            }

            const keyInput = document.getElementById('edit-key-input');
            const newKey = keyInput.value.trim();
            
            if (!newKey) {
                showToast('O nome não pode estar vazio.', 'error');
                return;
            }
            
            if (newKey !== oldKey && parentObject.hasOwnProperty(newKey)) {
                showToast('Já existe uma propriedade com esse nome.', 'error');
                return;
            }

            if (newKey !== oldKey) {
                saveState();
                
                // Renomear a chave preservando a ordem
                const newObj = {};
                for (const key in parentObject) {
                    if (key === oldKey) {
                        newObj[newKey] = parentObject[key];
                    } else {
                        newObj[key] = parentObject[key];
                    }
                }
                
                // Substituir o objeto na estrutura
                if (path.length === 0) {
                    jsonStructure = newObj;
                } else {
                    let grandParentObject = jsonStructure;
                    for (let i = 0; i < path.length - 1; i++) {
                        grandParentObject = grandParentObject[path[i]];
                    }
                    const parentKey = path[path.length - 1];
                    grandParentObject[parentKey] = newObj;
                }
            }

            updateBuilder();
            updatePreview();
            showToast('Nome alterado com sucesso!', 'success');
        }

        // Altera dinamicamente o campo de input do valor quando o tipo é trocado na edição.
        function updateEditInputType() {
            const typeSelect = document.getElementById('edit-type-select');
            const valueType = typeSelect.value;
            const container = document.getElementById('edit-value-container');
            if (!container) return;

            let newFieldHtml = '';
            if (valueType === 'null') {
                newFieldHtml = 'null';
                container.style.color = '#666';
            } else {
                container.style.color = 'inherit';
                if (valueType === 'boolean') {
                    newFieldHtml = `
                        <select class="edit-input" id="edit-value-input">
                            <option value="true">true</option>
                            <option value="false">false</option>
                        </select>`;
                } else {
                    newFieldHtml = `
                        <input type="${valueType === 'number' ? 'number' : 'text'}" 
                               class="edit-input" 
                               id="edit-value-input" 
                               placeholder="Valor"
                               ${valueType === 'number' ? 'step="any"' : ''}
                               style="flex: 1;">`;
                }
            }
            container.innerHTML = newFieldHtml;
        }

        // Salva as alterações feitas na interface de edição para a estrutura principal `jsonStructure`.
        function saveChanges(button, path, oldKeyOrIndex) {
            const elementHeader = button.closest('.element-header');
            if (!elementHeader) return;

            let parentObject = jsonStructure;
            for (const p of path) {
                parentObject = parentObject[p];
            }
            const isArrayItem = Array.isArray(parentObject);

            // Obtém a nova chave do campo de input (se existir).
            let newKey = oldKeyOrIndex;
            const keyInput = document.getElementById('edit-key-input');
            if (keyInput) {
                newKey = keyInput.value.trim();
                if (!newKey) {
                    showToast('A chave não pode estar vazia.', 'error');
                    return;
                }
                if (newKey !== oldKeyOrIndex && parentObject.hasOwnProperty(newKey)) {
                    showToast('Já existe uma propriedade com esse nome.', 'error');
                    return;
                }
            }

            // Obtém o novo valor do seu campo de input.
            const valueType = document.getElementById('edit-type-select').value;
            let newValue;

            if (valueType === 'null') {
                newValue = null;
            } else {
                const valueInput = document.getElementById('edit-value-input');
                if (valueType === 'boolean') {
                    newValue = valueInput.value === 'true';
                } else if (valueType === 'number') {
                    const num = parseFloat(valueInput.value);
                    newValue = isNaN(num) ? 0 : num;
                } else {
                    newValue = valueInput.value;
                }
            }

            saveState(); // Salva o estado atual para o histórico de "desfazer".

            if (isArrayItem) {
                // Se for um array, apenas atualiza o valor no índice.
                parentObject[oldKeyOrIndex] = newValue;
            } else {
                // Se for um objeto, lida com a possível renomeação da chave.
                if (newKey !== oldKeyOrIndex) {
                    // Para preservar a ordem das propriedades, um novo objeto é criado.
                    const newObj = {};
                    for (const key in parentObject) {
                        if (key === oldKeyOrIndex) {
                            newObj[newKey] = newValue;
                        } else {
                            newObj[key] = parentObject[key];
                        }
                    }
                    
                    // Substitui o objeto antigo pelo novo na estrutura principal.
                    if (path.length === 0) {
                        jsonStructure = newObj;
                    } else {
                        let grandParentObject = jsonStructure;
                        for (let i = 0; i < path.length - 1; i++) {
                            grandParentObject = grandParentObject[path[i]];
                        }
                        const parentKey = path[path.length - 1];
                        grandParentObject[parentKey] = newObj;
                    }
                } else {
                    // Se a chave não mudou, apenas atualiza o valor.
                    parentObject[newKey] = newValue;
                }
            }

            // Atualiza toda a interface para refletir as mudanças.
            updateBuilder();
            updatePreview();
            showToast('Alterações salvas com sucesso!', 'success');
        }

        // Cancela a edição e restaura o conteúdo original.
        function cancelChanges(button) {
            const elementHeader = button.closest('.element-header');
            if (elementHeader) {
                const originalHtml = elementHeader.getAttribute('data-original-html');
                if (originalHtml) {
                    elementHeader.innerHTML = originalHtml;
                    elementHeader.removeAttribute('data-original-html');
                } else {
                    // Fallback caso o HTML original não tenha sido salvo.
                    updateBuilder();
                }
            }
        }
        
        // --- FIM DA NOVA LÓGICA DE EDIÇÃO ---

        // --- INÍCIO DA LÓGICA DE DRAG-AND-DROP ---

        function replaceObjectAtPath(path, newObj) {
            if (path.length === 0) {
                jsonStructure = newObj;
            } else {
                let parent = jsonStructure;
                for (let i = 0; i < path.length - 1; i++) {
                    parent = parent[path[i]];
                }
                parent[path[path.length - 1]] = newObj;
            }
        }

        function handleDragStart(e, path, key) {
            dragSourcePath = path;
            dragSourceKey = key;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', '');
            const el = e.target.closest('.json-element');
            if (el) el.classList.add('dragging');
        }

        function handleDragEnd(e) {
            document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
            document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
            dragSourcePath = null;
            dragSourceKey = null;
        }

        function handleDragOver(e) {
            if (dragSourcePath === null) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const target = e.target.closest('.json-element');
            if (target) {
                document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
                target.classList.add('drop-target');
            }
        }

        function handleDragLeave(e) {
            const target = e.target.closest('.json-element');
            if (target && !target.contains(e.relatedTarget)) {
                target.classList.remove('drop-target');
            }
        }

        function handleDrop(e) {
            e.preventDefault();
            document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
            document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));

            if (dragSourcePath === null || dragSourceKey === null) return;

            const targetEl = e.target.closest('.json-element');
            if (!targetEl) return;

            const targetPath = JSON.parse(targetEl.getAttribute('data-element-path'));
            const targetKey = targetEl.getAttribute('data-element-key');

            // Não permitir soltar em si mesmo
            if (JSON.stringify(dragSourcePath) === JSON.stringify(targetPath) && String(dragSourceKey) === String(targetKey)) {
                dragSourcePath = null;
                dragSourceKey = null;
                return;
            }

            // Não permitir soltar dentro de si mesmo (descendente)
            const sourceFull = [...dragSourcePath, dragSourceKey];
            const targetFull = [...targetPath, targetKey];
            if (targetFull.length >= sourceFull.length) {
                const isDescendant = sourceFull.every((part, i) => String(part) === String(targetFull[i]));
                if (isDescendant) {
                    dragSourcePath = null;
                    dragSourceKey = null;
                    return;
                }
            }

            try {
                // Verificar se o alvo é um container (objeto ou array)
                const targetParent = getParentObject(targetPath);
                const targetValue = targetParent[targetKey];
                const targetIsContainer = (typeof targetValue === 'object' && targetValue !== null);

                // Se o alvo é um container, mover para dentro dele
                if (targetIsContainer) {
                    saveState();
                    const elementToMove = JSON.parse(JSON.stringify(getElementByPath(dragSourcePath, dragSourceKey)));
                    const originalKey = dragSourceKey;

                    removeElementFromStructure(dragSourcePath, dragSourceKey);

                    if (Array.isArray(targetValue)) {
                        addElementToDestination({ path: [...targetPath, targetKey], type: 'array' }, originalKey, elementToMove);
                    } else {
                        addElementToDestination({ path: [...targetPath, targetKey], type: 'object' }, originalKey, elementToMove);
                    }

                    updateBuilder();
                    updatePreview();
                    showToast('Elemento movido com sucesso!', 'success');
                } else if (JSON.stringify(dragSourcePath) === JSON.stringify(targetPath)) {
                    // Mesmo pai e alvo não é container - reordenar
                    const parent = getParentObject(dragSourcePath);
                    saveState();

                    if (Array.isArray(parent)) {
                        const fromIndex = parseInt(dragSourceKey);
                        const toIndex = parseInt(targetKey);
                        const item = parent.splice(fromIndex, 1)[0];
                        parent.splice(toIndex, 0, item);
                    } else {
                        const keys = Object.keys(parent);
                        const fromIdx = keys.indexOf(String(dragSourceKey));
                        const toIdx = keys.indexOf(String(targetKey));
                        if (fromIdx > -1 && toIdx > -1) {
                            keys.splice(fromIdx, 1);
                            keys.splice(toIdx, 0, String(dragSourceKey));
                            const newObj = {};
                            keys.forEach(k => { newObj[k] = parent[k]; });
                            replaceObjectAtPath(dragSourcePath, newObj);
                        }
                    }

                    updateBuilder();
                    updatePreview();
                    showToast('Elemento reordenado com sucesso!', 'success');
                } else {
                    // Pais diferentes e alvo não é container - mover para o pai do alvo
                    saveState();
                    const elementToMove = JSON.parse(JSON.stringify(getElementByPath(dragSourcePath, dragSourceKey)));
                    const originalKey = dragSourceKey;

                    removeElementFromStructure(dragSourcePath, dragSourceKey);

                    addElementToDestination({ path: targetPath, type: Array.isArray(targetParent) ? 'array' : 'object' }, originalKey, elementToMove);

                    updateBuilder();
                    updatePreview();
                    showToast('Elemento movido com sucesso!', 'success');
                }
            } catch (error) {
                console.error('Erro no drag-and-drop:', error);
                showToast('Erro ao mover elemento: ' + error.message, 'error');
            }

            dragSourcePath = null;
            dragSourceKey = null;
        }

        // --- FIM DA LÓGICA DE DRAG-AND-DROP ---

        // Função para recolher/expandir conteúdo aninhado
        function toggleCollapse(btn) {
            btn.classList.toggle('collapsed');
            const parentElement = btn.closest('.json-element');
            if (parentElement) {
                const nestedContent = parentElement.querySelector(':scope > .nested-content');
                if (nestedContent) {
                    nestedContent.classList.toggle('collapsed');
                }
            }
        }

        // Renderizar objeto recursivamente
        function renderObject(obj, container, path) {
            Object.keys(obj).forEach(key => {
                const value = obj[key];
                const elementId = `element-${elementIdCounter++}`;
                const element = document.createElement('div');
                element.className = 'json-element';
                element.id = elementId;
                
                element.setAttribute('data-element-path', JSON.stringify(path));
                element.setAttribute('data-element-key', key);
                element.setAttribute('data-element-id', elementId);
                
                // Adicionar event listener para seleção
                element.addEventListener('click', function(e) {
                    if (selectionMode && !e.target.closest('button')) {
                        e.stopPropagation();
                        selectElement(elementId, path, key);
                    }
                });
                
                if (Array.isArray(value)) {
                    element.classList.add('array');
                    element.innerHTML = `
                        <div class="element-header">
                            <div class="element-type">
                                <button class="collapse-btn" onclick="toggleCollapse(this)" title="Recolher/Expandir">▼</button>
                                <span class="drag-handle" title="Arraste para mover">⋮⋮</span>
                                Array: "${escapeHtml(key)}" [${value.length} items]
                            </div>
                            <div class="element-controls">
                                <button class="mini-btn btn-primary" onclick="startEditing(this)">
                                    Editar Nome
                                </button>
                                <button class="mini-btn btn-success" onclick='showAddValueToArrayModal(${JSON.stringify([...path, key])})'>
                                    Adicionar Valor
                                </button>
                                <button class="mini-btn btn-primary" onclick='addObjectToArray(${JSON.stringify([...path, key])})'>
                                    Adicionar Objeto
                                </button>
                                <button class="mini-btn btn-info" onclick='addNestedArray(${JSON.stringify([...path, key])})'>
                                    Adicionar Array
                                </button>
                                <button class="mini-btn btn-warning" onclick='startMove(${JSON.stringify(path)}, "${escapeHtml(key)}", "array")'>
                                    Mover
                                </button>
                                <button class="mini-btn btn-danger" onclick='removeElement(${JSON.stringify(path)}, "${escapeHtml(key)}")'>
                                    Remover
                                </button>
                            </div>
                        </div>
                    `;
                    
                    const nestedContainer = document.createElement('div');
                    nestedContainer.className = 'nested nested-content';
                    value.forEach((item, index) => {
                        const itemKey = index.toString();
                        const itemPath = [...path, key];

                        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
                            const objElement = document.createElement('div');
                            const objElementId = `element-${elementIdCounter++}`;
                            objElement.className = 'json-element nested';
                            objElement.id = objElementId;
                            objElement.setAttribute('data-element-path', JSON.stringify(itemPath));
                            objElement.setAttribute('data-element-key', index.toString());
                            objElement.setAttribute('data-element-id', objElementId);
                            
                            // Adicionar event listener para seleção
                            objElement.addEventListener('click', function(e) {
                                if (selectionMode && !e.target.closest('button')) {
                                    e.stopPropagation();
                                    selectElement(objElementId, itemPath, index.toString());
                                }
                            });
                            
                            objElement.innerHTML = `
                                <div class="element-header">
                                    <div class="element-type">
                                        <button class="collapse-btn" onclick="toggleCollapse(this)" title="Recolher/Expandir">▼</button>
                                        <span class="drag-handle" title="Arraste para mover">⋮⋮</span>
                                        [${index}] (Objeto)
                                    </div>
                                    <div class="element-controls">
                                        <button class="mini-btn btn-success" onclick='addToArray(${JSON.stringify([...itemPath, index])})'>
                                            Adicionar Propriedade
                                        </button>
                                        <button class="mini-btn btn-primary" onclick='addObjectToArray(${JSON.stringify([...itemPath, index])})'>
                                            Adicionar Objeto
                                        </button>
                                        <button class="mini-btn btn-info" onclick='addNestedArray(${JSON.stringify([...itemPath, index])})'>
                                            Adicionar Array
                                        </button>
                                        <button class="mini-btn btn-warning" onclick='startMove(${JSON.stringify(itemPath)}, "${index}", "object")'>
                                            Mover
                                        </button>
                                        <button class="mini-btn btn-danger" onclick='removeElement(${JSON.stringify(itemPath)}, "${index}")'>
                                            Remover
                                        </button>
                                    </div>
                                </div>`;
                            
                            const objNestedContainer = document.createElement('div');
                            objNestedContainer.className = 'nested nested-content';
                            renderObject(item, objNestedContainer, [...itemPath, index]);
                            objElement.appendChild(objNestedContainer);
                            nestedContainer.appendChild(objElement);
                        } else if (Array.isArray(item)) {
                            const arrayElement = document.createElement('div');
                            const arrayElementId = `element-${elementIdCounter++}`;
                            arrayElement.className = 'json-element nested array';
                            arrayElement.id = arrayElementId;
                            arrayElement.setAttribute('data-element-path', JSON.stringify(itemPath));
                            arrayElement.setAttribute('data-element-key', itemKey);
                            arrayElement.setAttribute('data-element-id', arrayElementId);
                            
                            // Adicionar event listener para seleção
                            arrayElement.addEventListener('click', function(e) {
                                if (selectionMode && !e.target.closest('button')) {
                                    e.stopPropagation();
                                    selectElement(arrayElementId, itemPath, index.toString());
                                }
                            });
                            
                            arrayElement.innerHTML = `
                                <div class="element-header">
                                    <div class="element-type">
                                        <button class="collapse-btn" onclick="toggleCollapse(this)" title="Recolher/Expandir">▼</button>
                                        <span class="drag-handle" title="Arraste para mover">⋮⋮</span>
                                        [${index}] Array [${item.length} items]
                                    </div>
                                    <div class="element-controls">
                                        <button class="mini-btn btn-success" onclick='showAddValueToArrayModal(${JSON.stringify([...itemPath, index])})'>
                                            Adicionar Valor
                                        </button>
                                        <button class="mini-btn btn-primary" onclick='addObjectToArray(${JSON.stringify([...itemPath, index])})'>
                                            Adicionar Objeto
                                        </button>
                                        <button class="mini-btn btn-info" onclick='addNestedArray(${JSON.stringify([...itemPath, index])})'>
                                            Adicionar Array
                                        </button>
                                        <button class="mini-btn btn-warning" onclick='startMove(${JSON.stringify(itemPath)}, "${index}", "array")'>
                                            Mover
                                        </button>
                                        <button class="mini-btn btn-danger" onclick='removeElement(${JSON.stringify(itemPath)}, "${index}")'>
                                            Remover
                                        </button>
                                    </div>
                                </div>`;
                            
                            const arrayNestedContainer = document.createElement('div');
                            arrayNestedContainer.className = 'nested nested-content';
                            renderObject(item, arrayNestedContainer, [...itemPath, index]);
                            arrayElement.appendChild(arrayNestedContainer);
                            nestedContainer.appendChild(arrayElement);
                        } else {
                            const itemElement = document.createElement('div');
                            const itemElementId = `element-${elementIdCounter++}`;
                            itemElement.className = 'json-element nested';
                            itemElement.id = itemElementId;
                            itemElement.setAttribute('data-element-path', JSON.stringify(itemPath));
                            itemElement.setAttribute('data-element-key', itemKey);
                            itemElement.setAttribute('data-element-id', itemElementId);
                            
                            // Adicionar event listener para seleção
                            itemElement.addEventListener('click', function(e) {
                                if (selectionMode && !e.target.closest('button')) {
                                    e.stopPropagation();
                                    selectElement(itemElementId, itemPath, itemKey);
                                }
                            });
                            
                            let itemDisplay = JSON.stringify(item);
                            if (typeof item === 'string') {
                                itemDisplay = `"${item.replace(/</g, '&lt;').replace(/>/g, '&gt;')}"`;
                            }
                            
                            itemElement.innerHTML = `
                                <div class="element-header">
                                    <div class="element-type">
                                        <span class="drag-handle" title="Arraste para mover">⋮⋮</span>
                                        [${index}]: ${itemDisplay}
                                    </div>
                                    <div class="element-controls">
                                        <button class="mini-btn btn-primary" onclick="startEditing(this)">
                                            Editar
                                        </button>
                                        <button class="mini-btn btn-warning" onclick='startMove(${JSON.stringify(itemPath)}, "${index}", "primitive")'>
                                            Mover
                                        </button>
                                        <button class="mini-btn btn-danger" onclick='removeElement(${JSON.stringify(itemPath)}, "${index}")'>
                                            Remover
                                        </button>
                                    </div>
                                </div>`;
                            nestedContainer.appendChild(itemElement);
                        }
                    });
                    element.appendChild(nestedContainer);
                    
                } else if (typeof value === 'object' && value !== null) {
                    element.innerHTML = `
                        <div class="element-header">
                            <div class="element-type">
                                <button class="collapse-btn" onclick="toggleCollapse(this)" title="Recolher/Expandir">▼</button>
                                <span class="drag-handle" title="Arraste para mover">⋮⋮</span>
                                Objeto: "${escapeHtml(key)}"
                            </div>
                            <div class="element-controls">
                                <button class="mini-btn btn-primary" onclick="startEditing(this)">
                                    Editar Nome
                                </button>
                                <button class="mini-btn btn-success" onclick='addToArray(${JSON.stringify([...path, key])})'>
                                    Adicionar Propriedade
                                </button>
                                <button class="mini-btn btn-primary" onclick='addObjectToArray(${JSON.stringify([...path, key])})'>
                                    Adicionar Objeto
                                </button>
                                <button class="mini-btn btn-info" onclick='addNestedArray(${JSON.stringify([...path, key])})'>
                                    Adicionar Array
                                </button>
                                <button class="mini-btn btn-warning" onclick='startMove(${JSON.stringify(path)}, "${escapeHtml(key)}", "object")'>
                                    Mover
                                </button>
                                <button class="mini-btn btn-danger" onclick='removeElement(${JSON.stringify(path)}, "${escapeHtml(key)}")'>
                                    Remover
                                </button>
                            </div>
                        </div>
                    `;
                    
                    const nestedContainer = document.createElement('div');
                    nestedContainer.className = 'nested nested-content';
                    renderObject(value, nestedContainer, [...path, key]);
                    element.appendChild(nestedContainer);
                    
                } else {
                    let displayValue = JSON.stringify(value);
                     if (typeof value === 'string') {
                        displayValue = `"${value.replace(/</g, '&lt;').replace(/>/g, '&gt;')}"`;
                    }
                    
                    element.innerHTML = `
                        <div class="element-header">
                            <div class="element-type">
                                <span class="drag-handle" title="Arraste para mover">⋮⋮</span>
                                "${escapeHtml(key)}": ${displayValue}
                            </div>
                            <div class="element-controls">
                                <button class="mini-btn btn-primary" onclick="startEditing(this)">
                                    Editar
                                </button>
                                <button class="mini-btn btn-warning" onclick='startMove(${JSON.stringify(path)}, "${escapeHtml(key)}", "primitive")'>
                                    Mover
                                </button>
                                <button class="mini-btn btn-danger" onclick='removeElement(${JSON.stringify(path)}, "${escapeHtml(key)}")'>
                                    Remover
                                </button>
                            </div>
                        </div>
                    `;
                }
                
                container.appendChild(element);
            });
        }

        // Atualizar preview do JSON
        function updatePreview() {
            const preview = document.getElementById('jsonPreview');
            try {
                const jsonString = JSON.stringify(jsonStructure, null, 2);
                preview.innerHTML = syntaxHighlight(jsonString);
                updateStatus(true);
            } catch (e) {
                preview.textContent = 'Erro ao gerar JSON: ' + e.message;
                updateStatus(false);
            }
        }

        // Syntax highlighting
        function syntaxHighlight(json) {
            json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
                let cls = 'json-number';
                if (/^"/.test(match)) {
                    cls = /:$/.test(match) ? 'json-key' : 'json-string';
                } else if (/true|false/.test(match)) {
                    cls = 'json-boolean';
                } else if (/null/.test(match)) {
                    cls = 'json-null';
                }
                return '<span class="' + cls + '">' + match + '</span>';
            });
        }

        // Atualizar status
        function updateStatus(isValid) {
            const statusDot = document.getElementById('statusDot');
            const statusText = document.getElementById('statusText');
            
            statusDot.className = isValid ? 'status-dot' : 'status-dot error';
            statusText.textContent = isValid ? 'JSON válido' : 'JSON inválido';
        }

        // Atualizar contagem de elementos
        function updateElementCount() {
            const count = countElements(jsonStructure);
            document.getElementById('elementCount').textContent = `${count} elemento${count !== 1 ? 's' : ''}`;
        }

        // Contar elementos recursivamente
        function countElements(obj) {
            let count = 0;
            if (typeof obj !== 'object' || obj === null) return 0;

            if (Array.isArray(obj)) {
                count += obj.length;
                obj.forEach(item => {
                    count += countElements(item);
                });
            } else {
                const keys = Object.keys(obj);
                count += keys.length;
                keys.forEach(key => {
                    count += countElements(obj[key]);
                });
            }
            return count;
        }

        // Limpar tudo
        function clearAll() {
            if (confirm('Tem certeza que deseja limpar toda a estrutura JSON?')) {
                saveState();
                jsonStructure = {};
                currentPath = [];
                updateBuilder();
                updatePreview();
                showToast('JSON limpo', 'success');
            }
        }

        // Copiar para clipboard
        function copyToClipboard() {
            const jsonString = JSON.stringify(jsonStructure, null, 2);
            navigator.clipboard.writeText(jsonString).then(() => {
                showToast('JSON copiado para a área de transferência', 'success');
            }, () => {
                showToast('Erro ao copiar JSON', 'error');
            });
        }

        // Download JSON
        function downloadJSON() {
            try {
                const jsonString = JSON.stringify(jsonStructure, null, 2);
                const blob = new Blob([jsonString], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `json-export-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast('JSON baixado com sucesso', 'success');
            } catch(e) {
                showToast('Erro ao criar arquivo JSON.', 'error');
            }
        }

        // Formatar JSON
        function formatJSON() {
            updatePreview();
            showToast('JSON formatado', 'success');
        }

        // Mostrar toast
        function showToast(message, type = 'success') {
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.className = `toast ${type} show`;
            
            setTimeout(() => {
                toast.classList.remove('show');
            }, 3000);
        }

        // Event listeners
        document.addEventListener('DOMContentLoaded', () => {
            saveState();
            updateBuilder();
            updatePreview();
            
            document.querySelectorAll('.modal').forEach(modal => {
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) closeModal(modal.id);
                });
            });
            
            document.getElementById('arrayName').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') addArray();
            });
            
            document.getElementById('objectModal').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') addObject();
            });
            
            document.getElementById('keyValueModal').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') addKeyValue();
            });
            
            document.getElementById('addValueModal').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') addValueToArray();
            });

            // Drag-and-drop via delegação de eventos
            const builderEl = document.getElementById('jsonBuilder');

            builderEl.addEventListener('mousedown', function(e) {
                if (e.target.classList.contains('drag-handle')) {
                    const jsonElement = e.target.closest('.json-element');
                    if (jsonElement) jsonElement.setAttribute('draggable', 'true');
                }
            });

            builderEl.addEventListener('dragstart', function(e) {
                const jsonElement = e.target.closest('.json-element');
                if (jsonElement && jsonElement.getAttribute('draggable') === 'true') {
                    const path = JSON.parse(jsonElement.getAttribute('data-element-path'));
                    const key = jsonElement.getAttribute('data-element-key');
                    handleDragStart(e, path, key);
                }
            });

            builderEl.addEventListener('dragend', function(e) {
                const jsonElement = e.target.closest('.json-element');
                if (jsonElement) jsonElement.removeAttribute('draggable');
                handleDragEnd(e);
            });

            builderEl.addEventListener('dragover', function(e) {
                handleDragOver(e);
            });

            builderEl.addEventListener('dragleave', function(e) {
                handleDragLeave(e);
            });

            builderEl.addEventListener('drop', function(e) {
                handleDrop(e);
            });
            
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    document.querySelectorAll('.modal').forEach(modal => closeModal(modal.id));
                }
                if (e.ctrlKey || e.metaKey) {
                    if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); } 
                    else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') { e.preventDefault(); redo(); } 
                    else if (e.key === 's') { e.preventDefault(); downloadJSON(); } 
                    else if (e.key === 'c' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') { e.preventDefault(); copyToClipboard(); }
                }
            });
        });
