import { render } from "@react-email/components";
import { Resend } from "resend";

import { env } from "../config/env.js";
import ResetPasswordEmail from "./ResetPasswordEmail.js";

const resend = new Resend(env.RESEND_API_KEY);

export async function sendPasswordResetEmail(
  name: string,
  email: string,
  token: string,
) {
  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${token}`;

  const emailHtml = await render(ResetPasswordEmail({ name, resetUrl }));
  const emailText = await render(ResetPasswordEmail({ name, resetUrl }), {
    plainText: true,
  });

  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: email,
    subject: "Reset your password",
    html: emailHtml,
    text: emailText,
  });

  if (error) {
    throw new Error(`Failed to send password reset email: ${error.message}`);
  }
}
