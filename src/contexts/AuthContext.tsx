import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User } from '@/types';

interface AuthContextType {
  user: User | null;
  loginWithToken: (token: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // 检查本地存储中的登录状态
    const storedUser = localStorage.getItem('bd_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const loginWithToken = async (token: string): Promise<boolean> => {
    const raw = String(token || '').trim();
    if (!raw) return false;
    try {
      const res = await fetch(`/api/auth/verify?token=${encodeURIComponent(raw)}`, {
        cache: 'no-store',
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) return false;
      const data = json?.data || {};
      const newUser: User = {
        id: String(data.id || `feishu-${data.openId || 'user'}`),
        username: String(data.username || data.openId || ''),
        name: String(data.name || data.username || data.openId || ''),
      };
      if (!newUser.username || !newUser.name) return false;
      setUser(newUser);
      localStorage.setItem('bd_user', JSON.stringify(newUser));
      return true;
    } catch (e) {
      console.error('[AuthContext] loginWithToken failed:', e);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('bd_user');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loginWithToken,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
