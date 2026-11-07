"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";

/** Dependency-free disclosure menu: closes on Escape and on a pointer down outside. */
export function MenuButton({
  label,
  icon: Icon,
  children,
  iconOnly = false,
  align = "start",
}: {
  label: string;
  icon: LucideIcon;
  children: (close: () => void) => ReactNode;
  /** icon-only trigger: `label` becomes aria-label + tooltip, no text, no chevron (T-12.8) */
  iconOnly?: boolean;
  /** which trigger edge the menu lines up with; "end" for menus at the right end of a bar */
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={iconOnly ? label : undefined}
        title={iconOnly ? label : undefined}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-8 items-center rounded-lg whitespace-nowrap border border-neutral-700 bg-neutral-900 ${
          iconOnly ? "w-8 justify-center" : "gap-1.5 px-3"
        } text-xs font-medium text-neutral-300 transition-colors duration-150 hover:border-neutral-500 hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 aria-expanded:border-neutral-500 aria-expanded:text-neutral-100`}
      >
        {iconOnly ? (
          <Icon className="h-4 w-4" />
        ) : (
          <>
            <Icon className="h-3.5 w-3.5" />
            {label}
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform duration-150 ${
                open ? "rotate-180" : ""
              }`}
            />
          </>
        )}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={`absolute top-full ${
            align === "end" ? "right-0" : "left-0"
          } z-30 mt-2 w-80 rounded-xl border border-neutral-700 bg-neutral-900 p-1.5 shadow-xl shadow-black/40`}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon: Icon,
  title,
  description,
  meta,
  checked,
  onSelect,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  meta?: string;
  /** set → menuitemradio */
  checked?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role={checked === undefined ? "menuitem" : "menuitemradio"}
      aria-checked={checked}
      onClick={onSelect}
      className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-150 hover:bg-neutral-800 focus-visible:bg-neutral-800 focus-visible:outline-none"
    >
      <span className="mt-0.5 h-4 w-4 shrink-0">
        {checked !== undefined ? (
          checked ? (
            <Check className="h-4 w-4 text-sky-400" />
          ) : (
            <span className="block h-4 w-4" />
          )
        ) : (
          Icon && <Icon className="h-4 w-4 text-neutral-400" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-neutral-100">
          {title}
        </span>
        {description && (
          <span className="block text-xs leading-snug text-neutral-400">
            {description}
          </span>
        )}
        {meta && (
          <span className="mt-0.5 block font-mono text-[10px] text-neutral-500">
            {meta}
          </span>
        )}
      </span>
    </button>
  );
}
