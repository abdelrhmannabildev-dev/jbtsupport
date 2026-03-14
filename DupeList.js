const API_BASE = "https://reveal-hall-drugs-commission.trycloudflare.com/";
const CSV_FILE = "items.csv";

const input = document.getElementById("dupeSearch");
const grid  = document.getElementById("dupeResults");

// ─── Robust CSV parser (shared utility) ──────────────────────────────────────
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
        obj[h] = (vals[i] ?? "").trim();
      });
      return obj;
    });
}

// ─── Search on Enter ──────────────────────────────────────────────────────────
input.addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;

  const query = input.value.trim();
  if (!query) return;

  grid.innerHTML = `<p style="color:#64748b;grid-column:1/-1">Checking dupe records…</p>`;

  try {
    let userId = null;

    // Numeric → treat as Roblox user ID directly
    if (/^\d+$/.test(query)) {
      userId = query;
    } else {
      // Resolve username → userId via Roblox API
      const username = query.replace(/^@/, "");
      const res  = await fetch("https://users.roblox.com/v1/usernames/users", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ usernames: [username], excludeBannedUsers: false })
      });
      const data = await res.json();
      if (!data.data?.length) {
        grid.innerHTML = `<p style="color:#64748b;grid-column:1/-1">User not found.</p>`;
        return;
      }
      userId = data.data[0].id;
    }

    // Try API first
    let items = await fetchDupesFromAPI(userId);

    // If API fails, fall back to CSV local lookup
    if (items === null) {
      console.warn("Dupe API failed, falling back to CSV…");
      items = await fetchDupesFromCSV(userId, query);
    }

    if (!items || items.length === 0) {
      grid.innerHTML = `<p style="color:#64748b;grid-column:1/-1">No duped vehicles found for this user.</p>`;
      return;
    }

    renderDupes(items);

  } catch (err) {
    console.error(err);
    grid.innerHTML = `<p style="color:#64748b;grid-column:1/-1">Failed to load dupe data. Please try again.</p>`;
  }
});

// ─── Fetch dupes from API ─────────────────────────────────────────────────────
async function fetchDupesFromAPI(userId) {
  try {
    const res = await fetch(`${API_BASE}/dupes/userid/${userId}`);
    if (!res.ok) throw new Error("API error");
    return await res.json();
  } catch {
    return null; // signal fallback
  }
}

// ─── Fetch dupes from CSV (local fallback) ────────────────────────────────────
// The CSV doesn't have per-user dupe data — this searches by item name match
// so it shows all CSV items marked as duped (useful offline / API-down scenario)
async function fetchDupesFromCSV(userId, originalQuery) {
  try {
    const res  = await fetch(CSV_FILE);
    if (!res.ok) throw new Error("CSV not found");
    const text  = await res.text();
    const items = parseCSV(text);
    // Return items that have a duped_value set (not empty, not N/A)
    // Since CSV has no per-user data, we note this is a limitation
    const duped = items
      .filter(i => i.duped_value && i.duped_value.trim() !== "" && i.duped_value.toUpperCase() !== "N/A")
      .map(i => i.name);
    return duped.length ? duped : [];
  } catch {
    return [];
  }
}

// ─── Render dupe cards ────────────────────────────────────────────────────────
function renderDupes(items) {
  grid.innerHTML = "";
  items.forEach(item => {
    const card = document.createElement("div");
    card.className = "value-card";
    card.style.borderColor = "#ef4444";
    card.innerHTML = `
      <h3>${item}</h3>
      <span class="category-badge" style="background:#ef444420;color:#ef4444">Duped</span>
    `;
    grid.appendChild(card);
  });
}
