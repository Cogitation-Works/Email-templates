import type {
  AuditLog,
  AuthResponse,
  ClientReplyNotificationsResponse,
  CreateUserPayload,
  EmailChangeStartResponse,
  ExportManifestResponse,
  ForgotPasswordStartResponse,
  LeadHistoryResponse,
  LeadReplyHistoryResponse,
  LeadPreviewPayload,
  LeadPreviewResponse,
  LeadSendPayload,
  LeadSendResponse,
  LoginChallengeResponse,
  ManagedUserCreateResponse,
  ManagedUserPasswordResetResponse,
  ManagedUserUpdateResponse,
  SchedulerStatusResponse,
  TemplateVariant,
  UpdateUserPayload,
  User,
} from "../types";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function buildApiUrl(path: string) {
  return `${API_BASE}${path}`;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);

  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(buildApiUrl(path), {
    ...options,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    let message = "Something went wrong.";
    try {
      const payload = (await response.json()) as {
        detail?: unknown;
        message?: unknown;
      };
      const detail = payload?.detail;
      if (Array.isArray(detail)) {
        const mapped = detail
          .map((item) => {
            if (item && typeof item === "object") {
              const maybeItem = item as { msg?: unknown; type?: unknown };
              return String(maybeItem.msg ?? maybeItem.type ?? "").trim();
            }
            return String(item ?? "").trim();
          })
          .filter(Boolean);
        message = mapped.length ? mapped.join(", ") : message;
      } else if (typeof detail === "string" && detail.trim()) {
        message = detail;
      } else if (
        typeof payload?.message === "string" &&
        payload.message.trim()
      ) {
        message = payload.message;
      }
    } catch {
      message = response.statusText || message;
    }

    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  me: () => request<AuthResponse>("/auth/me"),
  startSignIn: (email: string, password: string, rememberMe: boolean) =>
    request<LoginChallengeResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, remember_me: rememberMe }),
    }),
  verifyOtp: (challengeId: string, otpCode: string) =>
    request<AuthResponse>("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ challenge_id: challengeId, otp_code: otpCode }),
    }),
  startForgotPassword: (email: string) =>
    request<ForgotPasswordStartResponse>("/auth/forgot-password/start", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  verifyForgotPasswordOtp: (challengeId: string, otpCode: string) =>
    request<{ message: string }>("/auth/forgot-password/verify", {
      method: "POST",
      body: JSON.stringify({ challenge_id: challengeId, otp_code: otpCode }),
    }),
  resetForgotPassword: (challengeId: string, newPassword: string) =>
    request<{ message: string }>("/auth/forgot-password/reset", {
      method: "POST",
      body: JSON.stringify({
        challenge_id: challengeId,
        new_password: newPassword,
      }),
    }),
  startEmailChange: (newEmail: string) =>
    request<EmailChangeStartResponse>("/auth/email-change/start", {
      method: "POST",
      body: JSON.stringify({ new_email: newEmail }),
    }),
  verifyEmailChangeOtp: (
    challengeId: string,
    otpCode: string,
    target: "current" | "new",
  ) =>
    request<{
      message: string;
      current_email_verified: boolean;
      new_email_verified: boolean;
    }>("/auth/email-change/verify", {
      method: "POST",
      body: JSON.stringify({
        challenge_id: challengeId,
        otp_code: otpCode,
        target,
      }),
    }),
  confirmEmailChange: (challengeId: string) =>
    request<{ message: string; user: User }>("/auth/email-change/confirm", {
      method: "POST",
      body: JSON.stringify({ challenge_id: challengeId }),
    }),
  signOut: () =>
    request<{ message: string }>("/auth/logout", { method: "POST" }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ message: string }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    }),
  updateProfile: (payload: { full_name?: string; phone?: string }) =>
    request<{ user: User }>("/auth/profile", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  listUsers: () => request<User[]>("/admin/users"),
  createUser: (payload: CreateUserPayload) =>
    request<ManagedUserCreateResponse>("/admin/users", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateUser: (userId: string, payload: UpdateUserPayload) =>
    request<ManagedUserUpdateResponse>(`/admin/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  resendUserPassword: (userId: string) =>
    request<ManagedUserPasswordResetResponse>(
      `/admin/users/${userId}/resend-password`,
      {
        method: "POST",
      },
    ),
  deleteUser: (userId: string) =>
    request<{ message: string }>(`/admin/users/${userId}`, {
      method: "DELETE",
    }),
  listLogs: () => request<AuditLog[]>("/admin/logs"),
  listExportManifest: () =>
    request<ExportManifestResponse>("/admin/exports/manifest"),
  downloadAdminExport: async (params: {
    dataset: string;
    format: "json" | "csv";
    record_id?: string;
  }) => {
    const search = new URLSearchParams({
      dataset: params.dataset,
      format: params.format,
    });
    if (params.record_id?.trim()) {
      search.set("record_id", params.record_id.trim());
    }

    const response = await fetch(
      buildApiUrl(`/admin/exports/download?${search.toString()}`),
      {
        credentials: "include",
      },
    );

    if (!response.ok) {
      let message = "Unable to export data.";
      try {
        const payload = (await response.json()) as { detail?: string };
        if (typeof payload?.detail === "string" && payload.detail.trim()) {
          message = payload.detail;
        }
      } catch {
        message = response.statusText || message;
      }
      throw new ApiError(message, response.status);
    }

    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const filenameMatch = disposition.match(/filename="([^"]+)"/i);

    return {
      blob,
      filename: filenameMatch?.[1] || `${params.dataset}.${params.format}`,
    };
  },
  listClientLeadTemplates: () =>
    request<{ content_type: string; variants: TemplateVariant[] }>(
      "/leads/client-lead/templates",
    ),
  previewClientLeadEmails: (payload: LeadPreviewPayload) =>
    request<LeadPreviewResponse>("/leads/client-lead/preview", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  sendClientLeadEmails: (
    payload: LeadSendPayload,
    emailAttachments: File[],
    personalAttachments: File[],
  ) => {
    const formData = new FormData();
    formData.append("payload", JSON.stringify(payload));
    emailAttachments.forEach((file) =>
      formData.append("email_attachments", file),
    );
    personalAttachments.forEach((file) =>
      formData.append("personal_attachments", file),
    );

    return request<LeadSendResponse>("/leads/client-lead/send", {
      method: "POST",
      body: formData,
    });
  },
  listLeadHistorySections: () =>
    request<LeadHistoryResponse>("/leads/client-lead/history"),
  getSchedulerStatus: () =>
    request<SchedulerStatusResponse>("/scheduler/status"),
  listClientReplyHistorySections: () =>
    request<LeadReplyHistoryResponse>("/leads/client-lead/replies/history"),
  listClientReplyNotifications: () =>
    request<ClientReplyNotificationsResponse>(
      "/leads/client-lead/replies/notifications",
    ),
  markClientReplyNotificationsRead: (ids?: string[]) =>
    request<{ updated: number }>("/leads/client-lead/replies/notifications/read", {
      method: "POST",
      body: JSON.stringify({ ids: ids ?? [] }),
    }),
  syncClientReplies: () =>
    request<{ message: string; result: Record<string, unknown> }>(
      "/leads/client-lead/replies/sync",
      {
        method: "POST",
      },
    ),
  resendClientLeadEmail: (
    recordId: string,
    payload?: { dispatch_mode?: "now" | "schedule"; scheduled_for?: string },
  ) =>
    request<LeadSendResponse>(`/leads/client-lead/sent/${recordId}/resend`, {
      method: "POST",
      body: payload ? JSON.stringify(payload) : undefined,
    }),
  cancelScheduledClientLeadEmail: (recordId: string) =>
    request<LeadSendResponse>(
      `/leads/client-lead/sent/${recordId}/cancel-schedule`,
      {
        method: "POST",
      },
    ),
  rescheduleClientLeadEmail: (recordId: string, scheduledFor: string) =>
    request<LeadSendResponse>(`/leads/client-lead/sent/${recordId}/schedule`, {
      method: "PATCH",
      body: JSON.stringify({ scheduled_for: scheduledFor }),
    }),
  deleteClientLeadEmail: (recordId: string) =>
    request<LeadSendResponse>(`/leads/client-lead/sent/${recordId}`, {
      method: "DELETE",
    }),
  recoverDeletedClientLeadEmail: (recordId: string) =>
    request<LeadSendResponse>(`/leads/client-lead/sent/${recordId}/recover`, {
      method: "POST",
    }),
};
