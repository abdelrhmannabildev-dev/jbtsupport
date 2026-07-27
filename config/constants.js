// ═══════════════════════════════════════════════════════════════════════════════
//  CONSTANTS  — shared across all pages
// ═══════════════════════════════════════════════════════════════════════════════

export const API_URL  = "https://reveal-hall-drugs-commission.trycloudflare.com/";
export const CSV_FILE = "items.csv";
// Resolve relative to the page (window.location.href), NOT to this file's location.
// This ensures "items.csv" always maps to the project root regardless of where
// this constants.js lives in the folder structure.
export const CSV_URL  = new URL(CSV_FILE, window.location.href).toString();

// ── Category colour map ────────────────────────────────────────────────────────
export const CATEGORY_CONFIG = {
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
  "Weapon Skin":  "#64748b",
};

// ── Demand tier config ─────────────────────────────────────────────────────────
// requestAdj   : added to a requesting item's effective value
//                positive  → receiving this item is valuable (easy to re-trade)
//                negative  → receiving this item is costly   (hard to move)
// upgradeMulti : scales the expected overpay when consolidating many → fewer items
//                lower = items are liquid, receiver needs less compensation
export const DEMAND_CONFIG = {
  "very high":     { requestAdj:  2_000_000, upgradeMulti: 0.0 },
  "high":          { requestAdj:  1_000_000, upgradeMulti: 0.3 },
  "decent":        { requestAdj:          0, upgradeMulti: 0.6 },
  "medium":        { requestAdj:          0, upgradeMulti: 0.8 },
  "low":           { requestAdj: -1_000_000, upgradeMulti: 1.2 },
  "very low":      { requestAdj: -1_500_000, upgradeMulti: 1.5 },
  "close to none": { requestAdj: -2_000_000, upgradeMulti: 2.0 },
};

// ── Demand options list (used by Hoard selects) ────────────────────────────────
export const DEMAND_OPTIONS = ["Very High", "High", "Decent", "Medium", "Low", "Very Low"];

// ── Trade verdict bands ────────────────────────────────────────────────────────
// Evaluated top-to-bottom; first matching band wins.
// tradeScore > 0 = WIN for the offerer (they receive more effective value than they give)
export const VERDICT_BANDS = [
  { min:  2_000_000, label: "Big Win 🔥",  cls: "verdict-bigwin"  },
  { min:  1_000_000, label: "Win ✅",      cls: "verdict-win"     },
  { min:   -500_000, label: "Fair ⚖️",    cls: "verdict-fair"    },
  { min: -2_000_000, label: "Loss ❌",    cls: "verdict-loss"    },
  { min: -Infinity,  label: "Big Loss 💀", cls: "verdict-bigloss" },
];

// ── Items per page (Value List pagination) ─────────────────────────────────────
export const ITEMS_PER_PAGE = 20;