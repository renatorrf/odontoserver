"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendAppointmentWhatsApp = sendAppointmentWhatsApp;
exports.sendRetentionWhatsApp = sendRetentionWhatsApp;
exports.sendQuoteWhatsApp = sendQuoteWhatsApp;
const env_1 = require("../config/env");
async function sendAppointmentWhatsApp(input) {
    const config = env_1.env.whatsapp;
    if (!config.phoneNumberId || !config.accessToken || !config.appointmentTemplate) {
        return {
            status: 'pendente',
            error: 'Integracao WhatsApp aguardando credenciais e template.',
        };
    }
    try {
        const response = await fetch(`https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`, {
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
        });
        const body = await response.json();
        if (!response.ok) {
            return { status: 'falhou', error: body.error?.message || 'Falha no envio pelo WhatsApp.' };
        }
        return { status: 'enviada', providerId: body.messages?.[0]?.id };
    }
    catch (error) {
        return {
            status: 'falhou',
            error: error instanceof Error ? error.message : 'Falha de comunicacao com o WhatsApp.',
        };
    }
}
async function sendRetentionWhatsApp(input) {
    const config = env_1.env.whatsapp;
    if (!config.phoneNumberId || !config.accessToken || !config.retentionTemplate) {
        return {
            status: 'pendente',
            error: 'Integracao WhatsApp aguardando credenciais e template de retencao.',
        };
    }
    try {
        const response = await fetch(`https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`, {
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
        });
        const body = await response.json();
        if (!response.ok) {
            return { status: 'falhou', error: body.error?.message || 'Falha no envio pelo WhatsApp.' };
        }
        return { status: 'enviada', providerId: body.messages?.[0]?.id };
    }
    catch (error) {
        return {
            status: 'falhou',
            error: error instanceof Error ? error.message : 'Falha de comunicacao com o WhatsApp.',
        };
    }
}
async function sendQuoteWhatsApp(input) {
    const config = env_1.env.whatsapp;
    if (!config.phoneNumberId || !config.accessToken || !config.quoteTemplate) {
        return {
            status: 'pendente',
            error: 'Integracao WhatsApp aguardando credenciais e template de orcamento.',
        };
    }
    try {
        const response = await fetch(`https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`, {
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
        });
        const body = await response.json();
        if (!response.ok) {
            return { status: 'falhou', error: body.error?.message || 'Falha no envio do orcamento pelo WhatsApp.' };
        }
        return { status: 'enviada', providerId: body.messages?.[0]?.id };
    }
    catch (error) {
        return {
            status: 'falhou',
            error: error instanceof Error ? error.message : 'Falha de comunicacao com o WhatsApp.',
        };
    }
}
