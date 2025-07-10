import { getLocalStorage, setLocalStorage, removeLocalStorage } from './storage';
import api from './api';

export interface SessionData {
  token: string;
  staff: {
    id: string;
    cin: string;
    firstName: string;
    lastName: string;
    role: string;
    phoneNumber?: string;
  };
  expiresAt?: Date;
}

export interface SessionValidationResult {
  isValid: boolean;
  session?: SessionData;
  error?: string;
  source: 'local' | 'server' | 'error';
}

class SessionManager {
  private static instance: SessionManager;
  private currentSession: SessionData | null = null;

  private constructor() {}

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  /**
   * Save session to localStorage
   */
  saveSession(session: SessionData): void {
    try {
      this.currentSession = session;
      setLocalStorage('auth', { token: session.token });
      setLocalStorage('staff', session.staff);
      
      if (session.expiresAt) {
        setLocalStorage('session_expires', session.expiresAt.toISOString());
      }
      
      console.log('💾 Session saved to localStorage');
    } catch (error) {
      console.error('❌ Error saving session:', error);
    }
  }

  /**
   * Load session from localStorage
   */
  loadSession(): SessionData | null {
    try {
      const authData = getLocalStorage('auth');
      const staffData = getLocalStorage('staff');
      const expiresData = getLocalStorage('session_expires');

      if (!authData?.token || !staffData) {
        return null;
      }

      const session: SessionData = {
        token: authData.token,
        staff: staffData,
        expiresAt: expiresData ? new Date(expiresData) : undefined
      };

      this.currentSession = session;
      return session;
    } catch (error) {
      console.error('❌ Error loading session:', error);
      return null;
    }
  }

  /**
   * Validate session with server
   */
  async validateSession(): Promise<SessionValidationResult> {
    try {
      const session = this.loadSession();
      
      if (!session) {
        return {
          isValid: false,
          error: 'No session found',
          source: 'local'
        };
      }

      // Check if session is expired locally
      if (session.expiresAt && session.expiresAt < new Date()) {
        this.clearSession();
        return {
          isValid: false,
          error: 'Session expired',
          source: 'local'
        };
      }

      // Verify with server
      const response = await api.verifyToken();
      
      if (response.success) {
        // Update staff data if server returns different info
        const serverStaff = response.staff || response.data?.staff;
        if (serverStaff) {
          session.staff = { ...session.staff, ...serverStaff };
          setLocalStorage('staff', session.staff);
        }
        
        this.currentSession = session;
        return {
          isValid: true,
          session,
          source: 'server'
        };
      } else {
        // Server says token is invalid
        this.clearSession();
        return {
          isValid: false,
          error: response.message || 'Token validation failed',
          source: 'server'
        };
      }
    } catch (error) {
      console.error('❌ Session validation error:', error);
      return {
        isValid: false,
        error: 'Network error during validation',
        source: 'error'
      };
    }
  }

  /**
   * Clear session from localStorage and memory
   */
  clearSession(): void {
    try {
      this.currentSession = null;
      removeLocalStorage('auth');
      removeLocalStorage('staff');
      removeLocalStorage('session_expires');
      console.log('🧹 Session cleared from localStorage');
    } catch (error) {
      console.error('❌ Error clearing session:', error);
    }
  }

  /**
   * Get current session (from memory or localStorage)
   */
  getCurrentSession(): SessionData | null {
    if (this.currentSession) {
      return this.currentSession;
    }
    return this.loadSession();
  }

  /**
   * Check if session exists and is valid
   */
  async hasValidSession(): Promise<boolean> {
    const result = await this.validateSession();
    return result.isValid;
  }

  /**
   * Refresh session data from server
   */
  async refreshSession(): Promise<boolean> {
    try {
      const session = this.getCurrentSession();
      if (!session) {
        return false;
      }

      const response = await api.verifyToken();
      if (response.success) {
        const serverStaff = response.staff || response.data?.staff;
        if (serverStaff) {
          session.staff = { ...session.staff, ...serverStaff };
          setLocalStorage('staff', session.staff);
          this.currentSession = session;
          console.log('🔄 Session refreshed from server');
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Error refreshing session:', error);
      return false;
    }
  }

  /**
   * Get session info for debugging
   */
  getSessionInfo(): {
    hasSession: boolean;
    hasToken: boolean;
    hasStaff: boolean;
    isExpired: boolean;
    expiresAt?: Date;
  } {
    const session = this.getCurrentSession();
    const now = new Date();
    
    return {
      hasSession: !!session,
      hasToken: !!session?.token,
      hasStaff: !!session?.staff,
      isExpired: session?.expiresAt ? session.expiresAt < now : false,
      expiresAt: session?.expiresAt
    };
  }
}

export default SessionManager; 