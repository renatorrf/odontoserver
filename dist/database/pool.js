"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.query = query;
exports.transaction = transaction;
const pg_1 = require("pg");
const env_1 = require("../config/env");
function resolveSsl() {
    const value = env_1.env.dbSsl;
    if (['true', '1', 'yes', 'on', 'require'].includes(value)) {
        return { rejectUnauthorized: false };
    }
    return false;
}
exports.pool = new pg_1.Pool({
    connectionString: env_1.env.databaseUrl,
    max: env_1.env.dbPoolMax,
    ssl: resolveSsl(),
});
async function query(text, values = []) {
    return exports.pool.query(text, values);
}
async function transaction(callback) {
    const client = await exports.pool.connect();
    try {
        await client.query('begin');
        const result = await callback(client);
        await client.query('commit');
        return result;
    }
    catch (error) {
        await client.query('rollback');
        throw error;
    }
    finally {
        client.release();
    }
}
