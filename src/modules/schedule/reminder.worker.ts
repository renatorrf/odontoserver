import { transaction } from '../../database/pool';
import { sendScheduleNotification } from './schedule-notification.service';

let running = false;

export async function processUpcomingAppointmentReminders(): Promise<number> {
  if (running) return 0;
  running = true;
  try {
    const twoHourEventIds = await transaction(async (client) => {
      const result = await client.query<{ id: string }>(
        `select id from odonto.agenda_eventos
          where tipo = 'consulta'
            and status in ('agendado', 'confirmado')
            and lembrete_duas_horas_habilitado = true
            and lembrete_duas_horas_enviado_em is null
            and inicio_em > now()
            and inicio_em <= now() + interval '2 hours'
          order by inicio_em
          for update skip locked
          limit 50`,
      );
      if (result.rows.length) {
        await client.query(
          `update odonto.agenda_eventos
              set lembrete_duas_horas_enviado_em = now()
            where id = any($1::uuid[])`,
          [result.rows.map((row) => row.id)],
        );
      }
      return result.rows.map((row) => row.id);
    });
    for (const eventId of twoHourEventIds) {
      await sendScheduleNotification(eventId, 'lembrete_duas_horas');
    }
    const threeDayEventIds = await transaction(async (client) => {
      const result = await client.query<{ id: string }>(
        `select id from odonto.agenda_eventos
          where tipo = 'consulta'
            and retorno_ortodontico = true
            and status in ('agendado', 'confirmado')
            and lembrete_tres_dias_enviado_em is null
            and inicio_em > now()
            and inicio_em <= now() + interval '3 days'
          order by inicio_em
          for update skip locked
          limit 50`,
      );
      if (result.rows.length) {
        await client.query(
          `update odonto.agenda_eventos
              set lembrete_tres_dias_enviado_em = now()
            where id = any($1::uuid[])`,
          [result.rows.map((row) => row.id)],
        );
      }
      return result.rows.map((row) => row.id);
    });
    for (const eventId of threeDayEventIds) {
      await sendScheduleNotification(eventId, 'lembrete_retorno_tres_dias');
    }
    return twoHourEventIds.length + threeDayEventIds.length;
  } finally {
    running = false;
  }
}

export function startAppointmentReminderWorker(): NodeJS.Timeout {
  void processUpcomingAppointmentReminders().catch((error) => console.error('appointment reminder failed', error));
  const timer = setInterval(() => {
    void processUpcomingAppointmentReminders().catch((error) => console.error('appointment reminder failed', error));
  }, 60_000);
  timer.unref();
  return timer;
}
