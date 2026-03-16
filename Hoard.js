// ═══════════════════════════════════════════════════════════════════════════════
//  HOARD MANAGER v2
//  Storage key: "jbe_hoard_v2"
//  Format: { "ItemName": { customValue: number|null, customDemand: string|null } }
//  Backward compat: migrates old "jbe_hoard" (array) on first load
// ═══════════════════════════════════════════════════════════════════════════════
const API_URL  = "https://reveal-hall-drugs-commission.trycloudflare.com";
const CSV_FILE = "items.csv";
const CSV_URL  = new URL(CSV_FILE, window.location.href).toString();

const CATEGORY_CONFIG = {
  "Body Color":"#a855f7","Drift":"#f97316","Furniture":"#a16207","Horns":"#3b82f6",
  "HyperChrome":"#ec4899","Limited":"#facc15","Rim":"#8b5cf6","Seasonal":"#22d3ee",
  "Spoiler":"#f59e0b","Texture":"#94a3b8","Tire Sticker":"#06b6d4","Tire Style":"#22c55e",
  "Vehicle":"#ef4444","Weapon Skin":"#64748b"
};

const DEMAND_OPTIONS = ["Very High","High","Decent","Medium","Low","Very Low"];

let allItems  = [];
let hoardData = {}; // { name: { customValue, customDemand } }
let numberFormat = "full";
let sortKey = "default";
let searchQuery = "";
let searchInputEl;
let searchSectionEl;
let searchResultsEl;

// ── Storage ───────────────────────────────────────────────────────────────────
function loadHoard() {
  try {
    // Try new format first
    const v2 = localStorage.getItem("jbe_hoard_v2");
    if (v2) { hoardData = JSON.parse(v2); return; }

    // Migrate old format (array of names)
    const old = localStorage.getItem("jbe_hoard");
    if (old) {
      const names = JSON.parse(old);
      hoardData = {};
      names.forEach(n => { hoardData[n] = { customValue: null, customDemand: null }; });
      saveHoard();
    }
  } catch { hoardData = {}; }
}

function saveHoard() {
  localStorage.setItem("jbe_hoard_v2", JSON.stringify(hoardData));
}

function addToHoard(name) {
  if (!hoardData[name]) hoardData[name] = { customValue: null, customDemand: null };
  saveHoard();
  renderHoardList();
  renderStats();
}

function removeFromHoard(name) {
  delete hoardData[name];
  saveHoard();
  renderHoardList();
  renderStats();
}

function updateCustomValue(name, val) {
  if (!hoardData[name]) return;
  let str = String(val).replace(/,/g, "").toLowerCase();
  let multiplier = 1;
  if (str.endsWith('m')) {
    multiplier = 1000000;
    str = str.slice(0, -1);
  }
  const n = Number(str) * multiplier;
  hoardData[name].customValue = (val === "" || isNaN(n)) ? null : n;
  saveHoard();
}

function updateCustomDemand(name, demand) {
  if (!hoardData[name]) return;
  hoardData[name].customDemand = demand || null;
  saveHoard();
}

// ── Boot ─────────────────────────────────────────────────────────────────────
loadHoard();

fetch(API_URL)
  .then(r => {
    if (!r.ok) throw new Error();
    return r.json();
  })
  .then(d => {
    allItems = Array.isArray(d) ? d : (d.values || []);
    if (!allItems.length) throw new Error();
    init();
  })
  .catch(() =>
    fetch(CSV_URL, { cache: "no-store" })
      .then(r => {
        if (!r.ok) throw new Error("CSV not found");
        return r.text();
      })
      .then(t => {
        allItems = parseCSV(t);
        if (!allItems.length) throw new Error("CSV empty");
        console.log("Loaded items:", allItems.length);
        init();
      })
  )
  .catch(() => {
    const fileNote = location.protocol === "file:"
      ? "<br><br><span style='font-size:14px;color:#94a3b8'>Local file access is blocked by the browser. Run a local server (example: <code>python -m http.server</code>) and open <code>http://localhost:8000/Hoard.html</code>.</span>"
      : "";
    document.getElementById("hoardMain").innerHTML +=
      "<p style='color:#64748b;text-align:center;padding:40px'>Failed to load items." + fileNote + "</p>";
  });

function init() { renderHoardList(); renderStats(); setupControls(); setupSearch(); }

