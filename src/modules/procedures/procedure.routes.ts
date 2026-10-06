import { Router } from 'express';
import { z } from 'zod';
import { transaction } from '../../database/pool';
import { teethSchema } from '../dental/dental.rules';
import { correctExtraction } from '../dental/dental.service';
import { asyncHandler } from '../../utils/async-handler';
import { requirePermission } from '../../middlewares/permissions';
import {
  catalogProcedureIdSchema,
  catalogProcedureListQuerySchema,
  catalogProcedureSchema,
  catalogProcedureStatusSchema,
  createProcedureSchema,
  procedureListQuerySchema,
} from './procedure.schemas';
import {
  createCatalogProcedure,
  createProcedure,
  getCatalogProcedure,
  listCatalogProcedures,
  listProcedures,
  updateCatalogProcedure,
  updateCatalogProcedureStatus,
} from './procedure.service';

const router = Router();
router.patch('/realizados/:id/dentes', requirePermission('pacientes.clinico.editar'), asyncHandler(async (req,res)=>{
  const {id}=catalogProcedureIdSchema.parse(req.params);
  const input=z.object({dentes:teethSchema,justificativa:z.string().trim().min(3).max(1000)}).parse(req.body);
  await transaction((client)=>correctExtraction(client,req.auth!,id,input.dentes,input.justificativa));
  res.json({success:true});
}));

router.get('/catalogo', asyncHandler(async (req, res) => {
  const input = catalogProcedureListQuerySchema.parse(req.query);
  res.json({ success: true, procedimentos: await listCatalogProcedures(req.auth!, input) });
}));

router.post('/catalogo', requirePermission('procedimentos.editar'), asyncHandler(async (req, res) => {
  const input = catalogProcedureSchema.parse(req.body);
  res.status(201).json({ success: true, procedimento: await createCatalogProcedure(req.auth!, input) });
}));

router.get('/catalogo/:id', asyncHandler(async (req, res) => {
  const { id } = catalogProcedureIdSchema.parse(req.params);
  res.json({ success: true, procedimento: await getCatalogProcedure(req.auth!, id) });
}));

router.put('/catalogo/:id', requirePermission('procedimentos.editar'), asyncHandler(async (req, res) => {
  const { id } = catalogProcedureIdSchema.parse(req.params);
  const input = catalogProcedureSchema.parse(req.body);
  res.json({ success: true, procedimento: await updateCatalogProcedure(req.auth!, id, input) });
}));

router.patch('/catalogo/:id/status', requirePermission('procedimentos.editar'), asyncHandler(async (req, res) => {
  const { id } = catalogProcedureIdSchema.parse(req.params);
  const input = catalogProcedureStatusSchema.parse(req.body);
  await updateCatalogProcedureStatus(req.auth!, id, input);
  res.json({ success: true, message: input.ativo ? 'Procedimento reativado.' : 'Procedimento inativado.' });
}));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const params = procedureListQuerySchema.parse(req.query);
    const procedures = await listProcedures(req.auth!, params);

    res.json({
      success: true,
      procedures,
    });
  }),
);

router.post(
  '/',
  requirePermission('pacientes.clinico.editar'),
  asyncHandler(async (req, res) => {
    const payload = createProcedureSchema.parse(req.body);
    const procedure = await createProcedure(req.auth!, payload);

    res.status(201).json({
      success: true,
      procedure,
    });
  }),
);

export default router;
