// ═══════════════════════════════════════════════════════════════════════════════
//  API  — fetch items from the live REST endpoint
// ═══════════════════════════════════════════════════════════════════════════════

import { API_URL } from "../config/constants.js";

/**
 * Fetch the item list from the live API.
 * Resolves with a non-empty array of item objects.
 * Rejects if the request fails or the response contains no items.
 *
 * @returns {Promise<object[]>}
 */
export async function fetchItemsFromAPI() {
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error(`API responded with ${res.status}`);

  const data  = await res.json();
  const items = Array.isArray(data) ? data : (data.values || []);

  if (!items.length) throw new Error("API returned an empty item list");
  return items;
}