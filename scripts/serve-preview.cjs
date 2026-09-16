// Local UI verification: deliberately does not start the notification worker.
const { app } = require('../dist/app');
app.listen(3333, '127.0.0.1', () => console.log('Preview API: http://127.0.0.1:3333 (no reminder worker)'));