function setupControls() {
  const header = document.querySelector(".values-header");
  if (!header || document.getElementById("sortSelect")) return;

  const controlsHtml = `
    <div class="list-controls">
      <div class="format-wrapper" title="Choose how numbers are displayed">
        <label for="formatSelect">Number Format:</label>
        <select id="formatSelect">
          <option value="full">Full (e.g., 1,000,000)</option>
          <option value="short">Short (e.g., 1M / 1K)</option>
        </select>
      </div>
      <div class="format-wrapper" title="Sort items">
        <label for="sortSelect">Sort By:</label>
        <select id="sortSelect">
          <option value="default">Default</option>
          <option value="value-desc">Value: High â†’ Low</option>
          <option value="value-asc">Value: Low â†’ High</option>
          <option value="demand-desc">Demand: High â†’ Low</option>
          <option value="demand-asc">Demand: Low â†’ High</option>
          <option value="name-asc">Name A â†’ Z</option>
          <option value="name-desc">Name Z â†’ A</option>
        </select>
      </div>
    </div>
  `;
  header.insertAdjacentHTML("beforeend", controlsHtml);

  const formatSelect = document.getElementById("formatSelect");
  formatSelect.value = numberFormat;
  formatSelect.addEventListener("change", e => {
    numberFormat = e.target.value;
    renderHoardList();
    renderStats();
    renderSearchResults();
  });

  const sortSelect = document.getElementById("sortSelect");
  sortSelect.value = sortKey;
  sortSelect.addEventListener("change", e => {
    sortKey = e.target.value;
    renderHoardList();
    renderStats();
    renderSearchResults();
  });
}

// ── Hoard list ────────────────────────────────────────────────────────────────
function renderHoardList() {
  const listEl  = document.getElementById("hoardList");
  const titleEl = document.getElementById("hoardListTitle");
  const names   = Object.keys(hoardData);

  if (!names.length) {
    titleEl.style.display = "none";
    listEl.innerHTML = `
      <div class="hoard-empty">
        <div class="hoard-empty-icon">🗄</div>
        <p>No hoarded items yet.</p>
        <p class="hoard-empty-sub">Search for items below and mark them as hoarded. You can set a personal value and demand so the Trade Calculator uses your estimate instead of the market value.</p>
      </div>`;
    return;
  }

  titleEl.style.display = "block";
  listEl.innerHTML = "";

  const itemsForSort = names.map(name => {
    const item = allItems.find(i => i.name === name);
    return item || { name, value: 0, demand: "", category: "" };
  });
  const sortedItems = applySort(itemsForSort);

  sortedItems.forEach(item => {
    const name    = item.name;
    const entry   = hoardData[name];
    const full    = allItems.find(i => i.name === name) || item;
    const color   = full ? (CATEGORY_CONFIG[full.category] || "#64748b") : "#64748b";
    const mktVal  = full ? numVal(full.value) : 0;
    const mktDem  = full ? (full.demand || "Unknown") : "Unknown";

    const card = document.createElement("div");
    card.className = "hoard-card";
    card.style.borderColor = color;

    card.innerHTML = `
      <div class="hoard-card-top">
        <div>
          <div class="hoard-card-name">${name}</div>
          ${full ? `<span class="category-badge" style="background:${color}20;color:${color}">${full.category}</span>` : ""}
        </div>
        <button class="hoard-remove-btn" title="Remove from hoard">✕</button>
      </div>

      <!-- Market values (read-only reference) -->
      <div class="hoard-market-row">
        <span class="hoard-mkt-label">Market</span>
        <span class="hoard-mkt-val">${fmt(mktVal)}</span>
        <span class="demand-badge ${demandBadgeClass(mktDem)}">${mktDem}</span>
      </div>

      <!-- Custom override inputs -->
      <div class="hoard-custom-section">
        <div class="hoard-custom-label">
          My estimate
          <span class="hoard-custom-hint">Used by the Trade Calculator instead of market data</span>
        </div>
        <div class="hoard-custom-row">
          <div class="hoard-input-wrap">
            <span class="hoard-input-prefix">💰</span>
            <input
              type="text"
              class="hoard-custom-input hoard-val-input"
              placeholder="${fmt(mktVal)}"
              value="${entry.customValue !== null ? entry.customValue.toLocaleString('en-US') : ''}"
              data-name="${name}"
            />
          </div>
          <select class="hoard-custom-select hoard-dem-select" data-name="${name}">
            <option value="" Style="background:${color};">Market (${mktDem})</option>
            ${DEMAND_OPTIONS.map(d => `<option value="${d}" ${entry.customDemand === d ? "selected" : ""}>${d}</option>`).join("")}
          </select>
        </div>

        ${entry.customValue !== null || entry.customDemand !== null ? `
        <div class="hoard-override-active">
          ✓ Custom estimate active —
          <strong>${entry.customValue !== null ? fmt(entry.customValue) : fmt(mktVal)}</strong>
          · <strong>${entry.customDemand || mktDem}</strong>
        </div>` : `
        <div class="hoard-override-inactive">No custom estimate set — using market values</div>
        `}
      </div>

      ${hoardReason(entry.customDemand || mktDem)}
    `;

    card.querySelector(".hoard-remove-btn").addEventListener("click", () => removeFromHoard(name));

    const valInput = card.querySelector(".hoard-val-input");
    valInput.addEventListener("change", () => {
      updateCustomValue(name, valInput.value.trim());
      renderHoardList(); renderStats();
    });

    const demSelect = card.querySelector(".hoard-dem-select");
    demSelect.addEventListener("change", () => {
      updateCustomDemand(name, demSelect.value);
      renderHoardList(); renderStats();
    });

    listEl.appendChild(card);
  });
}

