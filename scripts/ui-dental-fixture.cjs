const { randomUUID } = require('node:crypto');
const { query, pool } = require('../dist/database/pool');

async function main() {
  if (process.argv[2] === 'remove') {
    const id = process.argv[3];
    if (!/^[a-f0-9-]{36}$/.test(id || '')) throw new Error('Invalid fixture id');
    const result = await query("delete from odonto.catalogo_procedimentos where id=$1 and nome='VALIDACAO UI - Extracao temporaria'", [id]);
    console.log('Temporary catalog records removed:', result.rowCount);
    return;
  }
  const companies = await query("select distinct ue.empresa_id from odonto.usuario_empresas ue join odonto.usuarios u on u.id=ue.usuario_id where u.login='master' and ue.ativo");
  if (companies.rows.length !== 1) throw new Error('Expected exactly one master company');
  const id = randomUUID();
  await query("insert into odonto.catalogo_procedimentos(id,empresa_id,nome,valor,duracao_minutos,extracao,forma_cobranca) values($1,$2,'VALIDACAO UI - Extracao temporaria',300,30,true,'POR_DENTE')", [id, companies.rows[0].empresa_id]);
  console.log(id);
}
main().catch(error => { console.error(error.message); process.exitCode=1; }).finally(() => pool.end());
