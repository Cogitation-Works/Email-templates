import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { useAuth } from "./context/AuthContext";
import { AdminPage } from "./pages/AdminPage";
import { HistoryPage } from "./pages/HistoryPage";
import { LogsPage } from "./pages/LogsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SignInPage } from "./pages/SignInPage";
import { WorkspacePage } from "./pages/WorkspacePage";

function AuthLoadingScreen({ message }: { message: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[var(--bg)] text-[var(--text)]">
      <div className="flex flex-col items-center gap-4">
        <img
          alt="Cogitation Works"
          className="h-12 w-12 object-contain"
          src="/cw-logo.png"
        />
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--accent)]" />
        <p className="text-sm text-[var(--muted)]">{message}</p>
      </div>
    </div>
  );
}

function ProtectedRoute({
  children,
  roles,
}: {
  children: React.ReactNode;
  roles?: Array<"super_admin" | "user">;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <AuthLoadingScreen message="Preparing command center..." />;
  }

  if (!user) {
    return <Navigate replace state={{ from: location }} to="/signin" />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate replace to="/workspace" />;
  }

  if (user.must_change_password && location.pathname !== "/settings") {
    return <Navigate replace to="/settings" />;
  }

  return <>{children}</>;
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      <Route
        element={
          loading ? (
            <AuthLoadingScreen message="Checking your session..." />
          ) : user ? (
            <Navigate replace to="/workspace" />
          ) : (
            <Navigate replace to="/signin" />
          )
        }
        path="/"
      />
      <Route
        element={
          loading ? (
            <AuthLoadingScreen message="Checking your session..." />
          ) : user ? (
            <Navigate replace to="/workspace" />
          ) : (
            <SignInPage />
          )
        }
        path="/signin"
      />
      <Route
        element={
          <ProtectedRoute roles={["super_admin", "user"]}>
            <WorkspacePage />
          </ProtectedRoute>
        }
        path="/workspace"
      />
      <Route
        element={
          <ProtectedRoute roles={["super_admin", "user"]}>
            <HistoryPage />
          </ProtectedRoute>
        }
        path="/history"
      />
      <Route
        element={
          <ProtectedRoute roles={["super_admin", "user"]}>
            <SettingsPage />
          </ProtectedRoute>
        }
        path="/settings"
      />
      <Route
        element={
          <ProtectedRoute roles={["super_admin"]}>
            <AdminPage />
          </ProtectedRoute>
        }
        path="/admin"
      />
      <Route
        element={
          <ProtectedRoute roles={["super_admin"]}>
            <LogsPage />
          </ProtectedRoute>
        }
        path="/logs"
      />
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  );
}
