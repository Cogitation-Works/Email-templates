import { motion } from "framer-motion";
import {
  Download,
  Filter,
  RefreshCw,
  Search,
  UserRoundPlus,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "../api/client";
import {
  ActionToast,
  actionToastDurationMs,
  type ActionToastState,
} from "../components/ActionToast";
import { AppShell } from "../components/AppShell";
import { Field } from "../components/Field";
import { StatusPill } from "../components/StatusPill";
import { UserCard } from "../components/UserCard";
import type {
  ManagedUserCreateResponse,
  ManagedUserPasswordResetResponse,
  User,
} from "../types";

const initialForm = {
  full_name: "",
  email: "",
  phone: "",
  can_view_team_history: false,
  can_use_sales_sender: false,
  can_use_admin_sender: false,
  new_password: "",
};

function sectionMotion(delay: number) {
  return {
    initial: { opacity: 0, y: 22 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.2 },
    transition: { duration: 0.45, delay, ease: "easeOut" as const },
  };
}

type RoleFilter = "all" | "super_admin" | "user";
type StatusFilter = "all" | "active" | "pending";

export function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState(initialForm);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<
    "loading" | "create" | "update" | "delete" | "reset" | null
  >("loading");
  const [selectedBusyUserId, setSelectedBusyUserId] = useState<string | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const [credentialResult, setCredentialResult] = useState<
    ManagedUserCreateResponse | ManagedUserPasswordResetResponse | null
  >(null);
  const composerRef = useRef<HTMLElement | null>(null);
  const directoryRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeoutId = window.setTimeout(
      () => setToast(null),
      actionToastDurationMs,
    );
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const showToast = (kind: ActionToastState["kind"], message: string) => {
    setToast({ id: Date.now(), kind, message });
  };

  const scrollToSection = (target: HTMLElement | null) => {
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const loadUsers = async () => {
    try {
      setBusyAction("loading");
      const response = await api.listUsers();
      setUsers(response);
      return true;
    } catch (err) {
      showToast(
        "error",
        err instanceof Error ? err.message : "Unable to load users.",
      );
      return false;
    } finally {
      setBusyAction(null);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const resetForm = () => {
    setForm(initialForm);
    setEditingUserId(null);
  };

  const handleSubmit = async () => {
    if (!form.full_name.trim() || !form.email.trim()) {
      showToast(
        "error",
        "Name and email are required before saving this user.",
      );
      return;
    }

    try {
      if (editingUserId) {
        setBusyAction("update");
        await api.updateUser(editingUserId, {
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          can_view_team_history: form.can_view_team_history,
          can_use_sales_sender: form.can_use_sales_sender,
          can_use_admin_sender: form.can_use_admin_sender,
          new_password: form.new_password.trim() || undefined,
        });
        setCredentialResult(null);
        showToast("success", "User access updated successfully.");
      } else {
        setBusyAction("create");
        const response = await api.createUser({
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          can_view_team_history: form.can_view_team_history,
          can_use_sales_sender: form.can_use_sales_sender,
          can_use_admin_sender: form.can_use_admin_sender,
        });
        setCredentialResult(response);
        showToast("success", "User created and onboarding email prepared.");
      }

      resetForm();
      await loadUsers();
    } catch (err) {
      showToast(
        "error",
        err instanceof Error ? err.message : "Unable to save user.",
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleEdit = (user: User) => {
    setEditingUserId(user.id);
    setForm({
      full_name: user.full_name,
      email: user.email,
      phone: user.phone ?? "",
      can_view_team_history: user.can_view_team_history,
      can_use_sales_sender: user.can_use_sales_sender,
      can_use_admin_sender: user.can_use_admin_sender,
      new_password: "",
    });
    scrollToSection(composerRef.current);
    showToast(
      "info",
      `Editing ${user.full_name}. Update the fields and save when ready.`,
    );
  };

  const handleDelete = async (user: User) => {
    const confirmed = window.confirm(
      `Delete ${user.full_name}? This cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    try {
      setSelectedBusyUserId(user.id);
      setBusyAction("delete");
      await api.deleteUser(user.id);
      showToast("success", `${user.full_name} was removed from the workspace.`);
      await loadUsers();
    } catch (err) {
      showToast(
        "error",
        err instanceof Error ? err.message : "Unable to delete user.",
      );
    } finally {
      setSelectedBusyUserId(null);
      setBusyAction(null);
    }
  };

  const handleResetPassword = async (user: User) => {
    try {
      setSelectedBusyUserId(user.id);
      setBusyAction("reset");
      const response = await api.resendUserPassword(user.id);
      setCredentialResult(response);
      showToast(
        "success",
        `Fresh credentials were generated for ${user.full_name}.`,
      );
    } catch (err) {
      showToast(
        "error",
        err instanceof Error ? err.message : "Unable to resend password.",
      );
    } finally {
      setSelectedBusyUserId(null);
      setBusyAction(null);
    }
  };

  const handleCreateNewUser = () => {
    resetForm();
    setCredentialResult(null);
    scrollToSection(composerRef.current);
    showToast("info", "User composer is ready for a new user.");
  };

  const handleRefreshUsers = async () => {
    const refreshed = await loadUsers();
    if (refreshed) {
      showToast("success", "User directory refreshed.");
    }
  };

  const stats = useMemo(
    () => ({
      total: users.length,
      teamHistory: users.filter((item) => item.can_view_team_history).length,
      sales: users.filter((item) => item.can_use_sales_sender).length,
      admin: users.filter((item) => item.can_use_admin_sender).length,
    }),
    [users],
  );

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return users.filter((user) => {
      const roleMatch = roleFilter === "all" ? true : user.role === roleFilter;
      const statusMatch =
        statusFilter === "all"
          ? true
          : statusFilter === "active"
            ? Boolean(user.last_login)
            : !user.last_login;
      const searchMatch = normalizedQuery
        ? `${user.full_name} ${user.email} ${user.phone ?? ""} ${user.role}`
            .toLowerCase()
            .includes(normalizedQuery)
        : true;

      return roleMatch && statusMatch && searchMatch;
    });
  }, [query, roleFilter, statusFilter, users]);

  const cycleRoleFilter = () => {
    const next: Record<RoleFilter, RoleFilter> = {
      all: "super_admin",
      super_admin: "user",
      user: "all",
    };
    const nextFilter = next[roleFilter];
    setRoleFilter(nextFilter);
    showToast(
      "info",
      nextFilter === "all"
        ? "Showing every user role."
        : nextFilter === "super_admin"
          ? "Showing super admin users only."
          : "Showing standard users only.",
    );
  };

  const cycleStatusFilter = () => {
    const next: Record<StatusFilter, StatusFilter> = {
      all: "active",
      active: "pending",
      pending: "all",
    };
    const nextFilter = next[statusFilter];
    setStatusFilter(nextFilter);
    showToast(
      "info",
      nextFilter === "all"
        ? "Showing all user statuses."
        : nextFilter === "active"
          ? "Showing active users only."
          : "Showing pending users only.",
    );
  };

  const exportUsersCsv = () => {
    if (filteredUsers.length === 0) {
      showToast("info", "There are no users in the current view to export.");
      return;
    }

    const rows = [
      [
        "Name",
        "Email",
        "Phone",
        "Role",
        "Team History",
        "Sales Sender",
        "Admin Sender",
        "Last Login",
      ],
      ...filteredUsers.map((user) => [
        user.full_name,
        user.email,
        user.phone ?? "",
        user.role,
        String(user.can_view_team_history),
        String(user.can_use_sales_sender),
        String(user.can_use_admin_sender),
        user.last_login ?? "",
      ]),
    ]
      .map((row) =>
        row
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\n");

    const blob = new Blob([rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "cogitation-works-users.csv";
    link.click();
    URL.revokeObjectURL(url);
    showToast(
      "success",
      `Exported ${filteredUsers.length} user records to CSV.`,
    );
  };

  return (
    <>
      <ActionToast toast={toast} />
      <AppShell
        actions={
          <>
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--surface-muted)] px-4 py-2.5 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--surface-high)]"
              onClick={exportUsersCsv}
              type="button"
            >
              <Download className="h-4 w-4" />
              <span>Export CSV</span>
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-black text-white transition hover:brightness-110"
              onClick={handleCreateNewUser}
              type="button"
            >
              <UserRoundPlus className="h-4 w-4" />
              <span>Create New User</span>
            </button>
          </>
        }
        description="Create users, control sender permissions, refresh passwords, and manage internal access from one production-ready admin workspace."
        eyebrow="Super Admin View"
        onSearchChange={setQuery}
        searchPlaceholder="Search users..."
        searchValue={query}
        sidebarAction={
          <button
            className="mx-2 mb-8 inline-flex w-[calc(100%-1rem)] items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-black text-white transition hover:brightness-110"
            onClick={handleCreateNewUser}
            type="button"
          >
            <UserRoundPlus className="h-4 w-4" />
            <span>Create User</span>
          </button>
        }
        title="User Access Control"
      >
        <motion.section
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
          id="overview"
          {...sectionMotion(0.02)}
        >
          {[
            {
              label: "Total users",
              value: stats.total,
              badge: "Directory",
              tone: "accent",
              onClick: () => setRoleFilter("all"),
            },
            {
              label: "Team history",
              value: stats.teamHistory,
              badge: "Shared",
              tone: "accent",
              onClick: () => setStatusFilter("all"),
            },
            {
              label: "Sales access",
              value: stats.sales,
              badge: "Sales",
              tone: "secondary",
              onClick: () => setRoleFilter("user"),
            },
            {
              label: "Admin access",
              value: stats.admin,
              badge: "Admin",
              tone: "secondary",
              onClick: () => setRoleFilter("super_admin"),
            },
          ].map((item) => (
            <motion.button
              className="surface-panel rounded-2xl p-6 text-left"
              key={item.label}
              onClick={() => {
                item.onClick();
                scrollToSection(directoryRef.current);
                showToast(
                  "info",
                  `${item.label} metric is now highlighted in the current view.`,
                );
              }}
              type="button"
              whileHover={{ y: -6, scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-label text-[11px] font-extrabold uppercase tracking-[0.22em] text-[var(--soft)]">
                  {item.label}
                </p>
                <StatusPill
                  label={item.badge}
                  tone={item.tone as "accent" | "secondary"}
                />
              </div>
              <p className="mt-4 text-4xl font-black tracking-tight">
                {item.value}
              </p>
            </motion.button>
          ))}
        </motion.section>

        <motion.section
          className="surface-panel mt-6 flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-center sm:justify-between"
          {...sectionMotion(0.04)}
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 text-sm font-bold">
              <Filter className="h-4 w-4 text-[var(--accent)]" />
              <span>Filters</span>
            </span>
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--surface-high)] px-4 py-2 text-sm font-medium transition hover:bg-[var(--surface-soft)]"
              onClick={cycleRoleFilter}
              type="button"
            >
              <span>
                Role:{" "}
                {roleFilter === "all"
                  ? "All"
                  : roleFilter === "super_admin"
                    ? "Super Admin"
                    : "User"}
              </span>
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--surface-high)] px-4 py-2 text-sm font-medium transition hover:bg-[var(--surface-soft)]"
              onClick={cycleStatusFilter}
              type="button"
            >
              <span>
                Status:{" "}
                {statusFilter === "all"
                  ? "All"
                  : statusFilter === "active"
                    ? "Active"
                    : "Pending"}
              </span>
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-[rgba(var(--secondary-rgb),0.14)] px-4 py-2 text-sm font-semibold text-[var(--secondary)] transition hover:bg-[rgba(var(--secondary-rgb),0.22)]"
              onClick={() => void handleRefreshUsers()}
              type="button"
            >
              <RefreshCw
                className={
                  busyAction === "loading" ? "h-4 w-4 animate-spin" : "h-4 w-4"
                }
              />
              <span>{busyAction === "loading" ? "Refreshing" : "Refresh"}</span>
            </button>
          </div>
          <div className="inline-flex items-center gap-2 text-sm text-[var(--muted)]">
            <Search className="h-4 w-4 text-[var(--soft)]" />
            <span>Showing {filteredUsers.length} user(s)</span>
          </div>
        </motion.section>

        <motion.section
          className="surface-panel mt-6 rounded-xl p-5 sm:p-6"
          id="composer"
          ref={composerRef}
          {...sectionMotion(0.06)}
        >
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-label text-[11px] font-extrabold uppercase tracking-[0.22em] text-[var(--accent)]">
                User composer
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-tight">
                {editingUserId ? "Edit user access" : "Create a new user"}
              </h2>
            </div>
            {editingUserId ? (
              <button
                className="rounded-full border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text)]"
                onClick={() => {
                  resetForm();
                  showToast("info", "Edit mode cleared.");
                }}
                type="button"
              >
                Cancel edit
              </button>
            ) : (
              <div className="inline-flex items-center gap-2 rounded-full bg-[rgba(var(--accent-rgb),0.14)] px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--accent)]">
                <UserRoundPlus className="h-4 w-4" />
                <span>New user</span>
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.15fr_1.15fr_0.8fr]">
            <Field
              label="Full name"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  full_name: event.target.value,
                }))
              }
              placeholder="Enter user name"
              value={form.full_name}
            />
            <Field
              label="Email"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
              placeholder="Enter user email"
              type="email"
              value={form.email}
            />
            <Field
              label="Phone"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  phone: event.target.value,
                }))
              }
              placeholder="Optional phone number"
              value={form.phone}
            />
            {editingUserId ? (
              <Field
                label="New password"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    new_password: event.target.value,
                  }))
                }
                placeholder="Optional password override"
                type="password"
                value={form.new_password}
              />
            ) : (
              <div className="surface-strong rounded-[1.6rem] p-4 md:col-span-2 xl:col-span-1">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--soft)]">
                  On create
                </p>
                <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                  The backend auto-generates the password and prepares the
                  onboarding email.
                </p>
              </div>
            )}
          </div>

          <div className="mt-5 grid gap-4">
            <ToggleRow
              checked={form.can_view_team_history}
              description="Allows this user to view others' email history."
              label="Allow team history access"
              onChange={(checked) =>
                setForm((current) => ({
                  ...current,
                  can_view_team_history: checked,
                }))
              }
            />
            <ToggleRow
              checked={form.can_use_sales_sender}
              description="Makes the Sales Zoho sender available in the workspace."
              label="Allow Sales Zoho sender"
              onChange={(checked) =>
                setForm((current) => ({
                  ...current,
                  can_use_sales_sender: checked,
                }))
              }
            />
            <ToggleRow
              checked={form.can_use_admin_sender}
              description="Makes the Admin Zoho sender available in the workspace."
              label="Allow Admin Zoho sender"
              onChange={(checked) =>
                setForm((current) => ({
                  ...current,
                  can_use_admin_sender: checked,
                }))
              }
            />
          </div>

          <button
            className="mt-6 inline-flex w-full items-center justify-center rounded-[1.35rem] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-5 py-4 text-sm font-black uppercase tracking-[0.18em] text-[#052113] transition hover:-translate-y-0.5 disabled:opacity-70"
            disabled={busyAction === "create" || busyAction === "update"}
            onClick={() => void handleSubmit()}
            type="button"
          >
            {busyAction === "create" || busyAction === "update"
              ? "Saving user"
              : editingUserId
                ? "Update user"
                : "Create user"}
          </button>

          {credentialResult ? (
            <motion.div
              className="mt-6 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]"
              initial={{ opacity: 0, y: 14 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              whileInView={{ opacity: 1, y: 0 }}
            >
              <div className="surface-strong rounded-[1.6rem] p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--soft)]">
                  Generated password
                </p>
                <p className="mt-3 break-all text-lg font-black tracking-tight text-[var(--text)]">
                  {credentialResult.generated_password}
                </p>
              </div>
              <div className="surface-strong rounded-[1.6rem] p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--soft)]">
                  Credential delivery
                </p>
                <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                  {credentialResult.delivery_status.message}
                </p>
              </div>
            </motion.div>
          ) : null}
        </motion.section>

        <motion.section
          className="mt-8"
          id="directory"
          ref={directoryRef}
          {...sectionMotion(0.1)}
        >
          <div className="mb-4">
            <h2 className="text-2xl font-black tracking-tight">
              User directory
            </h2>
            <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
              Review identity, permissions, password actions, and history access
              for every user.
            </p>
          </div>

          <div className="surface-panel mb-5 flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex w-full items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-3 py-2.5 sm:max-w-md">
              <Search className="h-4 w-4 text-[var(--soft)]" />
              <input
                className="w-full bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--soft)]"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name, email, phone, or role"
                type="text"
                value={query}
              />
            </label>
            <p className="text-sm text-[var(--muted)]">
              {filteredUsers.length} result(s)
            </p>
          </div>

          <div className="grid w-full grid-cols-1 gap-5 md:grid-cols-2">
            {filteredUsers.map((user, index) => (
              <motion.div
                className="min-w-0"
                initial={{ opacity: 0, y: 18 }}
                key={user.id}
                transition={{
                  delay: index * 0.03,
                  duration: 0.35,
                  ease: "easeOut",
                }}
                viewport={{ once: true, amount: 0.15 }}
                whileInView={{ opacity: 1, y: 0 }}
              >
                <UserCard
                  busyAction={
                    selectedBusyUserId === user.id
                      ? busyAction === "delete"
                        ? "delete"
                        : busyAction === "reset"
                          ? "reset"
                          : null
                      : null
                  }
                  onDelete={handleDelete}
                  onEdit={handleEdit}
                  onResetPassword={handleResetPassword}
                  user={user}
                />
              </motion.div>
            ))}
          </div>

          {filteredUsers.length === 0 ? (
            <div className="surface-panel mt-4 rounded-2xl p-6 text-center">
              <p className="text-base font-bold text-[var(--text)]">
                No users match the current search or filters.
              </p>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Adjust the filters or create a new user to continue.
              </p>
            </div>
          ) : null}
        </motion.section>
      </AppShell>
    </>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="surface-strong flex cursor-pointer items-start justify-between gap-4 rounded-[1.6rem] p-4">
      <div>
        <p className="text-sm font-bold">{label}</p>
        <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
          {description}
        </p>
      </div>
      <input
        checked={checked}
        className="mt-1 h-5 w-5 rounded border-[var(--line)] bg-[var(--surface)] accent-[var(--accent)]"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
    </label>
  );
}
