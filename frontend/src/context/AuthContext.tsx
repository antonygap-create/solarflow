import React, { createContext, useContext, useState, useEffect } from 'react';
import type { TokenResponse, UserAuthInfo } from '../types/solar';

interface AuthContextType {
  token: string | null;
  user: UserAuthInfo | null;
  isAuthenticated: boolean;
  tenantSlug: string;
  login: (data: TokenResponse) => void;
  logout: () => void;
  setTenantSlug: (slug: string) => void;
  getAuthHeader: () => Record<string, string>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize token securely from localStorage on initial render
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('jwt_token') || localStorage.getItem('solarflow_token');
  });

  // Initialize user securely from localStorage on initial render
  const [user, setUser] = useState<UserAuthInfo | null>(() => {
    const savedUser = localStorage.getItem('jwt_user') || localStorage.getItem('solarflow_user');
    if (!savedUser) return null;
    try {
      return JSON.parse(savedUser);
    } catch {
      return null;
    }
  });

  const [tenantSlug, setTenantSlug] = useState<string>('default-installer');

  // Persist token changes to localStorage
  useEffect(() => {
    if (token) {
      localStorage.setItem('jwt_token', token);
      localStorage.setItem('solarflow_token', token);
    } else {
      localStorage.removeItem('jwt_token');
      localStorage.removeItem('solarflow_token');
    }
  }, [token]);

  // Persist user info changes to localStorage
  useEffect(() => {
    if (user) {
      localStorage.setItem('jwt_user', JSON.stringify(user));
      localStorage.setItem('solarflow_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('jwt_user');
      localStorage.removeItem('solarflow_user');
    }
  }, [user]);

  const login = (data: TokenResponse) => {
    const newToken = data.access_token;
    const userInfo: UserAuthInfo = {
      user_id: data.user_id,
      email: data.email,
      full_name: data.full_name,
      tenant_id: data.tenant_id,
      tenant_name: data.tenant_name,
    };

    localStorage.setItem('jwt_token', newToken);
    localStorage.setItem('solarflow_token', newToken);
    localStorage.setItem('jwt_user', JSON.stringify(userInfo));
    localStorage.setItem('solarflow_user', JSON.stringify(userInfo));

    setToken(newToken);
    setUser(userInfo);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('jwt_token');
    localStorage.removeItem('solarflow_token');
    localStorage.removeItem('jwt_user');
    localStorage.removeItem('solarflow_user');
  };

  const getAuthHeader = (): Record<string, string> => {
    const currentToken = token || localStorage.getItem('jwt_token') || localStorage.getItem('solarflow_token');
    return currentToken ? { Authorization: `Bearer ${currentToken}` } : {};
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isAuthenticated: !!token,
        tenantSlug,
        login,
        logout,
        setTenantSlug,
        getAuthHeader,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
