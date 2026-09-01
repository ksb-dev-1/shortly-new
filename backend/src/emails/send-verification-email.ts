import { render } from "@react-email/components";
import { Resend } from "resend";

import { env } from "../config/env.js";
import VerifyEmail from "./VerifyEmail.js";

const resend = new Resend(env.RESEND_API_KEY);

export async function sendVerificationEmail(
  name: string,
  email: string,
  token: string,
) {
  const verifyUrl = `${env.FRONTEND_URL}/verify-email?token=${token}`;

  const emailHtml = await render(VerifyEmail({ name, verifyUrl }));
  const emailText = await render(VerifyEmail({ name, verifyUrl }), {
    plainText: true,
  });

  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: email,
    subject: "Confirm your email",
    html: emailHtml,
    text: emailText,
  });

  if (error) {
    throw new Error(`Failed to send verification email: ${error.message}`);
  }
}
