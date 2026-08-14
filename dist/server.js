"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const env_1 = require("./config/env");
const pool_1 = require("./database/pool");
const reminder_worker_1 = require("./modules/schedule/reminder.worker");
const server = app_1.app.listen(env_1.env.port, () => {
    console.log(`odonto-backend listening on http://localhost:${env_1.env.port}`);
});
const reminderWorker = (0, reminder_worker_1.startAppointmentReminderWorker)();
function shutdown() {
    clearInterval(reminderWorker);
    server.close(() => {
        void pool_1.pool.end().finally(() => process.exit(0));
    });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
