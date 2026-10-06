import { Router } from 'express';
import { requirePermission } from '../../middlewares/permissions';
import { asyncHandler } from '../../utils/async-handler';
import {
  accessUserParamsSchema,
  approvalDecisionSchema,
  approvalQuerySchema,
  createAccessProfileSchema,
  createAccessUserSchema,
  updateAccessProfileSchema,
  updateAccessUserSchema,
} from './access.schemas';
import {
  createAccessProfile,
  createAccessUser,
  currentAccess,
  listAccessProfiles,
  listAccessUsers,
  updateAccessProfile,
  updateAccessUser,
} from './access.service';
import { decideApprovalRequest, listApprovalRequests } from './approval-request.service';
import { executeApprovedRequest } from './approval-executor.service';

const router = Router();

router.get('/me/acesso', asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await currentAccess(req.auth!)) });
}));

router.get('/usuarios', requirePermission('usuarios.visualizar'), asyncHandler(async (req, res) => {
  res.json({ success: true, usuarios: await listAccessUsers(req.auth!) });
}));

router.post('/usuarios', requirePermission('usuarios.gerenciar'), asyncHandler(async (req, res) => {
  const usuario = await createAccessUser(req.auth!, createAccessUserSchema.parse(req.body));
  res.status(201).json({ success: true, usuario, message: 'Usuario criado com senha temporaria.' });
}));

router.put('/usuarios/:id', requirePermission('usuarios.gerenciar'), asyncHandler(async (req, res) => {
  const { id } = accessUserParamsSchema.parse(req.params);
  const usuario = await updateAccessUser(req.auth!, id, updateAccessUserSchema.parse(req.body));
  res.json({ success: true, usuario, message: 'Acesso do usuario atualizado. As sessoes anteriores foram encerradas.' });
}));

router.get('/perfis', requirePermission('usuarios.visualizar'), asyncHandler(async (req, res) => {
  res.json({ success: true, perfis: await listAccessProfiles(req.auth!) });
}));

router.post('/perfis', requirePermission('perfis.gerenciar'), asyncHandler(async (req, res) => {
  const perfil = await createAccessProfile(req.auth!, createAccessProfileSchema.parse(req.body));
  res.status(201).json({ success: true, perfil, message: 'Perfil de acesso criado.' });
}));

router.put('/perfis/:id', requirePermission('perfis.gerenciar'), asyncHandler(async (req, res) => {
  const { id } = accessUserParamsSchema.parse(req.params);
  const perfil = await updateAccessProfile(req.auth!, id, updateAccessProfileSchema.parse(req.body));
  res.json({ success: true, perfil, message: 'Perfil atualizado. Usuarios vinculados deverao entrar novamente.' });
}));

router.get('/aprovacoes', requirePermission('aprovacoes.financeiras.aprovar'), asyncHandler(async (req, res) => {
  const { status } = approvalQuerySchema.parse(req.query);
  res.json({ success: true, solicitacoes: await listApprovalRequests(req.auth!, status) });
}));

router.post('/aprovacoes/:id/decisao', requirePermission('aprovacoes.financeiras.aprovar'), asyncHandler(async (req, res) => {
  const { id } = accessUserParamsSchema.parse(req.params);
  const input = approvalDecisionSchema.parse(req.body);
  const request = await decideApprovalRequest(req.auth!, id, input);
  if (input.decisao === 'rejeitar') {
    res.json({ success: true, message: 'Solicitacao rejeitada.' });
    return;
  }
  await executeApprovedRequest(req.auth!, request);
  res.json({ success: true, message: 'Operacao autorizada e executada.' });
}));

export default router;
