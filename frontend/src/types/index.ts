export type Role = "super_admin" | "user";
export type ThemeMode = "dark" | "light";
export type LeadSenderMode = "gmail" | "sales" | "admin";

export interface User {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  role: Role;
  can_view_team_history: boolean;
  can_use_sales_sender: boolean;
  can_use_admin_sender: boolean;
  created_at: string;
  updated_at: string;
  last_login?: string | null;
  must_change_password?: boolean;
}

export interface AuthResponse {
  user: User | null;
}

export interface LoginChallengeStatus {
  mode: string;
  delivered: boolean;
  message: string;
}

export interface LoginChallengeResponse {
  challenge_id: string;
  masked_email: string;
  expires_in_seconds: number;
  remember_me: boolean;
  delivery_status: LoginChallengeStatus;
  debug_otp?: string | null;
}

export interface ForgotPasswordStartResponse {
  challenge_id: string;
  masked_email: string;
  expires_in_seconds: number;
  delivery_status: LoginChallengeStatus;
  debug_otp?: string | null;
}

export interface EmailChangeStartResponse {
  challenge_id: string;
  masked_current_email: string;
  masked_new_email: string;
  expires_in_seconds: number;
  delivery_status: LoginChallengeStatus;
  debug_otp?: {
    current_email_otp: string;
    new_email_otp: string;
  } | null;
}

export interface DeliveryStatus {
  mode: string;
  delivered: boolean;
  message: string;
}

export interface EmailAttachment {
  label: string;
  filename: string;
  content_type: string;
  size_bytes?: number | null;
}

export interface EmailPreview {
  template_id: string;
  template_title: string;
  recipient_name: string;
  recipient_email: string;
  subject: string;
  html_body: string;
  text_body: string;
  from_name: string;
  from_email: string;
  attachments: EmailAttachment[];
}

export interface ManagedUserCreateResponse {
  user: User;
  generated_password: string;
  onboarding_email: EmailPreview;
  delivery_status: DeliveryStatus;
}

export interface ManagedUserUpdateResponse {
  user: User;
}

export interface ManagedUserPasswordResetResponse {
  user: User;
  generated_password: string;
  credential_email: EmailPreview;
  delivery_status: DeliveryStatus;
}

export interface AuditLog {
  id: string;
  action: string;
  actor_name: string;
  actor_role: string;
  target_type: string;
  target_id?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface TemplateVariant {
  id: string;
  title: string;
  tone: string;
  summary: string;
  preview_subject: string;
}

export interface LeadClientInput {
  name: string;
  email: string;
  phone: string;
}

export interface LeadEmailVariant {
  template: TemplateVariant;
  previews: EmailPreview[];
}

export interface LeadPreviewResponse {
  variants: LeadEmailVariant[];
  active_template_id: string;
}

export interface LeadDeliveryResult {
  recipient_name: string;
  recipient_email: string;
  subject: string;
  delivered: boolean;
  message: string;
}

export interface SentLeadRecord {
  id: string;
  content_type: "client_lead";
  template_id: string;
  template_title: string;
  sender_mode: LeadSenderMode;
  custom_sender_email?: string | null;
  from_email: string;
  delivery_mode: "single" | "multiple";
  clients: Array<{
    name: string;
    email: string;
    phone?: string | null;
  }>;
  technologies?: string[];
  email_details_paragraph?: string | null;
  personal_use_paragraph?: string | null;
  email_attachments: EmailAttachment[];
  personal_attachments: EmailAttachment[];
  emails: EmailPreview[];
  delivery_results: LeadDeliveryResult[];
  created_by: string;
  created_by_role: string;
  created_at: string;
  last_sent_at: string;
  resend_count: number;
  scheduled_for?: string | null;
  dispatch_status?: "scheduled" | "sending" | "sent" | "failed" | "cancelled";
}

export interface LeadSendResponse {
  message: string;
  record: SentLeadRecord;
}

export interface LeadHistorySection {
  id: string;
  title: string;
  description: string;
  allow_resend: boolean;
  records: SentLeadRecord[];
}

export interface LeadHistoryResponse {
  sections: LeadHistorySection[];
}

export interface CreateUserPayload {
  full_name: string;
  email: string;
  phone?: string;
  can_view_team_history: boolean;
  can_use_sales_sender: boolean;
  can_use_admin_sender: boolean;
}

export interface UpdateUserPayload extends CreateUserPayload {
  new_password?: string;
}

export interface LeadPreviewPayload {
  sender_mode: LeadSenderMode;
  custom_sender_email?: string;
  custom_sender_app_password?: string;
  content_type: "client_lead";
  delivery_mode: "single" | "multiple";
  selected_template_id?: string;
  technologies?: string[];
  email_details_paragraph?: string;
  scheduled_for?: string;
  clients: Array<{
    name: string;
    email: string;
    phone?: string;
  }>;
}

export interface LeadSendPayload extends LeadPreviewPayload {
  selected_template_id: string;
  personal_use_paragraph?: string;
}
