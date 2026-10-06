import nodemailer from 'nodemailer';
import { getSmtpRuntimeConfig } from '../modules/settings/integration.service';

interface SendMailInput {
  empresaId: string | null;
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendMail(input: SendMailInput): Promise<void> {
  const config = await getSmtpRuntimeConfig(input.empresaId);
  if (!config.active || !config.host) {
    console.log('[email:dev]', {
      to: input.to,
      subject: input.subject,
      text: input.text,
    });
    return;
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user
      ? {
          user: config.user,
          pass: config.pass,
        }
      : undefined,
  });

  await transporter.sendMail({
    from: config.from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}
