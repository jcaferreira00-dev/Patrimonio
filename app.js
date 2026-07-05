(() => {
  "use strict";

  const STORAGE_KEY = "patrimonio:dados:v2";
  const SETTINGS_KEY = "patrimonio:config:v2";
  const COLLAPSE_KEY = "patrimonio:colapso:v2";

  const INVESTMENT_CATEGORIES = {
    acoes: { label: "Ações", emoji: "📈", color: "#4F8CFF", type: "stock" },
    fiis: { label: "FIIs", emoji: "🏢", color: "#22C55E", type: "stock" },
    prev_pessoal: { label: "Previdência Privada Pessoal", emoji: "🛡️", color: "#A855F7", type: "manual" },
    renda_fixa: { label: "Renda Fixa", emoji: "🏦", color: "#F59E0B", type: "manual" },
    prev_corporativa: { label: "Previdência Privada Corporativa", emoji: "💼", color: "#EC4899", type: "corp_pension" },
    bitcoin: { label: "Bitcoin (HardWallet)", emoji: "₿", color: "#F7931A", type: "crypto", fixedCoin: "bitcoin" },
    ilp: { label: "ILP (Investimento Longo Prazo)", emoji: "🌱", color: "#14B8A6", type: "stock" },
    fgts: { label: "FGTS", emoji: "🔒", color: "#EAB308", type: "fgts" },
    outras_cryptos: { label: "Outras Cryptos", emoji: "🪙", color: "#8B5CF6", type: "crypto" },
  };

  // Cronograma de vesting da previdência corporativa: % do valor atual da empresa que conta no patrimônio
  const VESTING_SCHEDULE = [
    { year: 2027, month: 9, pct: 0.6 },  // outubro/2027
    { year: 2028, month: 9, pct: 0.7 },
    { year: 2029, month: 9, pct: 0.8 },
    { year: 2030, month: 9, pct: 0.9 },
    { year: 2031, month: 9, pct: 1.0 },
  ];
  function vestingPercent(date = new Date()) {
    let pct = 0.5;
    for (const s of VESTING_SCHEDULE) {
      const milestone = new Date(s.year, s.month, 1);
      if (date >= milestone) pct = s.pct;
    }
    return pct;
  }

  const DEBT_CATEGORIES = {
    cartao_credito: { label: "Cartões de Crédito", emoji: "💳" },
    carta_credito: { label: "Cartas de Crédito", emoji: "📄" },
    financiamento_casa: { label: "Financiamento da Casa", emoji: "🏡" },
    fies: { label: "Fies", emoji: "🎓" },
  };

  const uid = () => Math.random().toString(36).slice(2, 10);

  const fmt = (v) => {
    if (settings.hideValues) return "R$ ••••";
    return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };
  const fmtCompact = (v) => {
    if (settings.hideValues) return "R$ •••";
    const n = Number(v) || 0;
    const sign = n < 0 ? "-" : "";
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${sign}R$ ${(abs / 1_000_000).toFixed(1)}mi`;
    if (abs >= 1_000) return `${sign}R$ ${(abs / 1_000).toFixed(1)}k`;
    return fmt(n);
  };
  const escapeHtml = (str) => {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  };

  // ---------- state ----------
  let state = { investments: [], debts: [], properties: [], receivables: [] };
  let settings = { theme: "dark", brapiToken: "", autoRefresh: false, hideValues: false };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) state = Object.assign({ investments: [], debts: [], properties: [], receivables: [] }, JSON.parse(raw));
    } catch (e) { showToast("Não consegui carregar seus dados salvos."); }
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) settings = Object.assign(settings, JSON.parse(raw));
    } catch (e) {}
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { showToast("Não consegui salvar agora."); }
  }
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
  }
  function getCollapse() {
    try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || "{}"); } catch (e) { return {}; }
  }
  function setCollapse(id, open) {
    const s = getCollapse(); s[id] = open;
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(s));
  }

  function showToast(msg, ms = 4000) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { el.hidden = true; }, ms);
  }

  // ---------- theme ----------
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", settings.theme);
    document.querySelectorAll(".theme-opt").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.theme === settings.theme);
    });
  }

  // ---------- computed ----------
  function computed() {
    const totalInvestido = state.investments.reduce((s, i) => s + (Number(i.valorAtual) || 0), 0);
    const totalAplicado = state.investments.reduce((s, i) => s + (Number(i.valorInvestido) || 0), 0);
    const totalAReceber = state.receivables.reduce((s, r) => s + (Number(r.valor) || 0), 0);
    const totalDividas = state.debts.reduce((s, d) => s + (Number(d.valorTotal) || 0), 0);
    const totalAtivos = totalInvestido + totalAReceber;
    const patrimonioLiquido = totalAtivos - totalDividas;
    const rentabilidade = totalAplicado > 0 ? ((totalInvestido - totalAplicado) / totalAplicado) * 100 : null;
    return { totalInvestido, totalAplicado, totalAReceber, totalAtivos, totalDividas, patrimonioLiquido, rentabilidade };
  }

  // ---------- render ----------
  function render() {
    const c = computed();

    document.getElementById("netWorthValue").textContent = fmt(c.patrimonioLiquido);
    document.getElementById("netWorthValue").style.color = c.patrimonioLiquido >= 0 ? "var(--text)" : "var(--rust)";
    const sub = document.getElementById("netWorthSub");
    if (c.rentabilidade !== null) {
      sub.textContent = `${c.rentabilidade >= 0 ? "+" : ""}${c.rentabilidade.toFixed(1)}% de rentabilidade sobre o aplicado`;
      sub.className = "sub " + (c.rentabilidade >= 0 ? "pos" : "neg");
    } else { sub.textContent = ""; sub.className = "sub"; }

    document.getElementById("heroCard").classList.toggle("debt-heavy", c.totalDividas > c.totalAtivos);

    document.getElementById("totalAtivos").textContent = fmtCompact(c.totalAtivos);
    document.getElementById("totalDividas").textContent = fmtCompact(c.totalDividas);

    const maxLado = Math.max(c.totalAtivos, c.totalDividas, 1);
    document.getElementById("beamGreen").style.width = `${Math.min(100, (c.totalAtivos / maxLado) * 100)}%`;
    document.getElementById("beamRust").style.width = `${Math.min(100, (c.totalDividas / maxLado) * 100)}%`;

    renderDonut();
    renderInvestmentCards();
    renderReceivables();
    renderProperties();
    renderDebtCards();

    document.getElementById("investmentsGroupTotal").textContent = fmt(c.totalInvestido);
    document.getElementById("debtsGroupTotal").textContent = fmt(c.totalDividas);

    if (typeof updateToggleAllLabel === "function") updateToggleAllLabel();
    if (typeof updateInvestmentsGroupToggle === "function") updateInvestmentsGroupToggle();
    if (typeof updateDebtsGroupToggle === "function") updateDebtsGroupToggle();
  }

  function renderDonut() {
    const canvas = document.getElementById("donutChart");
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const size = 150;
    canvas.width = size * dpr; canvas.height = size * dpr;
    canvas.style.width = size + "px"; canvas.style.height = size + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2, cy = size / 2, rOuter = 65, rInner = 43;
    const totals = Object.keys(INVESTMENT_CATEGORIES).map((key) => ({
      key,
      value: state.investments.filter((i) => i.categoria === key).reduce((s, i) => s + (Number(i.valorAtual) || 0), 0),
    })).filter((t) => t.value > 0);
    const total = totals.reduce((s, t) => s + t.value, 0);

    document.getElementById("donutCenterValue").textContent = fmtCompact(total);

    if (total <= 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, (rOuter + rInner) / 2, 0, Math.PI * 2);
      ctx.lineWidth = rOuter - rInner;
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--surface-2") || "#eee";
      ctx.stroke();
    } else {
      let start = -Math.PI / 2;
      totals.forEach((t) => {
        const angle = (t.value / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, (rOuter + rInner) / 2, start, start + angle);
        ctx.lineWidth = rOuter - rInner;
        ctx.strokeStyle = INVESTMENT_CATEGORIES[t.key].color;
        ctx.lineCap = "butt";
        ctx.stroke();
        start += angle;
      });
    }

    const legend = document.getElementById("donutLegend");
    legend.innerHTML = totals.map((t) => {
      const pct = total > 0 ? ((t.value / total) * 100).toFixed(0) : 0;
      return `<div class="legend-item">
        <span class="legend-dot" style="background:${INVESTMENT_CATEGORIES[t.key].color}"></span>
        <span class="legend-name">${INVESTMENT_CATEGORIES[t.key].label}</span>
        <span class="legend-pct mono">${pct}%</span>
      </div>`;
    }).join("") || `<div class="empty-row">Adicione investimentos para ver a alocação.</div>`;
  }

  function rowMetaForInvestment(item, cat) {
    if (cat.type === "stock" || cat.type === "crypto") {
      const parts = [];
      if (item.ticker) parts.push(item.ticker.toUpperCase());
      if (item.quantidade) parts.push(`${item.quantidade} un.`);
      if (item.precoAtual) parts.push(`cot. ${fmt(item.precoAtual)}`);
      if (item.valorInvestido) parts.push(`aplicado ${fmt(item.valorInvestido)}`);
      return parts.join(" · ");
    }
    if (cat.type === "fgts") {
      const parts = [`Total do contrato: ${fmt(item.valorTotal)}`];
      if (item.valorTotal) parts.push(`Multa (40%): ${fmt((Number(item.valorTotal) || 0) * 0.4)}`);
      return parts.join(" · ");
    }
    if (cat.type === "corp_pension") {
      const parts = [];
      if (item.nomeEmpresa) parts.push(`Empresa: ${item.nomeEmpresa}`);
      parts.push(`Colaborador ${fmt(item.valorAtualColaborador)}`);
      parts.push(`Empresa ${fmt(item.valorAtualEmpresa)} (${Math.round((item.vestingPercentApplied || 0) * 100)}% vestido)`);
      return parts.join(" · ");
    }
    if (item.valorInvestido) return `Aplicado: ${fmt(item.valorInvestido)}`;
    return "";
  }

  function renderInvestmentCards() {
    const wrap = document.getElementById("investmentCards");
    const collapse = getCollapse();
    wrap.innerHTML = Object.entries(INVESTMENT_CATEGORIES).map(([key, cat]) => {
      const items = state.investments.filter((i) => i.categoria === key);
      const catTotal = items.reduce((s, i) => s + (Number(i.valorAtual) || 0), 0);
      const isOpen = collapse[`inv-${key}`] === true;

      const rows = items.length === 0
        ? `<div class="empty-row">Nenhum lançamento ainda.</div>`
        : items.map((item) => {
            const investido = Number(item.valorInvestido) || 0;
            const atual = Number(item.valorAtual) || 0;
            const delta = (cat.type !== "fgts" && cat.type !== "corp_pension" && investido > 0) ? ((atual - investido) / investido) * 100 : null;
            return `<div class="row">
              <div class="row-main">
                <div class="row-name">${escapeHtml(item.nome || "Sem nome")}</div>
                <div class="row-meta">${rowMetaForInvestment(item, cat)}</div>
              </div>
              <div class="row-value">
                <div class="amount mono">${fmt(atual)}</div>
                ${delta !== null ? `<div class="delta ${delta >= 0 ? "pos" : "neg"}">${delta >= 0 ? "↑" : "↓"} ${Math.abs(delta).toFixed(1)}%</div>` : ""}
              </div>
              <div class="row-actions">
                <button class="icon-btn" data-action="edit-investment" data-id="${item.id}" aria-label="Editar">✎</button>
                <button class="icon-btn" data-action="delete-investment" data-id="${item.id}" aria-label="Remover">🗑</button>
              </div>
            </div>`;
          }).join("");

      return `<details class="sub-block" data-collapse-id="inv-${key}" ${isOpen ? "open" : ""}>
        <summary>
          <span class="cat-icon-head">
            <span class="cat-icon" style="background:${cat.color}22;color:${cat.color}">${cat.emoji}</span>
            <span class="card-title">${cat.label}</span>
          </span>
          <span class="card-total mono">${fmt(catTotal)}</span>
          <svg class="chevron" width="14" height="14" viewBox="0 0 16 16"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </summary>
        <div class="sub-body">
          ${rows}
          <button class="add-btn" data-action="add-investment" data-categoria="${key}">+ Adicionar em ${cat.label}</button>
        </div>
      </details>`;
    }).join("");

    wrap.querySelectorAll("details.collapsible, details.sub-block").forEach((d) => {
      d.addEventListener("toggle", () => setCollapse(d.dataset.collapseId, d.open));
    });
  }

  function renderReceivables() {
    const totalAReceber = state.receivables.reduce((s, r) => s + (Number(r.valor) || 0), 0);
    document.getElementById("receivablesCardTotal").textContent = totalAReceber > 0 ? fmt(totalAReceber) : "";
    const list = document.getElementById("receivablesList");
    list.innerHTML = state.receivables.length === 0
      ? `<div class="empty-row">Nenhum valor a receber cadastrado.</div>`
      : state.receivables.map((r) => `<div class="row">
          <div class="row-main">
            <div class="row-name">${escapeHtml(r.nome || "Sem nome")}</div>
            <div class="row-meta">${[escapeHtml(r.observacao || ""), r.dataPrevista ? `previsto p/ ${escapeHtml(r.dataPrevista)}` : ""].filter(Boolean).join(" · ")}</div>
          </div>
          <div class="row-value">
            <div class="amount mono" style="color:#2DD4BF">${fmt(r.valor)}</div>
          </div>
          <div class="row-actions">
            <button class="icon-btn" data-action="edit-receivable" data-id="${r.id}" aria-label="Editar">✎</button>
            <button class="icon-btn" data-action="delete-receivable" data-id="${r.id}" aria-label="Remover">🗑</button>
          </div>
        </div>`).join("");
  }

  function renderProperties() {
    const totalEstimado = state.properties.reduce((s, p) => s + (Number(p.valorEstimado) || 0), 0);
    document.getElementById("propertiesCardTotal").textContent = totalEstimado > 0 ? fmt(totalEstimado) : "";
    const list = document.getElementById("propertiesList");
    list.innerHTML = state.properties.length === 0
      ? `<div class="empty-row">Nenhum imóvel cadastrado.</div>`
      : state.properties.map((p) => `<div class="row">
          <div class="row-main">
            <div class="row-name">${escapeHtml(p.nome || "Imóvel")}</div>
            <div class="row-meta">${escapeHtml(p.endereco || "")}${p.matricula ? ` · matrícula ${escapeHtml(p.matricula)}` : ""}</div>
          </div>
          <div class="row-value">
            ${p.valorEstimado ? `<div class="amount mono">${fmt(p.valorEstimado)}</div>` : ""}
          </div>
          <div class="row-actions">
            <button class="icon-btn" data-action="edit-property" data-id="${p.id}" aria-label="Editar">✎</button>
            <button class="icon-btn" data-action="delete-property" data-id="${p.id}" aria-label="Remover">🗑</button>
          </div>
        </div>`).join("");
  }

  function renderDebtCards() {
    const wrap = document.getElementById("debtCards");
    const collapse = getCollapse();
    wrap.innerHTML = Object.entries(DEBT_CATEGORIES).map(([key, cat]) => {
      const items = state.debts.filter((d) => d.categoria === key);
      const catTotal = items.reduce((s, d) => s + (Number(d.valorTotal) || 0), 0);
      const isOpen = collapse[`debt-${key}`] === true;

      const rows = items.length === 0
        ? `<div class="empty-row">Nenhum lançamento ainda.</div>`
        : items.map((d) => {
            const metaParts = [];
            if (d.taxaJuros) metaParts.push(`${d.taxaJuros}% a.m.`);
            if (d.parcela) metaParts.push(`parcela ${fmt(d.parcela)}`);
            return `<div class="row">
              <div class="row-main">
                <div class="row-name">${escapeHtml(d.nome || "Sem nome")}</div>
                <div class="row-meta">${metaParts.join(" · ")}</div>
              </div>
              <div class="row-value">
                <div class="amount mono" style="color:var(--rust)">${fmt(d.valorTotal)}</div>
              </div>
              <div class="row-actions">
                <button class="icon-btn" data-action="edit-debt" data-id="${d.id}" aria-label="Editar">✎</button>
                <button class="icon-btn" data-action="delete-debt" data-id="${d.id}" aria-label="Remover">🗑</button>
              </div>
            </div>`;
          }).join("");

      return `<details class="sub-block" data-collapse-id="debt-${key}" ${isOpen ? "open" : ""}>
        <summary>
          <span class="cat-icon-head">
            <span class="cat-icon" style="background:var(--rust-soft);color:var(--rust)">${cat.emoji}</span>
            <span class="card-title">${cat.label}</span>
          </span>
          <span class="card-total mono">${fmt(catTotal)}</span>
          <svg class="chevron" width="14" height="14" viewBox="0 0 16 16"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </summary>
        <div class="sub-body">
          ${rows}
          <button class="add-btn" data-action="add-debt" data-categoria="${key}">+ Adicionar em ${cat.label}</button>
        </div>
      </details>`;
    }).join("");

    wrap.querySelectorAll("details.collapsible, details.sub-block").forEach((d) => {
      d.addEventListener("toggle", () => setCollapse(d.dataset.collapseId, d.open));
    });
  }

  // ---------- modal: investimento ----------
  const overlay = document.getElementById("overlay");
  const modalTitle = document.getElementById("modalTitle");
  const itemForm = document.getElementById("itemForm");

  function openInvestmentModal(categoria, item) {
    const cat = INVESTMENT_CATEGORIES[categoria];
    const isNew = cat.type === "corp_pension" ? (!item.nomeColaborador && !item.nomeEmpresa) : !item.nome;
    modalTitle.textContent = isNew ? `Novo em ${cat.label}` : "Editar investimento";

    let fieldsHtml = "";
    if (cat.type === "stock") {
      fieldsHtml = `
        <div class="field"><label>Nome</label><input type="text" name="nome" value="${escapeHtml(item.nome || "")}" placeholder="Ex: Itaúsa, Vale" required /></div>
        <div class="field"><label>Ticker (B3)</label><input type="text" name="ticker" value="${escapeHtml(item.ticker || "")}" placeholder="Ex: ITSA4, HGLG11" style="text-transform:uppercase" /></div>
        <div class="field-row">
          <div class="field"><label>Quantidade</label><input type="number" step="any" min="0" name="quantidade" value="${item.quantidade ?? ""}" placeholder="0" /></div>
          <div class="field"><label>Preço médio pago (R$)</label><input type="number" step="0.01" min="0" name="precoMedio" value="${item.precoMedio ?? ""}" placeholder="0,00" /></div>
        </div>
        <div class="field-hint">A cotação atual é buscada ao tocar em ↻ na Visão geral.</div>`;
    } else if (cat.type === "crypto") {
      const coinValue = item.coinId || cat.fixedCoin || "";
      fieldsHtml = `
        <div class="field"><label>Nome</label><input type="text" name="nome" value="${escapeHtml(item.nome || "")}" placeholder="Ex: Carteira principal" required /></div>
        <div class="field"><label>ID da moeda (CoinGecko)</label><input type="text" name="coinId" value="${escapeHtml(coinValue)}" placeholder="Ex: bitcoin, ethereum, solana" ${cat.fixedCoin ? "" : ""} /></div>
        <div class="field-row">
          <div class="field"><label>Quantidade</label><input type="number" step="any" min="0" name="quantidade" value="${item.quantidade ?? ""}" placeholder="0,00000000" /></div>
          <div class="field"><label>Preço médio pago (R$)</label><input type="number" step="0.01" min="0" name="precoMedio" value="${item.precoMedio ?? ""}" placeholder="0,00" /></div>
        </div>
        <div class="field-hint">A cotação atual é buscada ao tocar em ↻ na Visão geral.</div>`;
    } else if (cat.type === "fgts") {
      const multaPreview = fmt((Number(item.valorTotal) || 0) * 0.4);
      fieldsHtml = `
        <div class="field"><label>Nome</label><input type="text" name="nome" value="${escapeHtml(item.nome || "FGTS")}" placeholder="FGTS" required /></div>
        <div class="field-row">
          <div class="field"><label>Valor total do contrato</label><input type="number" step="0.01" min="0" name="valorTotal" value="${item.valorTotal ?? ""}" placeholder="0,00" required /></div>
          <div class="field"><label>Valor atual</label><input type="number" step="0.01" min="0" name="valorAtual" value="${item.valorAtual ?? ""}" placeholder="0,00" required /></div>
        </div>
        <div class="field-hint">Multa rescisória (40% do valor total do contrato): ${multaPreview}, calculada automaticamente e apenas informativa. Só o "valor atual" entra no cálculo do patrimônio.</div>`;
    } else if (cat.type === "corp_pension") {
      const vp = Math.round(vestingPercent() * 100);
      fieldsHtml = `
        <div class="field"><label>Nome do investimento (Colaborador)</label><input type="text" name="nomeColaborador" value="${escapeHtml(item.nomeColaborador || "")}" placeholder="Ex: Plano PGBL - parte colaborador" required /></div>
        <div class="field-row">
          <div class="field"><label>Valor aplicado (R$)</label><input type="number" step="0.01" min="0" name="valorAplicadoColaborador" value="${item.valorAplicadoColaborador ?? ""}" placeholder="0,00" /></div>
          <div class="field"><label>Valor atual (R$)</label><input type="number" step="0.01" min="0" name="valorAtualColaborador" value="${item.valorAtualColaborador ?? ""}" placeholder="0,00" required /></div>
        </div>
        <div class="field" style="margin-top:14px"><label>Nome do investimento (Empresa)</label><input type="text" name="nomeEmpresa" value="${escapeHtml(item.nomeEmpresa || "")}" placeholder="Ex: Plano PGBL - parte empresa" required /></div>
        <div class="field-row">
          <div class="field"><label>Valor aplicado (R$)</label><input type="number" step="0.01" min="0" name="valorAplicadoEmpresa" value="${item.valorAplicadoEmpresa ?? ""}" placeholder="0,00" /></div>
          <div class="field"><label>Valor atual (R$)</label><input type="number" step="0.01" min="0" name="valorAtualEmpresa" value="${item.valorAtualEmpresa ?? ""}" placeholder="0,00" required /></div>
        </div>
        <div class="field-hint">A parte da empresa segue vesting crescente (50% até out/2027, +10% a cada outubro até 100% em out/2031). Hoje, ${vp}% do valor atual da empresa conta no patrimônio.</div>`;
    } else {
      fieldsHtml = `
        <div class="field"><label>Nome</label><input type="text" name="nome" value="${escapeHtml(item.nome || "")}" placeholder="Nome do investimento" required /></div>
        <div class="field-row">
          <div class="field"><label>Valor aplicado (R$)</label><input type="number" step="0.01" min="0" name="valorInvestido" value="${item.valorInvestido ?? ""}" placeholder="0,00" /></div>
          <div class="field"><label>Valor atual (R$)</label><input type="number" step="0.01" min="0" name="valorAtual" value="${item.valorAtual ?? ""}" placeholder="0,00" required /></div>
        </div>`;
    }

    itemForm.innerHTML = fieldsHtml + `
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" data-action="close-modal">Cancelar</button>
        <button type="submit" class="btn btn-primary">Salvar</button>
      </div>
      ${!isNew ? `<button type="button" class="btn btn-danger" style="margin-top:10px" data-action="delete-investment" data-id="${item.id}">Remover</button>` : ""}
    `;

    itemForm.onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(itemForm);
      const updated = { id: item.id, categoria };

      if (cat.type === "stock" || cat.type === "crypto") {
        const quantidade = Number(fd.get("quantidade")) || 0;
        const precoMedio = Number(fd.get("precoMedio")) || 0;
        updated.nome = fd.get("nome");
        if (cat.type === "stock") updated.ticker = (fd.get("ticker") || "").toUpperCase().trim();
        else updated.coinId = (fd.get("coinId") || "").toLowerCase().trim();
        updated.quantidade = quantidade;
        updated.precoMedio = precoMedio;
        updated.precoAtual = item.precoAtual || precoMedio;
        updated.valorInvestido = quantidade * precoMedio;
        updated.valorAtual = quantidade * (updated.precoAtual || precoMedio);
        updated.lastUpdate = item.lastUpdate || null;
      } else if (cat.type === "fgts") {
        updated.nome = fd.get("nome");
        updated.valorTotal = Number(fd.get("valorTotal")) || 0;
        updated.valorAtual = Number(fd.get("valorAtual")) || 0;
        updated.valorInvestido = 0;
      } else if (cat.type === "corp_pension") {
        const vp = vestingPercent();
        const valorAplicadoColaborador = Number(fd.get("valorAplicadoColaborador")) || 0;
        const valorAtualColaborador = Number(fd.get("valorAtualColaborador")) || 0;
        const valorAplicadoEmpresa = Number(fd.get("valorAplicadoEmpresa")) || 0;
        const valorAtualEmpresa = Number(fd.get("valorAtualEmpresa")) || 0;
        updated.nomeColaborador = fd.get("nomeColaborador");
        updated.nomeEmpresa = fd.get("nomeEmpresa");
        updated.valorAplicadoColaborador = valorAplicadoColaborador;
        updated.valorAtualColaborador = valorAtualColaborador;
        updated.valorAplicadoEmpresa = valorAplicadoEmpresa;
        updated.valorAtualEmpresa = valorAtualEmpresa;
        updated.vestingPercentApplied = vp;
        updated.nome = `${updated.nomeColaborador} + ${updated.nomeEmpresa}`;
        updated.valorInvestido = valorAplicadoColaborador + valorAplicadoEmpresa;
        updated.valorAtual = valorAtualColaborador + valorAtualEmpresa * vp;
      } else {
        updated.nome = fd.get("nome");
        updated.valorInvestido = Number(fd.get("valorInvestido")) || 0;
        updated.valorAtual = Number(fd.get("valorAtual")) || 0;
      }

      upsertInvestment(updated);
      closeModal();
    };

    showModal();
  }

  // ---------- modal: dívida ----------
  function openDebtModal(categoria, item) {
    const cat = DEBT_CATEGORIES[categoria];
    const isNew = !item.nome;
    modalTitle.textContent = isNew ? `Nova em ${cat.label}` : "Editar dívida";
    itemForm.innerHTML = `
      <div class="field"><label>Nome</label><input type="text" name="nome" value="${escapeHtml(item.nome || "")}" placeholder="Ex: Nubank, Caixa..." required /></div>
      <div class="field"><label>Valor total devido (R$)</label><input type="number" step="0.01" min="0" name="valorTotal" value="${item.valorTotal ?? ""}" placeholder="0,00" required /></div>
      <div class="field-row">
        <div class="field"><label>Juros (% ao mês)</label><input type="number" step="0.01" min="0" name="taxaJuros" value="${item.taxaJuros ?? ""}" placeholder="0,00" /></div>
        <div class="field"><label>Parcela mensal (R$)</label><input type="number" step="0.01" min="0" name="parcela" value="${item.parcela ?? ""}" placeholder="0,00" /></div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" data-action="close-modal">Cancelar</button>
        <button type="submit" class="btn btn-primary rust">Salvar</button>
      </div>
      ${!isNew ? `<button type="button" class="btn btn-danger" style="margin-top:10px" data-action="delete-debt" data-id="${item.id}">Remover</button>` : ""}
    `;
    itemForm.onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(itemForm);
      upsertDebt({
        id: item.id, categoria,
        nome: fd.get("nome"),
        valorTotal: Number(fd.get("valorTotal")) || 0,
        taxaJuros: fd.get("taxaJuros"),
        parcela: fd.get("parcela"),
      });
      closeModal();
    };
    showModal();
  }

  // ---------- modal: a receber ----------
  function openReceivableModal(item) {
    const isNew = !item.nome;
    modalTitle.textContent = isNew ? "Nova pessoa" : "Editar valor a receber";
    itemForm.innerHTML = `
      <div class="field"><label>Nome da pessoa</label><input type="text" name="nome" value="${escapeHtml(item.nome || "")}" placeholder="Quem te deve" required /></div>
      <div class="field"><label>Valor (R$)</label><input type="number" step="0.01" min="0" name="valor" value="${item.valor ?? ""}" placeholder="0,00" required /></div>
      <div class="field"><label>Previsão de recebimento (opcional)</label><input type="text" name="dataPrevista" value="${escapeHtml(item.dataPrevista || "")}" placeholder="Ex: 15/08, ou 'sem previsão'" /></div>
      <div class="field"><label>Observação (opcional)</label><input type="text" name="observacao" value="${escapeHtml(item.observacao || "")}" placeholder="Ex: rateio da viagem" /></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" data-action="close-modal">Cancelar</button>
        <button type="submit" class="btn btn-primary">Salvar</button>
      </div>
      ${!isNew ? `<button type="button" class="btn btn-danger" style="margin-top:10px" data-action="delete-receivable" data-id="${item.id}">Remover</button>` : ""}
    `;
    itemForm.onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(itemForm);
      upsertReceivable({
        id: item.id,
        nome: fd.get("nome"),
        valor: Number(fd.get("valor")) || 0,
        dataPrevista: fd.get("dataPrevista"),
        observacao: fd.get("observacao"),
      });
      closeModal();
    };
    showModal();
  }

  // ---------- modal: imóvel ----------
  function openPropertyModal(item) {
    const isNew = !item.nome && !item.endereco;
    modalTitle.textContent = isNew ? "Novo imóvel" : "Editar imóvel";
    itemForm.innerHTML = `
      <div class="field"><label>Apelido</label><input type="text" name="nome" value="${escapeHtml(item.nome || "")}" placeholder="Ex: Casa, Apê da praia" required /></div>
      <div class="field"><label>Endereço</label><input type="text" name="endereco" value="${escapeHtml(item.endereco || "")}" placeholder="Rua, número, bairro, cidade" /></div>
      <div class="field"><label>Matrícula</label><input type="text" name="matricula" value="${escapeHtml(item.matricula || "")}" placeholder="Número da matrícula do imóvel" /></div>
      <div class="field"><label>Valor estimado (R$, opcional)</label><input type="number" step="0.01" min="0" name="valorEstimado" value="${item.valorEstimado ?? ""}" placeholder="0,00" /></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" data-action="close-modal">Cancelar</button>
        <button type="submit" class="btn btn-primary">Salvar</button>
      </div>
      ${!isNew ? `<button type="button" class="btn btn-danger" style="margin-top:10px" data-action="delete-property" data-id="${item.id}">Remover</button>` : ""}
    `;
    itemForm.onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(itemForm);
      upsertProperty({
        id: item.id,
        nome: fd.get("nome"),
        endereco: fd.get("endereco"),
        matricula: fd.get("matricula"),
        valorEstimado: fd.get("valorEstimado") ? Number(fd.get("valorEstimado")) : null,
      });
      closeModal();
    };
    showModal();
  }

  function showModal() { overlay.hidden = false; }
  function closeModal() { overlay.hidden = true; itemForm.onsubmit = null; }

  // ---------- data ops ----------
  function upsertInvestment(item) {
    const idx = state.investments.findIndex((i) => i.id === item.id);
    if (idx >= 0) state.investments[idx] = item; else state.investments.push(item);
    saveState(); render();
  }
  function deleteInvestment(id) { state.investments = state.investments.filter((i) => i.id !== id); saveState(); render(); }
  function upsertDebt(item) {
    const idx = state.debts.findIndex((d) => d.id === item.id);
    if (idx >= 0) state.debts[idx] = item; else state.debts.push(item);
    saveState(); render();
  }
  function deleteDebt(id) { state.debts = state.debts.filter((d) => d.id !== id); saveState(); render(); }
  function upsertProperty(item) {
    const idx = state.properties.findIndex((p) => p.id === item.id);
    if (idx >= 0) state.properties[idx] = item; else state.properties.push(item);
    saveState(); render();
  }
  function deleteProperty(id) { state.properties = state.properties.filter((p) => p.id !== id); saveState(); render(); }
  function upsertReceivable(item) {
    const idx = state.receivables.findIndex((r) => r.id === item.id);
    if (idx >= 0) state.receivables[idx] = item; else state.receivables.push(item);
    saveState(); render();
  }
  function deleteReceivable(id) { state.receivables = state.receivables.filter((r) => r.id !== id); saveState(); render(); }

  // ---------- live quotes ----------
  async function fetchBrapiQuotes(tickers) {
    if (tickers.length === 0) return {};
    const token = settings.brapiToken.trim();
    const url = `https://brapi.dev/api/quote/${encodeURIComponent(tickers.join(","))}`;
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("brapi_fail");
    const data = await res.json();
    const map = {};
    (data.results || []).forEach((r) => { map[r.symbol.toUpperCase()] = r.regularMarketPrice; });
    return map;
  }

  async function fetchCoinGeckoPrices(ids) {
    if (ids.length === 0) return {};
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(","))}&vs_currencies=brl`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("coingecko_fail");
    return res.json();
  }

  async function refreshAllQuotes() {
    const btn = document.getElementById("refreshQuotes");
    const statusEl = document.getElementById("quoteStatus");
    btn.classList.add("spinning");

    const stockItems = state.investments.filter((i) => INVESTMENT_CATEGORIES[i.categoria]?.type === "stock" && i.ticker);
    const cryptoItems = state.investments.filter((i) => INVESTMENT_CATEGORIES[i.categoria]?.type === "crypto" && i.coinId);

    const tickers = [...new Set(stockItems.map((i) => i.ticker.toUpperCase()))];
    const coinIds = [...new Set(cryptoItems.map((i) => i.coinId.toLowerCase()))];

    const results = await Promise.allSettled([
      fetchBrapiQuotes(tickers),
      fetchCoinGeckoPrices(coinIds),
    ]);

    let okStock = results[0].status === "fulfilled";
    let okCrypto = results[1].status === "fulfilled";

    if (okStock) {
      const priceMap = results[0].value;
      stockItems.forEach((item) => {
        const price = priceMap[item.ticker.toUpperCase()];
        if (price !== undefined) {
          item.precoAtual = price;
          item.valorAtual = (Number(item.quantidade) || 0) * price;
          item.lastUpdate = Date.now();
        }
      });
    }
    if (okCrypto) {
      const priceMap = results[1].value;
      cryptoItems.forEach((item) => {
        const price = priceMap[item.coinId.toLowerCase()]?.brl;
        if (price !== undefined) {
          item.precoAtual = price;
          item.valorAtual = (Number(item.quantidade) || 0) * price;
          item.lastUpdate = Date.now();
        }
      });
    }

    saveState(); render();
    btn.classList.remove("spinning");

    const now = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (tickers.length === 0 && coinIds.length === 0) {
      statusEl.textContent = "Adicione um ticker ou moeda para ativar cotações em tempo real.";
    } else if (okStock && okCrypto) {
      statusEl.textContent = `Cotações atualizadas às ${now}.`;
    } else {
      const problems = [];
      if (!okStock && tickers.length) problems.push("ações/FIIs");
      if (!okCrypto && coinIds.length) problems.push("cripto");
      statusEl.textContent = `Não consegui atualizar: ${problems.join(" e ")}. Verifique o token da brapi.dev nas configurações, se for o caso.`;
      showToast("Algumas cotações não puderam ser atualizadas.");
    }
  }

  // ---------- settings modal ----------
  const settingsOverlay = document.getElementById("settingsOverlay");
  function openSettings() {
    document.getElementById("brapiToken").value = settings.brapiToken || "";
    document.getElementById("autoRefreshToggle").checked = !!settings.autoRefresh;
    applyTheme();
    settingsOverlay.hidden = false;
  }
  function closeSettings() { settingsOverlay.hidden = true; }

  // ---------- events ----------
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (btn) {
      const action = btn.dataset.action;
      const id = btn.dataset.id;

      if (action === "add-investment") openInvestmentModal(btn.dataset.categoria, { id: uid() });
      else if (action === "edit-investment") { const item = state.investments.find((i) => i.id === id); if (item) openInvestmentModal(item.categoria, item); }
      else if (action === "delete-investment") { deleteInvestment(id); closeModal(); }
      else if (action === "add-debt") openDebtModal(btn.dataset.categoria, { id: uid() });
      else if (action === "edit-debt") { const item = state.debts.find((d) => d.id === id); if (item) openDebtModal(item.categoria, item); }
      else if (action === "delete-debt") { deleteDebt(id); closeModal(); }
      else if (action === "add-property") openPropertyModal({ id: uid() });
      else if (action === "edit-property") { const item = state.properties.find((p) => p.id === id); if (item) openPropertyModal(item); }
      else if (action === "delete-property") { deleteProperty(id); closeModal(); }
      else if (action === "add-receivable") openReceivableModal({ id: uid() });
      else if (action === "edit-receivable") { const item = state.receivables.find((r) => r.id === id); if (item) openReceivableModal(item); }
      else if (action === "delete-receivable") { deleteReceivable(id); closeModal(); }
      else if (action === "close-modal") closeModal();
      else if (action === "close-settings") closeSettings();
      return;
    }
  });

  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
  settingsOverlay.addEventListener("click", (e) => { if (e.target === settingsOverlay) closeSettings(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { if (!overlay.hidden) closeModal(); if (!settingsOverlay.hidden) closeSettings(); }
  });

  document.getElementById("openSettings").addEventListener("click", openSettings);
  document.getElementById("refreshQuotes").addEventListener("click", (e) => {
    e.preventDefault();
    refreshAllQuotes().catch(() => showToast("Não consegui atualizar as cotações agora."));
  });

  document.getElementById("themeToggle").addEventListener("click", (e) => {
    const btn = e.target.closest(".theme-opt");
    if (!btn) return;
    settings.theme = btn.dataset.theme;
    saveSettings(); applyTheme();
  });

  document.getElementById("brapiToken").addEventListener("change", (e) => {
    settings.brapiToken = e.target.value.trim();
    saveSettings();
  });
  document.getElementById("autoRefreshToggle").addEventListener("change", (e) => {
    settings.autoRefresh = e.target.checked;
    saveSettings();
  });

  document.getElementById("exportData").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `patrimonio-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
  document.getElementById("importDataBtn").addEventListener("click", () => document.getElementById("importDataInput").click());
  document.getElementById("importDataInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        state = Object.assign({ investments: [], debts: [], properties: [], receivables: [] }, parsed);
        saveState(); render(); closeSettings();
        showToast("Backup importado com sucesso.");
      } catch (err) {
        showToast("Esse arquivo não parece ser um backup válido.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });
  document.getElementById("resetData").addEventListener("click", () => {
    if (confirm("Isso vai apagar todos os investimentos, dívidas e imóveis salvos neste dispositivo. Tem certeza?")) {
      state = { investments: [], debts: [], properties: [], receivables: [] };
      saveState(); render(); closeSettings();
      showToast("Todos os dados foram apagados.");
    }
  });

  ["card-receivables", "card-properties", "card-investments-group", "card-debts-group"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const collapse = getCollapse();
    el.open = collapse[id] === true;
    el.addEventListener("toggle", () => setCollapse(id, el.open));
  });
  (() => {
    const id = "card-dashboard";
    const el = document.getElementById(id);
    if (!el) return;
    const collapse = getCollapse();
    if (collapse[id] === false) el.open = false;
    el.addEventListener("toggle", () => setCollapse(id, el.open));
  })();

  // ---------- recolher / expandir tudo ----------
  const toggleAllBtn = document.getElementById("toggleAllBtn");
  function updateToggleAllLabel() {
    const allDetails = document.querySelectorAll("#cards details");
    const anyOpen = Array.from(allDetails).some((d) => d.open);
    toggleAllBtn.classList.toggle("open", anyOpen);
    toggleAllBtn.title = anyOpen ? "Recolher tudo" : "Expandir tudo";
    toggleAllBtn.setAttribute("aria-label", toggleAllBtn.title);
  }
  toggleAllBtn.addEventListener("click", () => {
    const allDetails = document.querySelectorAll("#cards details");
    const anyOpen = Array.from(allDetails).some((d) => d.open);
    allDetails.forEach((d) => { d.open = !anyOpen; });
    updateToggleAllLabel();
  });
  document.getElementById("cards").addEventListener("toggle", updateToggleAllLabel, true);
  updateToggleAllLabel();

  // ---------- ocultar / mostrar valores ----------
  const EYE_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/></svg>`;
  const EYE_OFF_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/><path d="M3 3l18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  const toggleValuesBtn = document.getElementById("toggleValuesBtn");
  function updateEyeIcon() {
    toggleValuesBtn.innerHTML = settings.hideValues ? EYE_OFF_ICON : EYE_ICON;
    toggleValuesBtn.title = settings.hideValues ? "Mostrar valores" : "Ocultar valores";
    toggleValuesBtn.setAttribute("aria-label", toggleValuesBtn.title);
  }
  toggleValuesBtn.addEventListener("click", () => {
    settings.hideValues = !settings.hideValues;
    saveSettings();
    updateEyeIcon();
    render();
  });
  updateEyeIcon();

  // ---------- recolher / expandir dentro de um grupo específico ----------
  function wireGroupToggle(btnId, containerId) {
    const btn = document.getElementById(btnId);
    const container = document.getElementById(containerId);
    function update() {
      const subs = container.querySelectorAll("details.sub-block");
      const anyOpen = Array.from(subs).some((d) => d.open);
      btn.title = anyOpen ? "Recolher categorias" : "Expandir categorias";
    }
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const subs = container.querySelectorAll("details.sub-block");
      const anyOpen = Array.from(subs).some((d) => d.open);
      subs.forEach((d) => { d.open = !anyOpen; });
      update();
    });
    container.addEventListener("toggle", update, true);
    update();
    return update;
  }
  const updateInvestmentsGroupToggle = wireGroupToggle("toggleInvestmentsSub", "investmentCards");
  const updateDebtsGroupToggle = wireGroupToggle("toggleDebtsSub", "debtCards");

  // ---------- init ----------
  loadState();
  applyTheme();
  render();
  if (settings.autoRefresh) {
    refreshAllQuotes().catch(() => {});
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    });
  }
})();
