import type { HttpMethod } from "@/lib/core";
// HTTP_METHODS comes from @/persistence/boards (T-13.1); do not redefine it here.

/** Tint per method (border + text); key order is the picker order. */
export const METHOD_STYLES: Record<HttpMethod, string> = {
  GET: "border-sky-500/50 text-sky-300",
  POST: "border-emerald-500/50 text-emerald-300",
  PUT: "border-amber-500/50 text-amber-300",
  PATCH: "border-violet-500/50 text-violet-300",
  DELETE: "border-rose-500/50 text-rose-300",
};

/** Text tint for a raw status string by class (2xx…5xx); never validates. */
export function statusTone(status: string): string {
  const s = status.trim();
  if (/^2\d\d$/.test(s)) return "text-emerald-300";
  if (/^3\d\d$/.test(s)) return "text-sky-300";
  if (/^4\d\d$/.test(s)) return "text-amber-300";
  if (/^5\d\d$/.test(s)) return "text-rose-300";
  return "text-neutral-100";
}

export type JsonStatus = "empty" | "valid" | "invalid";

/** Whitespace-only counts as empty (no hint); otherwise JSON.parse decides. */
export function jsonStatus(text: string): JsonStatus {
  if (text.trim() === "") return "empty";
  try {
    JSON.parse(text);
    return "valid";
  } catch {
    return "invalid";
  }
}

export type JsonTokenKind = "key" | "string" | "number" | "literal" | "punct" | "text";
export interface JsonToken {
  kind: JsonTokenKind;
  text: string;
}

export const TOKEN_CLASS: Record<JsonTokenKind, string> = {
  key: "text-sky-300",
  string: "text-emerald-300",
  number: "text-amber-300",
  literal: "text-violet-300",
  punct: "text-neutral-500",
  text: "text-neutral-200",
};

// One sticky scan; every alternative consumes >= 1 char, so the loop ends and
// the token texts concatenate back to the input exactly (any input, valid or not).
const TOKEN_RE =
  /("(?:[^"\\\n]|\\.)*"?)(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(true|false|null)(?![A-Za-z0-9_])|([{}[\],:])|([^"\-\d{}[\],:tfn]+|[\s\S])/y;

/** Lossless, forgiving JSON tokens for coloring; half-typed input is fine. */
export function tokenizeJson(text: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  const push = (kind: JsonTokenKind, t: string) => {
    const last = tokens[tokens.length - 1];
    if (last !== undefined && last.kind === "text" && kind === "text") last.text += t;
    else tokens.push({ kind, text: t });
  };
  TOKEN_RE.lastIndex = 0;
  while (TOKEN_RE.lastIndex < text.length) {
    const m = TOKEN_RE.exec(text);
    if (m === null) break;
    if (m[1] !== undefined) {
      if (m[2] !== undefined) {
        push("key", m[1]);
        if (m[2].length > 1) push("text", m[2].slice(0, -1));
        push("punct", ":");
      } else push("string", m[1]);
    } else if (m[3] !== undefined) push("number", m[3]);
    else if (m[4] !== undefined) push("literal", m[4]);
    else if (m[5] !== undefined) push("punct", m[5]);
    else push("text", m[0]);
  }
  return tokens;
}
