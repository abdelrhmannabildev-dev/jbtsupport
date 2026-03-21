// ═══════════════════════════════════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════════════════════════════════
const API_URL  = "https://reveal-hall-drugs-commission.trycloudflare.com/";
const CSV_FILE = "items.csv";
const CSV_URL  = new URL(CSV_FILE, window.location.href).toString();

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
  "close to none": { requestAdj: -2_000_000, upgradeMulti: 2},
};

// Demand tier → numeric rank for comparison
function demandRank(d) {
  const k = (d || "").toLowerCase().trim();
  if (k === "very high") return 6;
  if (k === "high")      return 5;
  if (k === "decent")    return 4;
  if (k === "medium")    return 3;
  if (k === "low")       return 2;
  if (k === "very low")  return 1;
  if (k === "close to none") return 0;
  return 4; // unknown → treat as decent
}

// Upgrade OP:
//   base is always 500k when demand sides are similar (within 1 tier avg).
//   if offering lower-demand items (harder to re-trade) → scale UP (they need more OP).
//   if offering higher-demand items (easy to move) → scale DOWN (less OP needed).
function calcUpgradeOP(offeringItems, requestingItems, totalOfferValue, stackBonus) {
  const BASE_OP = requestingItems<20_000_000? 500_000:1_000_000;

  const offerAvgRank   = offeringItems.reduce((s,i)  => s + demandRank(i.demand), 0) / offeringItems.length;
  const requestAvgRank = requestingItems.reduce((s,i) => s + demandRank(i.demand), 0) / requestingItems.length;

  const rankDiff = offerAvgRank - requestAvgRank; // positive = offering higher demand than requesting

  // When demand is similar (diff within 1 tier) → flat 500k OP
  // When offering lower-demand items → scale up OP (harder for receiver to move them)
  // When offering higher-demand items → scale down OP (easy for receiver)
  let scale;
  if (Math.abs(rankDiff) <= 1) {
    scale = 1.0;                              // similar demand → flat 500k
  } else if (rankDiff < -1) {
    // Offering LOWER demand than requesting → receiver stuck with hard-to-move items
    scale = 1.0 + (Math.abs(rankDiff) - 1) * 0.5; // e.g. 2 tiers diff → ×1.5 → 750k
  } else {
    // Offering HIGHER demand → receiver gets easy-to-move items, less OP needed
    scale = Math.max(0.2, 1.0 - (rankDiff - 1) * 0.4); // e.g. 2 tiers diff → ×0.6 → 300k
  }

  let op = BASE_OP * scale;

  // Stack discount: if offering a stack of high-demand items, stackBonus already
  // compensates the receiver — reduce expected OP accordingly
  if (stackBonus > 0) {
    op = Math.max(0, op - stackBonus);
  }

  return op;
}

// Verdict bands (tradeScore = requestEffective - offerFaceValue + upgradeOP)
// Positive = WIN for offerer (getting more than giving)
const VERDICT_BANDS = [
  { min:  2_000_000, label: "Big Win 🔥",  cls: "verdict-bigwin"  },
  { min:    1000_000, label: "Win ✅",      cls: "verdict-win"     },
  { min:   -500_000, label: "Fair ⚖️",     cls: "verdict-fair"    },
  { min: -2_000_000, label: "Loss ❌",     cls: "verdict-loss"    },
  { min: -Infinity,  label: "Big Loss 💀", cls: "verdict-bigloss" },
];

// ═══════════════════════════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════════════════════════
let allItems        = [];
let offeringItems   = [];
let requestingItems = [];
let hoardedNames = new Set(); // item name → quick lookup
let hoardData    = {};        // item name → { customValue, customDemand }
let numberFormat = "full";
let sortKey = "default";
let searchQuery = "";

// ─── Load hoard (v2: custom value+demand per item) ────────────────────────────
function loadHoard() {
  try {
    const v2 = localStorage.getItem("jbe_hoard_v2");
    if (v2) {
      hoardData    = JSON.parse(v2);
      hoardedNames = new Set(Object.keys(hoardData));
      return;
    }
    // Migrate old format (plain array of names)
    const old = localStorage.getItem("jbe_hoard");
    if (old) {
      const names = JSON.parse(old);
      hoardData = {};
      names.forEach(n => { hoardData[n] = { customValue: null, customDemand: null }; });
      hoardedNames = new Set(names);
    }
  } catch { hoardedNames = new Set(); hoardData = {}; }
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
    updateBrowser();
  })
  .catch(() => loadCSV());

