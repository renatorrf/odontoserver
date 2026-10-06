"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMail = sendMail;
const nodemailer_1 = __importDefault(require("nodemailer"));
const integration_service_1 = require("../modules/settings/integration.service");
async function sendMail(input) {
    const config = await (0, integration_service_1.getSmtpRuntimeConfig)(input.empresaId);
    if (!config.active || !config.host) {
        console.log('[email:dev]', {
            to: input.to,
            subject: input.subject,
            text: input.text,
        });
        return;
    }
    const transporter = nodemailer_1.default.createTransport({
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
