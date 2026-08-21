import { Router } from 'express';
import multer from 'multer';
import { requirePerfil } from '../../middlewares/auth';
import { asyncHandler } from '../../utils/async-handler';
import { createPatientSchema, patientIdParamSchema, patientListQuerySchema } from './patient.schemas';
import { createPatient, getPatient, inactivatePatient, listPatients, updatePatient } from './patient.service';
import {
  patientAnamnesisSchema,
  patientAppointmentsQuerySchema,
  patientDocumentMetadataSchema,
  patientDocumentParamsSchema,
  patientDocumentUpdateSchema,
  patientFinancialEntrySchema,
  patientQuoteItemParamsSchema,
  patientQuoteParamsSchema,
  quoteItemStatusSchema,
  clinicalDocumentSchema,
} from './patient-tabs.schemas';
import {
  createPatientAnamnesis,
  createPatientFinancialEntry,
  deletePatientDocument,
  duplicatePatientQuote,
  getPatientDocumentFile,
  getPatientTabSummary,
  listPatientAnamneses,
  listPatientAppointments,
  listPatientDocuments,
  listPatientFinancial,
  listPatientQuotes,
  listPatientTimeline,
  savePatientDocument,
  updatePatientDocument,
  updateQuoteItemStatus,
  listClinicalDocuments,
  createClinicalDocument,
  updateClinicalDocument,
  listMedications,
} from './patient-tabs.service';

const router = Router();
const documentUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

router.get('/apoio/medicamentos', asyncHandler(async (req, res) => {
  res.json({ success: true, medicamentos: await listMedications(req.auth!) });
}));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = patientListQuerySchema.parse(req.query);
    const patients = await listPatients(req.auth!, query);

    res.json({
      success: true,
      patients,
    });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const payload = createPatientSchema.parse(req.body);
    const patient = await createPatient(req.auth!, payload);

    res.status(201).json({
      success: true,
      patient,
    });
  }),
);

router.get('/:id/resumo-abas', asyncHandler(async (req, res) => {
  const { id } = patientIdParamSchema.parse(req.params);
  res.json({ success: true, ...(await getPatientTabSummary(req.auth!, id)) });
}));

router.get('/:id/orcamentos', asyncHandler(async (req, res) => {
  const { id } = patientIdParamSchema.parse(req.params);
  res.json({ success: true, orcamentos: await listPatientQuotes(req.auth!, id) });
}));

router.post('/:id/orcamentos/:quoteId/duplicar', asyncHandler(async (req, res) => {
  const { id, quoteId } = patientQuoteParamsSchema.parse(req.params);
  const orcamento = await duplicatePatientQuote(req.auth!, id, quoteId);
  res.status(201).json({ success: true, orcamento });
}));

router.patch('/:id/orcamentos/:quoteId/itens/:itemId/status', asyncHandler(async (req, res) => {
  const { id, quoteId, itemId } = patientQuoteItemParamsSchema.parse(req.params);
  const { status } = quoteItemStatusSchema.parse(req.body);
  await updateQuoteItemStatus(req.auth!, id, quoteId, itemId, status);
  res.json({ success: true, message: 'Status do procedimento atualizado.' });
}));

router.get(
  '/:id/financeiro',
  requirePerfil(['portal_admin', 'gestor']),
  asyncHandler(async (req, res) => {
    const { id } = patientIdParamSchema.parse(req.params);
    res.json({ success: true, ...(await listPatientFinancial(req.auth!, id)) });
  }),
);

router.post(
  '/:id/financeiro',
  requirePerfil(['portal_admin', 'gestor']),
  asyncHandler(async (req, res) => {
    const { id } = patientIdParamSchema.parse(req.params);
    const lancamento = await createPatientFinancialEntry(req.auth!, id, patientFinancialEntrySchema.parse(req.body));
    res.status(201).json({ success: true, lancamento });
  }),
);

router.get('/:id/documentos', asyncHandler(async (req, res) => {
  const { id } = patientIdParamSchema.parse(req.params);
  res.json({ success: true, documentos: await listPatientDocuments(req.auth!, id) });
}));

router.get('/:id/documentos-clinicos', asyncHandler(async (req, res) => {
  const { id } = patientIdParamSchema.parse(req.params);
  res.json({ success: true, documentos: await listClinicalDocuments(req.auth!, id) });
}));

