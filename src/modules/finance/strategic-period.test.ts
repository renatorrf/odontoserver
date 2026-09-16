import test from 'node:test';
import assert from 'node:assert/strict';
import { strategicDashboardQuerySchema } from './management.schemas';
import { resolveStrategicGranularity } from './strategic-period';
import { installationCountSql, installationSalesSql } from './installation-count';

test('explicit daily view is preserved for the entire year', () => {
  const input = strategicDashboardQuerySchema.parse({ inicio: '2026-01-01', fim: '2026-12-31', granularidade: 'dia' });
  assert.equal(resolveStrategicGranularity(input), 'dia');
});

test('explicit monthly view is preserved for a partial month', () => {
  const input = strategicDashboardQuerySchema.parse({ inicio: '2026-09-10', fim: '2026-09-20', granularidade: 'mes' });
  assert.equal(resolveStrategicGranularity(input), 'mes');
});

test('existing callers keep automatic aggregation including leap-year boundaries', () => {
  const input = { inicio: '2024-02-01', fim: '2024-03-16' };
  assert.equal(resolveStrategicGranularity(strategicDashboardQuerySchema.parse(input)), 'dia');
  assert.equal(resolveStrategicGranularity({ ...input, fim: '2024-03-17' }), 'mes');
  assert.equal(resolveStrategicGranularity({ inicio: '2026-01-01', fim: '2026-12-31' }), 'mes');
});

test('invalid granularity and reversed periods are rejected', () => {
  const period = { inicio: '2026-09-01', fim: '2026-09-30' };
  assert.equal(strategicDashboardQuerySchema.safeParse({ ...period, granularidade: 'year' }).success, false);
  assert.equal(strategicDashboardQuerySchema.safeParse({ ...period, inicio: '2026-10-01' }).success, false);
});

test('orthodontic indicators use the catalog event classification', () => {
  assert.match(installationCountSql, /tipo_evento_ortodontico='INSTALACAO'/);
  assert.match(installationSalesSql, /tipo_evento_ortodontico\)='INSTALACAO'/);
  assert.match(installationSalesSql, /coalesce\(r\.valor,c\.valor,0\)/);
  assert.doesNotMatch(installationSalesSql, /ilike '%ortod%'/i);
});
