import nodemailer from 'nodemailer';
import { env } from '../config/env';

interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendMail(input: SendMailInput): Promise<void> {
  if (!env.smtp.host) {
    console.log('[email:dev]', {
      to: input.to,
      subject: input.subject,
      text: input.text,
    });
    return;
  }

  const transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth: env.smtp.user
      ? {
          user: env.smtp.user,
          pass: env.smtp.pass,
        }
      : undefined,
  });

  await transporter.sendMail({
    from: env.smtp.from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}
