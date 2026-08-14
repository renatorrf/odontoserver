"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMail = sendMail;
const nodemailer_1 = __importDefault(require("nodemailer"));
const env_1 = require("../config/env");
async function sendMail(input) {
    if (!env_1.env.smtp.host) {
        console.log('[email:dev]', {
            to: input.to,
            subject: input.subject,
            text: input.text,
        });
        return;
    }
    const transporter = nodemailer_1.default.createTransport({
        host: env_1.env.smtp.host,
        port: env_1.env.smtp.port,
        secure: env_1.env.smtp.secure,
        auth: env_1.env.smtp.user
            ? {
                user: env_1.env.smtp.user,
                pass: env_1.env.smtp.pass,
            }
            : undefined,
    });
    await transporter.sendMail({
        from: env_1.env.smtp.from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
    });
}
