import { createContext, useContext, type ReactNode } from "react";

type SelectionContextValue = {
  account: string;
  group: string;
  setAccount: (account: string) => void;
  setGroup: (group: string) => void;
};

const SelectionContext = createContext<SelectionContextValue | undefined>(undefined);

type SelectionProviderProps = SelectionContextValue & { children: ReactNode };

export function SelectionProvider({
  account,
  group,
  setAccount,
  setGroup,
  children,
}: SelectionProviderProps) {
  return (
    <SelectionContext.Provider value={{ account, group, setAccount, setGroup }}>
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelection() {
  const context = useContext(SelectionContext);
  if (!context) {
    throw new Error("useSelection must be used within SelectionProvider");
  }
  return context;
}
