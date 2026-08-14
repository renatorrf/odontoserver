import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { env } from './config/env';
import { authenticate, requirePerfil } from './middlewares/auth';
import authRoutes from './modules/auth/auth.routes';
import clientRoutes from './modules/client/client.routes';
import commercialRoutes from './modules/commercial/commercial.routes';
import financeRoutes from './modules/finance/finance.routes';
import patientRoutes from './modules/patients/patient.routes';
import professionalRoutes from './modules/professionals/professional.routes';
import procedureRoutes from './modules/procedures/procedure.routes';
import projectionRoutes from './modules/projection/projection.routes';
import scheduleRoutes from './modules/schedule/schedule.routes';
import { HttpError } from './utils/http-error';

export const app = express();

app.use(
  cors({
    origin: env.corsOrigin,
  }),
);

app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({
    success: true,
    service: 'odonto-backend',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use(
  '/api/pacientes',
  authenticate,
  requirePerfil(['portal_admin', 'gestor', 'dentista', 'atendente']),
  patientRoutes,
);
app.use(
  '/api/profissionais',
  authenticate,
  requirePerfil(['portal_admin', 'gestor']),
  professionalRoutes,
);
app.use(
  '/api/agenda',
  authenticate,
  requirePerfil(['portal_admin', 'gestor', 'dentista', 'atendente']),
  scheduleRoutes,
);
app.use(
  '/api/procedimentos',
  authenticate,
  requirePerfil(['portal_admin', 'gestor', 'dentista', 'atendente']),
  procedureRoutes,
);
app.use(
  '/api/financeiro',
  authenticate,
  requirePerfil(['portal_admin', 'gestor']),
  financeRoutes,
);
app.use(
  '/api/projecao',
  authenticate,
  requirePerfil(['portal_admin', 'gestor']),
  projectionRoutes,
);
app.use(
  '/api/comercial',
  authenticate,
  requirePerfil(['portal_admin', 'gestor']),
  commercialRoutes,
);
app.use('/api/cliente', authenticate, requirePerfil(['paciente']), clientRoutes);

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Rota nao encontrada.',
  });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof multer.MulterError) {
    res.status(400).json({
      success: false,
      message: error.code === 'LIMIT_FILE_SIZE' ? 'O arquivo deve ter no maximo 10 MB.' : 'Falha ao receber o arquivo.',
    });
    return;
  }

  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    res.status(400).json({
      success: false,
      message: firstIssue?.message || 'Dados invalidos.',
      details: error.flatten(),
    });
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      details: error.details,
    });
    return;
  }

  console.error(error);
  res.status(500).json({
    success: false,
    message: 'Erro interno do servidor.',
  });
});
