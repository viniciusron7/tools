const entrada = document.getElementById("textoEntrada");
const textoLocalizar = document.getElementById("textoLocalizar");
const textoSubstituir = document.getElementById("textoSubstituir");
const btnLocalizarSubstituir = document.getElementById("btnLocalizarSubstituir");
const btnHistorico = document.getElementById("btnHistorico");
const painelHistorico = document.getElementById("painelHistorico");
const listaHistorico = document.getElementById("listaHistorico");
let historicoTransicoes = [];

function carregarHistorico() {
  try {
    const salvo = localStorage.getItem("formatarTextoHistorico");
    const dados = salvo ? JSON.parse(salvo) : null;

    if (dados && Array.isArray(dados.transicoes)) {
      historicoTransicoes = dados.transicoes;
    } else if (dados && Array.isArray(dados.versoes) && dados.versoes.length > 1) {
      historicoTransicoes = [];
      for (let i = 0; i < dados.versoes.length - 1; i += 1) {
        historicoTransicoes.push({
          original: dados.versoes[i].texto,
          resultado: dados.versoes[i + 1].texto
        });
      }
      salvarHistorico();
    } else {
      historicoTransicoes = [];
    }
  } catch {
    historicoTransicoes = [];
  }
  renderizarHistorico();
}

function salvarHistorico() {
  localStorage.setItem(
    "formatarTextoHistorico",
    JSON.stringify({ transicoes: historicoTransicoes })
  );
}

function renderizarHistorico() {
  listaHistorico.innerHTML = "";

  if (!historicoTransicoes.length) {
    const vazio = document.createElement("p");
    vazio.textContent = "Nenhum texto salvo ainda.";
    vazio.style.color = "#94a3b8";
    vazio.style.margin = "6px 0";
    listaHistorico.appendChild(vazio);
    return;
  }

  historicoTransicoes.forEach((transicao) => {
    const item = document.createElement("div");
    item.className = "history-item";

    const grid = document.createElement("div");
    grid.className = "history-item-grid";

    const campoOriginal = document.createElement("div");
    campoOriginal.className = "history-field";
    const textoOriginal = document.createElement("textarea");
    textoOriginal.readOnly = true;
    textoOriginal.value = transicao.original || "";

    const seta = document.createElement("div");
    seta.className = "history-arrow";
    seta.textContent = "→";

    const campoResultado = document.createElement("div");
    campoResultado.className = "history-field";
    const textoResultado = document.createElement("textarea");
    textoResultado.readOnly = true;
    textoResultado.value = transicao.resultado || "";

    campoOriginal.appendChild(textoOriginal);
    campoResultado.appendChild(textoResultado);

    grid.appendChild(campoOriginal);
    grid.appendChild(seta);
    grid.appendChild(campoResultado);
    item.appendChild(grid);
    listaHistorico.appendChild(item);
  });
}

function registrarTransicao(textoDe, textoPara) {
  historicoTransicoes.unshift({
    original: textoDe,
    resultado: textoPara
  });

  if (historicoTransicoes.length > 40) {
    historicoTransicoes = historicoTransicoes.slice(0, 40);
  }
}

function normalizarQuebras(texto) {
  return texto.replace(/\r\n|\r|\n/g, "\n");
}

function localizarESubstituir(texto, localizar, substituir) {
  const textoNormalizado = normalizarQuebras(texto);
  const localizarNormalizado = normalizarQuebras(localizar);
  const substituirNormalizado = normalizarQuebras(substituir);

  if (!localizarNormalizado) {
    return textoNormalizado;
  }

  return textoNormalizado.split(localizarNormalizado).join(substituirNormalizado);
}

btnLocalizarSubstituir.addEventListener("click", () => {
  const textoAtual = entrada.value;
  const resultado = localizarESubstituir(textoAtual, textoLocalizar.value, textoSubstituir.value);

  if (resultado !== textoAtual) {
    registrarTransicao(textoAtual, resultado);
    salvarHistorico();
    renderizarHistorico();
  }

  entrada.value = resultado;
});

btnHistorico.addEventListener("click", () => {
  painelHistorico.classList.toggle("aberto");
});

document.addEventListener("click", (evento) => {
  const cliqueNoPainel = painelHistorico.contains(evento.target);
  const cliqueNoBotao = btnHistorico.contains(evento.target);

  if (!cliqueNoPainel && !cliqueNoBotao) {
    painelHistorico.classList.remove("aberto");
  }
});

carregarHistorico();
