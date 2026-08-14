import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
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

router.get('/catalogo', asyncHandler(async (req, res) => {
  const input = catalogProcedureListQuerySchema.parse(req.query);
  res.json({ success: true, procedimentos: await listCatalogProcedures(req.auth!, input) });
}));

router.post('/catalogo', asyncHandler(async (req, res) => {
  const input = catalogProcedureSchema.parse(req.body);
  res.status(201).json({ success: true, procedimento: await createCatalogProcedure(req.auth!, input) });
}));

router.get('/catalogo/:id', asyncHandler(async (req, res) => {
  const { id } = catalogProcedureIdSchema.parse(req.params);
  res.json({ success: true, procedimento: await getCatalogProcedure(req.auth!, id) });
}));

router.put('/catalogo/:id', asyncHandler(async (req, res) => {
  const { id } = catalogProcedureIdSchema.parse(req.params);
  const input = catalogProcedureSchema.parse(req.body);
  res.json({ success: true, procedimento: await updateCatalogProcedure(req.auth!, id, input) });
}));

router.patch('/catalogo/:id/status', asyncHandler(async (req, res) => {
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
