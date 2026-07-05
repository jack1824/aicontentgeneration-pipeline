"use client";

// Session-scoped form persistence: everything a user typed survives navigating
// away and back (the #1 "my work vanished" complaint). Server render uses the
// initial value; the saved snapshot applies after mount (no hydration mismatch).
// sessionStorage on purpose — a browser restart SHOULD start clean.

import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";

export function usePersistentState<T>(
  key: string,
  initial: T,
  opts?: { restore?: boolean }, // false = seeded mount (URL prefill wins over the snapshot)
): [T, Dispatch<SetStateAction<T>>] {
  const restore = opts?.restore ?? true;
  const [value, setValue] = useState<T>(initial);
  const ready = useRef(false);

  useEffect(() => {
    if (restore) {
      try {
        const raw = sessionStorage.getItem(key);
        if (raw != null) setValue(JSON.parse(raw));
      } catch {
        /* corrupt/blocked storage — keep the initial value */
      }
    }
    ready.current = true;
    // restore/key are fixed for a mounted component instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready.current) return; // never overwrite the snapshot before restoring it
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage full/blocked — nonfatal */
    }
  }, [key, value]);

  return [value, setValue];
}
