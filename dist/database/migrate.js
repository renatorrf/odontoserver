"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const pool_1 = require("./pool");
async function ensureMigrationTable() {
    await pool_1.pool.query('create schema if not exists odonto');
    await pool_1.pool.query(`
    create table if not exists odonto.schema_migrations (
      name varchar(180) primary key,
      applied_at timestamptz not null default now()
    )
  `);
}
async function alreadyApplied(name) {
    const result = await pool_1.pool.query('select 1 from odonto.schema_migrations where name = $1 limit 1', [name]);
    return (result.rowCount ?? 0) > 0;
}
async function run() {
    await ensureMigrationTable();
    const migrationsDir = node_path_1.default.join(__dirname, 'migrations');
    const migrationFiles = (await promises_1.default.readdir(migrationsDir))
        .filter((file) => file.endsWith('.sql'))
        .sort((a, b) => a.localeCompare(b));
    for (const file of migrationFiles) {
        if (await alreadyApplied(file)) {
            console.log(`skip ${file}`);
            continue;
        }
        const sql = await promises_1.default.readFile(node_path_1.default.join(migrationsDir, file), 'utf8');
        const client = await pool_1.pool.connect();
        const noTransaction = sql.includes('-- migrate:no-transaction');
        try {
            if (noTransaction) {
                const statements = sql
                    .split('-- migrate:statement')
                    .map((statement) => statement.trim())
                    .filter(Boolean);
                for (const statement of statements) {
                    await client.query(statement);
                }
                await client.query('insert into odonto.schema_migrations (name) values ($1)', [file]);
            }
            else {
                await client.query('begin');
                await client.query(sql);
                await client.query('insert into odonto.schema_migrations (name) values ($1)', [file]);
                await client.query('commit');
            }
            console.log(`applied ${file}`);
        }
        catch (error) {
            if (!noTransaction) {
                await client.query('rollback');
            }
            throw error;
        }
        finally {
            client.release();
        }
    }
}
run()
    .catch((error) => {
    console.error('migration failed', error);
    process.exitCode = 1;
})
    .finally(async () => {
    await pool_1.pool.end();
});
