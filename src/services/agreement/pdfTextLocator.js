import zlib from "zlib";
import { PDFName, PDFArray } from "pdf-lib";

const WIN_ANSI_OVERRIDES = {
  0x85: "…",
  0x91: "‘",
  0x92: "’",
  0x93: "“",
  0x94: "”",
  0x95: "•",
  0x96: "–",
  0x97: "—",
  0xb1: "±",
};

function decodeHexString(hex) {
  const clean = hex.replace(/\s+/g, "");
  let out = "";
  for (let i = 0; i + 1 < clean.length; i += 2) {
    const code = parseInt(clean.slice(i, i + 2), 16);
    out += WIN_ANSI_OVERRIDES[code] ?? String.fromCharCode(code);
  }
  return out;
}

function decodeLiteralString(raw) {
  let out = "";
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = raw[i + 1];
    i += 1;
    if (next === "n") out += "\n";
    else if (next === "r") out += "\r";
    else if (next === "t") out += "\t";
    else if (next >= "0" && next <= "7") {
      let oct = next;
      while (oct.length < 3 && raw[i + 1] >= "0" && raw[i + 1] <= "7") {
        oct += raw[i + 1];
        i += 1;
      }
      const code = parseInt(oct, 8);
      out += WIN_ANSI_OVERRIDES[code] ?? String.fromCharCode(code);
    } else {
      out += next;
    }
  }
  return out;
}

function tokenize(content) {
  const tokens = [];
  let i = 0;
  const length = content.length;

  while (i < length) {
    const ch = content[i];

    if (ch === "%") {
      while (i < length && content[i] !== "\n") i += 1;
      continue;
    }
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === "(") {
      let depth = 1;
      let raw = "";
      i += 1;
      while (i < length && depth > 0) {
        const c = content[i];
        if (c === "\\") {
          raw += c + (content[i + 1] ?? "");
          i += 2;
          continue;
        }
        if (c === "(") depth += 1;
        if (c === ")") {
          depth -= 1;
          if (depth === 0) {
            i += 1;
            break;
          }
        }
        raw += c;
        i += 1;
      }
      tokens.push({ type: "string", value: decodeLiteralString(raw) });
      continue;
    }
    if (ch === "<" && content[i + 1] === "<") {
      tokens.push({ type: "op", value: "<<" });
      i += 2;
      continue;
    }
    if (ch === "<") {
      const end = content.indexOf(">", i);
      if (end === -1) break;
      tokens.push({ type: "string", value: decodeHexString(content.slice(i + 1, end)) });
      i = end + 1;
      continue;
    }
    if (ch === ">" && content[i + 1] === ">") {
      tokens.push({ type: "op", value: ">>" });
      i += 2;
      continue;
    }
    if (ch === "[") {
      tokens.push({ type: "arrayStart" });
      i += 1;
      continue;
    }
    if (ch === "]") {
      tokens.push({ type: "arrayEnd" });
      i += 1;
      continue;
    }
    if (ch === "/") {
      let name = "";
      i += 1;
      while (i < length && !/[\s/[\]()<>]/.test(content[i])) {
        name += content[i];
        i += 1;
      }
      tokens.push({ type: "name", value: name });
      continue;
    }
    if (/[-+.\d]/.test(ch)) {
      let num = "";
      while (i < length && /[-+.\d]/.test(content[i])) {
        num += content[i];
        i += 1;
      }
      const parsed = parseFloat(num);
      tokens.push({ type: "number", value: Number.isFinite(parsed) ? parsed : 0 });
      continue;
    }

    let op = "";
    while (i < length && !/[\s/[\]()<>]/.test(content[i])) {
      op += content[i];
      i += 1;
    }
    if (op) tokens.push({ type: "op", value: op });
    else i += 1;
  }

  return tokens;
}

function multiply(a, b) {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

function apply(matrix, x, y) {
  return {
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5],
  };
}

function pageContent(page) {
  const ctx = page.doc.context;
  const contents = page.node.get(PDFName.of("Contents"));
  const resolved =
    contents instanceof PDFArray
      ? Array.from({ length: contents.size() }, (_, i) => ctx.lookup(contents.get(i)))
      : [ctx.lookup(contents)];

  let raw = "";
  for (const stream of resolved) {
    if (!stream || typeof stream.getContents !== "function") continue;
    const buf = Buffer.from(stream.getContents());
    try {
      raw += `${zlib.inflateSync(buf).toString("latin1")}\n`;
    } catch {
      raw += `${buf.toString("latin1")}\n`;
    }
  }
  return raw;
}

