import { PoolClient } from 'pg';
import { AuthContext } from '../../types/public';

const SAO_PAULO_OFFSET = '-03:00';

interface AvailabilityRow {
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
  intervalo_minutos: number;
}

interface BusyEventRow {
  inicio_em: string;
  fim_em: string;
}

interface OrthodonticEventRow {
  paciente_id: string;
  paciente_nome: string;
  paciente_whatsapp: string | null;
  profissional_id: string;
  inicio_em: string;
  manutencao_procedimento_id: string | null;
  manutencao_descricao: string | null;
  manutencao_duracao_minutos: number | null;
}

export interface AutomaticOrthodonticReturnPlan {
  sourceEventId: string;
  patientId: string;
  patientName: string;
  patientWhatsapp: string | null;
  professionalId: string;
  procedureId: string;
  procedureDescription: string;
  start: Date;
  end: Date;
  targetDate: string;
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function weekday(date: string): number {
  return new Date(`${date}T12:00:00${SAO_PAULO_OFFSET}`).getUTCDay();
}

function atTime(date: string, time: string): Date {
  return new Date(`${date}T${time.slice(0, 5)}:00${SAO_PAULO_OFFSET}`);
}

function localParts(value: Date): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

function timeMinutes(time: string): number {
  const [hours, minutes] = time.slice(0, 5).split(':').map(Number);
  return hours * 60 + minutes;
}

function formatMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function overlaps(start: Date, end: Date, event: BusyEventRow): boolean {
  return start.getTime() < new Date(event.fim_em).getTime()
    && end.getTime() > new Date(event.inicio_em).getTime();
}

export function orthodonticReturnTargetDate(start: Date): string {
  return addDays(localParts(start).date, 30);
}

async function findClosestSlot(
  client: PoolClient,
  auth: AuthContext,
  professionalId: string,
  preferredStart: Date,
  durationMinutes: number,
): Promise<{ start: Date; end: Date; targetDate: string } | null> {
  const preferred = localParts(preferredStart);
  const targetDate = addDays(preferred.date, 30);
  const endDate = addDays(targetDate, 8);
  const [rangesResult, eventsResult] = await Promise.all([
    client.query<AvailabilityRow>(
      `select dia_semana, hora_inicio::text, hora_fim::text, intervalo_minutos
         from odonto.profissional_disponibilidades
        where empresa_id = $1 and profissional_id = $2 and ativo = true
        order by dia_semana, hora_inicio`,
      [auth.empresaId, professionalId],
    ),
    client.query<BusyEventRow>(
      `select inicio_em::text, fim_em::text
         from odonto.agenda_eventos
        where empresa_id = $1 and profissional_id = $2 and status <> 'cancelado'
          and inicio_em < $4::timestamptz and fim_em > $3::timestamptz`,
      [
        auth.empresaId,
        professionalId,
        atTime(targetDate, '00:00').toISOString(),
        atTime(endDate, '00:00').toISOString(),
      ],
    ),
  ]);

  for (let dayOffset = 0; dayOffset < 8; dayOffset += 1) {
    const date = addDays(targetDate, dayOffset);
    const ranges = rangesResult.rows.filter((range) => range.dia_semana === weekday(date));
    const candidates: Array<{ start: Date; end: Date; distance: number }> = [];
    for (const range of ranges) {
      const rangeStart = timeMinutes(range.hora_inicio);
      const rangeEnd = timeMinutes(range.hora_fim);
      for (
        let minute = rangeStart;
        minute + durationMinutes <= rangeEnd;
        minute += range.intervalo_minutos
      ) {
        const start = atTime(date, formatMinutes(minute));
        const end = new Date(start.getTime() + durationMinutes * 60_000);
        if (start.getTime() <= Date.now() || eventsResult.rows.some((event) => overlaps(start, end, event))) {
          continue;
        }
        candidates.push({ start, end, distance: Math.abs(minute - preferred.minutes) });
      }
    }
    candidates.sort((left, right) => left.distance - right.distance || left.start.getTime() - right.start.getTime());
    if (candidates.length) {
      return { start: candidates[0].start, end: candidates[0].end, targetDate };
    }
  }
  return null;
}

export async function resolveAutomaticOrthodonticReturn(
  client: PoolClient,
  auth: AuthContext,
  sourceEventId: string,
): Promise<AutomaticOrthodonticReturnPlan | null> {
  const existing = await client.query(
    `select 1 from odonto.agenda_eventos
      where empresa_id = $1 and origem_evento_id = $2 and retorno_ortodontico = true limit 1`,
    [auth.empresaId, sourceEventId],
  );
  if (existing.rowCount) return null;

  const result = await client.query<OrthodonticEventRow>(
    `select ae.paciente_id, pac.nome as paciente_nome, pct.celular as paciente_whatsapp,
            ae.profissional_id, ae.inicio_em::text,
            coalesce(current_maintenance.id, maintenance.id) as manutencao_procedimento_id,
            coalesce(current_maintenance.nome, maintenance.nome) as manutencao_descricao,
            coalesce(current_maintenance.duracao_minutos, maintenance.duracao_minutos) as manutencao_duracao_minutos
       from odonto.agenda_eventos ae
       join odonto.pacientes pac on pac.id = ae.paciente_id and pac.empresa_id = ae.empresa_id
       left join odonto.paciente_contatos pct on pct.paciente_id = pac.id
       join lateral (
         select 1
           from odonto.agenda_evento_procedimentos aep
           join odonto.catalogo_procedimentos cp
             on cp.id = aep.catalogo_procedimento_id and cp.empresa_id = aep.empresa_id
          where aep.empresa_id = ae.empresa_id and aep.agenda_evento_id = ae.id
            and aep.status::text not in ('cancelado', 'suspenso')
            and cp.tipo_evento_ortodontico in ('INSTALACAO', 'MANUTENCAO')
          limit 1
       ) orthodontic on true
       left join lateral (
         select cp.id, cp.nome, cp.duracao_minutos
           from odonto.agenda_evento_procedimentos aep
           join odonto.catalogo_procedimentos cp
             on cp.id = aep.catalogo_procedimento_id and cp.empresa_id = aep.empresa_id
          where aep.empresa_id = ae.empresa_id and aep.agenda_evento_id = ae.id
            and aep.status::text not in ('cancelado', 'suspenso')
            and cp.tipo_evento_ortodontico = 'MANUTENCAO'
          order by aep.created_at
          limit 1
       ) current_maintenance on true
       left join lateral (
         select cp.id, cp.nome, cp.duracao_minutos
           from odonto.catalogo_procedimentos cp
          where cp.empresa_id = ae.empresa_id and cp.ativo = true
            and cp.tipo_evento_ortodontico = 'MANUTENCAO'
          order by cp.nome, cp.id
          limit 1
       ) maintenance on true
      where ae.id = $1 and ae.empresa_id = $2 and ae.tipo = 'consulta'
        and ae.paciente_id is not null and ae.profissional_id is not null
      limit 1`,
    [sourceEventId, auth.empresaId],
  );
  const event = result.rows[0];
  if (!event?.manutencao_procedimento_id || !event.manutencao_descricao || !event.manutencao_duracao_minutos) {
    return null;
  }

  const start = new Date(event.inicio_em);
  const slot = await findClosestSlot(
    client,
    auth,
    event.profissional_id,
    start,
    event.manutencao_duracao_minutos,
  );
  if (!slot) return null;

  return {
    sourceEventId,
    patientId: event.paciente_id,
    patientName: event.paciente_nome,
    patientWhatsapp: event.paciente_whatsapp,
    professionalId: event.profissional_id,
    procedureId: event.manutencao_procedimento_id,
    procedureDescription: event.manutencao_descricao,
    start: slot.start,
    end: slot.end,
    targetDate: slot.targetDate,
  };
}
