import { env } from '../config/env';

interface AppointmentWhatsAppInput {
  to: string;
  patientName: string;
  date: string;
  time: string;
  professionalName: string;
  procedures: string;
}

interface WhatsAppResult {
  status: 'pendente' | 'enviada' | 'falhou';
  providerId?: string;
  error?: string;
}

interface RetentionWhatsAppInput {
  to: string;
  patientName: string;
  clinicName: string;
  offer: string;
}

interface QuoteWhatsAppInput {
  to: string;
  patientName: string;
  clinicName: string;
  total: string;
  discount: string;
}

export async function sendAppointmentWhatsApp(input: AppointmentWhatsAppInput): Promise<WhatsAppResult> {
  const config = env.whatsapp;
  if (!config.phoneNumberId || !config.accessToken || !config.appointmentTemplate) {
    return {
      status: 'pendente',
      error: 'Integracao WhatsApp aguardando credenciais e template.',
    };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: input.to,
          type: 'template',
          template: {
            name: config.appointmentTemplate,
            language: { code: config.languageCode },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: input.patientName },
                  { type: 'text', text: input.date },
                  { type: 'text', text: input.time },
                  { type: 'text', text: input.professionalName },
                  { type: 'text', text: input.procedures },
                ],
              },
            ],
          },
        }),
      },
    );
    const body = await response.json() as { messages?: Array<{ id?: string }>; error?: { message?: string } };
    if (!response.ok) {
      return { status: 'falhou', error: body.error?.message || 'Falha no envio pelo WhatsApp.' };
    }
    return { status: 'enviada', providerId: body.messages?.[0]?.id };
  } catch (error: unknown) {
    return {
      status: 'falhou',
      error: error instanceof Error ? error.message : 'Falha de comunicacao com o WhatsApp.',
    };
  }
}

export async function sendRetentionWhatsApp(input: RetentionWhatsAppInput): Promise<WhatsAppResult> {
  const config = env.whatsapp;
  if (!config.phoneNumberId || !config.accessToken || !config.retentionTemplate) {
    return {
      status: 'pendente',
      error: 'Integracao WhatsApp aguardando credenciais e template de retencao.',
    };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: input.to,
          type: 'template',
          template: {
            name: config.retentionTemplate,
            language: { code: config.languageCode },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: input.patientName },
                  { type: 'text', text: input.clinicName },
                  { type: 'text', text: input.offer },
                ],
              },
            ],
          },
        }),
      },
    );
    const body = await response.json() as { messages?: Array<{ id?: string }>; error?: { message?: string } };
    if (!response.ok) {
      return { status: 'falhou', error: body.error?.message || 'Falha no envio pelo WhatsApp.' };
    }
    return { status: 'enviada', providerId: body.messages?.[0]?.id };
  } catch (error: unknown) {
    return {
      status: 'falhou',
      error: error instanceof Error ? error.message : 'Falha de comunicacao com o WhatsApp.',
    };
  }
}

export async function sendQuoteWhatsApp(input: QuoteWhatsAppInput): Promise<WhatsAppResult> {
  const config = env.whatsapp;
  if (!config.phoneNumberId || !config.accessToken || !config.quoteTemplate) {
    return {
      status: 'pendente',
      error: 'Integracao WhatsApp aguardando credenciais e template de orcamento.',
    };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: input.to,
          type: 'template',
          template: {
            name: config.quoteTemplate,
            language: { code: config.languageCode },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: input.patientName },
                  { type: 'text', text: input.clinicName },
                  { type: 'text', text: input.total },
                  { type: 'text', text: input.discount },
                ],
              },
            ],
          },
        }),
      },
    );
    const body = await response.json() as { messages?: Array<{ id?: string }>; error?: { message?: string } };
    if (!response.ok) {
      return { status: 'falhou', error: body.error?.message || 'Falha no envio do orcamento pelo WhatsApp.' };
    }
    return { status: 'enviada', providerId: body.messages?.[0]?.id };
  } catch (error: unknown) {
    return {
      status: 'falhou',
      error: error instanceof Error ? error.message : 'Falha de comunicacao com o WhatsApp.',
    };
  }
}
