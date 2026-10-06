import { AuthContext } from '../../types/public';
import { paymentStatusSchema } from '../finance/finance.schemas';
import { updatePaymentStatus } from '../finance/finance.service';
import { expensePaymentSchema } from '../finance/management.schemas';
import { updateExpensePayment } from '../finance/management.service';
import { paymentReversalSchema, quoteReceiptSchema } from '../finance/receivables.schemas';
import { receiveQuote, reversePayment } from '../finance/receivables.service';
import { undoReconciliation } from '../finance/reconciliation.service';
import {
  ApprovalRequestRow,
  markApprovalExecution,
  requesterAuthForApproval,
} from './approval-request.service';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Payload de aprovacao invalido.');
  return value as Record<string, unknown>;
}

export async function executeApprovedRequest(approver: AuthContext, request: ApprovalRequestRow): Promise<void> {
  await markApprovalExecution(approver, request.id, 'executando');
  try {
    const requester = await requesterAuthForApproval(request);
    const approval = { approvalId: request.id, approvedBy: approver.usuarioId };
    const payload = object(request.payload);
    if (request.tipo === 'recebimento_retroativo') {
      const quoteId = String(payload.quoteId ?? '');
      await receiveQuote(requester, quoteId, quoteReceiptSchema.parse(payload.input), approval);
    } else if (request.tipo === 'estorno_recebimento_retroativo') {
      const paymentId = String(payload.paymentId ?? '');
      await reversePayment(requester, paymentId, paymentReversalSchema.parse(payload.input), approval);
    } else if (request.tipo === 'pagamento_profissional_retroativo') {
      const id = String(payload.id ?? '');
      await updatePaymentStatus(requester, id, paymentStatusSchema.parse(payload.input), approval);
    } else if (request.tipo === 'pagamento_despesa_retroativo') {
      const id = String(payload.id ?? '');
      await updateExpensePayment(requester, id, expensePaymentSchema.parse(payload.input), approval);
    } else if (request.tipo === 'desfazer_conciliacao') {
      await undoReconciliation(requester, String(payload.statementMovementId ?? ''), String(payload.reason ?? ''), approval);
    } else {
      throw new Error('Tipo de aprovacao sem executor cadastrado.');
    }
    await markApprovalExecution(approver, request.id, 'executada');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha nao identificada.';
    await markApprovalExecution(approver, request.id, 'falhou', message);
    throw error;
  }
}
