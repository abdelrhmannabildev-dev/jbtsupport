// ─── Config ───────────────────────────────────────────────────────────────────
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

// ─── State ────────────────────────────────────────────────────────────────────
let allItems       = [];
let filteredItems  = [];
let activeCategory = "All";
let searchQuery    = "";
let currentPage    = 1;
const ITEMS_PER_PAGE = 20;

const mainEl = document.querySelector("main.values-page");

// ─── Boot: API → CSV fallback ─────────────────────────────────────────────────
fetch(API_URL)
  .then(res => { if (!res.ok) throw new Error("API error"); return res.json(); })
  .then(data => {
    const items = Array.isArray(data) ? data
                : Array.isArray(data.values) ? data.values : [];
    if (!items.length) throw new Error("Empty");
    allItems = items;
    route();
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
      route();
    })
    .catch(err => {
      console.error("Both sources failed:", err.message);
      mainEl.innerHTML = "<p style='color:#64748b;text-align:center;padding:80px'>Failed to load items.</p>";
    });
}

// ─── Router ───────────────────────────────────────────────────────────────────
function route() {
  const slug = new URLSearchParams(location.search).get("item");
  if (slug) {
    const item = allItems.find(i => toSlug(i.name) === slug);
    item ? showDetail(item) : showNotFound(slug);
  } else {
    showList();
  }
}

window.addEventListener("popstate", route);

function navigate(url) {
  history.pushState({}, "", url);
  route();
}

function toSlug(name) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LIST VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function showList() {
  document.title = "Item Values | Jailbreak Exchange";

  mainEl.innerHTML = `
    <div id="categoryFilters" class="category-filters"></div>
    <section class="values-header">
      <h1>Jailbreak Exchange Values</h1>
      <p>Community-driven Jailbreak values built on real data, with zero manipulation.</p>
      <div class="search-wrapper">
        <input type="text" id="searchInput" class="search-input" placeholder="Search items… 🔎" />
      </div>
    </section>
    <section class="values-container">
      <div id="valuesGrid" class="values-grid"></div>
    </section>
  `;

  const gridEl    = document.getElementById("valuesGrid");
  const filtersEl = document.getElementById("categoryFilters");
  const searchEl  = document.getElementById("searchInput");

  filtersEl.innerHTML = `<button class="filter-btn active" data-cat="All">All</button>`;
  const cats = [...new Set(allItems.map(i => i.category).filter(Boolean))];
  cats.forEach(cat => {
    const color = CATEGORY_CONFIG[cat] || "#64748b";
    filtersEl.innerHTML += `<button class="filter-btn" data-cat="${cat}" style="--cat:${color}">${cat}</button>`;
  });

  filtersEl.addEventListener("click", e => {
    if (!e.target.classList.contains("filter-btn")) return;
    filtersEl.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    e.target.classList.add("active");
    activeCategory = e.target.dataset.cat;
    currentPage = 1;
    applyFilters(); renderPage(gridEl); renderPagination(gridEl);
  });

  searchEl.value = searchQuery;
  searchEl.addEventListener("input", e => {
    searchQuery = e.target.value.toLowerCase();
    currentPage = 1;
    applyFilters(); renderPage(gridEl); renderPagination(gridEl);
  });

  applyFilters();
  renderPage(gridEl);
  renderPagination(gridEl);
}

function applyFilters() {
  filteredItems = allItems.filter(item => {
    const matchCat    = activeCategory === "All" || item.category === activeCategory;
    const matchSearch = item.name && item.name.toLowerCase().includes(searchQuery);
    return matchCat && matchSearch;
  });
}

function renderPage(gridEl) {
  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  renderCards(filteredItems.slice(start, start + ITEMS_PER_PAGE), gridEl);
}

function renderPagination(gridEl) {
  let pg = document.getElementById("pagination");
  if (!pg) {
    pg = document.createElement("div");
    pg.id = "pagination";
    pg.className = "pagination";
    gridEl.after(pg);
  }
  pg.innerHTML = "";
  const total = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  if (total <= 1) return;

  const prev = document.createElement("button");
  prev.textContent = "← Prev";
  prev.disabled = currentPage === 1;
  prev.onclick = () => { currentPage--; renderPage(gridEl); renderPagination(gridEl); scrollTo({top:0,behavior:"smooth"}); };

  const info = document.createElement("span");
  info.textContent = `Page ${currentPage} of ${total}`;

  const next = document.createElement("button");
  next.textContent = "Next →";
  next.disabled = currentPage === total;
  next.onclick = () => { currentPage++; renderPage(gridEl); renderPagination(gridEl); scrollTo({top:0,behavior:"smooth"}); };

  pg.append(prev, info, next);
}

