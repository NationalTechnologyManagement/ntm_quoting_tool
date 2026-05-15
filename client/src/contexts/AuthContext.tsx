import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi, type LoginResponse } from '@/services/api';

interface User {
  id: string;
  email: string;
  role: string;
  name: string | null;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  // Returns the raw login response so the Login page can branch
  // (ok / needs_2fa / needs_setup). The page handles UI transitions;
  // this context just persists the final token.
  login: (email: string, password: string) => Promise<LoginResponse>;
  setSession: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // Try /me unconditionally. If there's a localStorage token, apiRequest
    // sends it as Bearer. If there's a cookie session (GHL-embed flow),
    // the cookie is sent via `credentials: 'include'`. Either path resolves
    // the same user — we only know we're unauthenticated when /me 401s.
    authApi
      .me()
      .then((data) => {
        setIsAuthenticated(true);
        setUser({
          id: data.user.userId,
          email: data.user.email,
          role: data.user.role,
          name: null,
        });
      })
      .catch(() => {
        localStorage.removeItem('adminToken');
        setIsAuthenticated(false);
        setUser(null);
      });
  }, []);

  const login = async (email: string, password: string): Promise<LoginResponse> => {
    const result = await authApi.login(email, password);
    if (result.status === 'ok') {
      localStorage.setItem('adminToken', result.token);
      setIsAuthenticated(true);
      setUser(result.user);
    }
    return result;
  };

  const setSession = (token: string, u: User) => {
    localStorage.setItem('adminToken', token);
    setIsAuthenticated(true);
    setUser(u);
  };

  const logout = () => {
    setIsAuthenticated(false);
    setUser(null);
    localStorage.removeItem('adminToken');
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, setSession, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
