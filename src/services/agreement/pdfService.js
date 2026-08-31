import fs from "fs/promises";
import path from "path";
import Mustache from "mustache";
import {
  PDF_REMOTE_BASE,
  PDF_REMOTE_TIMEOUT_MS,
  PDF_TEMPLATE_PATH,
  PDF_HEADER_TEMPLATE_PATH,
} from "#config/pdfConfig.js";
import { cleanupTemporaryArtifacts } from "#utils/tmpCleanup.js";
import logger from "../../utils/logger.js";

async function remotePostPdf(
  pathname,
  body = {},
  { timeoutMs = PDF_REMOTE_TIMEOUT_MS } = {}
) {
  const url = `${PDF_REMOTE_BASE.replace(/\/+$/, "")}/${pathname.replace(/^\/+/, "")}`;
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/pdf" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      const err = new Error(`Remote compile failed (${resp.status})`);
      err.detail = txt;
      throw err;
    }
    const ab = await resp.arrayBuffer();
    return Buffer.from(ab);
  } finally {
    clearTimeout(to);
  }
}

async function remotePostMultipart(
  pathname,
  files,
  extraFields = {},
  { timeoutMs = PDF_REMOTE_TIMEOUT_MS } = {}
) {
  const url = `${PDF_REMOTE_BASE.replace(/\/+$/, "")}/${pathname.replace(/^\/+/, "")}`;
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);

  try {
    logger.debug(`📡 [REMOTE PDF] Calling remote PDF service: ${url}`);

    // Generate boundary WITHOUT leading dashes (RFC 2046)
    // The -- prefix is added in the body, not in the Content-Type header
    const boundary = `FormBoundary${Date.now()}${Math.random().toString(36).substring(2)}`;
    const parts = [];

    // Add extra fields
    for (const [k, v] of Object.entries(extraFields || {})) {
      const value = typeof v === "string" ? v : JSON.stringify(v);
      parts.push(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${k}"\r\n\r\n` +
        `${value}\r\n`
      );
    }

    // Add files
    for (const f of files) {
      const filename = String(f.name).replace(/\\/g, "/");
      const contentType = f.type || "application/octet-stream";

      // Create header as string
      const header =
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${f.field}"; filename="${filename}"\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`;

      parts.push(header);
      parts.push(f.data);  // Binary data
      parts.push('\r\n');

      logger.debug(`📎 [REMOTE PDF] Added file: ${filename}, size: ${f.data.length} bytes, type: ${contentType}`);
    }

    // Add closing boundary
    parts.push(`--${boundary}--\r\n`);

    // Combine all parts into a single buffer
    const bodyParts = parts.map(part =>
      Buffer.isBuffer(part) ? part : Buffer.from(part, 'utf8')
    );
    const body = Buffer.concat(bodyParts);

    logger.debug(`📡 [REMOTE PDF] Total body size: ${body.length} bytes, boundary: ${boundary}`);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length.toString(),
      },
      body: body,
      signal: controller.signal
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      logger.error(`❌ [REMOTE PDF] Remote compile failed with status ${resp.status}:`, txt.slice(0, 500));

      const err = new Error(`Remote PDF service failed: ${resp.status} ${resp.statusText}`);
      err.detail = txt;
      err.httpStatus = resp.status;
      err.url = url;
      err.errorType = 'REMOTE_PDF_SERVICE_ERROR';
      throw err;
    }

    const ab = await resp.arrayBuffer();
    logger.debug(`✅ [REMOTE PDF] Successfully compiled PDF, size: ${ab.byteLength} bytes`);
    return Buffer.from(ab);
  } catch (error) {
    logger.error(`❌ [REMOTE PDF] Error during PDF compilation:`, {
      name: error.name,
      message: error.message,
      url,
      timeout: timeoutMs
    });

    const enhancedError = new Error(error.message || 'PDF compilation failed');
    enhancedError.originalError = error.message;
    enhancedError.errorName = error.name;
    enhancedError.url = url;
    enhancedError.timeout = timeoutMs;
    enhancedError.detail = error.detail || null;
    enhancedError.httpStatus = error.httpStatus || null;
    enhancedError.errorType = error.errorType || (error.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR');
    enhancedError.stack = error.stack;

    throw enhancedError;
  } finally {
    clearTimeout(to);
  }
}

async function tidyTempArtifacts(options = {}) {
  try {
    await cleanupTemporaryArtifacts(options);
  } catch (err) {
    logger.warn("⚠️ [TMP CLEANUP] Failed to clean temporary artifacts:", err.message);
  }
}

function buildServiceAgreementLatex(agreementData = {}) {
  if (!agreementData || !agreementData.includeInPdf) {
    return '';
  }

  // Pre-sanitize all string fields in agreementData to catch any binary corruption
  const sanitizeField = (value, fieldName) => {
    if (typeof value !== 'string') return value;

    // Check for ANY non-printable characters (more comprehensive check)
    const originalLength = value.length;

    // Use whitelist approach: only keep printable ASCII, common punctuation, and safe whitespace
    // This is more reliable than blacklisting specific control characters
    const cleaned = value
      // Remove all control characters (0x00-0x1F except tab, newline, carriage return)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
      // Remove DEL and C1 control codes (0x7F-0x9F)
      .replace(/[\x7F-\x9F]/g, '')
      // Remove replacement character
      .replace(/\uFFFD/g, '')
      // Remove any remaining non-ASCII high bytes that might cause issues
      .replace(/[\u0080-\u00FF]/g, (char) => {
        // Keep only safe extended ASCII (like smart quotes, etc.)
        const code = char.charCodeAt(0);
        // Allow common safe characters: non-breaking space, some punctuation
        if (code === 0xA0) return ' '; // Non-breaking space -> regular space
        if (code >= 0xC0 && code <= 0xFF) return char; // Keep accented letters
        logger.warn(`⚠️ [SERVICE AGREEMENT] Removing high-byte char 0x${code.toString(16)} from ${fieldName}`);
        return '';
      })
      // Remove any Unicode replacement characters or other problematic Unicode
      .replace(/[\uFFF0-\uFFFF]/g, '')
      .replace(/[^\x20-\x7E\xA0-\u024F-\u206F\u2010-\u2027]/g, '');

    if (cleaned.length !== originalLength) {
      logger.warn(`⚠️ [SERVICE AGREEMENT] Sanitized field "${fieldName}": removed ${originalLength - cleaned.length} chars`);
      logger.warn(`⚠️ [SERVICE AGREEMENT] Original (first 200 chars):`, value.slice(0, 200).replace(/[^\x20-\x7E]/g, '?'));
      // Log hex dump of first problematic area
      const firstBadIndex = value.split('').findIndex(c => {
        const code = c.charCodeAt(0);
        return code < 0x20 && code !== 0x09 && code !== 0x0A && code !== 0x0D;
      });
      if (firstBadIndex >= 0) {
        const start = Math.max(0, firstBadIndex - 10);
        const end = Math.min(value.length, firstBadIndex + 20);
        const snippet = value.slice(start, end);
        logger.warn(`⚠️ [SERVICE AGREEMENT] First bad char at index ${firstBadIndex}:`,
          Array.from(snippet).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' '));
      }
    }

    return cleaned;
  };

  // Sanitize the agreement data
  const sanitized = { ...agreementData };
  for (const key of Object.keys(sanitized)) {
    if (typeof sanitized[key] === 'string') {
      sanitized[key] = sanitizeField(sanitized[key], key);
    }
  }

  const escape = latexEscape;

  const checkbox = (checked) => checked ? '{[\\textbf{X}]}' : '{[~~]}';

  return `
\\newpage

% ====== SERVICE AGREEMENT PAGE ======================================

\\noindent
\\begin{minipage}[c]{0.20\\textwidth}
  \\centering
  \\includegraphics[width=0.80\\linewidth]{images/Envimaster.png}%
\\end{minipage}%
\\hfill
\\begin{minipage}[c]{0.60\\textwidth}
  \\centering
  {\\bfseries\\Large\\textcolor{emred}{${escape(sanitized.titleText || 'SERVICE AGREEMENT')}}}
  \\vspace{0.3em}

  {\\large\\bfseries ${escape(sanitized.subtitleText || 'Terms and Conditions')}}
\\end{minipage}%
\\hfill
\\begin{minipage}[c]{0.18\\textwidth}
  \\hfill
\\end{minipage}

\\vspace{0.5em}

% Terms
\\begin{enumerate}
  \\item ${escape(sanitized.term1 || '')}

  \\item ${escape(sanitized.term2 || '')}

  \\item ${escape(sanitized.term3 || '')}

  \\item ${escape(sanitized.term4 || '')}

  \\item ${escape(sanitized.term5 || '')}

  \\item ${escape(sanitized.term6 || '')}

  \\item ${escape(sanitized.term7 || '')}
\\end{enumerate}

\\vspace{0.5em}

% Dispenser options
\\noindent
${checkbox(sanitized.retainDispensers)} ${escape(sanitized.retainDispensersLabel || 'Customer desires to retain existing dispensers')}
\\hspace{2em}
${checkbox(sanitized.disposeDispensers)} ${escape(sanitized.disposeDispensersLabel || 'Customer desires to dispose of existing dispensers')}

\\vspace{0.5em}

\\noindent
${escape(sanitized.noteText || '')}

\\vspace{0.5em}

% Representatives
  \\noindent
  ${escape(sanitized.emSalesRepLabel || 'EM Sales Representative')}: \\filledlineleftlim[4.2cm]{${escape(sanitized.emSalesRepresentative || '')}} \\hspace{2em}
  ${escape(sanitized.insideSalesRepLabel || 'Inside Sales Representative')}: \\filledlineleftlim[4.2cm]{${escape(sanitized.insideSalesRepresentative || '')}}

\\vspace{0.5em}

\\noindent
{\\bfseries ${escape(sanitized.authorityText || 'I HEREBY REPRESENT THAT I HAVE THE AUTHORITY TO SIGN THIS AGREEMENT:')}}

\\vspace{0.8em}

% Signatures
\\noindent
\\begin{minipage}[t]{0.48\\textwidth}
  ${escape(sanitized.customerContactLabel || 'Customer Contact Name:')}: \\filledlineleftlim[5.5cm]{${escape(sanitized.customerContactName || '')}}

  \\vspace{0.6em}

  ${escape(sanitized.customerSignatureLabel || 'Signature:')}: \\filledlineleftlim[5.1cm]{${escape(sanitized.customerSignature || '')}}

  \\vspace{0.6em}

  ${escape(sanitized.customerDateLabel || 'Date:')}: \\filledlineleftlim[3cm]{${escape(sanitized.customerSignatureDate || '')}}
\\end{minipage}%
\\hfill
\\begin{minipage}[t]{0.48\\textwidth}
  ${escape(sanitized.emFranchiseeLabel || 'EM Franchisee:')}: \\filledlineleftlim[5.5cm]{${escape(sanitized.emFranchisee || '')}}

  \\vspace{0.6em}

  ${escape(sanitized.emSignatureLabel || 'Signature:')}: \\filledlineleftlim[5.1cm]{${escape(sanitized.emSignature || '')}}

  \\vspace{0.6em}

  ${escape(sanitized.emDateLabel || 'Date:')}: \\filledlineleftlim[3cm]{${escape(sanitized.emSignatureDate || '')}}
\\end{minipage}
`;
}

function buildWatermarkLatex() {
  const preamble = `
% ====== DRAFT WATERMARK PACKAGES ======================================
\\usepackage{tikz}
\\usepackage{everypage}
% ======================================================================
`;

  const command = `
% ====== DRAFT WATERMARK COMMAND =======================================
\\AddEverypageHook{%
  \\begin{tikzpicture}[remember picture, overlay]
    \\node[
      rotate=45,
      scale=10,
      text opacity=0.15,
      inner sep=0pt,
      text=gray
    ] at (current page.center) {\\textbf{DRAFT}};
  \\end{tikzpicture}%
}
% ======================================================================
`;

  return { preamble, command };
}

function validatePayloadData(body) {
  const issues = [];

  const checkValue = (path, value) => {
    if (value == null) return;
    const str = String(value);

    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/.test(str)) {
      issues.push(`${path}: contains control characters`);
    }
    if (/\uFFFD/.test(str)) {
      issues.push(`${path}: contains invalid UTF-8 (�)`);
    }
  };

  if (body.headerTitle) checkValue('headerTitle', body.headerTitle);
  if (body.headerRows) {
    body.headerRows.forEach((row, i) => {
      checkValue(`headerRows[${i}].labelLeft`, row.labelLeft);
      checkValue(`headerRows[${i}].valueLeft`, row.valueLeft);
      checkValue(`headerRows[${i}].labelRight`, row.labelRight);
      checkValue(`headerRows[${i}].valueRight`, row.valueRight);
    });
  }

  if (body.services?.notes?.textLines) {
    body.services.notes.textLines.forEach((line, i) => {
      checkValue(`services.notes.textLines[${i}]`, line);
    });
  }

  if (body.serviceAgreement) {
    const sa = body.serviceAgreement;
    Object.keys(sa).forEach(key => {
      if (typeof sa[key] === 'string') {
        checkValue(`serviceAgreement.${key}`, sa[key]);
      }
    });
  }

  if (issues.length > 0) {
    logger.warn('⚠️ [PAYLOAD VALIDATION] Found corrupted data in payload:');
    issues.forEach(issue => logger.warn(`  - ${issue}`));
  }

  return issues;
}

function deepSanitizeObject(obj, visited = new WeakSet(), path = '') {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj !== 'object') {
    if (typeof obj === 'string') {
      const hasProblems = /[\x00-\x1F\x7F-\xFF\uFFFD]/.test(obj);
      if (hasProblems) {
        logger.warn(`⚠️ [SANITIZE] Corrupted data found at path: "${path}"`, {
          originalLength: obj.length,
          preview: obj.slice(0, 50).replace(/[\x00-\x1F\x7F-\xFF]/g, '?'),
          hexDump: Array.from(obj.slice(0, 20)).map(c =>
            c.charCodeAt(0).toString(16).padStart(2, '0')
          ).join(' ')
        });
      }

      const cleaned = obj
        .replace(/\xd7/g, 'x')
        .replace(/\xf7/g, '/')
        .replace(/\xd0/g, '-')
        .replace(/\xa0/g, ' ')
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u2013\u2014\u2212]/g, '-')
        .replace(/\u2022/g, '*')
        .replace(/\u2023/g, '*')
        .replace(/\u25E6/g, '*')
        .replace(/\u00B7/g, '*')
        .replace(/\u2219/g, '*')
        .replace(/\u00D7/g, 'x')
        .replace(/\u00F7/g, '/')
        .replace(/\u2260/g, '!=')
        .replace(/\u2026/g, '...')
        .replace(/\u00A9/g, '(c)')
        .replace(/\u00AE/g, '(R)')
        .replace(/\u2122/g, '(TM)')
        .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
        .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
        .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
        .replace(/[\u{1F700}-\u{1F77F}]/gu, '')
        .replace(/[\u{1F780}-\u{1F7FF}]/gu, '')
        .replace(/[\u{1F800}-\u{1F8FF}]/gu, '')
        .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
        .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '')
        .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '')
        .replace(/[\u{2600}-\u{26FF}]/gu, '')
        .replace(/[\u{2700}-\u{27BF}]/gu, '')
        .replace(/[\x00-\x1F]/g, '')
        .replace(/\uFFFD/g, '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/[\x7F-\xFF]/g, (char) => {
          const code = char.charCodeAt(0).toString(16).padStart(2, '0');
          logger.warn(`⚠️ [SANITIZE] Unhandled high-bit character at "${path}": 0x${code}`);
          return '';
        })
        .replace(/[^\x20-\x7E\n\r\t]/g, '')
        .trim();

      if (cleaned.length === 0 && obj.length > 0) {
        logger.warn(`⚠️ [SANITIZE] Field completely removed (was corrupted): "${path}" (original: ${obj.length} chars)`);
      }

      return cleaned;
    }
    return obj; 
  }

  if (visited.has(obj)) {
    return obj;
  }
  visited.add(obj);

  if (Array.isArray(obj)) {
    return obj.map((item, index) => deepSanitizeObject(item, visited, `${path}[${index}]`));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    const newPath = path ? `${path}.${key}` : key;
    sanitized[key] = deepSanitizeObject(value, visited, newPath);
  }
  return sanitized;
}

