import { Router } from 'express';
import { authenticate, requirePerfil } from '../../middlewares/auth';
import { asyncHandler } from '../../utils/async-handler';
import {
  bootstrapGestorSchema,
  changePasswordSchema,
  createGestorSchema,
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  patientLoginSchema,
} from './auth.schemas';
import {
  bootstrapGestor,
  changePassword,
  createGestor,
  login,
  loginPaciente,
  requestPasswordReset,
  resetPassword,
} from './auth.service';

const router = Router();

router.post(
  '/bootstrap-gestor',
  asyncHandler(async (req, res) => {
    const payload = bootstrapGestorSchema.parse(req.body);
    const result = await bootstrapGestor(payload);

    res.status(201).json({
      success: true,
      ...result,
    });
  }),
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const payload = loginSchema.parse(req.body);
    const result = await login(payload);

    res.json({
      success: true,
      ...result,
    });
  }),
);

router.post(
  '/paciente/login',
  asyncHandler(async (req, res) => {
    const payload = patientLoginSchema.parse(req.body);
    const result = await loginPaciente(payload);

    res.json({
      success: true,
      ...result,
    });
  }),
);

router.post(
  '/alterar-senha',
  authenticate,
  asyncHandler(async (req, res) => {
    const payload = changePasswordSchema.parse(req.body);
    await changePassword(req.auth!, payload);

    res.json({
      success: true,
      message: 'Senha alterada com sucesso.',
    });
  }),
);

router.post(
  '/senha/solicitar-reset',
  asyncHandler(async (req, res) => {
    const payload = passwordResetRequestSchema.parse(req.body);
    await requestPasswordReset(payload);

    res.json({
      success: true,
      message: 'Se houver um e-mail cadastrado, as instrucoes serao enviadas.',
    });
  }),
);

router.post(
  '/senha/resetar',
  asyncHandler(async (req, res) => {
    const payload = passwordResetConfirmSchema.parse(req.body);
    await resetPassword(payload);

    res.json({
      success: true,
      message: 'Senha redefinida com sucesso.',
    });
  }),
);

router.post(
  '/gestores',
  authenticate,
  requirePerfil(['portal_admin', 'gestor']),
  asyncHandler(async (req, res) => {
    const payload = createGestorSchema.parse(req.body);
    const result = await createGestor(req.auth!, payload);

    res.status(201).json({
      success: true,
      gestor: result,
    });
  }),
);

export default router;
