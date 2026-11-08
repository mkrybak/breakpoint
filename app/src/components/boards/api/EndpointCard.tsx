"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { ArrowRight, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import type { ApiEndpoint } from "@/lib/core";
import { INPUT } from "@/components/panels/styles";
import { HTTP_METHODS } from "@/persistence/boards";
import { useDesignStore } from "@/stores/design-store";
import { METHOD_STYLES, statusTone } from "./api-format";
import { JsonField } from "./JsonField";

/**
 * INPUT for an inline row, minus the classes that would beat the row's own
 * width, margin and status tint in the cascade (`mt-1`, `w-full`, `text-neutral-100`).
 */
const ROW_INPUT = INPUT.split(" ")
  .filter((c) => c !== "mt-1" && c !== "w-full" && c !== "text-neutral-100")
  .join(" ");
const CARD ="rounded-lg border border-neutral-800 bg-neutral-900 p-3";
const ICON_BTN =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded text-neutral-400 transition-colors duration-150 hover:text-neutral-100 focus-visible:ring-2 focus-visible:ring-sky-500/40 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-30";

/** One editable endpoint: method, URL, status, request/response JSON. */
export function EndpointCard({
  endpoint,
  index,
  count,
  readOnly,
  autoFocusUrl,
  onAddNext,
  onDeleted,
}: {
  endpoint: ApiEndpoint;
  index: number;
  count: number;
  readOnly: boolean;
  autoFocusUrl: boolean;
  onAddNext: () => void;
  onDeleted: () => void;
}) {
  const updateEndpoint = useDesignStore((s) => s.updateEndpoint);
  const removeEndpoint = useDesignStore((s) => s.removeEndpoint);
  const moveEndpoint = useDesignStore((s) => s.moveEndpoint);
  const update = (patch: Partial<Omit<ApiEndpoint, "id">>) => updateEndpoint(endpoint.id, patch);

  const urlRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<HTMLTextAreaElement>(null);
  const upRef = useRef<HTMLButtonElement>(null);
  const downRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (autoFocusUrl) urlRef.current?.focus();
  }, [autoFocusUrl]);

  const { method, url, status, requestBody, responseBody } = endpoint;

  const move = (dir: -1 | 1) => {
    moveEndpoint(endpoint.id, index + dir);
    requestAnimationFrame(() => {
      const same = dir === -1 ? upRef.current : downRef.current;
      const other = dir === -1 ? downRef.current : upRef.current;
      (same && !same.disabled ? same : other)?.focus();
    });
  };

  const onCardKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (readOnly) return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === "Enter" && mod) {
      e.preventDefault();
      onAddNext();
      return;
    }
    if (!e.altKey || mod) return;
    const up = e.key === "ArrowUp" && index > 0;
    const down = e.key === "ArrowDown" && index < count - 1;
    if (!up && !down) return;
    const el = e.target instanceof HTMLElement ? e.target : null;
    e.preventDefault();
    moveEndpoint(endpoint.id, index + (up ? -1 : 1));
    requestAnimationFrame(() => el?.focus());
  };

  const plainEnter = (e: KeyboardEvent<HTMLInputElement>) =>
    e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;

  return (
    <li aria-label={`Endpoint ${index + 1}`} className={CARD}>
      <div onKeyDown={onCardKeyDown}>
        <div className="flex items-center gap-2">
          <select
            aria-label="HTTP method"
            value={method}
            onChange={(e) => {
              const m = HTTP_METHODS.find((x) => x === e.target.value);
              if (m) update({ method: m });
            }}
            className={`min-h-8 w-24 shrink-0 rounded border bg-neutral-800 px-1.5 font-mono text-xs font-semibold outline-hidden focus:ring-2 focus:ring-sky-500/40 ${METHOD_STYLES[method]}`}
          >
            {HTTP_METHODS.map((m) => (
              <option key={m} value={m} className="bg-neutral-900 text-neutral-100">
                {m}
              </option>
            ))}
          </select>
          <input
            ref={urlRef}
            aria-label="Endpoint URL"
            placeholder="/v1/orders/{id}"
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            value={url}
            onChange={(e) => update({ url: e.target.value })}
            onKeyDown={(e) => {
              if (!plainEnter(e)) return;
              e.preventDefault();
              statusRef.current?.focus();
            }}
            className={`${ROW_INPUT} min-w-0 flex-1 font-mono text-neutral-100`}
          />
          <ArrowRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
          <input
            ref={statusRef}
            aria-label="Response status code"
            placeholder="200"
            inputMode="numeric"
            autoComplete="off"
            value={status}
            onChange={(e) => update({ status: e.target.value })}
            onKeyDown={(e) => {
              if (!plainEnter(e)) return;
              e.preventDefault();
              requestRef.current?.focus();
            }}
            className={`${ROW_INPUT} w-16 shrink-0 font-mono ${statusTone(status)}`}
          />
          <button
            ref={upRef}
            type="button"
            aria-label="Move endpoint up"
            disabled={index === 0}
            onClick={() => move(-1)}
            className={ICON_BTN}
          >
            <ChevronUp aria-hidden className="h-4 w-4" />
          </button>
          <button
            ref={downRef}
            type="button"
            aria-label="Move endpoint down"
            disabled={index === count - 1}
            onClick={() => move(1)}
            className={ICON_BTN}
          >
            <ChevronDown aria-hidden className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Delete endpoint"
            onClick={() => {
              removeEndpoint(endpoint.id);
              onDeleted();
            }}
            className={`${ICON_BTN} hover:text-rose-300`}
          >
            <Trash2 aria-hidden className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <JsonField
            label="Request body"
            ref={requestRef}
            value={requestBody}
            onChange={(v) => update({ requestBody: v })}
            readOnly={readOnly}
            placeholder={'{ "items": [] }'}
          />
          <JsonField
            label="Response body"
            value={responseBody}
            onChange={(v) => update({ responseBody: v })}
            readOnly={readOnly}
            placeholder={'{ "id": "…" }'}
          />
        </div>
      </div>
    </li>
  );
}

/** A review-only endpoint row: no store access, no inputs. */
export function ReadOnlyEndpointCard({ endpoint, index }: { endpoint: ApiEndpoint; index: number }) {
  const { method, url, status, requestBody, responseBody } = endpoint;
  return (
    <li aria-label={`Endpoint ${index + 1}`} className={CARD}>
      <div className="flex items-center gap-2">
        <span
          className={`rounded border px-1.5 py-0.5 font-mono text-xs font-semibold ${METHOD_STYLES[method]}`}
        >
          {method}
        </span>
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-neutral-100">
          {url || "(no URL)"}
        </code>
        {status.trim() !== "" && (
          <>
            <ArrowRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
            <span className={`font-mono text-xs ${statusTone(status)}`}>{status}</span>
          </>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <JsonField label="Request body" value={requestBody} readOnly />
        <JsonField label="Response body" value={responseBody} readOnly />
      </div>
    </li>
  );
}