function latexEscape(value = "") {
  const original = String(value);

  const hasControlChars = /[\x00-\x1F\x7F-\xFF]/.test(original);
  const hasInvalidUTF8 = /\uFFFD/.test(original);
  const hasBinaryData = /[\x00-\x08\x0E-\x1F]/.test(original);

  if (hasControlChars || hasInvalidUTF8 || hasBinaryData) {
    logger.warn('⚠️ [LATEX-ESCAPE] PROBLEMATIC INPUT DETECTED:', {
      hasControlChars,
      hasInvalidUTF8,
      hasBinaryData,
      originalLength: original.length,
      hexDump: Array.from(original.slice(0, 50)).map(c =>
        c.charCodeAt(0).toString(16).padStart(2, '0')
      ).join(' '),
      preview: original.slice(0, 100).replace(/[\x00-\x1F\x7F-\xFF]/g, '?')
    });
  }

  let sanitized = original
    .replace(/\xd7/g, 'x')
    .replace(/\xf7/g, '/')
    .replace(/\xd0/g, '-')
    .replace(/\xa0/g, ' ')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u2022/g, '*')
    .replace(/\u2023/g, '*')
    .replace(/\u25E6/g, '*')
    .replace(/\u00B7/g, '*')
    .replace(/\u2219/g, '*')
    .replace(/\u00D7/g, 'x')
    .replace(/\u00F7/g, '/')
    .replace(/\u2260/g, '!=')
    .replace(/\u2026/g, '...')
    .replace(/\u00A9/g, '(c)')
    .replace(/\u00AE/g, '(R)')
    .replace(/\u2122/g, '(TM)')
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
    .replace(/[\u{2600}-\u{26FF}]/gu, '')
    .replace(/[\x00-\x1F]/g, '')
    .replace(/\uFFFD/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\x7F-\xFF]/g, (char) => {
      const code = char.charCodeAt(0).toString(16).padStart(2, '0');
      if (code !== 'd7' && code !== 'f7' && code !== 'd0' && code !== 'a0') {
        logger.warn(`⚠️ [LATEX-ESCAPE] Unhandled high-bit character: 0x${code}`);
      }
      return '';
    })
    .replace(/[^\x20-\x7E\n\r\t]/g, '')
    .replace(/[\n\r\t]+/g, ' ')  // Replace newlines and tabs with spaces to prevent breaking LaTeX macros
    .replace(/\s+/g, ' ')        // Collapse multiple spaces
    .normalize('NFC')
    .trim();

  if (sanitized.length === 0 && original.length > 0) {
    logger.warn('⚠️ [LATEX-ESCAPE] Sanitization removed all content! Original had:', original.length, 'chars');
    return '';
  }

  if (sanitized.length < original.length * 0.5 && original.length > 10) {
    logger.warn('⚠️ [LATEX-ESCAPE] Sanitization removed', original.length - sanitized.length, 'characters');
  }

  // Use placeholder approach to avoid double-escaping braces in LaTeX commands
  const BACKSLASH_PLACEHOLDER = '\u0000BKSL\u0000';
  const CARET_PLACEHOLDER = '\u0000CRET\u0000';
  const TILDE_PLACEHOLDER = '\u0000TLDE\u0000';

  return sanitized
    // First, use placeholders for special sequences that have braces
    .replace(/\\/g, BACKSLASH_PLACEHOLDER)
    .replace(/\^/g, CARET_PLACEHOLDER)
    .replace(/~/g, TILDE_PLACEHOLDER)
    // Escape braces and other special characters
    .replace(/([{}%&_#])/g, "\\$1")
    .replace(/\$/g, "\\$")
    // Replace placeholders with actual LaTeX commands (braces won't be re-escaped)
    .replace(new RegExp(BACKSLASH_PLACEHOLDER, 'g'), "\\textbackslash{}")
    .replace(new RegExp(CARET_PLACEHOLDER, 'g'), "\\textasciicircum{}")
    .replace(new RegExp(TILDE_PLACEHOLDER, 'g'), "\\textasciitilde{}");
}

function latexEscapeHeader(value = "") {
  let sanitized = String(value)
    .replace(/\xd7/g, 'x')
    .replace(/\xf7/g, '/')
    .replace(/\xd0/g, '-')
    .replace(/\xa0/g, ' ')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u2022/g, '*')
    .replace(/\u00B7/g, '*')
    .replace(/\u00D7/g, 'x')
    .replace(/\u00F7/g, '/')
    .replace(/\u2026/g, '...')
    .replace(/\u00A9/g, '(c)')
    .replace(/\u00AE/g, '(R)')
    .replace(/\u2122/g, '(TM)')
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
    .replace(/[\u{2600}-\u{26FF}]/gu, '')
    .replace(/[\x00-\x1F]/g, '')
    .replace(/\uFFFD/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\x7F-\xFF]/g, '')
    .normalize('NFC')
    .trim();

  let result = sanitized
    .replace(/Replacement/g, "Replace-ment")
    .replace(/Warranty/g, "War-ranty")
    .replace(/Frequency/g, "Fre-quency")
    .replace(/Install/g, "In-stall");

  // Use placeholder approach to avoid double-escaping braces in LaTeX commands
  const BACKSLASH_PLACEHOLDER = '\u0000BKSL\u0000';
  const CARET_PLACEHOLDER = '\u0000CRET\u0000';
  const TILDE_PLACEHOLDER = '\u0000TLDE\u0000';

  result = result
    // First, use placeholders for special sequences that have braces
    .replace(/\\/g, BACKSLASH_PLACEHOLDER)
    .replace(/\^/g, CARET_PLACEHOLDER)
    .replace(/~/g, TILDE_PLACEHOLDER)
    // Escape braces and other special characters
    .replace(/([{}%&_#])/g, "\\$1")
    .replace(/\$/g, "\\$")
    // Replace placeholders with actual LaTeX commands (braces won't be re-escaped)
    .replace(new RegExp(BACKSLASH_PLACEHOLDER, 'g'), "\\textbackslash{}")
    .replace(new RegExp(CARET_PLACEHOLDER, 'g'), "\\textasciicircum{}")
    .replace(new RegExp(TILDE_PLACEHOLDER, 'g'), "\\textasciitilde{}")
    .replace(/\//g, "/");

  return result;
}

function formatCurrency(value) {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return "";
  return `$${num.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
}

function fmtNum(value) {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return "0.00";
  return num.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

// A line item is printable as soon as a quantity was entered, even when the price
// is $0 — reps comp items for existing customers and those still have to appear on
// the agreement. The total is only a fallback so flat charges that carry no
// quantity keep printing. Values arrive both as numbers and as already-formatted
// strings ("$1,234.56"), so strip currency decoration before comparing.
function toPrintableNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined) return 0;
  const cleaned = String(value).replace(/[^0-9.\-]/g, "");
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function hasPrintableLineItem(qty, total) {
  return toPrintableNumber(qty) > 0 || toPrintableNumber(total) > 0;
}

function getFrequencyLabel(freq) {
  const normalized = Number(freq);
  const labels = {
    0: "One-time",
    4: "Weekly",
    2: "Bi-weekly",
    1: "Monthly",
    1.0833: "Every 4 Weeks",
    0.5: "Every 2 Months",
    0.33: "Quarterly",
    0.17: "Bi-annually",
    0.08: "Annually",
  };
  if (Number.isFinite(normalized) && labels[normalized]) {
    return labels[normalized];
  }
  if (Number.isFinite(normalized) && normalized > 0) {
    return `${normalized}×/mo`;
  }
  return "";
}

function formatChargeLabel(amount, frequency) {
  const num = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(num) || num <= 0) {
    return "None";
  }
  const freqLabel = getFrequencyLabel(frequency) || "Monthly";
  if (Number(frequency) === 0) {
    return `$${fmtNum(num)} (${freqLabel})`;
  }
  return `$${fmtNum(num)} × ${freqLabel}`;
}

function buildProductsLatex(products = {}, customColumns = { products: [], dispensers: [] }) {
  let mergedProducts = [];
  let dispensers = [];

  if (products.products && Array.isArray(products.products)) {
    mergedProducts = products.products;
    dispensers = products.dispensers || [];
  } else {
    const { smallProducts = [], bigProducts = [] } = products;
    mergedProducts = [...smallProducts, ...bigProducts];
    dispensers = products.dispensers || [];
  }

  const fmtDollar = (v) => {
    if (v === null || v === undefined || v === "") return "";
    const num = typeof v === "number" ? v : parseFloat(v);
    if (!isNaN(num)) {
      return `$${fmtNum(num)}`;
    }
    return `$${v}`;
  };
  const grayCell = (value) => `\\cellcolor[RGB]{217,217,217}${value}`;

  const pick = (obj, keys) => {
    if (!obj) return null;
    for (const k of keys) {
      const val = obj[k];
      if (val !== undefined && val !== null && val !== "") {
        return val;
      }
    }
    return null;
  };

  const toStr = (v) =>
    v === null || v === undefined ? "" : String(v);

  const isEmptyProduct = (p) => {
    const qty = pick(p, ["qty", "quantity"]);
    return !qty || Number(qty) === 0;
  };

  mergedProducts = mergedProducts.filter(p => !isEmptyProduct(p));
  dispensers = dispensers.filter(d => !isEmptyProduct(d));

  const rowCount = Math.max(
    mergedProducts.length,
    dispensers.length
  );

  if (rowCount === 0) {
    return {
      productsColTypeDefinition: "",
      productsColSpecLatex: "p{\\textwidth}",
      productsHeaderRowLatex: "",
      productsBodyRowsLatex: "",
      hasProducts: false,  // Signal to hide products section
    };
  }

  const baseProductHeaders = ["Products", "Qty", "Unit Price/Amount", "Charge Type", "Frequency", "Total"];
  const baseDispenserHeaders = ["Dispensers", "Qty", "Warranty Rate", "Replacement Rate/Install", "Charge Type", "Frequency", "Total"];

  const productCustomHeaders = (customColumns.products || []).map(col => col.label || col.id);

  const dispenserCustomHeaders = (customColumns.dispensers || []).map(col => col.label || col.id);

  const headers = [
    ...baseProductHeaders,
    ...productCustomHeaders,
    ...baseDispenserHeaders,
    ...dispenserCustomHeaders,
  ];

  const numCols = headers.length;
  const colWidth = `\\dimexpr\\textwidth/${numCols}-2\\tabcolsep-1.5\\arrayrulewidth\\relax`;

  const productsColTypeDefinition = `\\newcolumntype{C}{>{\\centering\\arraybackslash}m{${colWidth}}}`;

  const productsColSpecLatex = headers.map(() => 'C').join("|");

  logger.debug('🔍 [PRODUCTS-TABLE] Column specification:', {
    numCols,
    colWidthFormula: colWidth,
    colTypeDefinition: productsColTypeDefinition,
    fullColSpec: productsColSpecLatex,
    colSpecLength: productsColSpecLatex.length
  });

const headerCell = (header) =>
  `\\cellcolor[RGB]{218,233,247}\\textbf{\\textcolor{emred}{\\hspace{0pt}${latexEscapeHeader(header)}}}`;

const headerLinePattern = "|" + headers.map(() => "-|").join("");

const productsHeaderRowLatex =
  "\\arrayrulecolor{black}\n" +
  `\\hhline{${headerLinePattern}}\n` +
  headers.map(headerCell).join(" & ") +
  " \\\\\n" +
  `\\hhline{${headerLinePattern}}\n` +
  "\\arrayrulecolor{black}\n";


  let productsBodyRowsLatex = "";

  const sanitizeString = (val) => {
    if (val === undefined || val === null || val === "") return "";
    const str = String(val);
    return str
      .replace(/[\x00-\x1F\x7F-\xFF]/g, '')
      .replace(/\uFFFD/g, '')
      .replace(/[^\x20-\x7E\n\r\t]/g, '')
      .trim();
  };

  for (let i = 0; i < rowCount; i++) {
    const mp = mergedProducts[i] || {};
    const dp = dispensers[i] || {};

    const leftNameRaw =
      mp.customName ||
      mp.displayName ||
      mp.productName ||
      mp.productKey ||
      "";
    const leftName = sanitizeString(leftNameRaw);

    const leftQty = pick(mp, ["qty", "quantity"]);

    const leftAmount = pick(mp, [
      "unitPrice",
      "unitPriceOverride",
      "amount",
      "amountPerUnit",
    ]);

    const leftFreqRaw = pick(mp, [
      "frequency",
      "frequencyOfService",
      "frequencyLabel",
    ]) || "";
    const leftCostType = mp.costType || "warranty";
    const leftChargeLabel = leftCostType === "productCost" ? "Direct" : "Warranty";
    const leftFreq = leftCostType === "productCost" ? "—" : sanitizeString(leftFreqRaw);

    const leftTotal = pick(mp, [
      "total",
      "totalOverride",
      "lineTotal",
      "extPrice",
    ]);

    const rightNameRaw =
      dp.customName ||
      dp.displayName ||
      dp.productName ||
      dp.productKey ||
      "";
    const rightName = sanitizeString(rightNameRaw);

    const rightQty = pick(dp, ["qty", "quantity"]);

    const rightWarranty = pick(dp, [
      "warrantyRate",
      "warrantyPriceOverride",
      "warranty",
    ]);

    const rightReplacement = pick(dp, [
      "replacementRate",
      "replacementPriceOverride",
      "replacement",
    ]);

    const rightFreqRaw = pick(dp, [
      "frequency",
      "frequencyOfService",
      "frequencyLabel",
    ]) || "";
    const rightCostType = dp.costType || "productCost";
    const rightChargeLabel = rightCostType === "productCost" ? "Direct" : "Warranty";
    const rightFreq = rightCostType === "productCost" ? "—" : sanitizeString(rightFreqRaw);

    const rightTotal = pick(dp, [
      "total",
      "totalOverride",
      "lineTotal",
      "extPrice",
    ]);

    const leftCustomValues = (customColumns.products || []).map(col => {
      const value = mp.customFields?.[col.id];

      const sanitized = sanitizeString(value);

      if (sanitized === "") {
        return latexEscape("");
      }

      if (typeof value === "number") {
        return latexEscape(fmtDollar(value));
      }

      if (typeof value === "string") {
        const numValue = parseFloat(sanitized);
        if (!isNaN(numValue)) {
          return latexEscape(fmtDollar(numValue));
        }
        return latexEscape(sanitized);
      }

      return latexEscape(sanitized);
    });

    const rightCustomValues = (customColumns.dispensers || []).map(col => {
      const value = dp.customFields?.[col.id];

      const sanitized = sanitizeString(value);

      if (sanitized === "") {
        return latexEscape("");
      }

      if (typeof value === "number") {
        return latexEscape(fmtDollar(value));
      }

      if (typeof value === "string") {
        const numValue = parseFloat(sanitized);
        if (!isNaN(numValue)) {
          return latexEscape(fmtDollar(numValue));
        }
        return latexEscape(sanitized);
      }

      return latexEscape(sanitized);
    });

    const rowCells = [
      grayCell(latexEscape(leftName)),
      latexEscape(toStr(leftQty)),
      latexEscape(fmtDollar(leftAmount)),
      latexEscape(leftChargeLabel),
      latexEscape(leftFreq),
      latexEscape(fmtDollar(leftTotal)),

      ...leftCustomValues,

      grayCell(latexEscape(rightName)),
      latexEscape(toStr(rightQty)),
      latexEscape(fmtDollar(rightWarranty)),
      latexEscape(fmtDollar(rightReplacement)),
      latexEscape(rightChargeLabel),
      latexEscape(rightFreq),
      latexEscape(fmtDollar(rightTotal)),

      ...rightCustomValues,
    ];

    productsBodyRowsLatex += rowCells.join(" & ") + " \\\\ \\hline\n";
  }

  return {
    productsColTypeDefinition,
    productsColSpecLatex,
    productsHeaderRowLatex,
    productsBodyRowsLatex,
    hasProducts: true,  // Signal to show products section
  };
}


function buildServiceRows(rows = []) {
  let out = "";
  for (const r of rows) {
    // Never print the "Minimum" floor row in the agreement PDF — it's an
    // internal pricing input, not a line item the customer should see.
    if (String(r?.label || "").trim().toLowerCase() === "minimum") continue;
    const type = r.type || "line";
    const label = r.label || "";
    const value = r.value || "";
    const gapSuffix = r.gap === "wide" ? "Wide" : "";
    if (type === "line") {
      const lineCommand = "\\serviceLine";
      const command = gapSuffix ? `${lineCommand}${gapSuffix}` : lineCommand;
      if (gapSuffix) {
        logger.debug(`[PDF gap] line ${command} ${label}`);
      }
      out += `${command}{${latexEscape(label)}}{${latexEscape(value)}}\n`;
    } else if (type === "bold") {
      const lowerLabel = label.toLowerCase();
      const isTotal = lowerLabel.includes('total') ||
                     lowerLabel.includes('recurring') ||
                     lowerLabel.includes('contract') ||
                     lowerLabel.includes('monthly') ||
                     lowerLabel.includes('weekly') ||
                     lowerLabel.includes('annual') ||
                     lowerLabel.includes('visit');

      const baseCommand = isTotal ? "\\serviceTotalLine" : "\\serviceBoldLine";
      const command = gapSuffix ? `${baseCommand}Wide` : baseCommand;
      if (gapSuffix) {
        logger.debug(`[PDF gap] bold ${command} ${label}`);
      }
      out += `${command}{${latexEscape(label)}}{${latexEscape(value)}}\n`;
    } else if (type === "atCharge") {
      out += `\\serviceAtCharge{${latexEscape(r.label || "")}}{${latexEscape(r.v1 || "")}}{${latexEscape(r.v2 || "")}}{${latexEscape(r.v3 || "")}}\n`;
    } else if (type === "gap") {
      out += `\\serviceGapLine{${latexEscape(r.label || "")}}{${latexEscape(r.value || "")}}\n`;
    }
  }
  return out;
}

function buildServiceColumn(col = {}) {
  let latex = "";
  if (Array.isArray(col.sections) && col.sections.length > 0) {
    for (const sec of col.sections) {
      latex += `\\serviceSection{${latexEscape(sec.heading || "")}}\n`;
      latex += buildServiceRows(sec.rows || []);
      latex += "\\vspace{1.2em}\n";
    }
  } else {
    latex += `\\serviceSection{${latexEscape(col.heading || "")}}\n`;
    latex += buildServiceRows(col.rows || []);
  }
  return latex;
}

function buildServicesRow(cols = []) {
  if (!cols || !cols.length) return "";

  const sortedCols = cols.map((col) => {
    if (!col || !Array.isArray(col.rows)) return col;
    return {
      ...col,
      rows: [...col.rows].sort((a, b) => {
        const ai = typeof a?.orderNo === "number" ? a.orderNo : Number.MAX_SAFE_INTEGER;
        const bi = typeof b?.orderNo === "number" ? b.orderNo : Number.MAX_SAFE_INTEGER;
        return ai - bi;
      }),
    };
  });

  let rowLatex = "\\noindent\n";
  sortedCols.forEach((col, idx) => {
    rowLatex += "\\begin{minipage}[t]{0.48\\textwidth}\n";
    rowLatex += buildServiceColumn(col);
    rowLatex += "\\end{minipage}%\n";
    if (idx !== sortedCols.length - 1) rowLatex += "\\hfill\n";
  });
  rowLatex += "\n";
  return rowLatex;
}

function buildServicesBanner() {
  return (
    "\\noindent\n" +
    "\\fcolorbox{black}{emred}{%\n" +
    "  \\parbox{\\dimexpr\\textwidth-2\\fboxsep\\relax}{%\n" +
    "    \\centering\n" +
    "    \\vspace{0.2em}%\n" +
    "    {\\bfseries\\fontsize{1.2em}{1.6em}\\selectfont\\textcolor{white}{SERVICES}}%\n" +
    "    \\vspace{0.2em}%\n" +
    "  }%\n" +
    "}%  \n" +
    "\\vspace{0.9em}%\n" +
    "\\par\n"
  );
}

function buildServiceRowSequence(cols = [], includeBanner = false) {
  if (!cols || !cols.length) return "";
  const trimmedCols = [];
  for (let i = 0; i < cols.length; i += 2) {
    const group = [];
    for (let j = i; j < i + 2 && j < cols.length; j++) {
      const col = cols[j];
      if (col && Array.isArray(col.rows) && col.rows.length > 0) {
        group.push(col);
      }
    }
    if (group.length) {
      trimmedCols.push(group);
    }
  }
  if (!trimmedCols.length) return "";
  return trimmedCols
    .map((group, index) => {
      const gap = index > 0 ? "\\vspace{2.5em}\n" : "";
      const banner = includeBanner && index === 0 ? buildServicesBanner() : "";
      return banner + gap + buildServicesRow(group);
    })
    .join("");
}

function shouldDisplayField(field) {
  if (!field || typeof field !== "object") return true;
  if (typeof field.isDisplay === "boolean") return field.isDisplay;
  return true;
}

function attachOrderNo(field, row) {
  if (!field || typeof field !== "object") return row;
  const candidate = field.orderNo;
  if (candidate === null || candidate === undefined) return row;
  const parsed = typeof candidate === "number" ? candidate : Number(candidate);
  if (!Number.isFinite(parsed)) return row;
  return { ...row, orderNo: parsed };
}

const FREQUENCY_CANONICALS = new Map([
  ["onetime", "oneTime"],
  ["1time", "oneTime"],
  ["weekly", "weekly"],
  ["biweekly", "biweekly"],
  ["twicepermonth", "twicePerMonth"],
  ["2permonth", "twicePerMonth"],
  ["2xmonth", "twicePerMonth"],
  ["2month", "twicePerMonth"],
  ["monthly", "monthly"],
  ["every4weeks", "everyFourWeeks"],
  ["everyfourweeks", "everyFourWeeks"],
  ["every4weekly", "everyFourWeeks"],
  ["bimonthly", "bimonthly"],
  ["every2months", "bimonthly"],
  ["quarterly", "quarterly"],
  ["biannual", "biannual"],
  ["annual", "annual"],
]);

const FREQUENCY_DISPLAY_OVERRIDES = {
  oneTime: "One Time",
  twicePerMonth: "2× / Month",
  weekly: "Weekly",
  biweekly: "Bi-Weekly",
  monthly: "Monthly",
  everyFourWeeks: "Every 4 Weeks",
  bimonthly: "Every 2 Months",
  quarterly: "Quarterly",
  biannual: "Biannual",
  annual: "Annual",
};

const MONTHLY_FREQUENCY_KEYS = new Set(["weekly", "biweekly", "twicePerMonth", "monthly"]);
const VISIT_FREQUENCY_KEYS = new Set(["oneTime", "bimonthly", "quarterly", "biannual", "annual", "everyFourWeeks"]);

function normalizeFrequencyKey(raw) {
  if (raw === undefined || raw === null) return undefined;
  const str = String(raw).trim();
  if (!str) return undefined;
  const cleaned = str.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!cleaned) return undefined;
  const canonical = FREQUENCY_CANONICALS.get(cleaned);
  if (canonical) return canonical;
  if (cleaned.includes("twicepermonth") || cleaned.includes("2permonth") || cleaned.includes("2xmonth") || cleaned.includes("2month")) {
    return "twicePerMonth";
  }
  if (cleaned.includes("bimonth")) {
    return "bimonthly";
  }
  if (cleaned.includes("quarter")) {
    return "quarterly";
  }
  if (cleaned.includes("biannual")) {
    return "biannual";
  }
  if (cleaned.includes("annual")) {
    return "annual";
  }
  if (cleaned.includes("biweekly")) {
    return "biweekly";
  }
  if (cleaned.includes("weekly")) {
    return "weekly";
  }
  if (cleaned.includes("monthly")) {
    return "monthly";
  }
  if (cleaned.includes("onetime") || cleaned.includes("1time")) {
    return "oneTime";
  }
  return undefined;
}

function detectServiceFrequencyKey(data) {
  if (!data) return undefined;
  const candidates = [
    data.frequency,
    data.serviceFrequency,
    data.mainServiceFrequency,
    data.frequencyKey,
    data.serviceFrequencyKey,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate === "string") {
      const normalized = normalizeFrequencyKey(candidate);
      if (normalized) return normalized;
      continue;
    }
    if (typeof candidate === "object") {
      const value = candidate.frequencyKey ?? candidate.value ?? candidate.label;
      if (!value) continue;
      const normalized = normalizeFrequencyKey(value);
      if (normalized) return normalized;
    }
  }
  return undefined;
}

function determineFrequencyGroup(key) {
  if (!key) return undefined;
  if (MONTHLY_FREQUENCY_KEYS.has(key)) return "monthly";
  if (VISIT_FREQUENCY_KEYS.has(key)) return "visit";
  return undefined;
}

function transformServicesToPdfFormat(usedServices) {
  const topRow = [];
  const bottomRow = [];

  const allServices = [];

  const serviceLabels = {
    saniclean: 'RESTROOM & HYGIENE (SANICLEAN)',
    foamingDrain: 'FOAMING DRAIN',
    saniscrub: 'SANI SCRUB',
    microfiberMopping: 'MICROFIBER MOPPING',
    rpmWindows: 'RPM WINDOWS',
    sanipod: 'SANI POD',
    carpetclean: 'CARPET CLEAN',
    janitorial: 'JANITORIAL',
    pureJanitorial: 'JANITORIAL',
    stripwax: 'STRIP & WAX',
    greaseTrap: 'GREASE TRAP',
    electrostaticSpray: 'ELECTROSTATIC SPRAY',
    refreshPowerScrub: 'REFRESH POWER SCRUB'
  };

  for (const [serviceKey, serviceData] of Object.entries(usedServices)) {
    if (serviceKey === 'customServices') continue;
    if (serviceKey === 'refreshPowerScrub') continue;

    const column = transformServiceToColumn(serviceKey, serviceData, serviceLabels[serviceKey]);
    if (column && column.rows && column.rows.length > 0) {
      allServices.push(column);
    }
  }

  if (usedServices.customServices && Array.isArray(usedServices.customServices)) {
    for (const customService of usedServices.customServices) {
      const column = transformCustomServiceToColumn(customService);
      if (column && column.rows && column.rows.length > 0) {
        allServices.push(column);
      }
    }
  }

  for (let i = 0; i < allServices.length; i++) {
    if (i < 2) {
      topRow.push(allServices[i]);
    } else {
      bottomRow.push(allServices[i]);
    }
  }

  return { topRow, bottomRow };
}

function transformServiceToColumn(serviceKey, serviceData, label) {
  const rows = [];
  const pushRow = (field, row) => rows.push(attachOrderNo(field, row));

  const data = serviceData.formData || serviceData;

  // Debug logging for pureJanitorial
  if (serviceKey === 'pureJanitorial') {
    logger.debug('🧹 [PURE JANITORIAL PDF] serviceKey:', serviceKey);
    logger.debug('🧹 [PURE JANITORIAL PDF] serviceData keys:', Object.keys(serviceData));
    logger.debug('🧹 [PURE JANITORIAL PDF] serviceData.formData exists:', !!serviceData.formData);
    logger.debug('🧹 [PURE JANITORIAL PDF] using data from:', serviceData.formData ? 'serviceData.formData' : 'serviceData');
    logger.debug('🧹 [PURE JANITORIAL PDF] data.isActive:', data.isActive);
  }

  const getCorrectRate = (item) => {
    if (typeof item.total === 'number' && typeof item.qty === 'number' && item.qty > 0) {
      return item.total / item.qty;
    }
    return item.rate;
  };

  // Special handling for pureJanitorial service (may come as 'janitorial' or 'pureJanitorial')
  if ((serviceKey === 'pureJanitorial' || serviceKey === 'janitorial') && data.isActive && data.serviceId === 'pureJanitorial') {
    logger.debug('🧹 [PURE JANITORIAL PDF] Processing pureJanitorial service');
    logger.debug('🧹 [PURE JANITORIAL PDF] data keys:', Object.keys(data));
    logger.debug('🧹 [PURE JANITORIAL PDF] data.frequency:', JSON.stringify(data.frequency));
    logger.debug('🧹 [PURE JANITORIAL PDF] data.sqFt:', JSON.stringify(data.sqFt));
    logger.debug('🧹 [PURE JANITORIAL PDF] data.totals keys:', data.totals ? Object.keys(data.totals) : 'no totals');

    // Add frequency
    if (data.frequency && shouldDisplayField(data.frequency) && data.frequency.value) {
      pushRow(data.frequency, {
        type: 'line',
        label: data.frequency.label || 'Frequency',
        value: data.frequency.value
      });
    }

    // Add visits per week
    if (data.visitsPerWeek && shouldDisplayField(data.visitsPerWeek) && data.visitsPerWeek.value) {
      pushRow(data.visitsPerWeek, {
        type: 'line',
        label: data.visitsPerWeek.label || 'Visits per Week',
        value: data.visitsPerWeek.value
      });
    }

    // Add place type
    if (data.placeType && shouldDisplayField(data.placeType) && data.placeType.value) {
      pushRow(data.placeType, {
        type: 'line',
        label: data.placeType.label || 'Place Type',
        value: data.placeType.value
      });
    }

    // Add square feet
    if (data.sqFt && shouldDisplayField(data.sqFt) && data.sqFt.value) {
      pushRow(data.sqFt, {
        type: 'line',
        label: data.sqFt.label || 'Square Feet',
        value: data.sqFt.value
      });
    }

    // Add hours per visit
    if (data.hoursPerVisit && shouldDisplayField(data.hoursPerVisit) && data.hoursPerVisit.value) {
      pushRow(data.hoursPerVisit, {
        type: 'line',
        label: data.hoursPerVisit.label || 'Hours Per Visit',
        value: data.hoursPerVisit.value
      });
    }

    // Add cost per hour
    if (data.costPerHour && shouldDisplayField(data.costPerHour) && data.costPerHour.amount != null) {
      pushRow(data.costPerHour, {
        type: 'line',
        label: data.costPerHour.label || 'Cost Per Hour',
        value: `${formatCurrency(data.costPerHour.amount)}`
      });
    }

    // Add totals from the totals object
    if (data.totals) {
      const totalFields = [
        'annualBaseLabor',
        'annualLaborTax',
        'annualSupplies',
        'totalAnnualCost',
        'grossProfit',
        'annualContractValue',
        'monthlyRecurring',
        'recurringVisitTotal'
      ];

      for (const fieldKey of totalFields) {
        const field = data.totals[fieldKey];
        if (field && shouldDisplayField(field) && field.amount != null) {
          const numAmount = Number(field.amount);
          if (!isNaN(numAmount) && numAmount !== 0) {
            pushRow(field, {
              type: 'line',
              label: field.label || fieldKey,
              value: `${formatCurrency(numAmount)}`
            });
          }
        }
      }

      // Add contract total (bold)
      if (data.totals.contract && shouldDisplayField(data.totals.contract) && data.totals.contract.amount != null) {
        const numAmount = Number(data.totals.contract.amount);
        if (!isNaN(numAmount) && numAmount !== 0) {
          const contractLabel = data.totals.contract.label || 'Contract Total';
          const monthsLabel = data.totals.contract.months ? ` (${data.totals.contract.months}mo)` : '';
          pushRow(data.totals.contract, {
            type: 'bold',
            label: contractLabel,
            value: `${formatCurrency(numAmount)}${monthsLabel}`
          });
        }
      }
    }

    // Add notes
    if (data.notes && data.notes.trim()) {
      rows.push({ type: 'line', label: 'Notes', value: data.notes });
    }

    return {
      heading: label || data.displayName || 'JANITORIAL',
      rows
    };
  }

  if (data.isActive && (data.fixtureBreakdown || data.drainBreakdown || data.serviceBreakdown || data.windows || data.service || data.restroomFixtures || data.nonBathroomArea ||
      data.dumpster || data.patio || data.walkway || data.foh || data.boh || data.other)) {

    if (data.fixtureBreakdown && Array.isArray(data.fixtureBreakdown)) {
      for (const fixture of data.fixtureBreakdown) {
        if (!shouldDisplayField(fixture)) continue;
        if (fixture.qty > 0) {
          const correctRate = getCorrectRate(fixture);
          pushRow(fixture, {
            type: 'atCharge',
            label: fixture.label || '',
            v1: String(fixture.qty || ''),
            v2: typeof correctRate === 'number' ? `${formatCurrency(correctRate)}` : String(correctRate || ''),
            v3: typeof fixture.total === 'number' ? `${formatCurrency(fixture.total)}` : String(fixture.total || '')
          });
        }
      }
    }

    if (data.drainBreakdown && Array.isArray(data.drainBreakdown)) {
      for (const drain of data.drainBreakdown) {
        if (!shouldDisplayField(drain)) continue;
        if (drain.qty > 0) {
          const hasRate = drain.rate != null && drain.rate !== '';
          const hasTotal = drain.total != null && drain.total !== '';

          if (hasRate || hasTotal) {
            const correctRate = getCorrectRate(drain);
            rows.push({
              type: 'atCharge',
              orderNo: drain.orderNo,
              label: drain.label || '',
              v1: String(drain.qty || ''),
              v2: typeof correctRate === 'number' ? `${formatCurrency(correctRate)}` : String(correctRate || ''),
              v3: typeof drain.total === 'number' ? `${formatCurrency(drain.total)}` : String(drain.total || '')
            });
          } else {
            rows.push({
              type: 'line',
              orderNo: drain.orderNo,
              label: drain.label || '',
              value: `${drain.qty} drain${drain.qty !== 1 ? 's' : ''}`
            });
          }
        }
      }
    }

    if (data.serviceBreakdown && Array.isArray(data.serviceBreakdown)) {
      for (const item of data.serviceBreakdown) {
        if (!shouldDisplayField(item)) continue;
        const qty = typeof item.qty === 'number' ? item.qty : parseFloat(item.qty) || 0;
        const total = typeof item.total === 'number' ? item.total : parseFloat(item.total) || 0;
        const hasRate = item.rate != null && item.rate !== '';
        const hasTotal = item.total != null && item.total !== '';

        if (hasRate || hasTotal) {
          if (qty === 0 && total === 0) continue;
          pushRow(item, {
            type: 'atCharge',
            label: item.label || '',
            v1: String(item.qty || ''),
            v2: typeof item.rate === 'number' ? `${formatCurrency(item.rate)}` : String(item.rate || ''),
            v3: typeof item.total === 'number' ? `${formatCurrency(item.total)}` : String(item.total || '')
          });
        } else if (item.qty) {
          pushRow(item, {
            type: 'line',
            label: item.label || '',
            value: `${item.qty} ${item.unit || 'item'}${item.qty !== 1 ? 's' : ''}`
          });
        }
      }
    }

    if (data.windows && Array.isArray(data.windows)) {
      for (const window of data.windows) {
        if (!shouldDisplayField(window)) continue;
        if (window.qty > 0) {
          pushRow(window, {
            type: 'atCharge',
            label: window.label || '',
            v1: String(window.qty || ''),
            v2: typeof window.rate === 'number' ? `${formatCurrency(window.rate)}` : String(window.rate || ''),
            v3: typeof window.total === 'number' ? `${formatCurrency(window.total)}` : String(window.total || '')
          });
        }
      }
    }

    if (data.service && shouldDisplayField(data.service)) {
      const hasRate = data.service.rate != null && data.service.rate !== '';
      const hasTotal = data.service.total != null && data.service.total !== '';
      const svcQty = typeof data.service.qty === 'number' ? data.service.qty : parseFloat(data.service.qty) || 0;
      const svcTotal = typeof data.service.total === 'number' ? data.service.total : parseFloat(data.service.total) || 0;

      if (hasRate || hasTotal) {
        if (svcQty > 0 || svcTotal > 0) {
          let displayRate = data.service.rate;
          if (typeof data.service.total === 'number' && typeof data.service.qty === 'number' && data.service.qty > 0) {
            displayRate = data.service.total / data.service.qty;
          }

          rows.push({
            type: 'atCharge',
            orderNo: data.service.orderNo,
            label: data.service.label || '',
            v1: String(data.service.qty || ''),
            v2: typeof displayRate === 'number' ? `${formatCurrency(displayRate)}` : String(displayRate || ''),
            v3: typeof data.service.total === 'number' ? `${formatCurrency(data.service.total)}` : String(data.service.total || '')
          });
        }
      } else if (data.service.qty) {
        rows.push({
          type: 'line',
          orderNo: data.service.orderNo,
          label: data.service.label || '',
          value: `${data.service.qty} ${data.service.unit || 'item'}${data.service.qty !== 1 ? 's' : ''}`
        });
      }
    }

    if (data.restroomFixtures && shouldDisplayField(data.restroomFixtures) && data.restroomFixtures.qty) {
      const hasRate = data.restroomFixtures.rate != null && data.restroomFixtures.rate !== '';
      const hasTotal = data.restroomFixtures.total != null && data.restroomFixtures.total !== '';

      if (hasRate || hasTotal) {
        rows.push({
          type: 'atCharge',
          orderNo: data.restroomFixtures.orderNo,
          label: data.restroomFixtures.label || 'Restroom Fixtures',
          v1: String(data.restroomFixtures.qty || ''),
          v2: typeof data.restroomFixtures.rate === 'number' ? `${formatCurrency(data.restroomFixtures.rate)}` : String(data.restroomFixtures.rate || ''),
          v3: typeof data.restroomFixtures.total === 'number' ? `${formatCurrency(data.restroomFixtures.total)}` : String(data.restroomFixtures.total || '')
        });
      } else {
        rows.push({
          type: 'line',
          orderNo: data.restroomFixtures.orderNo,
          label: data.restroomFixtures.label || 'Restroom Fixtures',
          value: `${data.restroomFixtures.qty} fixture${data.restroomFixtures.qty !== 1 ? 's' : ''}`
        });
      }
    }

    if (data.nonBathroomArea && shouldDisplayField(data.nonBathroomArea) && data.nonBathroomArea.qty) {
      const hasRate = data.nonBathroomArea.rate != null && data.nonBathroomArea.rate !== '';
      const hasTotal = data.nonBathroomArea.total != null && data.nonBathroomArea.total !== '';

      if (hasRate || hasTotal) {
        rows.push({
          type: 'atCharge',
          orderNo: data.nonBathroomArea.orderNo,
          label: data.nonBathroomArea.label || 'Non-Bathroom Area',
          v1: `${data.nonBathroomArea.qty || ''} ${data.nonBathroomArea.unit || ''}`,
          v2: typeof data.nonBathroomArea.rate === 'number' ? `${formatCurrency(data.nonBathroomArea.rate)}` : String(data.nonBathroomArea.rate || ''),
          v3: typeof data.nonBathroomArea.total === 'number' ? `${formatCurrency(data.nonBathroomArea.total)}` : String(data.nonBathroomArea.total || '')
        });
      } else {
        rows.push({
          type: 'line',
          orderNo: data.nonBathroomArea.orderNo,
          label: data.nonBathroomArea.label || 'Non-Bathroom Area',
          value: `${data.nonBathroomArea.qty} ${data.nonBathroomArea.unit || 'sq ft'}`
        });
      }
    }

    const refreshAreas = ['dumpster', 'patio', 'walkway', 'foh', 'boh', 'other'];
      for (const areaKey of refreshAreas) {
        if (data[areaKey] && typeof data[areaKey] === 'object') {
          const area = data[areaKey];
          if (!shouldDisplayField(area)) {
            continue;
          }

        if (area.type === 'calc' && area.qty != null && area.rate != null && area.total != null) {
          rows.push({
            type: 'atCharge',
            label: area.label || areaKey.charAt(0).toUpperCase() + areaKey.slice(1),
            v1: String(area.qty || ''),
            v2: typeof area.rate === 'number' ? `${formatCurrency(area.rate)}` : String(area.rate || ''),
            v3: typeof area.total === 'number' ? `${formatCurrency(area.total)}` : String(area.total || '')
          });
        }
        else {
          const hasRate = area.rate != null && area.rate !== '';
          const hasTotal = area.total != null && area.total !== '';
          const hasQty = area.qty != null && area.qty !== '' && area.qty > 0;

          if (hasQty && (hasRate || hasTotal)) {
            rows.push({
              type: 'atCharge',
              label: area.label || areaKey.charAt(0).toUpperCase() + areaKey.slice(1),
              v1: `${area.qty || ''} ${area.unit || ''}`.trim(),
              v2: typeof area.rate === 'number' ? `${formatCurrency(area.rate)}` : String(area.rate || ''),
              v3: typeof area.total === 'number' ? `${formatCurrency(area.total)}` : String(area.total || '')
            });
          } else if (hasQty) {
            rows.push({
              type: 'line',
              label: area.label || areaKey.charAt(0).toUpperCase() + areaKey.slice(1),
              value: `${area.qty} ${area.unit || 'service'}${area.qty !== 1 ? 's' : ''}`
            });
          }
        }
      }
    }

    if (data.serviceInfo && shouldDisplayField(data.serviceInfo) && data.serviceInfo.value) {
      pushRow(data.serviceInfo, {
        type: 'line',
        label: data.serviceInfo.label || 'Service Info',
        value: data.serviceInfo.value
      });
    }

    if (data.extraBags && shouldDisplayField(data.extraBags) && data.extraBags.qty > 0) {
      const hasRate = data.extraBags.rate != null && data.extraBags.rate !== '';
      const hasTotal = data.extraBags.total != null && data.extraBags.total !== '';

      if (hasRate || hasTotal) {
        const correctRate = getCorrectRate(data.extraBags);
        pushRow(data.extraBags, {
          type: 'atCharge',
          label: data.extraBags.label || 'Extra Bags',
          v1: String(data.extraBags.qty || ''),
          v2: typeof correctRate === 'number' ? `${formatCurrency(correctRate)}` : String(correctRate || ''),
          v3: typeof data.extraBags.total === 'number' ? `${formatCurrency(data.extraBags.total)}` : String(data.extraBags.total || '')
        });
      } else {
        pushRow(data.extraBags, {
          type: 'line',
          label: data.extraBags.label || 'Extra Bags',
          value: `${data.extraBags.qty} bag${data.extraBags.qty !== 1 ? 's' : ''}`
        });
      }
    }

    if (data.installation && shouldDisplayField(data.installation) && data.installation.qty > 0) {
      const hasRate = data.installation.rate != null && data.installation.rate !== '';
      const hasTotal = data.installation.total != null && data.installation.total !== '';

      if (hasRate || hasTotal) {
        const correctRate = getCorrectRate(data.installation);
        pushRow(data.installation, {
          type: 'atCharge',
          label: data.installation.label || 'Installation',
          v1: String(data.installation.qty || ''),
          v2: typeof correctRate === 'number' ? `${formatCurrency(correctRate)}` : String(correctRate || ''),
          v3: typeof data.installation.total === 'number' ? `${formatCurrency(data.installation.total)}` : String(data.installation.total || '')
        });
      } else {
        pushRow(data.installation, {
          type: 'line',
          label: data.installation.label || 'Installation',
          value: `${data.installation.qty} unit${data.installation.qty !== 1 ? 's' : ''}`
        });
      }
    }

    if (data.installationFee && shouldDisplayField(data.installationFee) && data.installationFee.amount) {
      pushRow(data.installationFee, {
        type: 'line',
        label: data.installationFee.label || 'Installation Fee',
        value: typeof data.installationFee.amount === 'number' ? `${formatCurrency(data.installationFee.amount)}` : String(data.installationFee.amount || '')
      });
    }

    if (data.tripCharge && shouldDisplayField(data.tripCharge) && data.tripCharge.amount != null && data.tripCharge.amount > 0) {
      pushRow(data.tripCharge, {
        type: 'line',
        label: data.tripCharge.label || 'Trip Charge',
        value: typeof data.tripCharge.amount === 'number' ? `${formatCurrency(data.tripCharge.amount)}` : String(data.tripCharge.amount || '')
      });
    }

    if (data.warranty && shouldDisplayField(data.warranty) && data.warranty.qty) {
      const hasRate = data.warranty.rate != null && data.warranty.rate !== '';
      const hasTotal = data.warranty.total != null && data.warranty.total !== '';

      if (hasRate || hasTotal) {
        pushRow(data.warranty, {
          type: 'atCharge',
          label: data.warranty.label || 'Warranty',
          v1: String(data.warranty.qty || ''),
          v2: typeof data.warranty.rate === 'number' ? `${formatCurrency(data.warranty.rate)}` : String(data.warranty.rate || ''),
          v3: typeof data.warranty.total === 'number' ? `${formatCurrency(data.warranty.total)}` : String(data.warranty.total || '')
        });
      } else {
        pushRow(data.warranty, {
          type: 'line',
          label: data.warranty.label || 'Warranty',
          value: `${data.warranty.qty} item${data.warranty.qty !== 1 ? 's' : ''}`
        });
      }
    }

    if (data.luxuryUpgrade && shouldDisplayField(data.luxuryUpgrade)) {
      pushRow(data.luxuryUpgrade, {
        type: 'line',
        label: data.luxuryUpgrade.label || 'Luxury Soap Upgrade',
        value: typeof data.luxuryUpgrade.total === 'number' ? `${formatCurrency(data.luxuryUpgrade.total)}` : String(data.luxuryUpgrade.total || '')
      });
    }

    if (data.extraSoap && shouldDisplayField(data.extraSoap)) {
      pushRow(data.extraSoap, {
        type: 'line',
        label: data.extraSoap.label || 'Extra Soap',
        value: typeof data.extraSoap.total === 'number' ? `${formatCurrency(data.extraSoap.total)}` : String(data.extraSoap.total || '')
      });
    }

    if (data.pdfExtras && Array.isArray(data.pdfExtras)) {
      for (const field of data.pdfExtras) {
        if (!shouldDisplayField(field)) continue;
        const rowType = field.type === 'atCharge' ? 'atCharge' : field.type === 'bold' ? 'bold' : 'line';
        let row = {
          type: rowType,
          label: field.label || '',
          value: field.value || '',
          gap: field.gap,
        };
        if (rowType === 'atCharge') {
          row.v1 = field.v1 ?? '';
          row.v2 = field.v2 ?? '';
          row.v3 = field.v3 ?? '';
        }
        pushRow(field, row);
      }
    }

    if (data.pricingMethod && shouldDisplayField(data.pricingMethod) && data.pricingMethod.value) {
      pushRow(data.pricingMethod, {
        type: 'line',
        label: data.pricingMethod.label || 'Pricing Method',
        value: data.pricingMethod.value
      });
    }

    if (data.pricingMode && shouldDisplayField(data.pricingMode) && data.pricingMode.value) {
      pushRow(data.pricingMode, {
        type: 'line',
        label: data.pricingMode.label || 'Pricing Mode',
        value: data.pricingMode.value
      });
    }

    if (data.soapType && shouldDisplayField(data.soapType) && data.soapType.value) {
      pushRow(data.soapType, {
        type: 'line',
        label: data.soapType.label || 'Soap Type',
        value: data.soapType.value
      });
    }

    if (data.combinedService && shouldDisplayField(data.combinedService) && data.combinedService.value) {
      pushRow(data.combinedService, {
        type: 'line',
        label: data.combinedService.label || 'Combined with',
        value: data.combinedService.value
      });
    }

    const formatFrequencyDisplayValue = (candidate) => {
      if (!candidate) return null;
      if (typeof candidate === "string") {
        const normalized = normalizeFrequencyKey(candidate);
        if (normalized && FREQUENCY_DISPLAY_OVERRIDES[normalized]) {
          return FREQUENCY_DISPLAY_OVERRIDES[normalized];
        }
        return candidate;
      }
      if (typeof candidate === "object") {
        const baseValue = candidate.value || candidate.label || candidate.frequencyKey;
        if (!baseValue) return null;
        const normalized = normalizeFrequencyKey(baseValue);
        if (normalized && FREQUENCY_DISPLAY_OVERRIDES[normalized]) {
          return FREQUENCY_DISPLAY_OVERRIDES[normalized];
        }
        return baseValue;
      }
      return null;
    };

    const resolveFrequencyRow = () => {
      const candidateFields = [
        data.frequency,
        data.serviceFrequency,
        data.mainServiceFrequency,
        serviceData.frequency,
        serviceData.serviceFrequency,
        serviceData.mainServiceFrequency,
      ];
      for (const candidate of candidateFields) {
        if (!candidate) continue;
        const displayValue = formatFrequencyDisplayValue(candidate);
        if (!displayValue) continue;
        if (typeof candidate === "object" && !shouldDisplayField(candidate)) {
          continue;
        }
        const labelValue =
          typeof candidate === "object" ? candidate.label || "Frequency" : "Frequency";
        return { field: candidate, label: labelValue, value: displayValue };
      }
      const candidateKeys = [
        data.frequencyKey,
        data.serviceFrequencyKey,
        serviceData.frequencyKey,
        serviceData.serviceFrequencyKey,
      ];
      for (const raw of candidateKeys) {
        if (!raw) continue;
        const displayValue = formatFrequencyDisplayValue(raw);
        if (!displayValue) continue;
        return { field: null, label: "Frequency", value: displayValue };
      }
      return null;
    };

    const freqRowDetail = resolveFrequencyRow();
    if (freqRowDetail) {
      const { field, label, value } = freqRowDetail;
      const shouldRenderFreq = !field || shouldDisplayField(field);
      if (shouldRenderFreq) {
        pushRow(field, {
          type: 'line',
          label: label || 'Frequency',
          value,
        });
      }
    }

    const pdfVisibility = serviceData.pdfFieldVisibility || {};
    const locationVisOverride = pdfVisibility.hasOwnProperty("location")
      ? pdfVisibility.location
      : undefined;
    const primaryLocationField = data.location && typeof data.location === "object"
      ? data.location
      : null;
    const fallbackLocationField = serviceData.location && typeof serviceData.location === "object"
      ? serviceData.location
      : null;
    const locationFieldForOrder = primaryLocationField || fallbackLocationField;
    const locationValue = primaryLocationField?.value ||
      (typeof data.location === "string" && data.location.trim() !== "" ? data.location : "") ||
      fallbackLocationField?.value ||
      "";
    const locationLabel = (locationFieldForOrder && (locationFieldForOrder.label || locationFieldForOrder.value)) ||
      fallbackLocationField?.label ||
      'Location';
    const shouldRenderLocation =
      Boolean(locationValue) &&
      (!locationFieldForOrder || shouldDisplayField(locationFieldForOrder)) &&
      (locationVisOverride !== false && locationVisOverride !== "false");

    if (shouldRenderLocation) {
      pushRow(locationFieldForOrder, {
        type: 'line',
        label: locationLabel,
        value: locationValue
      });
    }

    if (data.serviceType && shouldDisplayField(data.serviceType) && data.serviceType.type === 'text' && data.serviceType.value) {
      pushRow(data.serviceType, {
        type: 'line',
        label: data.serviceType.label || 'Service Type',
        value: data.serviceType.value
      });
    }

    if (data.otherTasks && shouldDisplayField(data.otherTasks) && data.otherTasks.type === 'text' && data.otherTasks.value) {
      pushRow(data.otherTasks, {
        type: 'line',
        label: data.otherTasks.label || 'Other Tasks',
        value: data.otherTasks.value
      });
    }

    if (data.vacuuming && shouldDisplayField(data.vacuuming) && data.vacuuming.type === 'text' && data.vacuuming.value) {
      pushRow(data.vacuuming, {
        type: 'line',
        label: data.vacuuming.label || 'Vacuuming',
        value: data.vacuuming.value
      });
    }

    if (data.dusting && shouldDisplayField(data.dusting) && data.dusting.type === 'text' && data.dusting.value) {
      pushRow(data.dusting, {
        type: 'line',
        label: data.dusting.label || 'Dusting',
        value: data.dusting.value
      });
    }

    if (data.visitsPerWeek && shouldDisplayField(data.visitsPerWeek) && data.visitsPerWeek.type === 'text' && data.visitsPerWeek.value) {
      pushRow(data.visitsPerWeek, {
        type: 'line',
        label: data.visitsPerWeek.label || 'Visits per Week',
        value: data.visitsPerWeek.value
      });
    }
    if (data.addonTime && shouldDisplayField(data.addonTime) && data.addonTime.type === 'text' && data.addonTime.value) {
      pushRow(data.addonTime, {
        type: 'line',
        label: data.addonTime.label || 'Add-on Time',
        value: data.addonTime.value
      });
    }

    if (data.totals) {
      const freqKey = detectServiceFrequencyKey(data);
      const freqGroup = determineFrequencyGroup(freqKey);
      const isMonthlyGroup = freqGroup === "monthly" || freqGroup === undefined;
      const isVisitGroup = freqGroup === "visit";
      const isOneTime = freqKey === "oneTime";

      const formatMoneyValue = (amount) => {
        if (typeof amount === "number") {
          return `$${fmtNum(amount)}`;
        }
        if (amount === undefined || amount === null) {
          return "";
        }
        return String(amount);
      };

      const addBoldTotal = (field, options = {}) => {
        if (!field || !shouldDisplayField(field) || field.amount == null) return;
        const numAmount = Number(field.amount);
        if (!isNaN(numAmount) && numAmount === 0) return;
        const label = field.label || options.label || "Total";
        const value = options.value ?? formatMoneyValue(field.amount);
        const gap = field.gap ?? options.gap;
        pushRow(field, {
          type: "bold",
          label,
          value,
          gap,
        });
      };

      const totalPriceFieldFromRoot = typeof data.totalPrice === "number"
        ? { amount: data.totalPrice, label: "Total Price" }
        : null;

      const totalPriceFromContractTotal = typeof data.contractTotal === "number" && data.contractTotal > 0
        ? { amount: data.contractTotal, label: "Total Price" }
        : null;

      const addPrimaryVisitTotal = () => {
        const primaryCandidates = [
          totalPriceFromContractTotal,
          data.totals.totalPrice,
          totalPriceFieldFromRoot,
          data.totals.perVisit,
          data.totals.firstVisit,
          data.totals.firstMonth,
          data.totals.monthly,
          data.totals.monthlyRecurring,
          data.totals.contract,
          data.totals.weekly,
          data.totals.recurringVisit,
        ];
        let fallbackRow = null;
        for (const candidate of primaryCandidates) {
          if (!candidate || !shouldDisplayField(candidate) || candidate.amount == null) continue;
          const amount = Number(candidate.amount);
          if (!isNaN(amount) && amount !== 0) {
            addBoldTotal(candidate, { label: "Total Price" });
            return true;
          }
          if (!fallbackRow) {
            fallbackRow = candidate;
          }
        }
        if (fallbackRow) {
          addBoldTotal(fallbackRow, { label: "Total Price" });
          return true;
        }
        return false;
      };

      if (isOneTime) {
        addPrimaryVisitTotal();
      } else {
        addBoldTotal(data.totals.perVisit);

        if (isMonthlyGroup) {
          addBoldTotal(data.totals.firstMonth || data.totals.monthly);
          addBoldTotal(data.totals.monthlyRecurring, { gap: "wide" });
        } else if (isVisitGroup) {
          addBoldTotal(data.totals.firstVisit || data.totals.firstMonth);
          addBoldTotal(data.totals.recurringVisit, { gap: "wide" });
        }

        addBoldTotal(data.totals.weekly);
      }

      if (!isOneTime && data.totals.contract && shouldDisplayField(data.totals.contract) && data.totals.contract.amount != null) {
        const formattedContract = formatMoneyValue(data.totals.contract.amount);
        const contractValue =
          typeof data.totals.contract.amount === "number"
            ? `${formatCurrency(data.totals.contract.amount)} (${data.totals.contract.months || 12}mo)`
            : formattedContract;
        pushRow(data.totals.contract, {
          type: "bold",
          label: data.totals.contract.label || "Contract Total",
          value: contractValue,
        });
      }

      if (!isOneTime && data.totals.annual && shouldDisplayField(data.totals.annual) && data.totals.annual.amount != null) {
        const formattedAnnual = formatMoneyValue(data.totals.annual.amount);
        const annualValue =
          typeof data.totals.annual.amount === "number"
            ? `${formatCurrency(data.totals.annual.amount)} (${data.totals.annual.months || 12}mo)`
            : formattedAnnual;
        pushRow(data.totals.annual, {
          type: "bold",
          label: data.totals.annual.label || "Annual Total",
          value: annualValue,
        });
      }

      // Handle generic dollar-type totals fields (e.g., pureJanitorial)
      // These are fields with type: "dollar" and amount property
      const knownTotalKeys = new Set([
        'weekly', 'monthly', 'monthlyRecurring', 'contract', 'firstMonth',
        'firstVisit', 'perVisit', 'annual', 'recurringVisit', 'totalPrice'
      ]);

      for (const [totalKey, totalField] of Object.entries(data.totals)) {
        if (knownTotalKeys.has(totalKey)) continue; // Skip already-handled fields
        if (!totalField || typeof totalField !== 'object') continue;
        if (!shouldDisplayField(totalField)) continue;
        if (totalField.type !== 'dollar' || totalField.amount == null) continue;

        const numAmount = Number(totalField.amount);
        if (isNaN(numAmount) || numAmount === 0) continue;

        pushRow(totalField, {
          type: 'line',
          label: totalField.label || totalKey,
          value: formatMoneyValue(totalField.amount),
        });
      }
    }

    if (data.customFields && Array.isArray(data.customFields)) {
      let customIdx = 0;
      for (const field of data.customFields) {
        if (!shouldDisplayField(field)) continue;
        const fieldLabel = field.label || field.name;
        if (!field || !fieldLabel) continue;

        const topOrderNo = -1000 + customIdx;

        if (field.type === 'calc') {
          if (field.calcValues) {
            if (hasPrintableLineItem(field.calcValues.left, field.calcValues.right)) {
              pushRow({ orderNo: topOrderNo }, {
                type: 'atCharge',
                label: fieldLabel,
                v1: String(field.calcValues.left || ''),
                v2: String(field.calcValues.middle || ''),
                v3: String(field.calcValues.right || '')
              });
              customIdx++;
            }
          } else if (field.value && typeof field.value === 'object') {
            const calcValue = field.value;
            if (calcValue.qty != null && calcValue.rate != null && hasPrintableLineItem(calcValue.qty, calcValue.total)) {
              pushRow({ orderNo: topOrderNo }, {
                type: 'atCharge',
                label: fieldLabel,
                v1: String(calcValue.qty || ''),
                v2: typeof calcValue.rate === 'number' ? `${formatCurrency(calcValue.rate)}` : String(calcValue.rate || ''),
                v3: typeof calcValue.total === 'number' ? `${formatCurrency(calcValue.total)}` : String(calcValue.total || '')
              });
              customIdx++;
            }
          }
        } else if (field.type === 'money' || field.type === 'dollar') {
          const amount = typeof field.value === 'number' ? field.value : parseFloat(field.value) || 0;
          if (amount > 0) {
            pushRow({ orderNo: topOrderNo }, {
              type: 'line',
              label: fieldLabel,
              value: `${formatCurrency(amount)}`
            });
            customIdx++;
          }
        } else {
          const val = field.value !== undefined && field.value !== null ? String(field.value).trim() : '';
          if (val !== '' && val !== '0') {
            pushRow({ orderNo: topOrderNo }, {
              type: 'line',
              label: fieldLabel,
              value: val
            });
            customIdx++;
          }
        }
      }
    }

    if (data.notes && data.notes.trim()) {
      rows.push({ type: 'line', label: 'Notes', value: data.notes });
    }

    return {
      heading: label || data.displayName || serviceKey.toUpperCase(),
      rows
    };
  }

  const commonMappings = [
    { key: 'fixtureCount', label: 'Fixtures' },
    { key: 'fixtures', label: 'Fixtures' },
    { key: 'drainCount', label: 'Drains' },
    { key: 'drains', label: 'Drains' },
    { key: 'squareFeet', label: 'Square Feet' },
    { key: 'sqft', label: 'Square Feet' },
    { key: 'quantity', label: 'Quantity' },
    { key: 'qty', label: 'Qty' },
    { key: 'count', label: 'Count' },
    { key: 'ratePerFixture', label: 'Rate per Fixture' },
    { key: 'ratePerDrain', label: 'Rate per Drain' },
    { key: 'rate', label: 'Rate' },
    { key: 'unitPrice', label: 'Unit Price' }
  ];

  for (const mapping of commonMappings) {
    if (data[mapping.key] !== undefined && data[mapping.key] !== null && data[mapping.key] !== '') {
      let value = String(data[mapping.key]);
      if (mapping.key.includes('rate') || mapping.key.includes('Price')) {
        value = typeof data[mapping.key] === 'number' ? `${formatCurrency(data[mapping.key])}` : value;
      }
      rows.push({ type: 'line', label: mapping.label, value });
    }
  }

  if (data.weeklyTotal !== undefined && data.weeklyTotal !== null && data.weeklyTotal !== 0) {
    const value = typeof data.weeklyTotal === 'number' ? `${formatCurrency(data.weeklyTotal)}` : String(data.weeklyTotal);
    rows.push({ type: 'bold', label: 'Weekly Total', value });
  }

  if (data.monthlyTotal !== undefined && data.monthlyTotal !== null && data.monthlyTotal !== 0) {
    const value = typeof data.monthlyTotal === 'number' ? `${formatCurrency(data.monthlyTotal)}` : String(data.monthlyTotal);
    rows.push({ type: 'bold', label: 'Monthly Total', value });
  }

  if (data.contractTotal !== undefined && data.contractTotal !== null && data.contractTotal !== 0) {
    const value = typeof data.contractTotal === 'number' ? `${formatCurrency(data.contractTotal)}` : String(data.contractTotal);
    const contractTotalLabel = data.frequency === 'oneTime' ? 'Total Price' : 'Contract Total';
    rows.push({ type: 'bold', label: contractTotalLabel, value });
  }

  if (data.customFields && Array.isArray(data.customFields)) {
    let customIdx = 0;
    for (const field of data.customFields) {
      if (!field) continue;
      const fieldLabel = field.label || field.name;
      if (!fieldLabel) continue;
      const topOrderNo = -1000 + customIdx;
      if (field.type === 'calc') {
        if (field.calcValues) {
          if (hasPrintableLineItem(field.calcValues.left, field.calcValues.right)) {
            rows.push({
              orderNo: topOrderNo,
              type: 'atCharge',
              label: fieldLabel,
              v1: String(field.calcValues.left || ''),
              v2: String(field.calcValues.middle || ''),
              v3: String(field.calcValues.right || '')
            });
            customIdx++;
          }
        } else if (field.value !== undefined && field.value !== null && typeof field.value === 'object') {
          const calcValue = field.value;
          if (hasPrintableLineItem(calcValue.qty ?? calcValue.left, calcValue.total)) {
            rows.push({
              orderNo: topOrderNo,
              type: 'atCharge',
              label: fieldLabel,
              v1: String(calcValue.left || ''),
              v2: String(calcValue.middle || ''),
              v3: typeof calcValue.total === 'number' ? `${formatCurrency(calcValue.total)}` : String(calcValue.total || '')
            });
            customIdx++;
          }
        }
      } else if (field.type === 'money' || field.type === 'dollar') {
        const amount = typeof field.value === 'number' ? field.value : parseFloat(field.value) || 0;
        if (amount > 0) {
          rows.push({
            orderNo: topOrderNo,
            type: 'line',
            label: fieldLabel,
            value: `${formatCurrency(amount)}`
          });
          customIdx++;
        }
      } else {
        const val = field.value !== undefined && field.value !== null ? String(field.value).trim() : '';
        if (val !== '' && val !== '0') {
          rows.push({
            orderNo: topOrderNo,
            type: 'line',
            label: fieldLabel,
            value: val
          });
          customIdx++;
        }
      }
    }
  }

  return {
    heading: label || serviceKey.toUpperCase(),
    rows
  };
}

function transformCustomServiceToColumn(customService) {
  const rows = [];

  const label = customService.name || customService.label || 'CUSTOM SERVICE';
  const fields = customService.fields || [];

  for (const field of fields) {
    if (!shouldDisplayField(field)) continue;
    const fieldLabel = field.label || field.name;

    if (field && fieldLabel) {
      if (field.type === 'calc' && field.calcValues &&
          (field.calcValues.left || field.calcValues.middle || field.calcValues.right)) {
        rows.push({
          type: 'atCharge',
          label: fieldLabel,
          v1: String(field.calcValues.left || ''),
          v2: String(field.calcValues.middle || ''),
          v3: String(field.calcValues.right || '')
        });
      }
      else if (field.value !== undefined && field.value !== '') {
        let value = String(field.value);

        if (field.type === 'dollar') {
          const numValue = parseFloat(field.value);
          if (!isNaN(numValue)) {
            value = `${formatCurrency(numValue)}`;
          }
        }

        const rowType = field.type === 'calc' ? 'bold' : 'line';
        rows.push({ type: rowType, label: fieldLabel, value });
      }
    }
  }

  return {
    heading: label,
    rows
  };
}

const NON_SERVICE_KEYS = new Set([
  'notes', 'topRow', 'bottomRow', 'secondRow', 'refreshPowerScrub', 'customServices',
]);

const SERVICE_DISPLAY_NAMES = {
  saniclean:         'Saniclean',
  foamingDrain:      'Foaming Drain',
  saniscrub:         'SaniScrub',
  microfiberMopping: 'Microfiber Mopping',
  rpmWindows:        'RPM Windows',
  sanipod:           'SaniPod',
  carpetclean:       'Carpet Cleaning',
  pureJanitorial:    'Janitorial',
  janitorial:        'Janitorial',
  stripwax:          'Strip & Wax',
  greaseTrap:        'Grease Trap',
  electrostaticSpray:'Electrostatic Spray',
};

function resolveServiceData(serviceData) {
  if (!serviceData) return null;
  let data = serviceData;
  const seen = new Set();
  while (data && data.formData && !seen.has(data)) {
    seen.add(data);
    data = data.formData;
  }
  return data || serviceData;
}

function isServiceUsed(serviceData) {
  if (!serviceData) return false;
  const data = resolveServiceData(serviceData);
  if (!data) return false;

  if (serviceData.isActive === false) return false;
  if (data.isActive === false) return false;

  if (
    (data.weeklyTotal && (typeof data.weeklyTotal === 'number' ? data.weeklyTotal > 0 : parseFloat(data.weeklyTotal) > 0)) ||
    (data.monthlyTotal && (typeof data.monthlyTotal === 'number' ? data.monthlyTotal > 0 : parseFloat(data.monthlyTotal) > 0)) ||
    (data.contractTotal && (typeof data.contractTotal === 'number' ? data.contractTotal > 0 : parseFloat(data.contractTotal) > 0)) ||
    (data.firstVisit && (typeof data.firstVisit === 'number' ? data.firstVisit > 0 : parseFloat(data.firstVisit) > 0)) ||
    (data.ongoingMonthly && (typeof data.ongoingMonthly === 'number' ? data.ongoingMonthly > 0 : parseFloat(data.ongoingMonthly) > 0))
  ) {
    return true;
  }

  if (data.totals) {
    if (
      (data.totals.weekly && data.totals.weekly.amount) ||
      (data.totals.monthly && data.totals.monthly.amount) ||
      (data.totals.monthlyRecurring && data.totals.monthlyRecurring.amount) ||
      (data.totals.contract && data.totals.contract.amount) ||
      (data.totals.firstMonth && data.totals.firstMonth.amount) ||
      (data.totals.perVisit && data.totals.perVisit.amount) ||
      (data.totals.annual && data.totals.annual.amount)
    ) {
      return true;
    }
  }

  if (data.total || data.amount || data.charge) return true;

  if (
    (data.fixtureCount && data.fixtureCount > 0) ||
    (data.drainCount && data.drainCount > 0) ||
    (data.squareFeet && data.squareFeet > 0) ||
    (data.quantity && data.quantity > 0) ||
    (data.trapCount && data.trapCount > 0) ||
    (data.hoursPerWeek && data.hoursPerWeek > 0) ||
    (data.windowCount && data.windowCount > 0)
  ) {
    return true;
  }

  if (data.serviceId === 'refreshPowerScrub') {
    const refreshAreas = ['dumpster', 'patio', 'walkway', 'foh', 'boh', 'other'];
    for (const area of refreshAreas) {
      if (data[area] && typeof data[area] === 'object') {
        const areaData = data[area];
        if ((areaData.total && areaData.total > 0) || (areaData.qty && areaData.qty > 0)) {
          return true;
        }
      }
    }
  }

  if (Array.isArray(data.customFields) && data.customFields.length > 0) {
    const hasCustomValue = data.customFields.some((field) => {
      if (!field) return false;
      const v = field.value;
      if (v === null || v === undefined) return false;
      if (typeof v === 'number') return v !== 0;
      if (typeof v === 'string') return v.trim() !== '' && v !== '0';
      return true;
    });
    if (hasCustomValue) return true;
  }

  const ignoreKeys = new Set([
    'serviceId', 'pricingMode', 'location', 'frequency',
    'rateTier', 'contractMonths', 'notes', 'method',
  ]);
  for (const key of Object.keys(data)) {
    if (ignoreKeys.has(key)) continue;
    const val = data[key];
    if (typeof val === 'number' && val > 0) return true;
    if (typeof val === 'string' && val.trim() !== '' && val !== '0') return true;
  }

  return false;
}

function buildPerServiceNotesLatex(services = {}) {
  const entries = [];

  Object.entries(services).forEach(([key, serviceData]) => {
    if (NON_SERVICE_KEYS.has(key)) return;
    if (!serviceData) return;

    const data = resolveServiceData(serviceData);
    const notesText = typeof data.notes === 'string' ? data.notes.trim() : '';
    if (!notesText) return;

    const label = SERVICE_DISPLAY_NAMES[key] || data.displayName || key;
    entries.push({ label, notesText });
  });

  if (entries.length === 0) return '';

  let latex = '\\vspace{1.0em}\n';
  latex += `\\serviceSection{SERVICE NOTES}\n`;
  latex += '\\vspace{0.35em}\n';

  for (const { label, notesText } of entries) {
    latex += `\\serviceBigHeading{${latexEscape(label)}:}\n`;
    const lines = notesText.split('\n').filter(l => l.trim() !== '');
    for (const line of lines) {
      latex += `\\filledlineleft{ ${latexEscape(line)} }\\\\[0.4em]\n`;
    }
    latex += '\\vspace{0.3em}\n';
  }

  return latex;
}

function buildServicesLatex(services = {}) {
  const filterServiceColumns = (cols) => {
    if (!cols || !Array.isArray(cols)) return [];
    return cols.filter((col) => {
      if (!col) return false;
      if (col.rows && col.rows.length > 0) {
        return col.rows.some(
          (row) => row && (row.value || row.v1 || row.v2 || row.v3)
        );
      }
      return false;
    });
  };

  const hasTopBottomFormat = services.topRow || services.bottomRow;

  let servicesTopRowLatex = "";
  let servicesBottomRowLatex = "";
  let refreshSectionLatex = "";
  let serviceNotesLatex = "";

  if (hasTopBottomFormat) {
    const topRowCols = services.topRow || [];
    const bottomRowCols = services.bottomRow || services.secondRow || [];

    const filteredTopRowCols = filterServiceColumns(topRowCols);
    const filteredBottomRowCols = filterServiceColumns(bottomRowCols);

    servicesTopRowLatex = buildServiceRowSequence(filteredTopRowCols, true);
    servicesBottomRowLatex = buildServiceRowSequence(filteredBottomRowCols, false);

    const sec = services.refreshPowerScrub;
    if (sec && Array.isArray(sec.columns) && sec.columns.length > 0) {
      const hasData = sec.columns.some((c) => c && c.trim() !== "");
      if (hasData) {
        const heading = latexEscape(sec.heading || "REFRESH POWER SCRUB");
        const cols = (sec.columns || [])
          .slice(0, 6)
          .map((c) => latexEscape(c || ""));
        const colCount = cols.length;
        const freqLabelsRaw = (sec.freqLabels || [])
          .slice(0, colCount)
          .map((l) => latexEscape(l || ""));
        const freqLabels = Array.from({ length: colCount }, (_, i) =>
          freqLabelsRaw[i] && freqLabelsRaw[i].trim() !== ""
            ? freqLabelsRaw[i]
            : "Freq"
        );
        if (colCount > 0) {
          const colSpec = "|" + Array(colCount).fill("Y").join("|") + "|";
          const labelRow =
            "  " +
            cols.map((h) => `\\scriptsize ${h} \\sblank`).join(" & ") +
            " \\\\";
          const freqRow =
            "  " +
            freqLabels
              .map((l) => `\\scriptsize ${l} \\sblank`)
              .join(" & ") +
            " \\\\";
        refreshSectionLatex += "\\nopagebreak[4]\n";
        refreshSectionLatex += `\\serviceSection{${heading}}\n`;
          refreshSectionLatex += "\\noindent\n";
          refreshSectionLatex += `\\begin{tabularx}{\\textwidth}{${colSpec}}\n`;
          refreshSectionLatex += "  \\hline\n" + labelRow + "\n";
          refreshSectionLatex += "  \\hline\n" + freqRow + "\n";
          refreshSectionLatex += "  \\hline\n";
          refreshSectionLatex += "\\end{tabularx}\n";
        }
      }
    }

    if (services.notes) {
      const notes = services.notes;
      const textLines = Array.isArray(notes.textLines) ? notes.textLines : [];
      const lines = textLines.length || notes.lines || 3;
      const hasContent = textLines.some((line) => line && line.trim() !== "");
      if (hasContent || lines > 0) {
        serviceNotesLatex += "\\vspace{1.0em}\n";
        serviceNotesLatex += `\\serviceSection{${latexEscape(
          notes.heading || "SERVICE NOTES"
        )}}\n`;
        serviceNotesLatex += "\\vspace{0.35em}\n";
        for (let i = 0; i < lines; i++) {
          const content = textLines[i] ? latexEscape(textLines[i]) : "";
          serviceNotesLatex += `\\filledlineleft{ ${content} }\\\\[0.6em]\n`;
        }
      }
    }

    serviceNotesLatex += buildPerServiceNotesLatex(services);

    return {
      servicesTopRowLatex,
      servicesBottomRowLatex,
      refreshSectionLatex,
      serviceNotesLatex,
    };
  }

  const usedServices = {};
  const allServiceKeys = [
    "saniclean",
    "foamingDrain",
    "saniscrub",
    "microfiberMopping",
    "rpmWindows",
    "refreshPowerScrub",
    "sanipod",
    "carpetclean",
    "janitorial",
    "pureJanitorial",
    "stripwax",
    "greaseTrap",
    "electrostaticSpray",
  ];

  logger.debug('🔍 [SERVICES DEBUG] services object keys:', Object.keys(services));
  logger.debug('🔍 [SERVICES DEBUG] services.pureJanitorial exists:', !!services.pureJanitorial);
  if (services.pureJanitorial) {
    logger.debug('🔍 [SERVICES DEBUG] pureJanitorial data:', JSON.stringify(services.pureJanitorial, null, 2).slice(0, 1000));
  }

  for (const serviceKey of allServiceKeys) {
    const svc = services[serviceKey];
    const isUsed = svc && isServiceUsed(svc);

    if (serviceKey === 'pureJanitorial') {
      logger.debug('🔍 [SERVICES DEBUG] pureJanitorial svc:', !!svc);
      logger.debug('🔍 [SERVICES DEBUG] pureJanitorial isUsed:', isUsed);
    }

    if (svc && isUsed) {
      usedServices[serviceKey] = svc;
    }
  }

  logger.debug('🔍 [SERVICES DEBUG] usedServices keys:', Object.keys(usedServices));

  if (services.customServices && Array.isArray(services.customServices)) {
    const usedCustomServices = services.customServices.filter((cs) => {
      return cs && Array.isArray(cs.fields) && cs.fields.length > 0;
    });
    if (usedCustomServices.length > 0) {
      usedServices.customServices = usedCustomServices;
    }
  }

  const refreshPowerScrubUsed = Object.keys(usedServices).includes('refreshPowerScrub');

  if (Object.keys(usedServices).length === 0) {
    return {
      servicesTopRowLatex: "",
      servicesBottomRowLatex: "",
      refreshSectionLatex: "",
      serviceNotesLatex: "",
    };
  }

  const transformedServices = transformServicesToPdfFormat(usedServices);
  const topRowCols = transformedServices.topRow || [];
  const bottomRowCols = transformedServices.bottomRow || [];

  servicesTopRowLatex = buildServiceRowSequence(filterServiceColumns(topRowCols), true);
  servicesBottomRowLatex = buildServiceRowSequence(filterServiceColumns(bottomRowCols), false);

  if (usedServices.refreshPowerScrub) {
    const refreshData = usedServices.refreshPowerScrub.formData || usedServices.refreshPowerScrub;

    if (refreshData && refreshData.isActive) {
      let enabledAreas = [];

      const isVisibleArea = (area) => area?.isDisplay !== false;

      if (refreshData.services) {
        const serviceKeys = Object.keys(refreshData.services);

        for (const serviceKey of serviceKeys) {
          const serviceData = refreshData.services[serviceKey];
          if (
            serviceData &&
            serviceData.enabled &&
            isVisibleArea(serviceData) &&
            serviceData.total &&
            serviceData.total.value > 0
          ) {
            const displayName = serviceKey === 'frontHouse' ? 'FRONT HOUSE' :
                              serviceKey === 'backHouse' ? 'BACK HOUSE' :
                              serviceKey.toUpperCase();

            enabledAreas.push({
              key: serviceKey,
              originalKey: serviceKey,
              displayName: displayName,
              data: serviceData
            });
          }
        }
      } else {
        const areas = ['dumpster', 'patio', 'walkway', 'foh', 'boh', 'other'];

        for (const areaKey of areas) {
          const legacyArea = refreshData[areaKey];
          if (
            legacyArea &&
            typeof legacyArea === 'object' &&
            legacyArea.isDisplay !== false &&
            legacyArea.type === 'calc' &&
            legacyArea.qty > 0
          ) {
            const displayName = areaKey === 'foh' ? 'FRONT HOUSE' : areaKey === 'boh' ? 'BACK HOUSE' : areaKey.toUpperCase();

            enabledAreas.push({
              key: areaKey,
              originalKey: areaKey,
              displayName: displayName,
              data: refreshData[areaKey]
            });
          }
        }
      }

      if (enabledAreas.length > 0) {
        const maxAreas = Math.min(enabledAreas.length, 4);
        const colSpec = "|l|" + Array(maxAreas).fill("Y").join("|") + "|";

        const headerRow = "  & " +
          enabledAreas.slice(0, maxAreas)
            .map(area => `\\textbf{\\textcolor{serviceHeaderBlue}{${latexEscape(area.displayName)}}}`)
            .join(" & ") +
          " \\\\";

        const getPricingMethodDisplay = (area) => {
          if (refreshData.services) {
            return area.data.pricingMethod ? area.data.pricingMethod.value : 'N/A';
          } else {
            if (area.data.unit === 'hours') return 'Per Hour';
            if (area.data.unit === 'workers') return 'Per Worker';
            if (area.data.unit === 'sq ft') return 'Square Feet';
            return 'Service';
          }
        };

        const pricingMethodRow = "  Method & " +
          enabledAreas.slice(0, maxAreas)
            .map(area => `\\scriptsize ${latexEscape(getPricingMethodDisplay(area))}`)
            .join(" & ") +
          " \\\\";

        const getAreaBreakdown = (area) => {
          const originalArea = refreshData[area.originalKey];
          if (!originalArea) return null;

          if (originalArea.insideSqFt !== undefined || originalArea.outsideSqFt !== undefined) {
            return {
              fixed: originalArea.sqFtFixedFee || 200,
              insideSqFt: originalArea.insideSqFt || 0,
              insideRate: originalArea.insideRate || 0.6,
              outsideSqFt: originalArea.outsideSqFt || 0,
              outsideRate: originalArea.outsideRate || 0.4
            };
          }
          return null;
        };

        const readFieldValue = (field) => {
          if (field === null || field === undefined) return undefined;
          return typeof field === "object" && "value" in field ? field.value : field;
        };

        const getCalculationDetails = (area) => {
          if (refreshData.services) {
            const serviceData = area.data;
            let details = [];

            if (serviceData.hours) {
              details.push(`${serviceData.hours.quantity} hrs @ \\$${serviceData.hours.priceRate}`);
            } else if (serviceData.workersCalc) {
              details.push(`${serviceData.workersCalc.quantity} workers @ \\$${serviceData.workersCalc.priceRate}`);
            } else if (serviceData.insideSqft || serviceData.outsideSqft) {
              if (serviceData.fixedFee) {
                details.push(`Fixed: \\$${serviceData.fixedFee.value}`);
              }
              if (serviceData.insideSqft && serviceData.insideSqft.quantity > 0) {
                details.push(`In: ${serviceData.insideSqft.quantity} @ \\$${serviceData.insideSqft.priceRate}`);
              }
              if (serviceData.outsideSqft && serviceData.outsideSqft.quantity > 0) {
                details.push(`Out: ${serviceData.outsideSqft.quantity} @ \\$${serviceData.outsideSqft.priceRate}`);
              }
            } else if (serviceData.plan) {
              if (area.key === 'patio' && serviceData.includePatioAddon) {
                if (serviceData.includePatioAddon.value === true) {
                  details.push(`Patio: \\$800 + Add-on: \\$500`);
                } else {
                  details.push(`Plan: ${serviceData.plan.value}`);
                }
              } else if (area.key === 'patio') {
                details.push(`Patio Service: \\$800`);
              } else {
                details.push(`Plan: ${serviceData.plan.value}`);
              }
            }

            if (area.key === 'backHouse') {
              const smallQty = readFieldValue(serviceData.smallMediumQuantity);
              const smallRate = readFieldValue(serviceData.smallMediumRate);
              const smallTotal = readFieldValue(serviceData.smallMediumTotal);
              const largeQty = readFieldValue(serviceData.largeQuantity);
              const largeRate = readFieldValue(serviceData.largeRate);
              const largeTotal = readFieldValue(serviceData.largeTotal);

              if (smallQty && smallRate) {
                const totalDisplay = smallTotal ? ` = \\$${smallTotal}` : "";
                details.push(`Small/Med: ${smallQty} @ \\$${smallRate}${totalDisplay}`);
              }
              if (largeQty && largeRate) {
                const totalDisplay = largeTotal ? ` = \\$${largeTotal}` : "";
                details.push(`Large: ${largeQty} @ \\$${largeRate}${totalDisplay}`);
              }
            }

            if (!details.length) {
              const presetQty = readFieldValue(serviceData.presetQuantity ?? serviceData.savedPresetQuantity);
              const presetRate = readFieldValue(serviceData.presetRate ?? serviceData.savedPresetRate);
              const presetTotal = readFieldValue(serviceData.total);
              if (presetQty || presetRate) {
                const parts = [];
                if (presetQty) {
                  parts.push(`${presetQty} pkg${presetQty !== 1 ? "s" : ""}`);
                }
                if (presetRate) {
                  parts.push(`@ \\$${presetRate}`);
                }
                if (presetTotal) {
                  parts.push(`= \\$${fmtNum(Number(presetTotal))}`);
                }
                details.push(`Preset: ${parts.join(" ")}`);
              }
            }

            return details.length > 0 ? details.join(", ") : "Service";
          } else {
            const breakdown = getAreaBreakdown(area);
            if (breakdown) {
              let details = [];
              if (breakdown.fixed > 0) {
                details.push(`Fixed: \\$${fmtNum(breakdown.fixed)}`);
              }
              if (breakdown.insideSqFt > 0) {
                details.push(`Inside: ${breakdown.insideSqFt} @ \\$${breakdown.insideRate}`);
              }
              if (breakdown.outsideSqFt > 0) {
                details.push(`Outside: ${breakdown.outsideSqFt} @ \\$${breakdown.outsideRate}`);
              }
              return details.length > 0 ? details.join(", ") : `${area.data.qty} ${area.data.unit || 'service'}${area.data.qty !== 1 ? 's' : ''}`;
            } else {
              return `${area.data.qty} ${area.data.unit || 'service'}${area.data.qty !== 1 ? 's' : ''}`;
            }
          }
        };

        const detailsRow = "  Details & " +
          enabledAreas.slice(0, maxAreas)
            .map(area => `\\scriptsize ${getCalculationDetails(area)}`)
            .join(" & ") +
          " \\\\";

        const frequencyRow = "  Frequency & " +
          enabledAreas.slice(0, maxAreas)
            .map(area => {
              const frequencyValue = refreshData.services
                ? latexEscape(area.data.frequency ? area.data.frequency.value : 'TBD')
                : 'TBD';
              return `\\scriptsize ${frequencyValue}`;
            })
            .join(" & ") +
          " \\\\";

        const totalRow = "  Total & " +
          enabledAreas.slice(0, maxAreas)
            .map(area => {
              if (refreshData.services) {
                return `\\textbf{\\textcolor{linegray}{\\$${fmtNum(area.data.total.value)}}}`;
              } else {
                return `\\textbf{\\textcolor{linegray}{\\$${fmtNum(area.data.total)}}}`;
              }
            })
            .join(" & ") +
          " \\\\";

        const getAreaFrequencyLabel = (area) => {
          if (refreshData.services) {
            return (area.data.frequency?.value || "").toString();
          }
          const rawArea = refreshData[area.originalKey];
          return (rawArea?.frequencyLabel || area.data.frequencyLabel || "").toString();
        };

        const isOneTimeFrequency = (label) => {
          if (!label) return false;
          const normalized = label.toLowerCase().replace(/-/g, " ");
          return normalized.includes("one") && normalized.includes("time");
        };

        const areasToDisplay = enabledAreas.slice(0, maxAreas);
        const shouldDisplayContractRow = areasToDisplay.some(
          area => !isOneTimeFrequency(getAreaFrequencyLabel(area))
        );

        const contractRow = shouldDisplayContractRow
          ? "  Contract & " +
            areasToDisplay
              .map(area => {
                if (isOneTimeFrequency(getAreaFrequencyLabel(area))) {
                  return "\\textbf{\\textcolor{linegray}{}}";
                }
                if (refreshData.services && area.data.contract) {
                  const contractTotal = area.data.contract.total || 0;
                  const contractMonths = area.data.contract.quantity || 12;
                  return `\\textbf{\\textcolor{linegray}{\\$${fmtNum(contractTotal)}}} \\scriptsize{(${contractMonths}mo)}`;
                }
                return "\\textbf{TBD}";
              })
              .join(" & ") +
            " \\\\"
          : "";

        refreshSectionLatex += "\\nopagebreak[4]\n";
        refreshSectionLatex += `\\serviceSection{REFRESH POWER SCRUB}\n`;
        refreshSectionLatex += "\\noindent\n";
        refreshSectionLatex += `\\begin{tabularx}{\\textwidth}{${colSpec}}\n`;
        refreshSectionLatex += "  \\hline\n" + headerRow + "\n";
        refreshSectionLatex += "  \\hline\n" + pricingMethodRow + "\n";
        refreshSectionLatex += "  \\hline\n" + detailsRow + "\n";
        refreshSectionLatex += "  \\hline\n" + frequencyRow + "\n";
        refreshSectionLatex += "  \\hline\n" + totalRow + "\n";
        if (contractRow) {
          refreshSectionLatex += "  \\hline\n" + contractRow + "\n";
        }
        refreshSectionLatex += "  \\hline\n";
        refreshSectionLatex += "\\end{tabularx}\n";

      }
    }
  }

  else if (services.refreshPowerScrub) {
    const secRoot = services.refreshPowerScrub;
    const sec = secRoot.formData || secRoot;

    if (sec && Array.isArray(sec.columns) && sec.columns.length > 0) {
      const hasData = sec.columns.some((c) => c && c.trim() !== "");
      if (hasData) {
        const heading = latexEscape(sec.heading || "REFRESH POWER SCRUB");
        const cols = (sec.columns || [])
          .slice(0, 6)
          .map((c) => latexEscape(c || ""));
        const colCount = cols.length;
        const freqLabelsRaw = (sec.freqLabels || [])
          .slice(0, colCount)
          .map((l) => latexEscape(l || ""));
        const freqLabels = Array.from({ length: colCount }, (_, i) =>
          freqLabelsRaw[i] && freqLabelsRaw[i].trim() !== ""
            ? freqLabelsRaw[i]
            : "Freq"
        );
        if (colCount > 0) {
          const colSpec = "|" + Array(colCount).fill("Y").join("|") + "|";
          const labelRow =
            "  " +
            cols.map((h) => `\\scriptsize ${h} \\sblank`).join(" & ") +
            " \\\\";
          const freqRow =
            "  " +
            freqLabels
              .map((l) => `\\scriptsize ${l} \\sblank`)
              .join(" & ") +
            " \\\\";
          refreshSectionLatex += "\\nopagebreak[4]\n";
          refreshSectionLatex += `\\serviceSection{${heading}}\n`;
          refreshSectionLatex += "\\noindent\n";
          refreshSectionLatex += `\\begin{tabularx}{\\textwidth}{${colSpec}}\n`;
          refreshSectionLatex += "  \\hline\n" + labelRow + "\n";
          refreshSectionLatex += "  \\hline\n" + freqRow + "\n";
          refreshSectionLatex += "  \\hline\n";
          refreshSectionLatex += "\\end{tabularx}\n";
        }
      }
    }
  }

  if (services.notes) {
    const notes = services.notes;
    const textLines = Array.isArray(notes.textLines) ? notes.textLines : [];
    const lines = textLines.length || notes.lines || 3;
    const hasContent = textLines.some((line) => line && line.trim() !== "");
    if (hasContent || lines > 0) {
      serviceNotesLatex += "\\vspace{1.0em}\n";
      serviceNotesLatex += `\\serviceSection{${latexEscape(
        notes.heading || "SERVICE NOTES"
      )}}\n`;
      serviceNotesLatex += "\\vspace{0.35em}\n";
      for (let i = 0; i < lines; i++) {
        const content = textLines[i] ? latexEscape(textLines[i]) : "";
        serviceNotesLatex += `\\filledlineleft{ ${content} }\\\\[0.6em]\n`;
      }
    }
  }

  serviceNotesLatex += buildPerServiceNotesLatex(services);

  return {
    servicesTopRowLatex,
    servicesBottomRowLatex,
    refreshSectionLatex,
    serviceNotesLatex,
  };
}


// ─── Pricing Catalog PDF — Helper functions ───────────────────────────────

function _camelToLabel(key) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, c => c.toUpperCase())
    .replace(/_/g, ' ')
    .trim();
}

function _isMonetaryKey(key) {
  return /price|rate|fee|charge|cost|minimum|amount|credit|weekly|monthly|annual|per|factor|multiplier/i.test(key);
}

// Keys excluded from the pricing catalog even though they look monetary —
// "minimum" floors/thresholds are internal calc inputs, not catalog pricing.
function _isExcludedPricingKey(key) {
  return /minimum/i.test(key);
}

function _formatConfigValue(key, val) {
  const k = key.toLowerCase();
  if (k.includes('multiplier') || k.includes('factor') || (k.includes('weeks') && val < 100) || k.includes('ratio')) {
    return `${val}x`;
  }
  return `$${fmtNum(Number(val))}`;
}

function _detectUnit(key) {
  const k = key.toLowerCase();
  if (k.includes('per visit') || k.includes('pervisit')) return '/visit';
  if (k.includes('per unit') || k.includes('perunit') || k.includes('perdispenser')) return '/unit';
  if (k.includes('per fixture') || k.includes('perfixture')) return '/fixture';
  if (k.includes('weekly') || k.includes('per week') || k.includes('perweek')) return '/week';
  if (k.includes('monthly') || k.includes('per month') || k.includes('permonth')) return '/month';
  if (k.includes('annual') || k.includes('per year') || k.includes('peryear')) return '/year';
  if (k.includes('multiplier') || k.includes('factor') || k.includes('ratio') || k.includes('weeks')) return 'x';
  return 'fixed';
}

function _flattenConfig(obj, rows = [], depth = 0) {
  if (depth > 2 || !obj || typeof obj !== 'object') return rows;
  for (const [key, val] of Object.entries(obj)) {
    if (Array.isArray(val)) continue;
    if (typeof val === 'number' && val > 0 && _isMonetaryKey(key) && !_isExcludedPricingKey(key)) {
      rows.push({ field: _camelToLabel(key), value: _formatConfigValue(key, val), unit: _detectUnit(key) });
    } else if (typeof val === 'object' && val !== null) {
      _flattenConfig(val, rows, depth + 1);
    }
  }
  return rows;
}

function _getCategoryTag(config) {
  for (const [key, val] of Object.entries(config || {})) {
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) return _camelToLabel(key);
  }
  return '';
}

function _countPricingItems(services) {
  return services.reduce((sum, s) => sum + _flattenConfig(s.config || {}).length, 0);
}

function _latexPricingCard({ title, tag, headers, colspec, rows }) {
  const esc = latexEscape;
  const ncol = headers.length;
  const headerCells = headers.map(h => `{\\color{white}\\bfseries\\footnotesize ${esc(h)}}`).join(' & ');
  const tagTex = tag ? `\\quad\\colorbox{emaccent}{\\color{white}\\scriptsize ${esc(tag)}}` : '';
  const dataRows = rows
    .map((cells, i) => {
      const shade = i % 2 === 1 ? '\\rowcolor{emrowalt}' : '';
      return `${shade}${cells.join(' & ')} \\\\ \\arrayrulecolor{emborder}\\hline`;
    })
    .join('\n');
  return `\\noindent
{\\arrayrulecolor{emborder}\\setlength{\\arrayrulewidth}{0.6pt}
\\begin{longtable}{|@{\\hspace{12pt}}${colspec}@{\\hspace{12pt}}|}
\\hline
\\rowcolor{emtitlebg}\\multicolumn{${ncol}}{|@{\\hspace{12pt}}l@{\\hspace{12pt}}|}{\\rule[-9pt]{0pt}{28pt}\\large\\bfseries\\color{emink}${esc(title)}${tagTex}} \\\\ \\hline
\\rowcolor{emaccent}\\rule[-7pt]{0pt}{22pt}${headerCells} \\\\ \\arrayrulecolor{emborder}\\hline
\\endhead
${dataRows}
\\end{longtable}}
\\vspace{20pt}
`;
}

function _buildPricingCatalogLatex({ exportDate, services, catalog, currency }) {
  const esc = latexEscape;
  const totalPricingItems = _countPricingItems(services);
  const categoryCount = services.length;

  const serviceCards = services
    .map(s => {
      const rows = _flattenConfig(s.config || {});
      if (!rows.length) return '';
      const tag = _getCategoryTag(s.config || {});
      return _latexPricingCard({
        title: s.label || s.serviceId || 'Service',
        tag,
        headers: ['Pricing Field', 'Value', 'Unit'],
        colspec: 'p{8.4cm} >{\\RaggedLeft\\arraybackslash}p{3.6cm} >{\\RaggedLeft\\arraybackslash}p{3.2cm}',
        rows: rows.map(r => [esc(r.field), esc(r.value), esc(r.unit)]),
      });
    })
    .filter(Boolean)
    .join('\n');

  let productCards = '';
  if (catalog && Array.isArray(catalog.families)) {
    productCards = catalog.families
      .filter(f => f.products && f.products.length > 0)
      .map(family => {
        const rows = family.products
          .filter(p => p.basePrice?.amount != null)
          .map(p => {
            const price = `$${fmtNum(Number(p.basePrice.amount))}`;
            const warranty = p.warrantyPricePerUnit?.amount != null
              ? `$${fmtNum(Number(p.warrantyPricePerUnit.amount))}/${p.warrantyPricePerUnit.billingPeriod || 'mo'}`
              : '-';
            return [esc(p.name || ''), esc(price), esc(p.basePrice.uom || 'each'), esc(warranty)];
          });
        if (!rows.length) return '';
        return _latexPricingCard({
          title: family.label || family.key || 'Products',
          tag: `${family.products.length} Products`,
          headers: ['Product Name', 'Base Price', 'UOM', 'Warranty/Unit'],
          colspec: 'p{6.6cm} >{\\RaggedLeft\\arraybackslash}p{3cm} >{\\RaggedLeft\\arraybackslash}p{3cm} >{\\RaggedLeft\\arraybackslash}p{3.2cm}',
          rows,
        });
      })
      .filter(Boolean)
      .join('\n');
  }

  const sectionHeading = label =>
    `{\\color{emaccent}\\rule[-2pt]{3.5pt}{14pt}}\\hspace{7pt}{\\large\\bfseries\\color{emink}${label}}\\par\\nobreak\\vspace{4pt}{\\color{emborder}\\rule{\\textwidth}{0.6pt}}\\par\\vspace{12pt}\n`;

  const body = `${categoryCount > 0 && serviceCards ? sectionHeading('Service Configurations') : ''}${serviceCards}${productCards ? `\n\\vspace{6pt}\n${sectionHeading('Product Catalog')}${productCards}` : ''}`;

  return `\\documentclass[10pt]{article}
\\usepackage[letterpaper,margin=1.4cm]{geometry}
\\usepackage[T1]{fontenc}
\\usepackage{helvet}
\\renewcommand{\\familydefault}{\\sfdefault}
\\usepackage{xcolor}
\\usepackage{array}
\\usepackage{tabularx}
\\usepackage{longtable}
\\usepackage{colortbl}
\\usepackage{ragged2e}
\\definecolor{emink}{HTML}{1F2937}
\\definecolor{emhdr}{HTML}{A00000}
\\definecolor{emaccent}{HTML}{C00000}
\\definecolor{emhdracc}{HTML}{F4C9C9}
\\definecolor{emmuted}{HTML}{6B7280}
\\definecolor{emborder}{HTML}{E5E7EB}
\\definecolor{emrowalt}{HTML}{FBF7F7}
\\definecolor{emtitlebg}{HTML}{FBEAEA}
\\setlength{\\parindent}{0pt}
\\renewcommand{\\arraystretch}{1.5}
\\setlength{\\tabcolsep}{8pt}
\\pagestyle{empty}
\\begin{document}

\\noindent\\colorbox{emhdr}{\\parbox[c]{\\dimexpr\\textwidth-2\\fboxsep\\relax}{\\vspace{14pt}
\\begin{minipage}[c]{0.60\\linewidth}
{\\fontsize{30}{32}\\selectfont\\bfseries\\color{white}Enviro-Master NVA}\\\\[5pt]
{\\color{emhdracc}\\large Service Pricing Report}\\\\[3pt]
{\\color{emhdracc}\\small Serving Northern Virginia}
\\end{minipage}\\hfill
\\begin{minipage}[c]{0.38\\linewidth}\\RaggedLeft
{\\scriptsize\\color{emhdracc}Generated on}\\\\{\\small\\color{white}${esc(exportDate)}}\\\\[6pt]
{\\scriptsize\\color{emhdracc}Prepared by}\\\\{\\small\\color{white}Admin}
\\end{minipage}
\\vspace{14pt}}}

\\vspace{18pt}
\\noindent{\\setlength{\\fboxsep}{14pt}%
\\fcolorbox{emborder}{white}{\\parbox[c][1.5cm][c]{\\dimexpr0.32\\textwidth-2\\fboxsep-2\\fboxrule\\relax}{{\\scriptsize\\color{emmuted}Service Categories}\\\\[4pt]{\\fontsize{22}{24}\\selectfont\\bfseries\\color{emaccent}${categoryCount}}}}\\hfill
\\fcolorbox{emborder}{white}{\\parbox[c][1.5cm][c]{\\dimexpr0.32\\textwidth-2\\fboxsep-2\\fboxrule\\relax}{{\\scriptsize\\color{emmuted}Pricing Items}\\\\[4pt]{\\fontsize{22}{24}\\selectfont\\bfseries\\color{emaccent}${totalPricingItems}}}}\\hfill
\\fcolorbox{emborder}{white}{\\parbox[c][1.5cm][c]{\\dimexpr0.32\\textwidth-2\\fboxsep-2\\fboxrule\\relax}{{\\scriptsize\\color{emmuted}Currency}\\\\[4pt]{\\fontsize{22}{24}\\selectfont\\bfseries\\color{emaccent}${esc(currency)}}}}}

\\vspace{26pt}

${body}

\\vfill
{\\color{emborder}\\rule{\\textwidth}{0.6pt}}
\\vspace{6pt}
\\noindent{\\footnotesize\\bfseries\\color{emaccent}Enviro-Master Pricing Report}\\hfill{\\footnotesize\\color{emmuted}Confidential --- Internal Use Only}

\\end{document}
`;
}

export async function compilePricingCatalogPdf({ services = [], catalog = null } = {}) {
  const exportDate = new Date().toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const activeServices = (services || []).filter(s => s.isActive);
  const currency = catalog?.currency || 'USD';
  const latex = _buildPricingCatalogLatex({ exportDate, services: activeServices, catalog, currency });

  const buffer = await remotePostPdf('pdf/compile', { template: latex });
  await tidyTempArtifacts({ purgeAll: true });
  const filename = `pricing-catalog-${new Date().toISOString().slice(0, 10)}.pdf`;
  return { buffer, filename };
}

export async function getPdfHealth() {
  try {
    const r = await fetch(`${PDF_REMOTE_BASE.replace(/\/+$/, "")}/health`);
    const j = await r.json();
    return { mode: "remote", ok: true, base: PDF_REMOTE_BASE, remote: j };
  } catch (e) {
    return { mode: "remote", ok: false, base: PDF_REMOTE_BASE, error: String(e) };
  }
}

export async function compileRawTex(texString) {
  if (!texString || typeof texString !== "string") {
    const err = new Error("Body must include a 'template' string.");
    err.status = 400;
    throw err;
  }
  const buffer = await remotePostPdf("pdf/compile", { template: texString });
  await tidyTempArtifacts({ purgeAll: true });
  return { buffer, filename: "document.pdf" };
}

export async function compileProposalTemplate() {
  const mainTex = await fs.readFile(PDF_TEMPLATE_PATH);
  const baseDir = path.dirname(PDF_TEMPLATE_PATH);
  const logoPath = path.join(baseDir, "images", "Envimaster.png");
  const logoBuf = await fs.readFile(logoPath);

  const files = [
    { field: "main", name: "doc.tex", data: mainTex, type: "application/x-tex" },
    { field: "assets", name: "images/Envimaster.png", data: logoBuf, type: "image/png" },
  ];
  const manifest = { "Envimaster.png": "images/Envimaster.png" };

  const buffer = await remotePostMultipart("pdf/compile-bundle", files, { assetsManifest: manifest });
  await tidyTempArtifacts({ purgeAll: true });
  return { buffer, filename: "proposal.pdf" };
}

export async function compileCustomerHeader(body = {}, options = {}) {
  const { watermark = false } = options;

  logger.debug('ÐY"? [PDF COMPILE] Starting compilation with options:', {
    templatePath: PDF_HEADER_TEMPLATE_PATH,
    watermark,
    status: body.status,
  });

  validatePayloadData(body);

  logger.debug('🧹 [PDF COMPILE] Deep sanitizing payload to remove corrupted characters...');
  body = deepSanitizeObject(body);
  logger.debug('✅ [PDF COMPILE] Payload sanitization complete');

  if (body.products) {
    logger.debug('🔍 [PRODUCTS VALIDATION] Checking products data for corrupted fields...');

    const checkProductData = (product, index, type) => {
      const fields = ['displayName', 'customName', 'productName', 'productKey', 'frequency', 'qty', 'unitPrice', 'amount', 'total'];
      for (const field of fields) {
        if (product[field] !== undefined && product[field] !== null) {
          const value = String(product[field]);
          const hasBadChars = /[\x00-\x1F\x7F-\xFF]/.test(value);
          if (hasBadChars) {
            logger.error(`❌ [PRODUCTS VALIDATION] Found corrupted data in ${type}[${index}].${field}:`, {
              field,
              value,
              valueLength: value.length,
              hexDump: Array.from(value.slice(0, 50)).map(c =>
                c.charCodeAt(0).toString(16).padStart(2, '0')
              ).join(' ')
            });
          }
        }
      }
    };

    if (Array.isArray(body.products.products)) {
      body.products.products.forEach((p, i) => checkProductData(p, i, 'products'));
    }

    if (Array.isArray(body.products.dispensers)) {
      body.products.dispensers.forEach((d, i) => checkProductData(d, i, 'dispensers'));
    }

    if (Array.isArray(body.products.smallProducts)) {
      body.products.smallProducts.forEach((p, i) => checkProductData(p, i, 'smallProducts'));
    }
    if (Array.isArray(body.products.bigProducts)) {
      body.products.bigProducts.forEach((p, i) => checkProductData(p, i, 'bigProducts'));
    }
  }

  const summaryData = body.summary || {};
  const SUMMARY_PLACEHOLDER = "—";
  const formatSummaryField = (value) => {
    if (value === undefined || value === null) return SUMMARY_PLACEHOLDER;
    const text = String(value).trim();
    if (text === "" || text.toLowerCase() === "null" || text.toLowerCase() === "undefined") {
      return SUMMARY_PLACEHOLDER;
    }
    return latexEscape(text);
  };

  const summaryContractMonthsRaw = formatSummaryField(summaryData.contractMonths);
  const summaryContractMonthsDisplay =
    summaryContractMonthsRaw === SUMMARY_PLACEHOLDER ? summaryContractMonthsRaw : `${summaryContractMonthsRaw} mo`;
  const summaryTripChargeLabel = latexEscape(formatChargeLabel(summaryData.tripCharge, summaryData.tripChargeFrequency));
  const summaryParkingChargeLabel = latexEscape(formatChargeLabel(summaryData.parkingCharge, summaryData.parkingChargeFrequency));
  const formattedServiceAgreementTotal = formatCurrency(summaryData.serviceAgreementTotal);
  const summaryServiceAgreementTotal =
    latexEscape(formattedServiceAgreementTotal || SUMMARY_PLACEHOLDER);

  const productMonthlyValue = summaryData.productMonthlyTotal;
  const productContractValue = summaryData.productContractTotal;
  const productMonthlyLabel = formatCurrency(productMonthlyValue);
  const productContractLabel = formatCurrency(productContractValue);
  const combinedProductTotals = [
    productMonthlyLabel ? `Monthly ${productMonthlyLabel}` : "",
    productContractLabel ? `Contract ${productContractLabel}` : ""
  ]
    .filter(Boolean)
    .join(" - ");
  const summaryProductTotalsLabel = latexEscape(combinedProductTotals || SUMMARY_PLACEHOLDER);

  const hasSummaryData = summaryData && Object.keys(summaryData).length > 0;
  const summaryExists = Boolean(hasSummaryData) && body.includeContractSummary !== false;

  const activeServiceEntries = Object.values(body.services || {}).filter(sd => isServiceUsed(sd));
  const allServicesOneTime =
    activeServiceEntries.length > 0 &&
    activeServiceEntries.every(sd => {
      const data = sd && sd.formData ? sd.formData : sd;
      const freqKey = detectServiceFrequencyKey(data);
      return freqKey === 'oneTime';
    });
  const showContractMonths = summaryExists && !allServicesOneTime;


  const view = {
    headerTitle: latexEscape(body.headerTitle || ""),
    // Extensions keep the legacy addendum heading; new agreements use the
    // service-agreement wording.
    documentHeading: body.isExtension === true
      ? "CUSTOMER UPDATE ADDENDUM"
      : "CUSTOMER SERVICE AGREEMENT",
    headerRows: (body.headerRows || []).map((r) => ({
      labelLeft: latexEscape(r.labelLeft || ""),
      valueLeft: latexEscape(r.valueLeft || ""),
      labelRight: latexEscape(r.labelRight || ""),
      valueRight: latexEscape(r.valueRight || ""),
    })),
    agreementEnviroOf: latexEscape(body.agreement?.enviroOf || ""),
    agreementExecutedOn: latexEscape(body.agreement?.customerExecutedOn || ""),
    agreementAdditionalMonths: latexEscape(body.agreement?.additionalMonths || ""),
    agreementPaymentOption: latexEscape(
      body.agreement?.paymentOption === "online" ? "Online" :
      body.agreement?.paymentOption === "cash"   ? "Cash"   :
      body.agreement?.paymentOption === "others" ? "Other"  : ""
    ),
    agreementPaymentNote: latexEscape(body.agreement?.paymentNote || ""),
    ...(() => {
      const productsData = buildProductsLatex(body.products || {}, body.products?.customColumns || { products: [], dispensers: [] });
      return {
        ...productsData,
        // Only show products table if there are actual products AND user hasn't explicitly disabled it
        includeProductsTable: productsData.hasProducts && body.includeProductsTable !== false,
      };
    })(),
    ...buildServicesLatex(body.services || {}),
    includeWatermark: watermark,
    summaryContractMonthsDisplay,
    summaryTripChargeLabel,
    summaryParkingChargeLabel,
    summaryServiceAgreementTotal,
    summaryProductTotalsLabel,
    summaryExists,
    showContractMonths,
  };

  const template = await fs.readFile(PDF_HEADER_TEMPLATE_PATH, "utf8");

  let tex = Mustache.render(template, view);
  logger.debug('🔍 [PDF COMPILE] After Mustache rendering, LaTeX length:', tex.length);

  try {
    const debugPath = '/tmp/debug-latex-output.tex';
    await fs.writeFile(debugPath, tex, 'utf8');
    logger.debug(`🔍 [PDF DEBUG] Generated LaTeX saved to: ${debugPath}`);
  } catch (err) {
    logger.warn('⚠️ Could not save debug LaTeX:', err.message);
  }

  if (watermark) {
    logger.debug('💧 [WATERMARK] Adding DRAFT watermark to PDF');
    const { preamble, command } = buildWatermarkLatex();

    tex = tex.replace(/\\begin\{document\}/, preamble + '\\begin{document}');

    tex = tex.replace(/\\begin\{document\}/, '\\begin{document}\n' + command);
  }

  if (body.serviceAgreement && body.serviceAgreement.includeInPdf) {
    logger.debug('📄 [SERVICE AGREEMENT] Including Service Agreement in PDF');
    const serviceAgreementLatex = buildServiceAgreementLatex(body.serviceAgreement);
    tex = tex.replace(/\\end\{document\}/, serviceAgreementLatex + '\n\\end{document}');
  } else {
    logger.debug('📄 [SERVICE AGREEMENT] Service Agreement not included (checkbox not checked or data missing)');
  }

  const openBraces = (tex.match(/\{/g) || []).length;
  const closeBraces = (tex.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) {
    logger.error(`❌ [LATEX-VALIDATION] Brace mismatch! Opening: ${openBraces}, Closing: ${closeBraces}, Difference: ${openBraces - closeBraces}`);

    try {
      const finalDebugPath = '/tmp/debug-latex-final-with-errors.tex';
      await fs.writeFile(finalDebugPath, tex, 'utf8');
      logger.debug(`🔍 [PDF DEBUG] Final LaTeX with errors saved to: ${finalDebugPath}`);
    } catch (err) {
      logger.warn('⚠️ Could not save final debug LaTeX:', err.message);
    }
  }

  try {
    const finalDebugPath = '/tmp/debug-latex-final.tex';
    await fs.writeFile(finalDebugPath, tex, 'utf8');
    logger.debug(`🔍 [PDF DEBUG] Final LaTeX (after all modifications) saved to: ${finalDebugPath}`);
  } catch (err) {
    logger.warn('⚠️ Could not save final debug LaTeX:', err.message);
  }

  const headerDir = path.dirname(PDF_HEADER_TEMPLATE_PATH);
  const logoPath = path.join(headerDir, "images", "Envimaster.png");
  logger.debug(`📷 [PDF] Reading logo from: ${logoPath}`);

  const logoBuf = await fs.readFile(logoPath);
  logger.debug(`📷 [PDF] Logo buffer size: ${logoBuf.length} bytes`);

  // Add unique timestamp comment to prevent caching issues
  const uniqueMarker = `% Generated: ${new Date().toISOString()} - ${Math.random().toString(36).substring(7)}\n`;
  let texWithMarker = uniqueMarker + tex;

  // FINAL SANITIZATION: Strip any binary/control characters that may have slipped through
  // This prevents LaTeX compilation errors from corrupted data
  // Use a simple whitelist approach - only allow printable ASCII and safe whitespace
  const hasBinaryCorruption = /[^\x09\x0A\x0D\x20-\x7E]/.test(texWithMarker);

  if (hasBinaryCorruption) {
    logger.error('❌ [PDF FINAL SANITIZE] Binary corruption detected in final LaTeX!');

    // Find the corrupted sections for logging
    const matches = [];
    const searchPattern = /[^\x09\x0A\x0D\x20-\x7E]/g;
    let match;
    while ((match = searchPattern.exec(texWithMarker)) !== null) {
      const start = Math.max(0, match.index - 20);
      const end = Math.min(texWithMarker.length, match.index + 20);
      const context = texWithMarker.slice(start, end).replace(/[^\x20-\x7E]/g, '?');
      const charCode = texWithMarker.charCodeAt(match.index).toString(16).padStart(4, '0');
      matches.push({ index: match.index, charCode: `U+${charCode}`, context });
      if (matches.length >= 10) break; // Limit logging
    }
    logger.error('❌ [PDF FINAL SANITIZE] Corruption locations (first 10):', JSON.stringify(matches, null, 2));

    // Remove ALL non-printable characters (only keep printable ASCII + tab + newline + carriage return)
    const beforeLength = texWithMarker.length;
    texWithMarker = texWithMarker.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');
    logger.debug(`✅ [PDF FINAL SANITIZE] Removed ${beforeLength - texWithMarker.length} corrupted characters, new length: ${texWithMarker.length}`);
  }

  // Convert tex to Buffer ensuring proper UTF-8 encoding
  const texBuffer = Buffer.from(texWithMarker, 'utf8');
  logger.debug(`📷 [PDF] LaTeX buffer size: ${texBuffer.length} bytes, first 100 chars:`, texWithMarker.substring(0, 100));

  const files = [
    { field: "main", name: "doc.tex", data: texBuffer, type: "text/plain; charset=utf-8" },
    // Send with just filename, let manifest specify the target path
    { field: "assets", name: "Envimaster.png", data: logoBuf, type: "image/png" },
  ];
  // Manifest maps source filename to target path in working directory
  const manifest = { "Envimaster.png": "images/Envimaster.png" };

  logger.debug(`📷 [PDF] Sending ${files.length} files to remote PDF service`);
  const filesDesc = files.map(f => {
    const sizeBytes = f.data.length;
    return `${f.name} (${sizeBytes} bytes)`;
  }).join(', ');
  logger.debug(`📷 [PDF] Files: ${filesDesc}`);
  logger.debug(`📷 [PDF] Manifest:`, JSON.stringify(manifest));

  try {
    const buffer = await remotePostMultipart("pdf/compile-bundle", files, { assetsManifest: manifest });
    await tidyTempArtifacts({ purgeAll: true });

    const customerName = extractCustomerName(body.customerName, body.headerRows);
    const filename = `${customerName}.pdf`;

    return { buffer, filename };
  } catch (error) {
    logger.error('❌ [PDF COMPILE] PDF compilation failed:', {
      errorType: error.errorType,
      message: error.message,
      url: error.url,
      httpStatus: error.httpStatus,
      timeout: error.timeout
    });

    const comprehensiveError = new Error(error.message || 'PDF compilation failed');

    comprehensiveError.errorType = error.errorType;
    comprehensiveError.originalError = error.originalError || error.message;
    comprehensiveError.errorName = error.errorName || error.name;
    comprehensiveError.url = error.url;
    comprehensiveError.httpStatus = error.httpStatus;
    comprehensiveError.timeout = error.timeout;
    comprehensiveError.detail = error.detail;
    comprehensiveError.stack = error.stack;

    comprehensiveError.latexError = {
      templatePath: PDF_HEADER_TEMPLATE_PATH,
      texLength: tex.length,
      watermark: watermark,
      hasServiceAgreement: !!(body.serviceAgreement && body.serviceAgreement.includeInPdf)
    };

    throw comprehensiveError;
  }
}

function extractCustomerName(customerNameFromBody, headerRows = []) {
  if (customerNameFromBody && customerNameFromBody.trim()) {
    return sanitizeFilename(customerNameFromBody.trim());
  }

  for (const row of headerRows) {
    if (row.labelLeft && row.labelLeft.toUpperCase().includes("CUSTOMER NAME")) {
      const name = row.valueLeft?.trim();
      if (name) return sanitizeFilename(name);
    }
    if (row.labelRight && row.labelRight.toUpperCase().includes("CUSTOMER NAME")) {
      const name = row.valueRight?.trim();
      if (name) return sanitizeFilename(name);
    }
  }

  return "Unnamed_Customer";
}

function sanitizeFilename(name) {
  return name
    .replace(/[^a-zA-Z0-9-_\s]+/g, "_")
    .replace(/\s+/g, "_")
    .substring(0, 80);
}

export async function proxyCompileFileToRemote(file, opts = {}) {
  if (!file?.buffer) {
    const err = new Error("Missing file buffer");
    err.status = 400;
    throw err;
  }
  const files = [
    {
      field: "file",
      name: file.originalname || "doc.tex",
      data: file.buffer,
      type: file.mimetype || "application/x-tex",
    },
  ];
  const buffer = await remotePostMultipart("pdf/compile-file", files, {}, opts);
  await tidyTempArtifacts({ purgeAll: true });
  return { buffer, filename: "document.pdf" };
}

export async function proxyCompileBundleToRemote(mainFile, assets = [], manifest = {}, opts = {}) {
  if (!mainFile?.buffer) {
    const err = new Error("Missing 'main' .tex file");
    err.status = 400;
    throw err;
  }
  const files = [
    {
      field: "main",
      name: mainFile.originalname || "doc.tex",
      data: mainFile.buffer,
      type: mainFile.mimetype || "application/x-tex",
    },
    ...assets.map((f) => ({
      field: "assets",
      name: f.originalname || "asset.bin",
      data: f.buffer,
      type: f.mimetype || "application/octet-stream",
    })),
  ];
  const buffer = await remotePostMultipart("pdf/compile-bundle", files, { assetsManifest: manifest }, opts);
  await tidyTempArtifacts({ purgeAll: true });
  return { buffer, filename: "document.pdf" };
}
