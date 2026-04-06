const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const nodemailer = require("nodemailer");

const {
  config,
  defaultSenderEmail,
  getSmtpAccount,
  resolveSystemSenderEmail,
  resolveSystemSenderName,
} = require("../config");

function stripHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function previewAttachment({
  label,
  filename,
  content_type,
  size_bytes = null,
  compressed_size_bytes = null,
  source_path = null,
  cid = null,
  content_disposition = null,
  hidden_in_ui = false,
}) {
  return {
    label,
    filename,
    content_type,
    size_bytes,
    compressed_size_bytes,
    source_path,
    cid,
    content_disposition,
    hidden_in_ui,
  };
}

function previewEmail({
  templateId,
  templateTitle,
  recipientName,
  recipientEmail,
  subject,
  htmlBody,
  textBody,
  fromName,
  fromEmail,
  attachments = [],
}) {
  return {
    template_id: templateId,
    template_title: templateTitle,
    recipient_name: recipientName,
    recipient_email: recipientEmail,
    subject,
    html_body: htmlBody,
    text_body: textBody,
    from_name: fromName,
    from_email: fromEmail,
    attachments,
  };
}

function buildUserOnboardingEmail({ fullName, email, phone, password }) {
  const fromName = resolveSystemSenderName();
  const fromEmail = resolveSystemSenderEmail();
  const phoneLine = phone ? `<li><strong>Phone:</strong> ${phone}</li>` : "";

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; color: #14213d; line-height: 1.6;">
      <p>Hi ${fullName},</p>
      <p>
        Welcome to ${config.companyName}. Your account has been created successfully.
        Please use the credentials below to sign in and start working with the email workflow platform.
      </p>
      <div style="padding: 16px; border-radius: 16px; background: #f5f8ff; border: 1px solid #d5def7;">
        <ul style="padding-left: 18px; margin: 0;">
          <li><strong>Name:</strong> ${fullName}</li>
          <li><strong>Email:</strong> ${email}</li>
          ${phoneLine}
          <li><strong>Temporary Password:</strong> ${password}</li>
        </ul>
      </div>
      <p>
        For security, please sign in and change your password once we enable the next account phase.
        If you need support, call us at ${config.companyPhone}.
      </p>
      <p>Regards,<br />${config.companyName}</p>
    </div>
  `.trim();

  return previewEmail({
    templateId: "user-onboarding",
    templateTitle: "User Onboarding",
    recipientName: fullName,
    recipientEmail: email,
    subject: `Your ${config.companyName} account is ready`,
    htmlBody,
    textBody: stripHtml(htmlBody),
    fromName,
    fromEmail,
  });
}

function buildLoginOtpEmail({ fullName, email, otpCode }) {
  const fromName = resolveSystemSenderName();
  const fromEmail = resolveSystemSenderEmail();
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; color: #14213d; line-height: 1.6;">
      <p>Hi ${fullName},</p>
      <p>
        We received a sign-in request for your ${config.companyName} account
        using <strong>${email}</strong>.
      </p>
      <div style="padding: 18px; border-radius: 18px; background: #f5f8ff; border: 1px solid #d5def7; text-align: center;">
        <p style="margin: 0 0 8px 0; font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; color: #4b5d7a;">Your OTP Code</p>
        <p style="margin: 0; font-size: 30px; font-weight: 700; letter-spacing: 0.28em;">${otpCode}</p>
      </div>
      <p>
        This code will expire soon. If you did not request this sign-in, you can ignore this email.
      </p>
      <p>Regards,<br />${config.companyName}<br />Phone: ${config.companyPhone}</p>
    </div>
  `.trim();

  return previewEmail({
    templateId: "login-otp",
    templateTitle: "Login OTP",
    recipientName: fullName,
    recipientEmail: email,
    subject: `Your ${config.companyName} sign-in OTP`,
    htmlBody,
    textBody: stripHtml(htmlBody),
    fromName,
    fromEmail,
  });
}