function scanPage(page, pageIndex) {
  const tokens = tokenize(pageContent(page));
  const runs = [];
  const rules = [];

  let ctm = [1, 0, 0, 1, 0, 0];
  const ctmStack = [];
  let textMatrix = [1, 0, 0, 1, 0, 0];
  let lineMatrix = [1, 0, 0, 1, 0, 0];
  let fontSize = 0;
  let leading = 0;
  let charSpacing = 0;
  let horizontalScale = 1;
  let pendingRects = [];
  let pathPoints = [];
  let operands = [];

  const numbers = (count) => {
    const picked = [];
    for (let i = operands.length - 1; i >= 0 && picked.length < count; i -= 1) {
      if (operands[i].type === "number") picked.unshift(operands[i].value);
    }
    while (picked.length < count) picked.unshift(0);
    return picked;
  };

  const emit = (text) => {
    if (!text) return;
    const combined = multiply(textMatrix, ctm);
    const scaleX = Math.hypot(combined[0], combined[1]) || 1;
    const size = fontSize * scaleX;
    const width = text.length * size * 0.5 * horizontalScale;
    runs.push({
      pageIndex,
      text,
      x: combined[4],
      y: combined[5],
      size,
      width,
    });
    const advance = (width + text.length * charSpacing) / (scaleX || 1);
    textMatrix = multiply([1, 0, 0, 1, advance, 0], textMatrix);
  };

  for (const token of tokens) {
    if (token.type !== "op") {
      operands.push(token);
      continue;
    }

    switch (token.value) {
      case "q":
        ctmStack.push([...ctm]);
        break;
      case "Q":
        ctm = ctmStack.pop() || [1, 0, 0, 1, 0, 0];
        break;
      case "cm": {
        const [a, b, c, d, e, f] = numbers(6);
        ctm = multiply([a, b, c, d, e, f], ctm);
        break;
      }
      case "re": {
        const [x, y, w, h] = numbers(4);
        const origin = apply(ctm, x, y);
        const far = apply(ctm, x + w, y + h);
        pendingRects.push({
          x: Math.min(origin.x, far.x),
          y: Math.min(origin.y, far.y),
          width: Math.abs(far.x - origin.x),
          height: Math.abs(far.y - origin.y),
        });
        break;
      }
      case "m":
      case "l": {
        const [x, y] = numbers(2);
        pathPoints.push(apply(ctm, x, y));
        break;
      }
      case "h":
        break;
      case "c":
      case "v":
      case "y": {
        const [x, y] = numbers(2);
        pathPoints.push(apply(ctm, x, y));
        break;
      }
      case "f":
      case "F":
      case "f*":
      case "b":
      case "b*":
      case "B":
      case "B*":
      case "S":
      case "s": {
        for (const rect of pendingRects) {
          if (rect.height <= 2.5 && rect.width >= 30) {
            rules.push({ pageIndex, ...rect });
          }
        }
        if (pathPoints.length >= 2) {
          const xs = pathPoints.map((point) => point.x);
          const ys = pathPoints.map((point) => point.y);
          const rect = {
            x: Math.min(...xs),
            y: Math.min(...ys),
            width: Math.max(...xs) - Math.min(...xs),
            height: Math.max(...ys) - Math.min(...ys),
          };
          if (rect.height <= 2.5 && rect.width >= 30) {
            rules.push({ pageIndex, ...rect });
          }
        }
        pendingRects = [];
        pathPoints = [];
        break;
      }
      case "n":
      case "W":
      case "W*":
        pendingRects = [];
        pathPoints = [];
        break;
      case "BT":
        textMatrix = [1, 0, 0, 1, 0, 0];
        lineMatrix = [1, 0, 0, 1, 0, 0];
        break;
      case "Tf":
        fontSize = numbers(1)[0];
        break;
      case "TL":
        leading = numbers(1)[0];
        break;
      case "Tc":
        charSpacing = numbers(1)[0];
        break;
      case "Tz":
        horizontalScale = numbers(1)[0] / 100;
        break;
      case "Tm": {
        const [a, b, c, d, e, f] = numbers(6);
        textMatrix = [a, b, c, d, e, f];
        lineMatrix = [...textMatrix];
        break;
      }
      case "Td": {
        const [tx, ty] = numbers(2);
        lineMatrix = multiply([1, 0, 0, 1, tx, ty], lineMatrix);
        textMatrix = [...lineMatrix];
        break;
      }
      case "TD": {
        const [tx, ty] = numbers(2);
        leading = -ty;
        lineMatrix = multiply([1, 0, 0, 1, tx, ty], lineMatrix);
        textMatrix = [...lineMatrix];
        break;
      }
      case "T*":
        lineMatrix = multiply([1, 0, 0, 1, 0, -leading], lineMatrix);
        textMatrix = [...lineMatrix];
        break;
      case "Tj":
      case "'":
      case '"': {
        if (token.value !== "Tj") {
          lineMatrix = multiply([1, 0, 0, 1, 0, -leading], lineMatrix);
          textMatrix = [...lineMatrix];
        }
        for (let i = operands.length - 1; i >= 0; i -= 1) {
          if (operands[i].type === "string") {
            emit(operands[i].value);
            break;
          }
        }
        break;
      }
      case "TJ": {
        let collected = "";
        for (const operand of operands) {
          if (operand.type === "string") collected += operand.value;
        }
        emit(collected);
        break;
      }
      default:
        break;
    }

    operands = [];
  }

  return { runs, rules };
}