function hoardReason(demand) {
  const dk = (demand || "").toLowerCase().trim();
  if (dk === "very low" || dk === "low")
    return `<div class="hoard-why"><span class="hoard-reason-tag">📈 Holding for appreciation — demand penalty ignored in trades</span></div>`;
  if (dk === "high" || dk === "very high")
    return `<div class="hoard-why"><span class="hoard-reason-tag hoard-reason-good">⭐ High demand hold — solid investment</span></div>`;
  return `<div class="hoard-why"><span class="hoard-reason-tag">📦 Investment hold — using your custom estimate</span></div>`;
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function renderStats() {
  const el    = document.getElementById("hoardStats");
  const names = Object.keys(hoardData);
  if (!names.length) { el.innerHTML = ""; return; }

  let totalVal = 0;
  const demandCounts = {};
  names.forEach(name => {
    const entry = hoardData[name];
    const item  = allItems.find(i => i.name === name);
    const val   = entry.customValue !== null ? entry.customValue : (item ? numVal(item.value) : 0);
    totalVal   += val;
    const dem   = entry.customDemand || (item ? item.demand : "Unknown") || "Unknown";
    demandCounts[dem] = (demandCounts[dem] || 0) + 1;
  });

  el.innerHTML = `
    <div class="hoard-stat-card">
      <div class="stat-label">Items Hoarding</div>
      <div class="stat-value" style="color:#38bdf8">${names.length}</div>
    </div>
    <div class="hoard-stat-card">
      <div class="stat-label">Total Hoard Value</div>
      <div class="stat-value" style="color:#4ade80">${fmt(totalVal)}</div>
      <div class="stat-sub">Using your estimates where set</div>
    </div>
    <div class="hoard-stat-card">
      <div class="stat-label">Demand Breakdown</div>
      <div class="hoard-demand-breakdown">
        ${Object.entries(demandCounts).map(([d,c]) =>
          `<span class="demand-badge ${demandBadgeClass(d)}">${d}: ${c}</span>`
        ).join("")}
      </div>
    </div>
  `;
}

// ── Search ────────────────────────────────────────────────────────────────────
function setupSearch() {
  searchInputEl = document.getElementById("hoardSearch");
  searchSectionEl = document.getElementById("searchResultsSection");
  searchResultsEl = document.getElementById("hoardSearchResults");
  if (!searchInputEl) return;

  searchInputEl.addEventListener("input", e => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderSearchResults();
  });
}

