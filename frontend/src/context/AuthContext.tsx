import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { useLocation } from "react-router-dom";

import { ApiError, api } from "../api/client";
import type {
  EmailChangeStartResponse,
  ForgotPasswordStartResponse,
  LoginChallengeResponse,
  User,
} from "../types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  refreshSession: () => Promise<void>;
  startSignIn: (
    email: string,
    password: string,
    rememberMe: boolean,
  ) => Promise<LoginChallengeResponse>;
  verifyOtp: (challengeId: string, otpCode: string) => Promise<void>;
  startForgotPassword: (email: string) => Promise<ForgotPasswordStartResponse>;
  verifyForgotPasswordOtp: (
    challengeId: string,
    otpCode: string,
  ) => Promise<string>;
  resetForgotPassword: (
    challengeId: string,
    newPassword: string,
  ) => Promise<string>;
  startEmailChange: (newEmail: string) => Promise<EmailChangeStartResponse>;
  verifyEmailChangeOtp: (
    challengeId: string,
    otpCode: string,
    target: "current" | "new",
  ) => Promise<{
    message: string;
    current_email_verified: boolean;
    new_email_verified: boolean;
  }>;
  confirmEmailChange: (challengeId: string) => Promise<string>;
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<string>;
  updateProfile: (payload: {
    full_name?: string;
    phone?: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = async () => {
    setLoading(true);

    try {
      const response = await api.me();
      setUser(response.user ?? null);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) {
        console.error(error);
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshSession();
  }, [location.pathname]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      refreshSession,
      startSignIn: (email, password, rememberMe) =>
        api.startSignIn(email, password, rememberMe),
      verifyOtp: async (challengeId, otpCode) => {
        const response = await api.verifyOtp(challengeId, otpCode);
        if (!response.user) {
          throw new Error("Unable to establish an authenticated session.");
        }
        setUser(response.user);
      },
      startForgotPassword: (email) => api.startForgotPassword(email),
      verifyForgotPasswordOtp: async (challengeId, otpCode) => {
        const response = await api.verifyForgotPasswordOtp(
          challengeId,
          otpCode,
        );
        return response.message;
      },
      resetForgotPassword: async (challengeId, newPassword) => {
        const response = await api.resetForgotPassword(
          challengeId,
          newPassword,
        );
        return response.message;
      },
      startEmailChange: (newEmail) => api.startEmailChange(newEmail),
      verifyEmailChangeOtp: (challengeId, otpCode, target) =>
        api.verifyEmailChangeOtp(challengeId, otpCode, target),
      confirmEmailChange: async (challengeId) => {
        const response = await api.confirmEmailChange(challengeId);
        setUser(response.user);
        return response.message;
      },
      changePassword: async (currentPassword, newPassword) => {
        const response = await api.changePassword(currentPassword, newPassword);
        await refreshSession();
        return response.message;
      },
      updateProfile: async (payload) => {
        const response = await api.updateProfile(payload);
        setUser(response.user);
      },
      signOut: async () => {
        await api.signOut();
        setUser(null);
      },
    }),
    [loading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
