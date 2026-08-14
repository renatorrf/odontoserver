import { app } from './app';
import { env } from './config/env';
import { pool } from './database/pool';
import { startAppointmentReminderWorker } from './modules/schedule/reminder.worker';

const server = app.listen(env.port, () => {
  console.log(`odonto-backend listening on http://localhost:${env.port}`);
});
const reminderWorker = startAppointmentReminderWorker();

function shutdown(): void {
  clearInterval(reminderWorker);
  server.close(() => {
    void pool.end().finally(() => process.exit(0));
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