function renderSearchResults() {
  if (!searchSectionEl || !searchResultsEl) return;
  if (!searchQuery) { searchSectionEl.style.display = "none"; return; }

  let matches = allItems.filter(i => i.name.toLowerCase().includes(searchQuery));
  matches = applySort(matches).slice(0, 30);

  searchSectionEl.style.display = "block";
  searchResultsEl.innerHTML = "";

  if (!matches.length) {
    searchResultsEl.innerHTML = "<p style='color:#64748b;padding:20px;grid-column:1/-1'>No items found.</p>";
    return;
  }

  matches.forEach(item => {
    const isHoarded = !!hoardData[item.name];
    const color     = CATEGORY_CONFIG[item.category] || "#64748b";
    const card      = document.createElement("div");
    card.className  = "value-card show";
    card.style.borderColor = color;

    card.innerHTML = `
      <h3>${item.name}</h3>
      <span class="category-badge" style="background:${color}20;color:${color}">${item.category}</span>
      <div class="value-row"><span>Value</span><strong>${fmt(item.value)}</strong></div>
      <div class="value-row" style="align-items:center"><span>Demand</span>${demandBadge(item.demand)}</div>
      <button class="hoard-toggle-btn ${isHoarded ? "hoard-active" : ""}" data-name="${item.name}">
        ${isHoarded ? "âœ“ Hoarding" : "+ Add to Hoard"}
      </button>
    `;

    card.querySelector(".hoard-toggle-btn").addEventListener("click", () => {
      if (hoardData[item.name]) { removeFromHoard(item.name); }
      else                      { addToHoard(item.name); }
      searchInputEl.dispatchEvent(new Event("input"));
    });

    searchResultsEl.appendChild(card);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function demandBadge(demand) {
  if (!demand || !demand.trim()) return `<span class="demand-badge d-unknown">Unknown</span>`;
  return `<span class="demand-badge ${demandBadgeClass(demand)}">${demand}</span>`;
}

function demandBadgeClass(demand) {
  const k = (demand || "").toLowerCase().trim();
  if (k === "very high" || k === "high") return "d-high";
  if (k === "decent")  return "d-decent";
  if (k === "medium")  return "d-medium";
  if (k === "low")     return "d-low";
  if (k === "very low")return "d-verylow";
  return "d-unknown";
}

function numVal(v) {
  if (!v || String(v).toUpperCase() === "N/A") return 0;
  let str = String(v).replace(/,/g, "").toLowerCase();
  let multiplier = 1;
  if (str.endsWith('m')) {
    multiplier = 1000000;
    str = str.slice(0, -1);
  }
  return Number(str) * multiplier || 0;
}

function fmt(v) {
  if (v === null || v === undefined || v === "") return "N/A";
  const n = Number(String(v).replace(/,/g, ""));
  if (isNaN(n)) return "N/A";
  if (numberFormat === "short") {
    if (n >= 1_000_000) return (n / 1_000_000).toLocaleString("en", { maximumFractionDigits: 1 }) + "M";
    if (n >= 1_000) return (n / 1_000).toLocaleString("en", { maximumFractionDigits: 2 }) + "K";
  }
  return n.toLocaleString("en-US");
}

function applySort(items) {
  const out = [...items];
  const DEMAND_ORDER = { "very high": 5, "high": 4, "decent": 3, "medium": 2, "low": 1, "very low": 0 };
  if (sortKey === "name-asc") {
    out.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortKey === "name-desc") {
    out.sort((a, b) => b.name.localeCompare(a.name));
  } else if (sortKey === "value-desc" || sortKey === "default") {
    out.sort((a, b) => numVal(b.value) - numVal(a.value));
  } else if (sortKey === "value-asc") {
    out.sort((a, b) => numVal(a.value) - numVal(b.value));
  } else if (sortKey === "demand-desc") {
    out.sort((a, b) => (DEMAND_ORDER[(b.demand||"").toLowerCase()] ?? -1) - (DEMAND_ORDER[(a.demand||"").toLowerCase()] ?? -1));
  } else if (sortKey === "demand-asc") {
    out.sort((a, b) => (DEMAND_ORDER[(a.demand||"").toLowerCase()] ?? -1) - (DEMAND_ORDER[(b.demand||"").toLowerCase()] ?? -1));
  }
  return out;
}

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCSVLine(line) {
  const result=[]; let i=0;
  line=line.replace(/\r/g,"");
  while(i<=line.length){
    if(i===line.length){result.push("");break;}
    if(line[i]==='"'){
      let j=i+1;
      while(j<line.length&&!(line[j]==='"'&&line[j+1]!=='"')){if(line[j]==='"')j++;j++;}
      result.push(line.slice(i+1,j).replace(/""/g,'"'));
      i=j+1;if(line[i]===',')i++;
    }else{
      const j=line.indexOf(',',i);
      if(j===-1){result.push(line.slice(i));break;}
      result.push(line.slice(i,j));i=j+1;
    }
  }
  return result;
}

function parseCSV(text) {
  const lines=text.trim().split("\n");
  const headers=parseCSVLine(lines.shift());
  return lines.filter(l=>l.trim()).map(line=>{
    const vals=parseCSVLine(line);
    const obj={};
    headers.forEach((h,i)=>{
      if(!h)return;
      const raw=(vals[i]??"").trim();
      if((h==="value"||h==="duped_value")&&raw&&raw.toUpperCase()!=="N/A"){
        const n=Number(raw.replace(/,/g,""));
        obj[h]=isNaN(n)?null:n;
      }else{obj[h]=raw;}
    });
    return obj;
  });
}