function buildForgotPasswordOtpEmail({ fullName, email, otpCode }) {
  const fromName = resolveSystemSenderName();
  const fromEmail = resolveSystemSenderEmail();
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; color: #14213d; line-height: 1.6;">
      <p>Hi ${fullName},</p>
      <p>
        We received a forgot-password request for your ${config.companyName} account
        using <strong>${email}</strong>.
      </p>
      <div style="padding: 18px; border-radius: 18px; background: #f5f8ff; border: 1px solid #d5def7; text-align: center;">
        <p style="margin: 0 0 8px 0; font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; color: #4b5d7a;">Password Reset OTP</p>
        <p style="margin: 0; font-size: 30px; font-weight: 700; letter-spacing: 0.28em;">${otpCode}</p>
      </div>
      <p>
        Enter this OTP on the verification page, then set your new password.
        If you did not request this reset, you can ignore this email.
      </p>
      <p>Regards,<br />${config.companyName}<br />Phone: ${config.companyPhone}</p>
    </div>
  `.trim();

  return previewEmail({
    templateId: "forgot-password-otp",
    templateTitle: "Forgot Password OTP",
    recipientName: fullName,
    recipientEmail: email,
    subject: `Your ${config.companyName} password reset OTP`,
    htmlBody,
    textBody: stripHtml(htmlBody),
    fromName,
    fromEmail,
  });
}

function buildEmailChangeOtpEmail({ fullName, email, otpCode, target }) {
  const fromName = resolveSystemSenderName();
  const fromEmail = resolveSystemSenderEmail();
  const targetLabel =
    target === "current" ? "current account email" : "new email address";
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; color: #14213d; line-height: 1.6;">
      <p>Hi ${fullName},</p>
      <p>
        We received an email-change verification request for your
        ${config.companyName} account.
      </p>
      <p>
        Use this OTP to verify your <strong>${targetLabel}</strong>:
      </p>
      <div style="padding: 18px; border-radius: 18px; background: #f5f8ff; border: 1px solid #d5def7; text-align: center;">
        <p style="margin: 0 0 8px 0; font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; color: #4b5d7a;">Email Change OTP</p>
        <p style="margin: 0; font-size: 30px; font-weight: 700; letter-spacing: 0.28em;">${otpCode}</p>
      </div>
      <p>
        Enter this OTP in settings to continue. If you did not request an email change,
        ignore this message and contact support.
      </p>
      <p>Regards,<br />${config.companyName}<br />Phone: ${config.companyPhone}</p>
    </div>
  `.trim();

  return previewEmail({
    templateId: `email-change-otp-${target}`,
    templateTitle: "Email Change OTP",
    recipientName: fullName,
    recipientEmail: email,
    subject: `Your ${config.companyName} email change OTP`,
    htmlBody,
    textBody: stripHtml(htmlBody),
    fromName,
    fromEmail,
  });
}

