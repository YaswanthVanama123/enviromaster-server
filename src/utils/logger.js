const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

function isProd() {
  return process.env.NODE_ENV === "production";
}

function threshold() {
  const raw = (process.env.LOG_LEVEL || "").toLowerCase();
  if (LEVELS[raw] != null) return LEVELS[raw];
  return isProd() ? LEVELS.info : LEVELS.debug;
}

function safeStringify(value) {
  const seen = new WeakSet();
  try {
    return JSON.stringify(value, (key, val) => {
      if (typeof val === "object" && val !== null) {
        if (seen.has(val)) return "[Circular]";
        seen.add(val);
      }
      if (typeof val === "bigint") return val.toString();
      return val;
    });
  } catch {
    return String(value);
  }
}

function format(arg) {
  if (arg instanceof Error) return arg.stack || arg.message;
  if (typeof arg === "object" && arg !== null) return safeStringify(arg);
  return String(arg);
}

function emit(level, args) {
  if (LEVELS[level] > threshold()) return;
  const ts = new Date().toISOString();

  if (isProd()) {
    const msg = args.map(format).join(" ");
    const line = safeStringify({ t: ts, level, msg }) + "\n";
    if (level === "error" || level === "warn") process.stderr.write(line);
    else process.stdout.write(line);
    return;
  }

  const native =
    level === "error"
      ? console.error
      : level === "warn"
      ? console.warn
      : console.log;
  native(`[${ts}] ${level.toUpperCase()}`, ...args);
}

const logger = {
  error: (...args) => emit("error", args),
  warn: (...args) => emit("warn", args),
  info: (...args) => emit("info", args),
  debug: (...args) => emit("debug", args),
  level: () =>
    Object.keys(LEVELS).find((k) => LEVELS[k] === threshold()) || "info",
  stream: {
    write: (line) => emit("info", [String(line).trim()]),
  },
};

export default logger;
