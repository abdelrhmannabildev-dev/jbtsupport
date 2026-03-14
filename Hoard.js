// ═══════════════════════════════════════════════════════════════════════════════
//  HOARD MANAGER
//  Saves/loads to localStorage under key "jbe_hoard" (array of item names)
// ═══════════════════════════════════════════════════════════════════════════════
const API_URL  = "https://reveal-hall-drugs-commission.trycloudflare.com/";
const CSV_FILE = "items.csv";

const CATEGORY_CONFIG = {
  "Body Color":   "#a855f7", "Drift":        "#f97316",
  "Furniture":    "#a16207", "Horns":        "#3b82f6",
  "HyperChrome":  "#ec4899", "Limited":      "#facc15",
  "Rim":          "#8b5cf6", "Seasonal":     "#22d3ee",
  "Spoiler":      "#f59e0b", "Texture":      "#94a3b8",
  "Tire Sticker": "#06b6d4", "Tire Style":   "#22c55e",
  "Vehicle":      "#ef4444", "Weapon Skin":  "#64748b"
};

const DEMAND_CONFIG = {
  "very high": { requestAdj:  2_000_000 },
  "high":      { requestAdj:  1_000_000 },
  "decent":    { requestAdj:          0 },
  "medium":    { requestAdj:          0 },
  "low":       { requestAdj: -1_000_000 },
  "very low":  { requestAdj: -1_500_000 },
};

let allItems   = [];
let hoardedSet = new Set(); // item names

// ─── Persistence ──────────────────────────────────────────────────────────────
function loadHoard() {
  try { hoardedSet = new Set(JSON.parse(localStorage.getItem("jbe_hoard") || "[]")); }
  catch { hoardedSet = new Set(); }
}

function saveHoard() {
  localStorage.setItem("jbe_hoard", JSON.stringify([...hoardedSet]));
}

function addToHoard(name) {
  hoardedSet.add(name);
  saveHoard();
  renderHoardList();
  renderStats();
}

