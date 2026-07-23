import { createContext, useContext, type ReactNode } from "react";
import type { AppController } from "./hooks/useAppController";

const AppControllerContext = createContext<AppController | null>(null);

export function AppControllerProvider({
  value,
  children,
}: {
  value: AppController;
  children: ReactNode;
}) {
  return (
    <AppControllerContext.Provider value={value}>
      {children}
    </AppControllerContext.Provider>
  );
}

export function useAppControllerContext() {
  const value = useContext(AppControllerContext);
  if (!value) throw new Error("AppControllerProvider chưa được khởi tạo.");
  return value;
}
