const API_URL  = "https://reveal-hall-drugs-commission.trycloudflare.com/";
const CSV_FILE = "items.csv";

const CATEGORY_CONFIG = {
  "Body Color":   "#a855f7",
  "Drift":        "#f97316",
  "Furniture":    "#a16207",
  "Horns":        "#3b82f6",
  "HyperChrome":  "#ec4899",
  "Limited":      "#facc15",
  "Rim":          "#8b5cf6",
  "Seasonal":     "#22d3ee",
  "Spoiler":      "#f59e0b",
  "Texture":      "#94a3b8",
  "Tire Sticker": "#06b6d4",
  "Tire Style":   "#22c55e",
  "Vehicle":      "#ef4444",
  "Weapon Skin":  "#64748b"
};

let allItems       = [];
let offeringItems  = [];
let requestingItems = [];

const grid          = document.getElementById("valuesGrid");
const searchInput   = document.getElementById("searchInput");
const offeringBox   = document.getElementById("offeringItems");
const requestingBox = document.getElementById("requestingItems");
const offeringTotal = document.getElementById("offeringTotal");
const requestingTotal = document.getElementById("requestingTotal");
const diffBox       = document.getElementById("tradeDifference");
const balanceMarker = document.getElementById("tradeBalanceMarker");

// ─── Fetch: API first, CSV fallback ──────────────────────────────────────────
fetch(API_URL)
  .then(res => { if (!res.ok) throw new Error("API error"); return res.json(); })
  .then(data => {
    const items = Array.isArray(data) ? data
                : Array.isArray(data.values) ? data.values : [];
    if (!items.length) throw new Error("Empty");
    allItems = items;
    renderBrowser(allItems);
  })
  .catch(err => {
    console.warn("API failed, loading CSV fallback…", err.message);
    loadCSV();
  });

function loadCSV() {
  fetch(CSV_FILE)
    .then(res => { if (!res.ok) throw new Error("CSV not found"); return res.text(); })
    .then(text => {
      allItems = parseCSV(text);
      if (!allItems.length) throw new Error("CSV empty");
      renderBrowser(allItems);
    })
    .catch(err => {
      console.error("CSV also failed:", err.message);
      grid.innerHTML = "<p style='color:#64748b;text-align:center;padding:40px'>Failed to load items.</p>";
    });
}

// ─── Robust CSV parser ────────────────────────────────────────────────────────
function parseCSVLine(line) {
  const result = [];
  let i = 0;
  line = line.replace(/\r/g, "");
  while (i <= line.length) {
    if (i === line.length) { result.push(""); break; }
    if (line[i] === '"') {
      let j = i + 1;
      while (j < line.length && !(line[j] === '"' && line[j + 1] !== '"')) {
        if (line[j] === '"') j++;
        j++;
      }
      result.push(line.slice(i + 1, j).replace(/""/g, '"'));
      i = j + 1;
      if (line[i] === ',') i++;
    } else {
      const j = line.indexOf(',', i);
      if (j === -1) { result.push(line.slice(i)); break; }
      result.push(line.slice(i, j));
      i = j + 1;
    }
  }
  return result;
}

function parseCSV(text) {
  const lines   = text.trim().split("\n");
  const headers = parseCSVLine(lines.shift());

  return lines
    .filter(l => l.trim())
    .map(line => {
      const vals = parseCSVLine(line);
      const obj  = {};
      headers.forEach((h, i) => {
        if (!h) return;
        const raw = (vals[i] ?? "").trim();
        if ((h === "value" || h === "duped_value") && raw && raw.toUpperCase() !== "N/A") {
          const num = Number(raw.replace(/,/g, ""));
          obj[h] = isNaN(num) ? null : num;
        } else {
          obj[h] = raw;
        }
      });
      return obj;
    });
}

// ─── Search filter ────────────────────────────────────────────────────────────
searchInput.addEventListener("input", e => {
  const q = e.target.value.toLowerCase();
  renderBrowser(allItems.filter(i => i.name && i.name.toLowerCase().includes(q)));
});

