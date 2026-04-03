/** Shrink huge strings (e.g. base64, markdown) for JSON preview in the UI */
export function sanitizeForStepDisplay(value: unknown, depth = 0): unknown {
  if (depth > 14) return "[max depth]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (value.length > 1200) {
      return `${value.slice(0, 1200)}… (${value.length} chars total)`;
    }
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeForStepDisplay(v, depth + 1));
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      if (k === "base64" && typeof v === "string") {
        out[k] = `[base64 omitted ${v.length} chars]`;
      } else {
        out[k] = sanitizeForStepDisplay(v, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}
