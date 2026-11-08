"use client";

import { createContext, useContext, useLayoutEffect, useRef, type RefObject } from "react";

/** Board-level UI state for the Entities board; nodes and edges read it through context (React Flow renders them inside our provider). */
export type FocusRequest = { key: string }; // a fresh object per request, so the same key can be requested again
export interface EntityBoardUi {
  readOnly: boolean;
  fieldTypeListId: string | undefined;
  /** relation id whose kind picker is open */
  pickerFor: string | null;
  closePicker: () => void;
  focus: FocusRequest | null;
  requestFocus: (key: string) => void;
}

export const READ_ONLY_UI: EntityBoardUi = {
  readOnly: true,
  fieldTypeListId: undefined,
  pickerFor: null,
  closePicker: () => {},
  focus: null,
  requestFocus: () => {},
};
export const EntityBoardUiContext = createContext<EntityBoardUi>(READ_ONLY_UI);
export const useEntityBoardUi = () => useContext(EntityBoardUiContext);

export const entityNameKey = (entityId: string) => `name:${entityId}`;
export const fieldNameKey = (fieldId: string) => `field:${fieldId}`;
export const fieldTypeKey = (fieldId: string) => `type:${fieldId}`;

/** Ref for an input that takes focus when `focus.key === key`. Retries per frame (max 30) because a fresh node stays visibility:hidden until React Flow measures it. */
export function useFocusTarget<T extends HTMLElement>(key: string): RefObject<T | null> {
  const { focus } = useEntityBoardUi();
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    if (focus?.key !== key) return;
    let tries = 0;
    let frame = 0;
    const attempt = () => {
      const el = ref.current;
      if (el) {
        el.focus({ preventScroll: true });
        if (document.activeElement === el) return;
      }
      if (++tries < 30) frame = requestAnimationFrame(attempt);
    };
    attempt();
    return () => cancelAnimationFrame(frame);
  }, [focus, key]);
  return ref;
}
