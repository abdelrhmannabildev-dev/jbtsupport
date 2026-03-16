// ─── Config ───────────────────────────────────────────────────────────────────
const API_URL  = "https://reveal-hall-drugs-commission.trycloudflare.com/";
const CSV_FILE = "items.csv";
const CSV_URL  = new URL(CSV_FILE, window.location.href).toString();

const CATEGORY_CONFIG = {
  "Body Color":   "#8b5cf6", // Purple – bright, stands out on dark backgrounds
  "Drift":        "#16f9c0", // Orange – highlights drifting-related items
  "Furniture":    "#b95310", // Neon green – visible and futuristic on dark UI
  "Horns":        "#925d5d", // Blue neon – matches horn accents
  "HyperChrome":  "#bb48ec", // Pink neon – flashy/highlighted items
  "Limited":      "#facc15", // Yellow neon – emphasizes rare/limited items
  "Rim":          "#2158a3", // Purple-blue neon – eye-catching for rims
  "Seasonal":     "#22d3ee", // Light cyan – seasonal items, cool neon tone
  "Spoiler":      "#f59e0b", // Orange – subtle highlight for spoilers
  "Texture":      "#94a3b8", // Light gray – textures, readable but muted
  "Tire Sticker": "#06b6d4", // Cyan-blue – sticker elements, clear visibility
  "Tire Style":   "#6366f1", // Neon blue – style variations, harmonizes with accents
  "Vehicle":      "#3b82f6", // Red neon – critical vehicle items, highly visible
  "Weapon Skin":  "#536783"  // Gray-blue – muted, balanced for weapon skins
};
// ─── State ────────────────────────────────────────────────────────────────────
let allItems       = [];
let filteredItems  = [];
let activeCategory = "All";
let searchQuery    = "";
let currentPage    = 1;
let numberFormat   = "full";
let sortKey        = "default";
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
  fetch(CSV_URL, { cache: "no-store" })
    .then(res => { if (!res.ok) throw new Error("CSV not found"); return res.text(); })
    .then(text => {
      allItems = parseCSV(text);
      if (!allItems.length) throw new Error("CSV empty");
      route();
    })
    .catch(err => {
      console.error("Both sources failed:", err.message);
      const fileNote = location.protocol === "file:" 
        ? "<br><br><span style='font-size:14px;color:#94a3b8'>Local file access is blocked by the browser. Run a local server (example: <code>python -m http.server</code>) and open <code>http://localhost:8000/ValueList.html</code>.</span>"
        : "";
      mainEl.innerHTML = "<p style='color:#64748b;text-align:center;padding:80px'>Failed to load items." + fileNote + "</p>";
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
  document.title = "Values | Jailbreak Exchange";

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
  document.querySelector(".values-header").insertAdjacentHTML("beforeend", controlsHtml);

  const formatSelect = document.getElementById("formatSelect");
  formatSelect.addEventListener("change", e => {
    numberFormat = e.target.value;
    renderPage(gridEl);
  });

  const sortSelect = document.getElementById("sortSelect");
  sortSelect.value = sortKey;
  sortSelect.addEventListener("change", e => {
    sortKey = e.target.value;
    currentPage = 1;
    applyFilters(); renderPage(gridEl); renderPagination(gridEl);
  });
  filtersEl.innerHTML = `<button class="filter-btn active" data-cat="All">All</button>`;
  const cats = [...new Set(allItems.map(i => i.category).filter(Boolean))];
  cats.forEach
  (cat => {
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

  const DEMAND_ORDER = { "very high": 5, "high": 4, "decent": 3, "medium": 2, "low": 1, "very low": 0 };

  if (sortKey === "name-asc") {
    filteredItems.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortKey === "name-desc") {
    filteredItems.sort((a, b) => b.name.localeCompare(a.name));
  } else if (sortKey === "value-desc"||sortKey === "default") {
    filteredItems.sort((a, b) => numVal(b.value) - numVal(a.value));
  } else if (sortKey === "value-asc") {
    filteredItems.sort((a, b) => numVal(a.value) - numVal(b.value));
  } else if (sortKey === "demand-desc") {
    filteredItems.sort((a, b) => (DEMAND_ORDER[(b.demand||"").toLowerCase()] ?? -1) - (DEMAND_ORDER[(a.demand||"").toLowerCase()] ?? -1));
  } else if (sortKey === "demand-asc") {
    filteredItems.sort((a, b) => (DEMAND_ORDER[(a.demand||"").toLowerCase()] ?? -1) - (DEMAND_ORDER[(b.demand||"").toLowerCase()] ?? -1));
  }
}

function renderPage(gridEl) {
  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  renderCards(filteredItems.slice(start, start + ITEMS_PER_PAGE), gridEl);
}

function renderPagination(gridEl) {
  let pgTop = document.getElementById("pagination-top");
  let pgBottom = document.getElementById("pagination-bottom");
  if (!pgTop) {
    pgTop = document.createElement("div");
    pgTop.id = "pagination-top";
    pgTop.className = "pagination pagination-top";
    gridEl.before(pgTop);
  }
  if (!pgBottom) {
    pgBottom = document.createElement("div");
    pgBottom.id = "pagination-bottom";
    pgBottom.className = "pagination pagination-bottom";
    gridEl.after(pgBottom);
  }
  pgTop.innerHTML = "";
  pgBottom.innerHTML = "";
  const total = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  if (total <= 1) return;

  const prev = document.createElement("button");
  prev.textContent = "← Prev";
  prev.disabled = currentPage === 1;
  prev.onclick = () => { currentPage--; renderPage(gridEl); renderPagination(gridEl); scrollTo({top:0,behavior:"smooth"}); };

  const info = document.createElement("span");
  info.textContent = `Page ${currentPage} of ${total}`;

  const jump = document.createElement("input");
  jump.type = "number";
  jump.min = "1";
  jump.max = String(total);
  jump.value = String(currentPage);
  jump.className = "pagination-jump";
  jump.title = "Go to page";
  jump.addEventListener("change", () => {
    let n = parseInt(jump.value, 10);
    if (isNaN(n)) n = currentPage;
    n = Math.min(Math.max(1, n), total);
    currentPage = n;
    renderPage(gridEl);
    renderPagination(gridEl);
    scrollTo({top:0,behavior:"smooth"});
  });

  const next = document.createElement("button");
  next.textContent = "Next →";
  next.disabled = currentPage === total;
  next.onclick = () => { currentPage++; renderPage(gridEl); renderPagination(gridEl); scrollTo({top:0,behavior:"smooth"}); };

  const prev2 = prev.cloneNode(true);
  const next2 = next.cloneNode(true);
  prev2.onclick = prev.onclick;
  next2.onclick = next.onclick;
  const info2 = info.cloneNode(true);
  const jump2 = jump.cloneNode(true);
  jump2.addEventListener("change", () => {
    let n = parseInt(jump2.value, 10);
    if (isNaN(n)) n = currentPage;
    n = Math.min(Math.max(1, n), total);
    currentPage = n;
    renderPage(gridEl);
    renderPagination(gridEl);
    scrollTo({top:0,behavior:"smooth"});
  });

  pgTop.append(prev, info, jump, next);
  pgBottom.append(prev2, info2, jump2, next2);
}

function renderCards(items, gridEl) {
  gridEl.innerHTML = "";
  if (!items.length) {
    gridEl.innerHTML = "<p style='color:#64748b;text-align:center;padding:40px;grid-column:1/-1'>No items found.</p>";
    return;
  }
  items.forEach((item, idx) => {
    const color = CATEGORY_CONFIG[item.category] || "#a0c3f5";
    const card  = document.createElement("div");
    card.className = "value-card clickable-card";
    card.style.borderColor = color;
    card.innerHTML = `<h3>${item.name}</h3>
      <span class="category-badge" style="background:${color}20;color:${color}">${item.category}</span>
      <div class="value-row">
        <span>Cash Value</span>
        <strong>${formatvalue(item.value)}</strong>
      </div>
      <div class="value-row">
        <span>Duped Value</span>
        <strong>${formatvalue(item.duped_value)}</strong>
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
    setTimeout(() => card.classList.add("show"), idx * 35);
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
                <div class="stat-value" style="color:${color}">${formatvalue(item.value)}</div>
                <div class="stat-sub">Clean condition</div>
              </div>
              <div class="detail-stat-card ${!hasDuped ? "stat-na" : ""}">
                <div class="stat-label">Duped Value</div>
                <div class="stat-value">${hasDuped ? formatvalue(item.duped_value) : "N/A"}</div>
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
                <span class="bar-amount">${formatvalue(item.value)}</span>
              </div>
              ${hasDuped ? '<div class="bar-row"><span class="bar-label">Duped</span><div class="bar-track"><div class="bar-fill duped-fill" data-w="' + dupedPct + '" style="width:0%"></div></div><span class="bar-amount bar-muted">' + formatvalue(item.duped_value) + '</span></div>' : ""}
            </div>
          </div>

        </div>
      </div>

      <div class="detail-info-section">
        <h2 class="section-title">Item Details</h2>
        <div class="detail-table">
          ${detailRow("Name",         item.name)}
          ${detailRow("Category",     item.category, color)}
          ${detailRow("Cash Value",   formatvalue(item.value))}
          ${detailRow("Duped Value",  formatvalue(item.duped_value))}
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
            return '<div class="similar-card" data-slug="' + toSlug(s.name) + '" style="border-color:' + sc + '44"><div class="similar-name">' + s.name + '</div><div class="similar-val" style="color:' + sc + '">' + formatvalue(s.value) + '</div>' + demandBadge(s.demand) + '</div>';
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

function formatvalue(value) {
  if (value === null || value === undefined) return "N/A";
  const num = Number(String(value).replace(/,/g, ""));
  if (isNaN(num)) return "N/A";

  if (numberFormat === "short") {
    if (num >= 1_000_000) return (num / 1_000_000).toLocaleString("en", { maximumFractionDigits: 1 }) + "M";
    if (num >= 1_000) return (num / 1_000).toLocaleString("en", { maximumFractionDigits: 2 }) + "K";
  }

  return num.toLocaleString("en");
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
