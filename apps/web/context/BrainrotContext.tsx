"use client";

import { createContext, useContext, useState, useEffect } from "react";

const STORAGE_KEY = "on-notice-brainrot";

interface BrainrotContextValue {
  unlocked: boolean;
  active: boolean;
  activate: () => void;
  toggle: () => void;
}

const BrainrotContext = createContext<BrainrotContextValue>({
  unlocked: false,
  active: false,
  activate: () => {},
  toggle: () => {},
});

export function BrainrotProvider({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const { unlocked: u, active: a } = JSON.parse(stored);
        setUnlocked(!!u);
        setActive(!!a);
      }
    } catch {}
  }, []);

  function activate() {
    setUnlocked(true);
    setActive(true);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ unlocked: true, active: true }));
  }

  function toggle() {
    const next = !active;
    setActive(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ unlocked: true, active: next }));
  }

  return (
    <BrainrotContext.Provider value={{ unlocked, active, activate, toggle }}>
      {children}
    </BrainrotContext.Provider>
  );
}

export function useBrainrot() {
  return useContext(BrainrotContext);
}
