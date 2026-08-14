"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidCpf = isValidCpf;
exports.hasValidPhoneLength = hasValidPhoneLength;
function isValidCpf(value) {
    const digits = value.replace(/\D/g, '');
    if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) {
        return false;
    }
    const numbers = digits.split('').map(Number);
    const checkDigit = (length) => {
        const sum = numbers.slice(0, length).reduce((total, digit, index) => total + digit * (length + 1 - index), 0);
        const result = (sum * 10) % 11;
        return result === 10 ? 0 : result;
    };
    return checkDigit(9) === numbers[9] && checkDigit(10) === numbers[10];
}
function hasValidPhoneLength(value) {
    const length = value.replace(/\D/g, '').length;
    return length >= 10 && length <= 15;
}