function removeFromHoard(name) {
  hoardedSet.delete(name);
  saveHoard();
  renderHoardList();
  renderStats();
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
loadHoard();

fetch(API_URL)
  .then(r => { if (!r.ok) throw new Error(); return r.json(); })
  .then(data => {
    allItems = Array.isArray(data) ? data : (data.values || []);
    if (!allItems.length) throw new Error();
    init();
  })
  .catch(() => loadCSV());

function loadCSV() {
  fetch(CSV_FILE)
    .then(r => { if (!r.ok) throw new Error(); return r.text(); })
    .then(text => { allItems = parseCSV(text); init(); })
    .catch(() => {
      document.getElementById("hoardMain").innerHTML +=
        "<p style='color:#64748b;text-align:center;padding:40px'>Failed to load items.</p>";
    });
}

function init() {
  renderHoardList();
  renderStats();
  setupSearch();
}

// ─── Hoard list ───────────────────────────────────────────────────────────────
function renderHoardList() {
  const listEl    = document.getElementById("hoardList");
  const titleEl   = document.getElementById("hoardListTitle");
  const names     = [...hoardedSet];

  if (!names.length) {
    titleEl.style.display = "none";
    listEl.innerHTML = `
      <div class="hoard-empty">
        <div class="hoard-empty-icon">🗄</div>
        <p>You have no hoarded items yet.</p>
        <p class="hoard-empty-sub">Search for items above and mark them as hoarded. The Trade Calculator will then ignore demand penalties for those items.</p>
      </div>`;
    return;
  }

  titleEl.style.display = "block";
  listEl.innerHTML = "";

  names.forEach(name => {
    const item  = allItems.find(i => i.name === name);
    const color = item ? (CATEGORY_CONFIG[item.category] || "#64748b") : "#64748b";

    const card = document.createElement("div");
    card.className = "hoard-card";
    card.style.borderColor = color;

    card.innerHTML = `
      <div class="hoard-card-top">
        <div>
          <div class="hoard-card-name">${name}</div>
          ${item ? `<span class="category-badge" style="background:${color}20;color:${color}">${item.category}</span>` : ""}
        </div>
        <button class="hoard-remove-btn" title="Remove from hoard">✕</button>
      </div>
      ${item ? `
      <div class="hoard-card-vals">
        <div class="value-row"><span>Value</span><strong>${fmt(item.value)}</strong></div>
        <div class="value-row"><span>Demand</span>${demandBadge(item.demand)}</div>
      </div>
      <div class="hoard-why">
        ${hoardReason(item.demand)}
      </div>` : '<p style="color:#64748b;font-size:13px">Item data not found</p>'}
    `;

    card.querySelector(".hoard-remove-btn").addEventListener("click", () => removeFromHoard(name));
    listEl.appendChild(card);
  });
}

// Explain why someone would hoard this
function hoardReason(demand) {
  const dk = (demand || "").toLowerCase().trim();
  if (dk === "very low" || dk === "low")
    return `<span class="hoard-reason-tag">📈 Holding for value appreciation — demand penalty ignored in trades</span>`;
  if (dk === "high" || dk === "very high")
    return `<span class="hoard-reason-tag hoard-reason-good">⭐ High demand — good investment hold</span>`;
  return `<span class="hoard-reason-tag">📦 Marked as investment hold</span>`;
}

// ─── Stats bar ────────────────────────────────────────────────────────────────
function renderStats() {
  const el    = document.getElementById("hoardStats");
  const names = [...hoardedSet];
  if (!names.length) { el.innerHTML = ""; return; }

  const items = names.map(n => allItems.find(i => i.name === n)).filter(Boolean);
  const totalVal = items.reduce((s, i) => s + numVal(i.value), 0);

  const demandCounts = {};
  items.forEach(i => {
    const d = (i.demand || "Unknown");
    demandCounts[d] = (demandCounts[d] || 0) + 1;
  });

  el.innerHTML = `
    <div class="hoard-stat-card">
      <div class="stat-label">Items Hoarding</div>
      <div class="stat-value" style="color:#38bdf8">${names.length}</div>
    </div>
    <div class="hoard-stat-card">
      <div class="stat-label">Total Hoard Value</div>
      <div class="stat-value" style="color:#4ade80">${fmt(totalVal)}</div>
    </div>
    <div class="hoard-stat-card">
      <div class="stat-label">Demand Breakdown</div>
      <div class="hoard-demand-breakdown">
        ${Object.entries(demandCounts).map(([d,c]) => `
          <span class="demand-badge ${demandBadgeClass(d)}">${d}: ${c}</span>
        `).join("")}
      </div>
    </div>
  `;
}

// ─── Search ───────────────────────────────────────────────────────────────────
function setupSearch() {
  const input   = document.getElementById("hoardSearch");
  const section = document.getElementById("searchResultsSection");
  const results = document.getElementById("hoardSearchResults");

  input.addEventListener("input", e => {
    const q = e.target.value.toLowerCase().trim();
    if (!q) { section.style.display = "none"; return; }

    const matches = allItems.filter(i => i.name.toLowerCase().includes(q)).slice(0, 30);
    section.style.display = "block";
    results.innerHTML = "";

    if (!matches.length) {
      results.innerHTML = "<p style='color:#64748b;padding:20px;grid-column:1/-1'>No items found.</p>";
      return;
    }

    matches.forEach(item => {
      const isHoarded = hoardedSet.has(item.name);
      const color     = CATEGORY_CONFIG[item.category] || "#64748b";
      const card      = document.createElement("div");
      card.className  = "value-card";
      card.style.borderColor = color;

      card.innerHTML = `
        <h3>${item.name}</h3>
        <span class="category-badge" style="background:${color}20;color:${color}">${item.category}</span>
        <div class="value-row"><span>Value</span><strong>${fmt(item.value)}</strong></div>
        <div class="value-row" style="align-items:center"><span>Demand</span>${demandBadge(item.demand)}</div>
        <button class="hoard-toggle-btn ${isHoarded ? "hoard-active" : ""}" data-name="${item.name}">
          ${isHoarded ? "✓ Hoarding" : "+ Add to Hoard"}
        </button>
      `;

      card.querySelector(".hoard-toggle-btn").addEventListener("click", () => {
        if (hoardedSet.has(item.name)) {
          removeFromHoard(item.name);
        } else {
          addToHoard(item.name);
        }
        // Re-render results so button state updates
        input.dispatchEvent(new Event("input"));
      });

      results.appendChild(card);
    });
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
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
  return Number(String(v).replace(/,/g, "")) || 0;
}

function fmt(v) {
  if (v === null || v === undefined || v === "") return "N/A";
  const n = Number(String(v).replace(/,/g, ""));
  return isNaN(n) ? "N/A" : n.toLocaleString("en-US");
}

// ─── CSV parser ───────────────────────────────────────────────────────────────
function parseCSVLine(line) {
  const result = []; let i = 0;
  line = line.replace(/\r/g, "");
  while (i <= line.length) {
    if (i === line.length) { result.push(""); break; }
    if (line[i] === '"') {
      let j = i + 1;
      while (j < line.length && !(line[j] === '"' && line[j+1] !== '"')) { if (line[j] === '"') j++; j++; }
      result.push(line.slice(i+1, j).replace(/""/g, '"'));
      i = j + 1; if (line[i] === ',') i++;
    } else {
      const j = line.indexOf(',', i);
      if (j === -1) { result.push(line.slice(i)); break; }
      result.push(line.slice(i, j)); i = j + 1;
    }
  }
  return result;
}

function parseCSV(text) {
  const lines   = text.trim().split("\n");
  const headers = parseCSVLine(lines.shift());
  return lines.filter(l => l.trim()).map(line => {
    const vals = parseCSVLine(line);
    const obj  = {};
    headers.forEach((h, i) => {
      if (!h) return;
      const raw = (vals[i] ?? "").trim();
      if ((h === "value" || h === "duped_value") && raw && raw.toUpperCase() !== "N/A") {
        const n = Number(raw.replace(/,/g, ""));
        obj[h] = isNaN(n) ? null : n;
      } else { obj[h] = raw; }
    });
    return obj;
  });
}
