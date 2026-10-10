/** A receipt repair is always visible and must be confirmed before saving. */
export type ImportRepairRecord = { type: string; count: number; before: string; after: string };
const MARKDOWN = new Set(["_", "[", "]", "{", "}", "*"]);
const JSON_ESCAPES = new Set(['"', "\\", "/", "b", "f", "n", "r", "t", "u"]);

/** Remove Markdown escapes from keys/structure only. Value text is opaque. */
export function normalizeMarkdownEscapes(text: string): { text: string; records: ImportRepairRecord[] } {
  let output = "";
  const records: ImportRepairRecord[] = [];
  for (let i = 0; i < text.length;) {
    if (text[i] === '"') {
      const start = i++;
      while (i < text.length) { if (text[i] === "\\") { i += 2; continue; } if (text[i++] === '"') break; }
      const token = text.slice(start, i);
      let next = i;
      while (/\s/.test(text[next] ?? "") && next < text.length) next++;
      const isKey = text[next] === ":" || text[next] === "：";
      let repaired = "", count = 0;
      for (let cursor = 0; cursor < token.length; cursor++) {
        const character = token[cursor], following = token[cursor + 1];
        if (character === "\\" && following) {
          if (JSON_ESCAPES.has(following)) { repaired += character + following; cursor++; continue; }
          if (MARKDOWN.has(following)) {
            // In values, retain the literal slash rather than guess whether it was intentional.
            repaired += isKey ? following : "\\\\" + following; count++; cursor++; continue;
          }
        }
        repaired += character;
      }
      if (repaired !== token) records.push({ type: isKey ? "Markdown 欄位跳脫" : "保留文字值中的非標準反斜線", count, before: token.slice(0, 120), after: repaired.slice(0, 120) });
      output += repaired;
    } else if (text[i] === "\\" && "[]{}".includes(text[i + 1] ?? "") && i + 1 < text.length) {
      records.push({ type: "Markdown 結構跳脫", count: 1, before: text.slice(i, i + 2), after: text[i + 1] });
      output += text[i + 1]; i += 2;
    } else { output += text[i++]; }
  }
  return { text: output, records };
}

/** Bounded snippets; never log or copy the complete receipt. */
export function repairDifference(type: string, before: string, after: string): ImportRepairRecord {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let oldEnd = before.length, newEnd = after.length;
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd--; newEnd--; }
  return { type, count: 1, before: before.slice(Math.max(0, start - 20), Math.min(before.length, oldEnd + 20)).slice(0, 160), after: after.slice(Math.max(0, start - 20), Math.min(after.length, newEnd + 20)).slice(0, 160) };
}
