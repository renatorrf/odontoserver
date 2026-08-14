"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleStatusTransitions = exports.scheduleStatuses = void 0;
exports.scheduleStatuses = [
    'agendado',
    'confirmado',
    'em_espera',
    'em_atendimento',
    'atendido',
    'atrasado',
    'faltou',
    'cancelado',
    'concluido',
];
exports.scheduleStatusTransitions = {
    agendado: ['confirmado', 'em_espera', 'em_atendimento', 'atrasado', 'cancelado', 'faltou'],
    confirmado: ['em_espera', 'em_atendimento', 'atrasado', 'cancelado', 'faltou'],
    em_espera: ['em_atendimento', 'atrasado', 'cancelado', 'faltou'],
    atrasado: ['em_espera', 'em_atendimento', 'cancelado', 'faltou'],
    em_atendimento: ['atendido'],
    atendido: [],
    concluido: [],
    faltou: [],
    cancelado: [],
};
