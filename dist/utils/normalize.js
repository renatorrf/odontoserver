"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onlyDigits = onlyDigits;
exports.optionalText = optionalText;
exports.optionalDate = optionalDate;
exports.hasAnyValue = hasAnyValue;
function onlyDigits(value) {
    if (value == null) {
        return null;
    }
    const digits = String(value).replace(/\D/g, '');
    return digits || null;
}
function optionalText(value) {
    if (value == null) {
        return null;
    }
    const trimmed = String(value).trim();
    return trimmed || null;
}
function optionalDate(value) {
    const text = optionalText(value);
    if (!text) {
        return null;
    }
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}
function hasAnyValue(payload) {
    return Object.values(payload).some((value) => {
        if (value == null) {
            return false;
        }
        if (typeof value === 'string') {
            return value.trim().length > 0;
        }
        return Boolean(value);
    });
}