// ─── Render browser cards ─────────────────────────────────────────────────────
function renderBrowser(items) {
  grid.innerHTML = "";
  items.forEach(item => {
    const card = document.createElement("div");
    card.className = "calc-item-card";

    const dk = (item.demand || "").toLowerCase().replace(/\s/g, "");
    const demandClass =
      dk.includes("veryhigh") ? "demand-high"
      : dk.includes("high")   ? "demand-high"
      : dk.includes("decent") ? "demand-decent"
      : dk.includes("medium") ? "demand-medium"
      : dk.includes("verylow")? "demand-verylow"
      : dk.includes("low")    ? "demand-low"
      : "demand-low";

    const catColor = CATEGORY_CONFIG[item.category] || "#64748b";

    card.innerHTML = `
      <div class="calc-item-title">${item.name}</div>
      <span class="calc-category" style="background:${catColor}20;color:${catColor}">${item.category}</span>
      <div class="calc-values">
        <div class="calc-row"><span>Value</span><strong>${fmt(item.value)}</strong></div>
        <div class="calc-row"><span>Duped</span><strong>${item.duped_value ? fmt(item.duped_value) : "N/A"}</strong></div>
      </div>
      <span class="demand-pill ${demandClass}">Demand: ${item.demand || "Unknown"}</span>
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

// ─── Add item ─────────────────────────────────────────────────────────────────
function addItem(item, side) {
  const entry = {
    uid:        crypto.randomUUID(),
    name:       item.name,
    cleanValue: Number(String(item.value       || "0").replace(/,/g, "")) || 0,
    dupedValue: Number(String(item.duped_value || "0").replace(/,/g, "")) || 0,
    isDuped:    false
  };
  (side === "offering" ? offeringItems : requestingItems).push(entry);
  renderTrade();
}

// ─── Render trade panels ──────────────────────────────────────────────────────
function renderTrade() {
  offeringBox.innerHTML  = "";
  requestingBox.innerHTML = "";
  offeringItems.forEach(i  => renderTradeItem(i, offeringBox));
  requestingItems.forEach(i => renderTradeItem(i, requestingBox));
  updateTotals();
  updateEmptyState();
}

function renderTradeItem(item, box) {
  const el = document.createElement("div");
  el.className   = "trade-item";
  el.dataset.uid = item.uid;

  const displayVal = item.isDuped
    ? (item.dupedValue || item.cleanValue)
    : item.cleanValue;

  el.innerHTML = `
    <h4>${item.name}</h4>
    <div class="item-value">${fmt(displayVal)}</div>
    <div class="controls">
      <button class="clean">Clean</button>
      <button class="duped">Duped</button>
    </div>
  `;

  el.addEventListener("click", () => removeItem(item.uid));
  el.querySelector(".clean").addEventListener("click", e => { e.stopPropagation(); toggle(item.uid, false); });
  el.querySelector(".duped").addEventListener("click", e => { e.stopPropagation(); toggle(item.uid, true);  });

  box.appendChild(el);
}

function toggle(uid, duped) {
  [...offeringItems, ...requestingItems].forEach(i => { if (i.uid === uid) i.isDuped = duped; });
  renderTrade();
}

function removeItem(uid) {
  const el = document.querySelector(`.trade-item[data-uid="${uid}"]`);
  if (!el) return;
  el.classList.add("removing");
  setTimeout(() => {
    offeringItems   = offeringItems.filter(i   => i.uid !== uid);
    requestingItems = requestingItems.filter(i => i.uid !== uid);
    renderTrade();
  }, 140);
}

function updateEmptyState() {
  document.getElementById("offeringWrapper").classList.toggle("has-items",  offeringItems.length  > 0);
  document.getElementById("requestingWrapper").classList.toggle("has-items", requestingItems.length > 0);
}

// ─── Totals & balance bar ─────────────────────────────────────────────────────
function updateTotals() {
  const sum = items => items.reduce((a, i) => {
    const v = i.isDuped ? (i.dupedValue || i.cleanValue) : i.cleanValue;
    return a + v;
  }, 0);

  const offer = sum(offeringItems);
  const req   = sum(requestingItems);

  offeringTotal.textContent  = `Total: ${fmt(offer)}`;
  requestingTotal.textContent = `Total: ${fmt(req)}`;

  const diff = offer - req;
  diffBox.textContent =
    diff === 0 ? "Perfectly balanced trade"
    : diff > 0 ? `You're offering +${fmt(diff)} extra`
    : `You need +${fmt(Math.abs(diff))} more`;

  updateBalanceBar(diff, offer, req);
}

function updateBalanceBar(diff, offer, req) {
  if (!balanceMarker) return;
  const base      = Math.max(offer, req, 1);
  const ratio     = Math.max(-1, Math.min(1, diff / base));
  const intensity = Math.min(1, Math.abs(diff) / base);
  const position  = (ratio + 1) * 50;

  balanceMarker.style.setProperty("--pos", `${position}%`);

  if (diff === 0) {
    balanceMarker.style.background  = "#94a3b8";
    balanceMarker.style.boxShadow   = "0 0 4px rgba(148,163,184,0.4)";
    return;
  }

  const hue        = diff > 0 ? 0 : 142;
  const saturation = 50 + Math.round(intensity * 40);
  const lightness  = diff > 0 ? 35 + Math.round(intensity * 10) : 50 - Math.round(intensity * 12);
  const color      = `hsl(${hue} ${saturation}% ${lightness}%)`;
  balanceMarker.style.background  = color;
  balanceMarker.style.boxShadow   = `0 0 ${6 + intensity * 10}px ${color}`;
}

// ─── Swap / Clear ─────────────────────────────────────────────────────────────
document.getElementById("swapBtn").onclick = () => {
  [offeringItems, requestingItems] = [requestingItems, offeringItems];
  renderTrade();
};

document.getElementById("clearBtn").onclick = () => {
  offeringItems  = [];
  requestingItems = [];
  renderTrade();
};

// ─── Scroll to browser on empty click ────────────────────────────────────────
document.querySelectorAll(".trade-empty").forEach(el => {
  el.addEventListener("click", () => {
    document.getElementById("itemBrowser").scrollIntoView({ behavior: "smooth" });
  });
});

// ─── Format ───────────────────────────────────────────────────────────────────
function fmt(v) {
  if (v === null || v === undefined || v === "") return "N/A";
  const n = Number(String(v).replace(/,/g, ""));
  return isNaN(n) ? "N/A" : n.toLocaleString("en-US");
}
