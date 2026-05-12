// Email sent when an admin invites a new staff member. The recipient
// clicks the link, picks a password, enrolls 2FA, then lands in the
// admin portal with their role already attached.

export function buildAdminInviteHtml(opts: {
  inviteeEmail: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
  expiresAt: Date;
}): string {
  const roleLabel = opts.role === 'admin' ? 'Admin' : 'Sales Rep';
  const expires = opts.expiresAt.toLocaleString('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're invited to the NTM admin portal</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f4f4f5;color:#0f172a;line-height:1.55;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr>
            <td style="background:#0f172a;color:#ffffff;padding:20px 24px;">
              <h1 style="margin:0;font-size:20px;">You've been invited</h1>
              <p style="margin:6px 0 0;font-size:13px;color:#94a3b8;">NTM Admin Portal</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 12px;">Hi ${opts.inviteeEmail.split('@')[0]},</p>
              <p style="margin:0 0 12px;">
                <strong>${opts.inviterName}</strong> invited you to join the NTM admin portal as
                <strong>${roleLabel}</strong>. Use the link below to set your password and turn on
                two-factor authentication.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
                <tr>
                  <td align="center">
                    <a href="${opts.acceptUrl}"
                       style="display:inline-block;background:#0f766e;color:#ffffff;padding:12px 26px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;">
                      Accept invite &amp; set up account
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 10px;font-size:13px;color:#475569;">
                This invite expires on <strong>${expires}</strong>. If it lapses, ask the admin who invited you to send a new one.
              </p>
              <p style="margin:14px 0 0;font-size:12px;color:#64748b;">
                If you weren't expecting this, you can safely ignore the email — the link is single-use and tied to ${opts.inviteeEmail}.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildLoginCodeHtml(opts: {
  email: string;
  code: string;
  expiresInMinutes: number;
}): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Your NTM admin login code</title></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f4f4f5;color:#0f172a;line-height:1.55;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;padding:24px;">
        <tr><td>
          <h2 style="margin:0 0 8px;font-size:18px;">Your login code</h2>
          <p style="margin:0 0 16px;color:#475569;font-size:14px;">Enter this code on the admin login screen to finish signing in.</p>
          <div style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:32px;letter-spacing:8px;background:#0f172a;color:#ffffff;padding:16px;border-radius:6px;text-align:center;">${opts.code}</div>
          <p style="margin:16px 0 0;font-size:13px;color:#64748b;">Expires in ${opts.expiresInMinutes} minutes. If you didn't try to log in, change your password right away.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