function loadCSV() {
  fetch(CSV_URL, { cache: "no-store" })
    .then(r => { if (!r.ok) throw new Error(); return r.text(); })
    .then(text => { allItems = parseCSV(text); updateBrowser(); })
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
          <option value="value-desc">Value: High → Low</option>
          <option value="value-asc">Value: Low → High</option>
          <option value="demand-desc">Demand: High → Low</option>
          <option value="demand-asc">Demand: Low → High</option>
          <option value="name-asc">Name A → Z</option>
          <option value="name-desc">Name Z → A</option>
        </select>
      </div>
    </div>
  `;
if (searchInput) {
  searchInput.insertAdjacentHTML("afterend", controlsHtml);
  const formatSelect = document.getElementById("formatSelect");
  const sortSelect = document.getElementById("sortSelect");

  if (formatSelect) {
    formatSelect.value = numberFormat;
    formatSelect.addEventListener("change", e => {
      numberFormat = e.target.value;
      updateBrowser();
      renderTrade();
    });
  }

  if (sortSelect) {
    sortSelect.value = sortKey;
    sortSelect.addEventListener("change", e => {
      sortKey = e.target.value;
      updateBrowser();
    });
  }

  searchInput.addEventListener("input", e => {
    searchQuery = e.target.value.toLowerCase().trim();
    updateBrowser();
  });
}

function updateBrowser() {
  let items = allItems;
  if (searchQuery) {
    items = items.filter(i => i.name && i.name.toLowerCase().includes(searchQuery));
  }
  items = applySort(items);
  renderBrowser(items);
}

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
  const isHoarded = hoardedNames.has(item.name);
  const hEntry    = isHoarded ? (hoardData[item.name] || {}) : {};

  // Use custom value/demand if the user has set them, otherwise fall back to market data
  const cleanValue = (isHoarded && hEntry.customValue != null)
    ? hEntry.customValue
    : numVal(item.value);

  const demand = (isHoarded && hEntry.customDemand)
    ? hEntry.customDemand
    : (item.demand || "");

  const entry = {
    uid:        crypto.randomUUID(),
    name:       item.name,
    demand,
    cleanValue,
    dupedValue: numVal(item.duped_value),
    isDuped:    false,
    isHoarded,
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

  // Check if custom overrides are active for this hoarded item
  const hEntry       = item.isHoarded ? (hoardData[item.name] || {}) : {};
  const hasCustomVal = item.isHoarded && hEntry.customValue != null;
  const hasCustomDem = item.isHoarded && hEntry.customDemand;

  el.innerHTML = `
    <h4>${item.name}</h4>
    <div class="item-value">${fmt(displayVal)}${hasCustomVal ? ' <span class="custom-val-tag">✎</span>' : ""}</div>
    ${item.isHoarded ? `<span class="hoard-tag">🗄${hasCustomVal||hasCustomDem ? " Custom" : " Hoarded"}</span>` : ""}
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
    setVerdict(null);
    return;
  }

  // ── Step 2: demand adjustment — symmetric on both sides ───────────────────
  // Requesting high-demand item: worth MORE to you (+adj) — easy to re-trade
  // Offering high-demand item:   costs MORE to give (-adj) — you lose something valuable
  // Both use the same magnitude so symmetric trades cancel out correctly.
  let reqDemandAdj = 0;
  requestingItems.forEach(item => {
    if (item.isHoarded) return;
    reqDemandAdj += demandCfg(item.demand).requestAdj;
  });

  let offerDemandAdj = 0;
  offeringItems.forEach(item => {
    if (item.isHoarded) return;
    offerDemandAdj += demandCfg(item.demand).requestAdj; // same scale, subtracted below
  });

  // Net demand adj = benefit of what you get minus cost of what you give
  const demandAdjTotal  = reqDemandAdj - offerDemandAdj;
  const requestEffective = requestFaceTotal + reqDemandAdj;
  const offerDemandCost  = offerDemandAdj;

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

  // offerEffective includes stack bonus + demand cost of giving away your items
  const offerEffective = offerFaceTotal + stackBonus + offerDemandCost;

  // ── Step 4: upgrade / downgrade OP ───────────────────────────────────────
  // Upgrade   (you give many → get fewer):  you owe OP  → positive expectedOP
  // Downgrade (you give few  → get more):   they owe OP → negative expectedOP
  //   (negative shifts the fair point: trade must OP YOU to be considered fair)
  // 1:1 count → no OP expected either way.
  const offerCount   = offeringItems.length;
  const requestCount = requestingItems.length;
  let expectedOP = 0;

  if (offerCount !== requestCount) {
    if (offerCount > requestCount) {
      // UPGRADE: you consolidate many → fewer. You owe OP.
      expectedOP = calcUpgradeOP(offeringItems, requestingItems, offerFaceTotal, stackBonus);
    } else {
      // DOWNGRADE: you split one → many. They owe you OP.
      // Mirror the same demand-aware logic, but from their perspective:
      // swap the sides — they are "upgrading" their many items into your fewer item.
      expectedOP = -calcUpgradeOP(requestingItems, offeringItems, requestFaceTotal, 0);
    }
  }

  // ── Step 5: trade score ────────────────────────────────────────────────────
  // tradeScore > 0 = WIN for you (you receive more effective value than you give)
  const tradeScore = requestEffective - offerEffective + expectedOP;

  // ── Show breakdown ─────────────────────────────────────────────────────────
  const rawDiff = requestFaceTotal - offerFaceTotal;
  breakdown.style.display = "flex";

  setBreakdownRow("bdRawDiff",    "Raw value diff",       rawDiff,        true);
  setBreakdownRow("bdDemandAdj",  "Demand adjustment",    demandAdjTotal, true);
  setBreakdownRow("bdStackBonus", "Stack bonus",          stackBonus,     true);
  setBreakdownRow("bdUpgradeOP",  "Expected overpay",    -expectedOP,     true);

  // ── Hoard notice ───────────────────────────────────────────────────────────
  const hoardNotice = document.getElementById("hoardNotice");
  const hasHoarded  = [...offeringItems, ...requestingItems].some(i => i.isHoarded);
  hoardNotice.style.display = hasHoarded ? "flex" : "none";

  // ── Verdict ────────────────────────────────────────────────────────────────
  setVerdict(tradeScore);
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
function setVerdict(score) {
  const arrow = document.getElementById("verdictNeedle");
  const label = document.getElementById("verdictLabel");
  if (!arrow || !label) return;

  if (score === null) {
    arrow.style.left  = "50%";
    arrow.className   = "verdict-arrow";
    label.textContent = "Add items to both sides";
    label.className   = "verdict-label";
    return;
  }

  // Map score → 0–100% position along the bar.
  // score  = 0   → 50% (centre, fair)
  // score  = +5m → 100% (far right, big win)
  // score  = -5m → 0%   (far left, big loss)
  const MAX_SCORE = 5_000_000;
  const clamped   = Math.max(-MAX_SCORE, Math.min(MAX_SCORE, score));
  const pos       = ((clamped / MAX_SCORE) + 1) / 2 * 100;  // 0–100%

  // Direct style.left on the real element — no pseudoelement tricks needed
  arrow.style.left = pos + "%";

  const band = VERDICT_BANDS.find(b => score >= b.min);
  arrow.className   = "verdict-arrow " + band.cls;
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
  if (dk === "close to none")              return "demand-closetonone";
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CONTROLS
// ══════════════════════════════
// ── How it works toggle ───────────────────────────────────────────────────────
const hiwToggle = document.getElementById("hiwToggle");
const hiwBody   = document.getElementById("hiwBody");
const hiwArrow  = document.querySelector(".hiw-arrow");
if (hiwToggle) {
  hiwToggle.addEventListener("click", () => {
    const open = hiwBody.classList.toggle("hiw-open");
    hiwArrow.style.transform = open ? "rotate(180deg)" : "";
  });
}

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
