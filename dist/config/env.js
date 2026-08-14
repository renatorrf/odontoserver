"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
function required(name) {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
    }
    return value;
}
function integer(name, fallback) {
    const value = process.env[name]?.trim();
    const parsed = value ? Number.parseInt(value, 10) : fallback;
    return Number.isFinite(parsed) ? parsed : fallback;
}
function stringList(name, fallback) {
    const value = process.env[name]?.trim();
    if (!value) {
        return fallback;
    }
    return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}
exports.env = {
    port: integer('PORT', 3333),
    databaseUrl: required('DATABASE_URL'),
    dbSsl: process.env.DB_SSL?.trim().toLowerCase() ?? 'false',
    dbPoolMax: integer('DB_POOL_MAX', 10),
    jwtSecret: required('JWT_SECRET'),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN?.trim() || '8h',
    bcryptRounds: integer('BCRYPT_ROUNDS', 10),
    patientDefaultPassword: process.env.PATIENT_DEFAULT_PASSWORD?.trim() || 'odonto1234',
    corsOrigin: stringList('CORS_ORIGIN', ['http://localhost:8100', 'http://localhost:4200']),
    passwordResetBaseUrl: process.env.PASSWORD_RESET_BASE_URL?.trim() || 'http://localhost:4200/resetar-senha',
    patientFilesDir: process.env.PATIENT_FILES_DIR?.trim() || 'storage/patient-files',
    smtp: {
        host: process.env.SMTP_HOST?.trim() || '',
        port: integer('SMTP_PORT', 587),
        secure: ['true', '1', 'yes', 'on'].includes(process.env.SMTP_SECURE?.trim().toLowerCase() ?? ''),
        user: process.env.SMTP_USER?.trim() || '',
        pass: process.env.SMTP_PASS?.trim() || '',
        from: process.env.SMTP_FROM?.trim() || 'Odonto PWA <no-reply@odonto.local>',
    },
    whatsapp: {
        apiVersion: process.env.WHATSAPP_API_VERSION?.trim() || 'v23.0',
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || '',
        accessToken: process.env.WHATSAPP_ACCESS_TOKEN?.trim() || '',
        appointmentTemplate: process.env.WHATSAPP_TEMPLATE_APPOINTMENT?.trim() || '',
        retentionTemplate: process.env.WHATSAPP_TEMPLATE_RETENTION?.trim() || '',
        quoteTemplate: process.env.WHATSAPP_TEMPLATE_QUOTE?.trim() || '',
        languageCode: process.env.WHATSAPP_LANGUAGE_CODE?.trim() || 'pt_BR',
    },
};
