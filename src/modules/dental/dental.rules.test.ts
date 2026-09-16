import test from 'node:test';
import assert from 'node:assert/strict';
import { assertClinical, dentalQuantity, sameTeeth, teethSchema, Tooth } from './dental.rules';
import { AuthContext } from '../../types/public';
const teeth:Tooth[]=[{numero:18,denticao:'permanente'},{numero:28,denticao:'permanente'}];
test('FDI: permanent and deciduous ranges, invalid quadrants and duplicates',()=>{
  for(const q of [1,2,3,4]) for(let n=1;n<=8;n++) assert(teethSchema.safeParse([{numero:q*10+n,denticao:'permanente'}]).success);
  for(const q of [5,6,7,8]) for(let n=1;n<=5;n++) assert(teethSchema.safeParse([{numero:q*10+n,denticao:'decidua'}]).success);
  for(const n of [0,10,19,49,56,99]) assert(!teethSchema.safeParse([{numero:n,denticao:'permanente'}]).success);
  assert(!teethSchema.safeParse([{numero:51,denticao:'permanente'}]).success);
  assert(!teethSchema.safeParse([teeth[0],teeth[0]]).success);
});
test('billing: per tooth, single set, missing teeth and inconsistent quantity',()=>{
  assert.equal(dentalQuantity({extracao:true,forma_cobranca:'POR_DENTE'},teeth,2),2);
  assert.equal(dentalQuantity({extracao:true,forma_cobranca:'VALOR_UNICO'},teeth,1),1);
  assert.throws(()=>dentalQuantity({extracao:true,forma_cobranca:'POR_DENTE'},teeth,1));
  assert.throws(()=>dentalQuantity({extracao:true,forma_cobranca:'VALOR_UNICO'},[],1));
  assert.throws(()=>dentalQuantity({extracao:false,forma_cobranca:'VALOR_UNICO'},teeth,1));
  assert(sameTeeth(teeth,[...teeth].reverse()));
  assert(!sameTeeth(teeth,[teeth[0]]));
});
test('clinical permissions are separate from attendance permissions',()=>{
  for(const perfil of ['atendente','paciente']) assert.throws(()=>assertClinical({perfil} as AuthContext));
  for(const perfil of ['gestor','dentista','portal_admin']) assert.doesNotThrow(()=>assertClinical({perfil} as AuthContext));
});
