import React, { createContext, useState, useContext, useEffect, ReactNode } from "react";
import api from "../lib/api";
import SessionManager from "../lib/sessionManager";

// Staff interface
interface Staff {
  id: string;
  cin: string;
  firstName: string;
  lastName: string;
  role: string;
  phoneNumber?: string;
}

interface AuthContextInterface {
  isAuthenticated: boolean;
  currentStaff: Staff | null;
  selectedRoute: string | null;
  login: (cin: string, route?: string) => Promise<any>;
  logout: () => Promise<void>;
  isLoading: boolean;
  restoreSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextInterface>({
  isAuthenticated: false,
  currentStaff: null,
  selectedRoute: null,
  login: async () => ({}),
  logout: async () => {},
  isLoading: true,
  restoreSession: async () => false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentStaff, setCurrentStaff] = useState<Staff | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const sessionManager = SessionManager.getInstance();

  /**
   * Restore session from localStorage and verify with server
   */
  const restoreSession = async (): Promise<boolean> => {
    try {
      console.log('🔍 Restoring session from localStorage...');
      
      const validationResult = await sessionManager.validateSession();
      
      if (validationResult.isValid && validationResult.session) {
        console.log('✅ Session restored successfully');
        setCurrentStaff(validationResult.session.staff);
        setSelectedRoute(validationResult.session.selectedRoute || null);
        setIsAuthenticated(true);
        return true;
      } else {
        console.log('❌ Stored session is invalid, clearing...');
        sessionManager.clearSession();
        setIsAuthenticated(false);
        setCurrentStaff(null);
        setSelectedRoute(null);
        return false;
      }
    } catch (error) {
      console.error('❌ Error restoring session:', error);
      sessionManager.clearSession();
      setIsAuthenticated(false);
      setCurrentStaff(null);
      setSelectedRoute(null);
      return false;
    }
  };

  // Check for existing authentication on app start
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        await restoreSession();
      } catch (error) {
        console.error('❌ Error during auth initialization:', error);
        // Clear any invalid data
        sessionManager.clearSession();
        setIsAuthenticated(false);
        setCurrentStaff(null);
        setSelectedRoute(null);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = async (cin: string, route?: string) => {
    try {
      const response = await api.login(cin, route);
      
      if (response.success && response.staff) {
        console.log('✅ Login successful, saving session...');
        setIsAuthenticated(true);
        setCurrentStaff(response.staff);
        setSelectedRoute(route || null);
        
        // Save session with route information
        if (response.token) {
          sessionManager.saveSession({
            token: response.token,
            staff: response.staff,
            selectedRoute: route || null,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
          });
        }
      }
      
      return response;
    } catch (error) {
      console.error('❌ Login error:', error);
      return {
        success: false,
        message: 'Failed to connect to authentication server',
        code: 'CONNECTION_ERROR'
      };
    }
  };

  const logout = async () => {
    try {
      // Call logout API
      await api.logout();
    } catch (error) {
      console.error('❌ Error during logout:', error);
    } finally {
      // Clear local state regardless of API response
      setIsAuthenticated(false);
      setCurrentStaff(null);
      setSelectedRoute(null);
      sessionManager.clearSession();
    }
  };

  return (
    <AuthContext.Provider value={{
      isAuthenticated,
      currentStaff,
      selectedRoute,
      login,
      logout,
      isLoading,
      restoreSession
    }}>
      {children}
    </AuthContext.Provider>
  );
}; 