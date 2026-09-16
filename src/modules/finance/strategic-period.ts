import { StrategicDashboardQuery } from './management.schemas';

export function resolveStrategicGranularity(input: StrategicDashboardQuery): 'dia' | 'mes' {
  if (input.granularidade) return input.granularidade;
  const start = new Date(`${input.inicio}T00:00:00.000Z`);
  const end = new Date(`${input.fim}T00:00:00.000Z`);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return days <= 45 ? 'dia' : 'mes';
}
