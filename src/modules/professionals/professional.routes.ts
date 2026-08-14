import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import {
  commissionSchema,
  createProfessionalSchema,
  professionalIdParamSchema,
  professionalListQuerySchema,
} from './professional.schemas';
import {
  createProfessional,
  getProfessional,
  inactivateProfessional,
  listProfessionals,
  saveCommission,
  updateProfessional,
} from './professional.service';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const input = professionalListQuerySchema.parse(req.query);
    const professionals = await listProfessionals(req.auth!, input);
    res.json({ success: true, professionals });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = createProfessionalSchema.parse(req.body);
    const professional = await createProfessional(req.auth!, input);
    res.status(201).json({ success: true, professional });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = professionalIdParamSchema.parse(req.params);
    const professional = await getProfessional(req.auth!, id);
    res.json({ success: true, professional });
  }),
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = professionalIdParamSchema.parse(req.params);
    const input = createProfessionalSchema.parse(req.body);
    const professional = await updateProfessional(req.auth!, id, input);
    res.json({ success: true, professional });
  }),
);

router.patch(
  '/:id/inativar',
  asyncHandler(async (req, res) => {
    const { id } = professionalIdParamSchema.parse(req.params);
    await inactivateProfessional(req.auth!, id);
    res.json({ success: true, message: 'Profissional inativado.' });
  }),
);

router.put(
  '/:id/comissao',
  asyncHandler(async (req, res) => {
    const { id } = professionalIdParamSchema.parse(req.params);
    const input = commissionSchema.parse(req.body);
    const commission = await saveCommission(req.auth!, id, input);
    res.json({ success: true, commission });
  }),
);

export default router;