export function buildDocumentIndex(pdfDoc) {
  const pages = pdfDoc.getPages();
  const allRuns = [];
  const allRules = [];

  pages.forEach((page, index) => {
    try {
      const { runs, rules } = scanPage(page, index);
      allRuns.push(...runs);
      allRules.push(...rules);
    } catch {
      return;
    }
  });

  const grouped = new Map();
  for (const run of allRuns) {
    if (!run.text.trim()) continue;
    const key = `${run.pageIndex}:${Math.round(run.y)}`;
    if (!grouped.has(key)) {
      grouped.set(key, { pageIndex: run.pageIndex, y: run.y, runs: [] });
    }
    grouped.get(key).runs.push(run);
  }

  const lines = [];
  for (const line of grouped.values()) {
    line.runs.sort((a, b) => a.x - b.x);
    line.text = line.runs.map((run) => run.text).join("");
    lines.push(line);
  }
  lines.sort((a, b) => a.pageIndex - b.pageIndex || b.y - a.y);

  return { lines, rules: allRules };
}

function offsetToX(line, charIndex, edge) {
  let consumed = 0;
  for (const run of line.runs) {
    const next = consumed + run.text.length;
    const inside = edge === "end" ? charIndex <= next : charIndex < next;
    if (inside) {
      const within = run.text.length > 0 ? (charIndex - consumed) / run.text.length : 0;
      return run.x + run.width * within;
    }
    consumed = next;
  }
  const last = line.runs[line.runs.length - 1];
  return last ? last.x + last.width : 0;
}

export function findLabel(index, label, options = {}) {
  const {
    column = null,
    pageWidth = 612,
    minPageIndex = 0,
    pageIndex = null,
    maxY = null,
    minY = null,
  } = options;
  const needle = label.toLowerCase().replace(/\s+/g, " ").trim();
  if (!needle) return null;

  const matches = [];

  for (const line of index.lines) {
    if (line.pageIndex < minPageIndex) continue;
    if (pageIndex !== null && line.pageIndex !== pageIndex) continue;
    if (maxY !== null && line.y > maxY) continue;
    if (minY !== null && line.y < minY) continue;

    const haystack = line.text.toLowerCase();
    const occurrences = [];
    let cursor = haystack.indexOf(needle);
    while (cursor !== -1) {
      occurrences.push({ at: cursor, length: needle.length });
      cursor = haystack.indexOf(needle, cursor + 1);
    }

    if (occurrences.length === 0) {
      const squashedHay = haystack.replace(/\s+/g, "");
      const squashedNeedle = needle.replace(/\s+/g, "");
      const squashedAt = squashedHay.indexOf(squashedNeedle);
      if (squashedAt === -1) continue;
      occurrences.push({ at: squashedAt, length: squashedNeedle.length });
    }

    for (const occurrence of occurrences) {
      matches.push({
        pageIndex: line.pageIndex,
        y: line.y,
        size: line.runs[0]?.size || 10,
        labelStartX: offsetToX(line, occurrence.at, "start"),
        labelEndX: offsetToX(line, occurrence.at + occurrence.length, "end"),
        text: line.text,
      });
    }
  }

  matches.sort((a, b) => a.pageIndex - b.pageIndex || b.y - a.y || a.labelStartX - b.labelStartX);

  if (matches.length === 0) return null;
  if (column === null) return matches[0];

  const mid = pageWidth / 2;
  const filtered = matches.filter((match) =>
    column === "right" ? match.labelStartX >= mid - 30 : match.labelStartX < mid - 30
  );
  return filtered[0] || null;
}

export function findFillRule(index, anchor, options = {}) {
  const { maxVerticalGap = 6, minWidth = 40 } = options;
  if (!anchor) return null;

  const candidates = index.rules.filter((rule) => {
    if (rule.pageIndex !== anchor.pageIndex) return false;
    if (rule.width < minWidth) return false;
    const verticalGap = anchor.y - rule.y;
    if (verticalGap < -2 || verticalGap > maxVerticalGap) return false;
    return rule.x + rule.width > anchor.labelStartX;
  });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const aAfter = a.x >= anchor.labelEndX - 6 ? 0 : 1;
    const bAfter = b.x >= anchor.labelEndX - 6 ? 0 : 1;
    if (aAfter !== bAfter) return aAfter - bAfter;
    return a.x - b.x;
  });

  return candidates[0];
}

export default { buildDocumentIndex, findLabel, findFillRule };
