export const scheduleStatuses = [
  'agendado',
  'confirmado',
  'em_espera',
  'em_atendimento',
  'atendido',
  'atrasado',
  'faltou',
  'cancelado',
  'concluido',
] as const;

export type ScheduleStatus = typeof scheduleStatuses[number];

export const scheduleStatusTransitions: Record<ScheduleStatus, ScheduleStatus[]> = {
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