router.post('/:id/documentos-clinicos', requirePerfil(['portal_admin','gestor','dentista']), asyncHandler(async (req, res) => {
  const { id } = patientIdParamSchema.parse(req.params);
  res.status(201).json({ success: true, documento: await createClinicalDocument(req.auth!, id, clinicalDocumentSchema.parse(req.body)) });
}));

router.put('/:id/documentos-clinicos/:documentId', requirePerfil(['portal_admin','gestor','dentista']), asyncHandler(async (req, res) => {
  const { id, documentId } = patientDocumentParamsSchema.parse(req.params);
  await updateClinicalDocument(req.auth!, id, documentId, clinicalDocumentSchema.parse(req.body));
  res.json({ success: true, message: 'Documento clinico atualizado.' });
}));

router.post(
  '/:id/documentos',
  documentUpload.single('arquivo'),
  asyncHandler(async (req, res) => {
    const { id } = patientIdParamSchema.parse(req.params);
    const documento = await savePatientDocument(
      req.auth!,
      id,
      req.file!,
      patientDocumentMetadataSchema.parse(req.body),
    );
    res.status(201).json({ success: true, documento });
  }),
);

router.put('/:id/documentos/:documentId', asyncHandler(async (req, res) => {
  const { id, documentId } = patientDocumentParamsSchema.parse(req.params);
  await updatePatientDocument(req.auth!, id, documentId, patientDocumentUpdateSchema.parse(req.body));
  res.json({ success: true, message: 'Documento atualizado.' });
}));

router.delete('/:id/documentos/:documentId', asyncHandler(async (req, res) => {
  const { id, documentId } = patientDocumentParamsSchema.parse(req.params);
  await deletePatientDocument(req.auth!, id, documentId);
  res.json({ success: true, message: 'Documento excluido.' });
}));

router.get('/:id/documentos/:documentId/arquivo', asyncHandler(async (req, res) => {
  const { id, documentId } = patientDocumentParamsSchema.parse(req.params);
  const file = await getPatientDocumentFile(req.auth!, id, documentId);
  res.type(file.mimeType);
  res.download(file.fullPath, file.fileName);
}));

router.get(
  '/:id/anamnese',
  requirePerfil(['portal_admin', 'gestor', 'dentista']),
  asyncHandler(async (req, res) => {
    const { id } = patientIdParamSchema.parse(req.params);
    res.json({ success: true, ...(await listPatientAnamneses(req.auth!, id)) });
  }),
);

router.post(
  '/:id/anamnese',
  requirePerfil(['portal_admin', 'gestor', 'dentista']),
  asyncHandler(async (req, res) => {
    const { id } = patientIdParamSchema.parse(req.params);
    const anamnese = await createPatientAnamnesis(req.auth!, id, patientAnamnesisSchema.parse(req.body));
    res.status(201).json({ success: true, anamnese });
  }),
);

router.get('/:id/agendamentos', asyncHandler(async (req, res) => {
  const { id } = patientIdParamSchema.parse(req.params);
  const input = patientAppointmentsQuerySchema.parse(req.query);
  res.json({ success: true, agendamentos: await listPatientAppointments(req.auth!, id, input) });
}));

router.get('/:id/timeline', asyncHandler(async (req, res) => {
  const { id } = patientIdParamSchema.parse(req.params);
  res.json({ success: true, timeline: await listPatientTimeline(req.auth!, id) });
}));

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const params = patientIdParamSchema.parse(req.params);
    const patient = await getPatient(req.auth!, params.id);

    res.json({
      success: true,
      patient,
    });
  }),
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const params = patientIdParamSchema.parse(req.params);
    const payload = createPatientSchema.parse(req.body);
    const patient = await updatePatient(req.auth!, params.id, payload);

    res.json({
      success: true,
      patient,
    });
  }),
);

router.patch(
  '/:id/inativar',
  asyncHandler(async (req, res) => {
    const params = patientIdParamSchema.parse(req.params);
    await inactivatePatient(req.auth!, params.id);

    res.json({
      success: true,
      message: 'Paciente inativado.',
    });
  }),
);

export default router;
