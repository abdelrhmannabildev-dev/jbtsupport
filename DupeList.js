// ═══════════════════════════════════════════════════════════════════════════════
//  CONFIG
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

// ── Demand tier config ─────────────────────────────────────────────────────────
// requestAdj   : added to requesting item effective value (positive = good for you)
// upgradeMulti : scales the expected overpay when upgrading
//                lower = items fly, so receiver doesn't need as much compensation
const DEMAND_CONFIG = {
  "very high": { requestAdj:  2_000_000, upgradeMulti: 0.0  },
  "high":      { requestAdj:  1_000_000, upgradeMulti: 0.3  },
  "decent":    { requestAdj:          0, upgradeMulti: 0.6  },
  "medium":    { requestAdj:          0, upgradeMulti: 0.8  },
  "low":       { requestAdj: -1_000_000, upgradeMulti: 1.2  },
  "very low":  { requestAdj: -1_500_000, upgradeMulti: 1.5  },
};

// Expected base overpay brackets (for upgrade trades: many items → fewer)
function baseUpgradeOP(totalOfferValue) {
  if (totalOfferValue < 10_000_000)  return 500_000;
  if (totalOfferValue < 30_000_000)  return 750_000;
  if (totalOfferValue < 100_000_000) return 1_000_000;
  return 1_500_000;
}

// Verdict bands (tradeScore = requestEffective - offerFaceValue + upgradeOP)
// Positive = WIN for offerer (getting more than giving)
const VERDICT_BANDS = [
  { min:  2_000_000, label: "Big Win 🔥",  cls: "verdict-bigwin"  },
  { min:    500_000, label: "Win ✅",       cls: "verdict-win"     },
  { min:   -500_000, label: "Fair ⚖️",     cls: "verdict-fair"    },
  { min: -2_000_000, label: "Loss ❌",      cls: "verdict-loss"    },
  { min: -Infinity,  label: "Big Loss 💀", cls: "verdict-bigloss" },
];

// ═══════════════════════════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════════════════════════
let allItems        = [];
let offeringItems   = [];
let requestingItems = [];
let hoardedNames    = new Set(); // loaded from localStorage