function buildPasswordResetEmail({ fullName, email, password }) {
  const fromName = resolveSystemSenderName();
  const fromEmail = resolveSystemSenderEmail();
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; color: #14213d; line-height: 1.6;">
      <p>Hi ${fullName},</p>
      <p>
        Your ${config.companyName} account password has been reset by the super admin.
        Please use the updated temporary password below to sign in.
      </p>
      <div style="padding: 16px; border-radius: 16px; background: #f5f8ff; border: 1px solid #d5def7;">
        <ul style="padding-left: 18px; margin: 0;">
          <li><strong>Email:</strong> ${email}</li>
          <li><strong>Temporary Password:</strong> ${password}</li>
        </ul>
      </div>
      <p>
        After signing in, change your password immediately. If you need help,
        contact ${config.companyName} at ${config.companyPhone}.
      </p>
      <p>Regards,<br />${config.companyName}</p>
    </div>
  `.trim();

  return previewEmail({
    templateId: "password-reset",
    templateTitle: "Password Reset",
    recipientName: fullName,
    recipientEmail: email,
    subject: `Your ${config.companyName} password has been reset`,
    htmlBody,
    textBody: stripHtml(htmlBody),
    fromName,
    fromEmail,
  });
}

async function deliverEmail(preview, options = {}) {
  if (config.emailDeliveryMode === "log") {
    return {
      delivered: true,
      message:
        "Email prepared in log mode. SMTP delivery is disabled in this environment.",
      provider_message_id: null,
    };
  }

  const gmailCredentials = options.gmailCredentials || null;
  const senderMode = String(options.senderMode || "").trim();

  const account =
    senderMode === "gmail" &&
    gmailCredentials?.email &&
    gmailCredentials?.appPassword
      ? {
          key: "gmail-direct",
          host: "smtp.gmail.com",
          port: 587,
          username: gmailCredentials.email,
          password: gmailCredentials.appPassword,
          senderEmail: gmailCredentials.email,
          senderName: preview.from_name || config.companyName,
          starttls: true,
        }
      : getSmtpAccount(preview.from_email) ||
        getSmtpAccount(defaultSenderEmail());
  if (!account) {
    return {
      delivered: false,
      message: "SMTP mode is enabled but the SMTP credentials are incomplete.",
      provider_message_id: null,
    };
  }

  const normalizedPreviewFrom = String(preview.from_email || "")
    .trim()
    .toLowerCase();
  const normalizedAccountFrom = String(account.senderEmail || "")
    .trim()
    .toLowerCase();
  const useAccountFrom =
    normalizedPreviewFrom &&
    normalizedAccountFrom &&
    normalizedPreviewFrom !== normalizedAccountFrom;

  const fromAddress = useAccountFrom ? account.senderEmail : preview.from_email;
  const replyToAddress = useAccountFrom ? preview.from_email : undefined;

  const attachments = [];
  for (const attachment of preview.attachments || []) {
    if (!attachment?.source_path) {
      continue;
    }
    const sourcePath = path.resolve(attachment.source_path);
    if (!fs.existsSync(sourcePath)) {
      return {
        delivered: false,
        message: `Attachment not found: ${attachment.filename}`,
        provider_message_id: null,
      };
    }
    if (sourcePath.endsWith(".gz")) {
      const zipped = fs.readFileSync(sourcePath);
      const content = zlib.gunzipSync(zipped);
      attachments.push({
        filename: attachment.filename,
        content,
        contentType: attachment.content_type,
        cid: attachment.cid || undefined,
        contentDisposition: attachment.content_disposition || undefined,
      });
    } else {
      attachments.push({
        filename: attachment.filename,
        path: sourcePath,
        contentType: attachment.content_type,
        cid: attachment.cid || undefined,
        contentDisposition: attachment.content_disposition || undefined,
      });
    }
  }

  try {
    const transporter = nodemailer.createTransport({
      host: account.host,
      port: account.port,
      secure: account.starttls ? false : account.port === 465,
      auth: {
        user: account.username,
        pass: account.password,
      },
      requireTLS: account.starttls,
    });

    const info = await transporter.sendMail({
      from: `${preview.from_name} <${fromAddress}>`,
      replyTo: replyToAddress,
      to: preview.recipient_email,
      subject: preview.subject,
      html: preview.html_body,
      text: preview.text_body,
      attachments,
    });

    const providerMessageId = String(info?.messageId || "")
      .trim()
      .replace(/^<+/, "")
      .replace(/>+$/, "")
      .toLowerCase();

    return {
      delivered: true,
      message: `Email delivered successfully using the ${account.key} SMTP account.`,
      provider_message_id: providerMessageId || null,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "SMTP delivery failed.";
    return {
      delivered: false,
      message: `SMTP delivery failed: ${message}`,
      provider_message_id: null,
    };
  }
}

module.exports = {
  buildEmailChangeOtpEmail,
  buildForgotPasswordOtpEmail,
  buildLoginOtpEmail,
  buildPasswordResetEmail,
  buildUserOnboardingEmail,
  deliverEmail,
  previewAttachment,
  previewEmail,
  stripHtml,
};
