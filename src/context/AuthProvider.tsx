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
  login: (staff: Staff, token?: string) => void;
  logout: () => Promise<void>;
  initiateLogin: (cin: string) => Promise<any>;
  verifyLogin: (cin: string, verificationCode: string) => Promise<any>;
  isLoading: boolean;
  restoreSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextInterface>({
  isAuthenticated: false,
  currentStaff: null,
  login: () => {},
  logout: async () => {},
  initiateLogin: async () => ({}),
  verifyLogin: async () => ({}),
  isLoading: true,
  restoreSession: async () => false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentStaff, setCurrentStaff] = useState<Staff | null>(null);
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
        setIsAuthenticated(true);
        return true;
      } else {
        console.log('❌ Stored session is invalid, clearing...');
        sessionManager.clearSession();
        setIsAuthenticated(false);
        setCurrentStaff(null);
        return false;
      }
    } catch (error) {
      console.error('❌ Error restoring session:', error);
      sessionManager.clearSession();
      setIsAuthenticated(false);
      setCurrentStaff(null);
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
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = (staff: Staff, token?: string) => {
    setIsAuthenticated(true);
    setCurrentStaff(staff);
    
    // Save session if token is provided
    if (token) {
      sessionManager.saveSession({
        token,
        staff,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      });
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
      sessionManager.clearSession();
    }
  };

  const initiateLogin = async (cin: string) => {
    try {
      const response = await api.initiateLogin(cin);
      return response;
    } catch (error) {
      console.error('❌ Login initiation error:', error);
      return {
        success: false,
        message: 'Failed to connect to authentication server',
        code: 'CONNECTION_ERROR'
      };
    }
  };

  const verifyLogin = async (cin: string, verificationCode: string) => {
    try {
      const response = await api.verifyLogin(cin, verificationCode);
      
      if (response.success && response.staff) {
        console.log('✅ Login successful, saving session...');
        login(response.staff, response.token);
      }
      
      return response;
    } catch (error) {
      console.error('❌ Verification error:', error);
      return {
        success: false,
        message: 'Failed to verify code',
        code: 'VERIFICATION_ERROR'
      };
    }
  };

  return (
    <AuthContext.Provider value={{
      isAuthenticated,
      currentStaff,
      login,
      logout,
      initiateLogin,
      verifyLogin,
      isLoading,
      restoreSession
    }}>
      {children}
    </AuthContext.Provider>
  );
}; 