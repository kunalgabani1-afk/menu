/**
 * Authoritative, robust table resolver for Tableline.
 * Resolves a physical table from a search parameter (QR token, table ID, slug, or table number)
 * with strict priority to guarantee ONE QR = ONE TABLE and prevent cross-table collisions.
 */
export function resolveTableBySlugOrToken(
  rawTables: Record<string, any>,
  param: string
): { id: string; table: any } | null {
  if (!param || typeof param !== "string" || !rawTables) return null;
  const search = param.trim().toLowerCase();
  if (!search) return null;

  // 1. Exact match by qrToken (highest priority for physical QR codes)
  for (const [id, t] of Object.entries(rawTables)) {
    if (t && t.qrToken && String(t.qrToken).trim().toLowerCase() === search) {
      return { id, table: t };
    }
  }

  // 2. Exact match by table ID
  for (const [id, t] of Object.entries(rawTables)) {
    if (id.toLowerCase() === search) {
      return { id, table: t };
    }
  }

  // 3. Exact match by table slug
  for (const [id, t] of Object.entries(rawTables)) {
    if (t && t.slug && String(t.slug).trim().toLowerCase() === search) {
      return { id, table: t };
    }
  }

  // 4. Exact match by tableNumber (exact string match)
  for (const [id, t] of Object.entries(rawTables)) {
    if (t && t.tableNumber !== undefined && String(t.tableNumber).trim().toLowerCase() === search) {
      return { id, table: t };
    }
  }

  // 5. Normalized alphanumeric match (e.g. "table-02" or "table 02")
  const normSearch = search.replace(/[^a-z0-9]/g, "");
  if (normSearch) {
    const normMatches = Object.entries(rawTables).filter(([_, t]) => {
      if (!t) return false;
      const tNum = String(t.tableNumber || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const tSlug = String(t.slug || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      return normSearch === tNum || normSearch === tSlug;
    });
    if (normMatches.length === 1) {
      return { id: normMatches[0][0], table: normMatches[0][1] };
    }
  }

  // 6. Normalized numeric match (e.g. "07" matching "7" or "table-7" matching tableNumber "7")
  // ONLY match if there is exactly ONE unique table that matches these digits.
  const searchDigits = search.replace(/[^0-9]/g, "").replace(/^0+/, "");
  if (searchDigits) {
    const digitMatches = Object.entries(rawTables).filter(([_, t]) => {
      if (!t || t.tableNumber === undefined) return false;
      const tDigits = String(t.tableNumber).replace(/[^0-9]/g, "").replace(/^0+/, "");
      return tDigits === searchDigits;
    });

    if (digitMatches.length === 1) {
      return { id: digitMatches[0][0], table: digitMatches[0][1] };
    }
  }

  return null;
}
