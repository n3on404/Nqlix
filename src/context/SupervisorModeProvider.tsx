import React, { createContext, useState, useContext, ReactNode } from "react";

interface SupervisorModeContextType {
  isSupervisorMode: boolean;
  toggleSupervisorMode: () => void;
}

const SupervisorModeContext = createContext<SupervisorModeContextType>({
  isSupervisorMode: false,
  toggleSupervisorMode: () => {},
});

export const useSupervisorMode = () => useContext(SupervisorModeContext);

export const SupervisorModeProvider = ({ children }: { children: ReactNode }) => {
  const [isSupervisorMode, setIsSupervisorMode] = useState(false);

  const toggleSupervisorMode = () => {
    setIsSupervisorMode(!isSupervisorMode);
  };

  return (
    <SupervisorModeContext.Provider value={{
      isSupervisorMode,
      toggleSupervisorMode
    }}>
      {children}
    </SupervisorModeContext.Provider>
  );
}; 