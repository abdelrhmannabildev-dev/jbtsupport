// ═══════════════════════════════════════════════════════════════════════════════
//  DATALOADER  — API-first loading with automatic CSV fallback
//  Used by: ValueList, Calculator, Hoard, DupeList
// ═══════════════════════════════════════════════════════════════════════════════

import { CSV_URL }          from "../config/constants.js";
import { fetchItemsFromAPI } from "./api.js";
import { parseCSV }          from "../utils/parsing.js";

/**
 * Load the item dataset.
 * Tries the live API first; on any failure falls back to `items.csv`.
 *
 * @param {object}   [opts]
 * @param {Function} [opts.onSuccess]  Called with the loaded item array when done.
 * @param {Function} [opts.onError]    Called with an error message string if both sources fail.
 * @returns {Promise<object[]>}        Also resolves/rejects directly for async callers.
 */
export async function loadItems({ onSuccess, onError } = {}) {
  try {
    // ── Primary: live API ──────────────────────────────────────────────────
    const items = await fetchItemsFromAPI();
    onSuccess?.(items);
    return items;

  } catch (apiErr) {
    console.warn("API unavailable, falling back to CSV:", apiErr.message);

    try {
      // ── Fallback: local CSV ────────────────────────────────────────────
      const res = await fetch(CSV_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`CSV fetch failed with status ${res.status}`);

      const text  = await res.text();
      const items = parseCSV(text);
      if (!items.length) throw new Error("CSV parsed to an empty list");

      console.log(`Loaded ${items.length} items from CSV fallback`);
      onSuccess?.(items);
      return items;

    } catch (csvErr) {
      const msg = buildErrorMessage(csvErr);
      console.error("Both data sources failed:", csvErr.message);
      onError?.(msg);
      throw new Error(msg);
    }
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function buildErrorMessage(err) {
  const base = "Failed to load items.";

  // Give a helpful hint when running from a file:// URL
  if (location.protocol === "file:") {
    return (
      base +
      "<br><br><span style='font-size:14px;color:#94a3b8'>" +
      "Local file access is blocked by the browser. " +
      "Run a local server — e.g. <code>python -m http.server</code> — " +
      "and open <code>http://localhost:8000</code>." +
      "</span>"
    );
  }

  return base;
}