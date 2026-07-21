import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

const KEY = "bountyops.selected-program";
type ProgramContextValue = { selectedProgramId?: string; setSelectedProgramId: (id?: string) => void };
const ProgramContext = createContext<ProgramContextValue | null>(null);

export function ProgramProvider({ children }: { children: ReactNode }) {
  const [selectedProgramId, setValue] = useState<string | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    return window.localStorage.getItem(KEY) ?? undefined;
  });
  const value = useMemo(() => ({
    selectedProgramId,
    setSelectedProgramId: (id?: string) => {
      setValue(id);
      if (typeof window === "undefined") return;
      if (id) window.localStorage.setItem(KEY, id); else window.localStorage.removeItem(KEY);
    },
  }), [selectedProgramId]);
  return <ProgramContext.Provider value={value}>{children}</ProgramContext.Provider>;
}

export function useSelectedProgram() {
  const context = useContext(ProgramContext);
  if (!context) throw new Error("useSelectedProgram must be used inside ProgramProvider");
  return context;
}