type Level = "info" | "warn" | "error";

type Meta = Record<string, unknown>;

/** Emit a single structured JSON log line. */
function emit(level: Level, msg: string, meta?: Meta): void {
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    msg,
    ...meta,
  });

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/** Tiny dependency-free structured logger. */
export const logger = {
  info: (msg: string, meta?: Meta) => emit("info", msg, meta),
  warn: (msg: string, meta?: Meta) => emit("warn", msg, meta),
  error: (msg: string, meta?: Meta) => emit("error", msg, meta),
};
