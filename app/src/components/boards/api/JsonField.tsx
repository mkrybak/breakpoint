"use client";

import { useId, useMemo, type Ref } from "react";
import { FIELD_LABEL } from "@/components/panels/styles";
import { jsonStatus, TOKEN_CLASS, tokenizeJson } from "./api-format";

const LAYER =
  "m-0 min-h-24 w-full px-2 py-1.5 font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-break-word";

/**
 * A JSON body field: a colored <pre> sets the height and a transparent
 * <textarea> on top takes the input, so the caret sits on the colored glyphs.
 * The value is never transformed; invalid JSON only gets a hint.
 */
export function JsonField({
  label,
  value,
  onChange,
  readOnly = false,
  placeholder,
  ref,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  ref?: Ref<HTMLTextAreaElement>;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const status = useMemo(() => jsonStatus(value), [value]);
  const tokens = useMemo(() => tokenizeJson(value), [value]);

  return (
    <div>
      {readOnly ? (
        <span id={id} className={FIELD_LABEL}>
          {label}
        </span>
      ) : (
        <label htmlFor={id} className={FIELD_LABEL}>
          {label}
        </label>
      )}
      <div className="relative mt-1 rounded border border-neutral-700 bg-neutral-800 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-500/40">
        <pre
          aria-hidden={!readOnly || undefined}
          aria-labelledby={readOnly ? id : undefined}
          className={`${LAYER} text-neutral-200`}
        >
          {readOnly && value === "" ? (
            <span className="text-neutral-600">empty</span>
          ) : (
            tokens.map((t, i) => (
              <span key={i} className={TOKEN_CLASS[t.kind]}>
                {t.text}
              </span>
            ))
          )}{" "}
        </pre>
        {!readOnly && (
          <textarea
            id={id}
            ref={ref}
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            placeholder={placeholder}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            aria-invalid={status === "invalid"}
            aria-describedby={status === "invalid" ? hintId : undefined}
            className={`${LAYER} absolute inset-0 h-full resize-none overflow-hidden bg-transparent text-transparent caret-neutral-100 outline-hidden placeholder:text-neutral-600 selection:bg-sky-500/30`}
          />
        )}
      </div>
      <p id={hintId} className="mt-1 h-4 text-[10px] text-amber-400/80">
        {status === "invalid" ? "not valid JSON" : ""}
      </p>
    </div>
  );
}