function renderCards(items, gridEl) {
  gridEl.innerHTML = "";
  if (!items.length) {
    gridEl.innerHTML = "<p style='color:#64748b;text-align:center;padding:40px;grid-column:1/-1'>No items found.</p>";
    return;
  }
  items.forEach(item => {
    const color = CATEGORY_CONFIG[item.category] || "#64748b";
    const card  = document.createElement("div");
    card.className = "value-card clickable-card";
    card.style.borderColor = color;
    card.innerHTML = `
      <h3>${item.name}</h3>
      <span class="category-badge" style="background:${color}20;color:${color}">${item.category}</span>
      <div class="value-row">
        <span>Cash Value</span>
        <strong>${fmt(item.value)}</strong>
      </div>
      <div class="value-row">
        <span>Duped Value</span>
        <strong>${fmt(item.duped_value)}</strong>
      </div>
      <div class="value-row" style="align-items:center">
        <span>Demand</span>
        ${demandBadge(item.demand)}
      </div>
      <div class="card-footer-hint">
        <span>View details</span>
        <span class="hint-arrow">→</span>
      </div>
    `;
    card.addEventListener("click", () => {
      navigate("ValueList.html?item=" + toSlug(item.name));
      scrollTo({top:0,behavior:"smooth"});
    });
    gridEl.appendChild(card);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DETAIL VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function showDetail(item) {
  document.title = item.name + " | Jailbreak Exchange";

  const color    = CATEGORY_CONFIG[item.category] || "#64748b";
  const cleanVal = numVal(item.value);
  const dupedVal = numVal(item.duped_value);
  const hasDuped = dupedVal > 0;
  const maxVal   = Math.max(cleanVal, dupedVal, 1);
  const cleanPct = Math.round((cleanVal / maxVal) * 100);
  const dupedPct = hasDuped ? Math.round((dupedVal / maxVal) * 100) : 0;
  const lossPct  = hasDuped ? Math.round(((cleanVal - dupedVal) / cleanVal) * 100) : null;

  const similar = allItems
    .filter(i => i.category === item.category && i.name !== item.name)
    .sort((a, b) => Math.abs(numVal(a.value) - cleanVal) - Math.abs(numVal(b.value) - cleanVal))
    .slice(0, 6);

  mainEl.innerHTML = `
    <div class="item-detail-page">

      <nav class="detail-breadcrumb">
        <a href="ValueList.html" class="bc-back" id="bcBackLink">← All Items</a>
        <span class="bc-sep">/</span>
        <span class="bc-cat" style="color:${color}">${item.category}</span>
        <span class="bc-sep">/</span>
        <span class="bc-current">${item.name}</span>
      </nav>

      <div class="detail-hero">
        <div class="detail-hero-glow" style="background:radial-gradient(ellipse at top left,${color}26 0%,transparent 65%)"></div>
        <div class="detail-hero-inner">

          <div class="detail-hero-left">
            <span class="detail-category-badge" style="background:${color}18;color:${color};border:1px solid ${color}40">${item.category}</span>
            <h1 class="detail-name">${item.name}</h1>
            <div class="detail-meta-row">
              ${demandBadge(item.demand)}
              ${item.last_updated ? '<span class="detail-updated">Updated: ' + item.last_updated + '</span>' : ""}
            </div>
            <div class="detail-stats-grid">
              <div class="detail-stat-card">
                <div class="stat-label">Cash Value</div>
                <div class="stat-value" style="color:${color}">${fmt(item.value)}</div>
                <div class="stat-sub">Clean condition</div>
              </div>
              <div class="detail-stat-card ${!hasDuped ? "stat-na" : ""}">
                <div class="stat-label">Duped Value</div>
                <div class="stat-value">${hasDuped ? fmt(item.duped_value) : "N/A"}</div>
                <div class="stat-sub">${hasDuped ? "Duped condition" : "Not applicable"}</div>
              </div>
              ${hasDuped ? '<div class="detail-stat-card"><div class="stat-label">Value Loss</div><div class="stat-value stat-loss-val">-' + lossPct + '%</div><div class="stat-sub">When duped</div></div>' : ""}
            </div>
          </div>

          <div class="detail-bar-section">
            <div class="detail-bar-title">Value Comparison</div>
            <div class="detail-bars">
              <div class="bar-row">
                <span class="bar-label">Clean</span>
                <div class="bar-track">
                  <div class="bar-fill" data-w="${cleanPct}" style="background:${color};width:0%"></div>
                </div>
                <span class="bar-amount">${fmt(item.value)}</span>
              </div>
              ${hasDuped ? '<div class="bar-row"><span class="bar-label">Duped</span><div class="bar-track"><div class="bar-fill duped-fill" data-w="' + dupedPct + '" style="width:0%"></div></div><span class="bar-amount bar-muted">' + fmt(item.duped_value) + '</span></div>' : ""}
            </div>
          </div>

        </div>
      </div>

      <div class="detail-info-section">
        <h2 class="section-title">Item Details</h2>
        <div class="detail-table">
          ${detailRow("Name",         item.name)}
          ${detailRow("Category",     item.category, color)}
          ${detailRow("Cash Value",   fmt(item.value))}
          ${detailRow("Duped Value",  fmt(item.duped_value))}
          ${detailRow("Demand",       item.demand || "—")}
          ${item.rarity       ? detailRow("Rarity",       item.rarity)       : ""}
          ${item.last_updated ? detailRow("Last Updated", item.last_updated) : ""}
        </div>
      </div>

      ${similar.length ? `
      <div class="detail-similar-section">
        <h2 class="section-title">More in <span style="color:${color}">${item.category}</span></h2>
        <div class="similar-grid">
          ${similar.map(s => {
            const sc = CATEGORY_CONFIG[s.category] || "#64748b";
            return '<div class="similar-card" data-slug="' + toSlug(s.name) + '" style="border-color:' + sc + '44"><div class="similar-name">' + s.name + '</div><div class="similar-val" style="color:' + sc + '">' + fmt(s.value) + '</div>' + demandBadge(s.demand) + '</div>';
          }).join("")}
        </div>
      </div>` : ""}

      <div class="detail-back-footer">
        <button class="back-btn" id="backBtnBottom">← Back to all items</button>
      </div>

    </div>
  `;

  document.getElementById("bcBackLink").addEventListener("click", e => {
    e.preventDefault(); navigate("ValueList.html"); scrollTo({top:0,behavior:"smooth"});
  });
  document.getElementById("backBtnBottom").addEventListener("click", () => {
    navigate("ValueList.html"); scrollTo({top:0,behavior:"smooth"});
  });
  document.querySelectorAll(".similar-card[data-slug]").forEach(card => {
    card.addEventListener("click", () => {
      navigate("ValueList.html?item=" + card.dataset.slug);
      scrollTo({top:0,behavior:"smooth"});
    });
  });

  requestAnimationFrame(() => {
    setTimeout(() => {
      document.querySelectorAll(".bar-fill[data-w]").forEach(bar => {
        bar.style.width = bar.dataset.w + "%";
      });
    }, 80);
  });
}

function showNotFound(slug) {
  document.title = "Not Found | Jailbreak Exchange";
  mainEl.innerHTML = `
    <div style="text-align:center;padding:140px 20px;color:#64748b">
      <div style="font-size:52px;margin-bottom:16px">🔍</div>
      <h2 style="color:#e2e8f0;font-size:26px;margin-bottom:10px">Item not found</h2>
      <p style="margin-bottom:28px">No item matching "<strong style="color:#38bdf8">${slug}</strong>"</p>
      <button class="back-btn" onclick="navigate('ValueList.html')">← Back to Values</button>
    </div>
  `;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function detailRow(label, value, color) {
  const val = color ? '<span style="color:' + color + ';font-weight:600">' + value + '</span>' : '<span>' + value + '</span>';
  return '<div class="detail-row"><span class="detail-label">' + label + '</span>' + val + '</div>';
}

function numVal(v) {
  if (!v || String(v).toUpperCase() === "N/A") return 0;
  return Number(String(v).replace(/,/g, "")) || 0;
}

function fmt(v) {
  if (v === null || v === undefined || v === "" || String(v).toUpperCase() === "N/A") return "N/A";
  const n = Number(String(v).replace(/,/g, ""));
  return isNaN(n) ? "N/A" : n.toLocaleString("en-US");
}

function demandBadge(demand) {
  if (!demand || !demand.trim() || demand === "—") return '<span class="demand-badge d-unknown">Unknown</span>';
  const key = demand.toLowerCase().replace(/\s/g, "");
  const cls =
      key === "veryhigh" ? "d-high"
    : key === "high"     ? "d-high"
    : key === "decent"   ? "d-decent"
    : key === "medium"   ? "d-medium"
    : key === "verylow"  ? "d-verylow"
    : key === "low"      ? "d-low"
    : "d-unknown";
  return '<span class="demand-badge ' + cls + '">' + demand + '</span>';
}

// ─── CSV parser ───────────────────────────────────────────────────────────────
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
  return lines.filter(l => l.trim()).map(line => {
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