// ─── Load hoard from localStorage ────────────────────────────────────────────
function loadHoard() {
  try {
    const saved = JSON.parse(localStorage.getItem("jbe_hoard") || "[]");
    hoardedNames = new Set(saved);
  } catch { hoardedNames = new Set(); }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════════════════════════
loadHoard();

fetch(API_URL)
  .then(r => { if (!r.ok) throw new Error(); return r.json(); })
  .then(data => {
    allItems = Array.isArray(data) ? data : (data.values || []);
    if (!allItems.length) throw new Error();
    renderBrowser(allItems);
  })
  .catch(() => loadCSV());

function loadCSV() {
  fetch(CSV_FILE)
    .then(r => { if (!r.ok) throw new Error(); return r.text(); })
    .then(text => { allItems = parseCSV(text); renderBrowser(allItems); })
    .catch(() => {
      document.getElementById("valuesGrid").innerHTML =
        "<p style='color:#64748b;padding:40px;text-align:center'>Failed to load items.</p>";
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  BROWSER
// ═══════════════════════════════════════════════════════════════════════════════
const grid        = document.getElementById("valuesGrid");
const searchInput = document.getElementById("searchInput");

searchInput.addEventListener("input", e => {
  const q = e.target.value.toLowerCase();
  renderBrowser(allItems.filter(i => i.name && i.name.toLowerCase().includes(q)));
});

function renderBrowser(items) {
  grid.innerHTML = "";
  items.forEach(item => {
    const card = document.createElement("div");
    card.className = "calc-item-card";
    const catColor = CATEGORY_CONFIG[item.category] || "#64748b";
    const dk = normDemand(item.demand);
    const dc = demandClass(dk);
    card.innerHTML = `
      <div class="calc-item-title">${item.name}</div>
      <span class="calc-category" style="background:${catColor}20;color:${catColor}">${item.category}</span>
      <div class="calc-values">
        <div class="calc-row"><span>Value</span><strong>${fmt(item.value)}</strong></div>
        <div class="calc-row"><span>Duped</span><strong>${item.duped_value ? fmt(item.duped_value) : "N/A"}</strong></div>
      </div>
      <span class="demand-pill ${dc}">Demand: ${item.demand || "Unknown"}</span>
      <div class="calc-actions-row">
        <button class="calc-offer">+ Offer</button>
        <button class="calc-request">+ Request</button>
      </div>
    `;
    card.querySelector(".calc-offer").onclick   = () => addItem(item, "offering");
    card.querySelector(".calc-request").onclick = () => addItem(item, "requesting");
    grid.appendChild(card);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TRADE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════
function addItem(item, side) {
  const entry = {
    uid:        crypto.randomUUID(),
    name:       item.name,
    demand:     item.demand || "",
    cleanValue: numVal(item.value),
    dupedValue: numVal(item.duped_value),
    isDuped:    false,
    isHoarded:  hoardedNames.has(item.name),
  };
  (side === "offering" ? offeringItems : requestingItems).push(entry);
  renderTrade();
}

function removeItem(uid) {
  const el = document.querySelector(`.trade-item[data-uid="${uid}"]`);
  if (el) {
    el.classList.add("removing");
    setTimeout(() => {
      offeringItems   = offeringItems.filter(i   => i.uid !== uid);
      requestingItems = requestingItems.filter(i => i.uid !== uid);
      renderTrade();
    }, 140);
  }
}

function toggle(uid, field, val) {
  [...offeringItems, ...requestingItems].forEach(i => {
    if (i.uid === uid) i[field] = val;
  });
  renderTrade();
}

function renderTrade() {
  const ob = document.getElementById("offeringItems");
  const rb = document.getElementById("requestingItems");
  ob.innerHTML = "";
  rb.innerHTML = "";
  offeringItems.forEach(i   => renderTradeItem(i, ob));
  requestingItems.forEach(i => renderTradeItem(i, rb));

  // Empty state
  document.getElementById("offeringWrapper").classList.toggle("has-items",  offeringItems.length  > 0);
  document.getElementById("requestingWrapper").classList.toggle("has-items", requestingItems.length > 0);

  computeAndDisplay();
}

function renderTradeItem(item, box) {
  const el = document.createElement("div");
  el.className = "trade-item";
  if (item.isHoarded) el.classList.add("trade-item-hoarded");
  el.dataset.uid = item.uid;

  const displayVal = item.isDuped
    ? (item.dupedValue || item.cleanValue)
    : item.cleanValue;

  el.innerHTML = `
    <h4>${item.name}</h4>
    <div class="item-value">${fmt(displayVal)}</div>
    ${item.isHoarded ? '<span class="hoard-tag">🗄 Hoarded</span>' : ""}
    <div class="controls">
      <button class="clean ${!item.isDuped ? "active-btn" : ""}">Clean</button>
      <button class="duped ${item.isDuped  ? "active-btn" : ""}">Duped</button>
    </div>
  `;

  el.addEventListener("click",      () => removeItem(item.uid));
  el.querySelector(".clean").addEventListener("click", e => { e.stopPropagation(); toggle(item.uid, "isDuped", false); });
  el.querySelector(".duped").addEventListener("click", e => { e.stopPropagation(); toggle(item.uid, "isDuped", true);  });
  box.appendChild(el);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ALGORITHM
// ═══════════════════════════════════════════════════════════════════════════════
function computeAndDisplay() {
  const offerTotal   = document.getElementById("offeringTotal");
  const requestTotal = document.getElementById("requestingTotal");
  const breakdown    = document.getElementById("scoreBreakdown");

  if (!offeringItems.length && !requestingItems.length) {
    offerTotal.textContent   = "";
    requestTotal.textContent = "";
    breakdown.style.display  = "none";
    setVerdict(null);
    return;
  }

  // ── Step 1: face value totals ──────────────────────────────────────────────
  const offerFaceTotal   = offeringItems.reduce((s, i)  => s + effectiveVal(i), 0);
  const requestFaceTotal = requestingItems.reduce((s, i) => s + effectiveVal(i), 0);

  offerTotal.textContent   = "Total: " + fmt(offerFaceTotal);
  requestTotal.textContent = "Total: " + fmt(requestFaceTotal);

  if (!offeringItems.length || !requestingItems.length) {
    breakdown.style.display = "none";
    setVerdict(null, offerFaceTotal, requestFaceTotal);
    return;
  }

  // ── Step 2: demand adjustment on requesting side ───────────────────────────
  let demandAdjTotal = 0;
  requestingItems.forEach(item => {
    if (item.isHoarded) return; // hoarded items: ignore demand penalty
    const cfg = demandCfg(item.demand);
    demandAdjTotal += cfg.requestAdj;
  });

  const requestEffective = requestFaceTotal + demandAdjTotal;

  // ── Step 3: stack bonus on offering side ───────────────────────────────────
  // Group identical items, apply bonus if ≥3 of same high/very-high demand item
  const stackGroups = {};
  offeringItems.forEach(item => {
    if (!stackGroups[item.name]) stackGroups[item.name] = [];
    stackGroups[item.name].push(item);
  });

  let stackBonus = 0;
  Object.values(stackGroups).forEach(group => {
    if (group.length < 3) return;
    const dk = normDemand(group[0].demand);
    if (dk !== "high" && dk !== "very high") return;
    stackBonus += group.length * group[0].cleanValue * 0.03;
  });

  const offerEffective = offerFaceTotal + stackBonus;

  // ── Step 4: upgrade expected OP ───────────────────────────────────────────
  const isUpgrade = requestingItems.length < offeringItems.length;
  let expectedOP  = 0;

  if (isUpgrade) {
    // Average upgradeMulti from offering side
    const avgMulti = offeringItems.reduce((s, i) => s + demandCfg(i.demand).upgradeMulti, 0)
                     / offeringItems.length;

    const base = baseUpgradeOP(offerFaceTotal);
    expectedOP = base * avgMulti;

    // Stack discount: if the stack bonus already compensates the OP, reduce expectedOP
    if (stackBonus > 0) {
      expectedOP = Math.max(0, expectedOP - stackBonus);
    }
  }

  // ── Step 5: trade score ────────────────────────────────────────────────────
  // Positive = WIN for offerer (what they get > what they give after adjustments)
  const tradeScore = requestEffective - offerEffective + expectedOP;

  // ── Show breakdown ─────────────────────────────────────────────────────────
  const rawDiff = requestFaceTotal - offerFaceTotal;
  breakdown.style.display = "flex";

  setBreakdownRow("bdRawDiff",    "Raw diff",       rawDiff,    true);
  setBreakdownRow("bdDemandAdj",  "Demand adj",     demandAdjTotal, true);
  setBreakdownRow("bdStackBonus", "Stack bonus",    stackBonus, true);
  setBreakdownRow("bdUpgradeOP",  "Expected OP",    -expectedOP, true); // negative because it's a cost

  // ── Hoard notice ───────────────────────────────────────────────────────────
  const hoardNotice = document.getElementById("hoardNotice");
  const hasHoarded  = [...offeringItems, ...requestingItems].some(i => i.isHoarded);
  hoardNotice.style.display = hasHoarded ? "flex" : "none";

  // ── Verdict ────────────────────────────────────────────────────────────────
  setVerdict(tradeScore, offerFaceTotal, requestFaceTotal);
}

function setBreakdownRow(id, label, value, showSign) {
  const el = document.getElementById(id);
  if (!el) return;
  if (value === 0) { el.style.display = "none"; return; }
  el.style.display = "flex";
  const sign  = value >= 0 ? "+" : "";
  const color = value > 0 ? "#4ade80" : value < 0 ? "#f87171" : "#94a3b8";
  el.innerHTML = `<span class="bd-label">${label}</span><span class="bd-val" style="color:${color}">${sign}${fmt(value)}</span>`;
}

// ── Verdict bar & label ────────────────────────────────────────────────────────
function setVerdict(score, offerTotal, reqTotal) {
  const needle = document.getElementById("verdictNeedle");
  const label  = document.getElementById("verdictLabel");
  if (!needle || !label) return;

  if (score === null) {
    // Reset to centre
    needle.style.setProperty("--pos", "50%");
    needle.className  = "verdict-needle";
    label.textContent = "Add items to both sides";
    label.className   = "verdict-label";
    return;
  }

  // Map score to 0–100% position.
  // score > 0 = WIN (right of centre), score < 0 = LOSS (left of centre).
  // Scale: ±5m covers the full bar. Clamp so it never goes past the edges.
  const MAX_SCORE = 5_000_000;
  const clamped   = Math.max(-MAX_SCORE, Math.min(MAX_SCORE, score));
  // score=-5m → pos=0% (far left / big loss)
  // score= 0  → pos=50% (centre / fair)
  // score=+5m → pos=100% (far right / big win)
  const pos = ((clamped / MAX_SCORE) + 1) / 2 * 100;

  // *** KEY FIX: set CSS custom property so ::before pseudoelement picks it up ***
  needle.style.setProperty("--pos", pos + "%");

  // Pick verdict band
  const band = VERDICT_BANDS.find(b => score >= b.min);
  needle.className  = "verdict-needle " + band.cls;
  label.textContent = band.label;
  label.className   = "verdict-label " + band.cls;
}

// ─── Util: effective face value of a trade item ───────────────────────────────
function effectiveVal(item) {
  return item.isDuped ? (item.dupedValue || item.cleanValue) : item.cleanValue;
}

// ─── Util: demand config lookup ───────────────────────────────────────────────
function demandCfg(demand) {
  const key = normDemand(demand);
  return DEMAND_CONFIG[key] || { requestAdj: 0, upgradeMulti: 0.6 };
}

function normDemand(d) {
  return (d || "").toLowerCase().trim();
}

function demandClass(dk) {
  if (dk === "very high" || dk === "high") return "demand-high";
  if (dk === "decent")                     return "demand-decent";
  if (dk === "medium")                     return "demand-medium";
  if (dk === "low")                        return "demand-low";
  if (dk === "very low")                   return "demand-verylow";
  return "demand-low";
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CONTROLS
// ═══════════════════════════════════════════════════════════════════════════════
document.getElementById("swapBtn").onclick = () => {
  [offeringItems, requestingItems] = [requestingItems, offeringItems];
  renderTrade();
};

document.getElementById("clearBtn").onclick = () => {
  offeringItems   = [];
  requestingItems = [];
  renderTrade();
};

document.querySelectorAll(".trade-empty").forEach(el => {
  el.addEventListener("click", () => {
    document.getElementById("itemBrowser").scrollIntoView({ behavior: "smooth" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  CSV PARSER
// ═══════════════════════════════════════════════════════════════════════════════
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

function numVal(v) {
  if (!v || String(v).toUpperCase() === "N/A") return 0;
  return Number(String(v).replace(/,/g, "")) || 0;
}

function fmt(v) {
  if (v === null || v === undefined || v === "") return "N/A";
  const n = Number(String(v).replace(/,/g, ""));
  return isNaN(n) ? "N/A" : n.toLocaleString("en-US");
}