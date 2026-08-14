"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processUpcomingAppointmentReminders = processUpcomingAppointmentReminders;
exports.startAppointmentReminderWorker = startAppointmentReminderWorker;
const pool_1 = require("../../database/pool");
const schedule_notification_service_1 = require("./schedule-notification.service");
let running = false;
async function processUpcomingAppointmentReminders() {
    if (running)
        return 0;
    running = true;
    try {
        const eventIds = await (0, pool_1.transaction)(async (client) => {
            const result = await client.query(`select id from odonto.agenda_eventos
          where tipo = 'consulta'
            and status in ('agendado', 'confirmado')
            and lembrete_duas_horas_habilitado = true
            and lembrete_duas_horas_enviado_em is null
            and inicio_em > now()
            and inicio_em <= now() + interval '2 hours'
          order by inicio_em
          for update skip locked
          limit 50`);
            if (result.rows.length) {
                await client.query(`update odonto.agenda_eventos
              set lembrete_duas_horas_enviado_em = now()
            where id = any($1::uuid[])`, [result.rows.map((row) => row.id)]);
            }
            return result.rows.map((row) => row.id);
        });
        for (const eventId of eventIds) {
            await (0, schedule_notification_service_1.sendScheduleNotification)(eventId, 'lembrete_duas_horas');
        }
        return eventIds.length;
    }
    finally {
        running = false;
    }
}
function startAppointmentReminderWorker() {
    void processUpcomingAppointmentReminders().catch((error) => console.error('appointment reminder failed', error));
    const timer = setInterval(() => {
        void processUpcomingAppointmentReminders().catch((error) => console.error('appointment reminder failed', error));
    }, 60_000);
    timer.unref();
    return timer;
}
