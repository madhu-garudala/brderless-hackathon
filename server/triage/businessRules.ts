import type { Ticket, TriageCategory, TriageUrgency } from '../../shared/types';

const REFUND_WINDOW_DAYS = 30;

export function applyBusinessRules(
  ticket: Ticket,
  triage: { category: TriageCategory; urgency: TriageUrgency; escalate: boolean; reply: string }
): { urgency: TriageUrgency; escalate: boolean; reply: string } {
  const text = `${ticket.subject} ${ticket.message}`.toLowerCase();
  const security = /unauthorized|suspicious (login|sign.in)|wasn.t me|credential compromise|someone signed in/.test(text);
  const privacy = triage.category === 'privacy' ||
    /gdpr|ccpa|personal data|data (export|deletion)|delete my data/.test(text);
  const sla = ticket.customer.plan === 'enterprise' &&
    (triage.category === 'outage' || /outage|sla breach|uptime|dashboard down/.test(text));
  const mandatoryEscalation = security || privacy || sla;

  let reply = triage.reply;
  if (ticket.purchaseDate && /refund|money back/.test(text)) {
    const ageDays = Math.floor(
      (Date.parse(ticket.createdAt) - Date.parse(ticket.purchaseDate)) / 86_400_000
    );
    if (Number.isFinite(ageDays) && ageDays > REFUND_WINDOW_DAYS) {
      reply = `Hi, thanks for reaching out. Our current refund policy covers purchases within ${REFUND_WINDOW_DAYS} days. Your purchase falls outside that window, so I cannot approve a refund under the standard policy. I can arrange a review of your options with our billing team.\n\nBest regards,\nSupport Team`;
    } else if (Number.isFinite(ageDays)) {
      reply = `Hi, thanks for reaching out. Your purchase appears to be within our ${REFUND_WINDOW_DAYS}-day refund window. We will verify the purchase details and eligibility before processing any refund. We will follow up with the next steps.\n\nBest regards,\nSupport Team`;
    }
  }

  const flaggedRefund = /refund-abuse flag/i.test(ticket.internalNotes.join(' ')) &&
    /refund|money back/.test(text);
  if (flaggedRefund) {
    reply = 'Hi, thanks for reaching out. We have received your refund request and will review the purchase details and available options. We will follow up after that review.\n\nBest regards,\nSupport Team';
  }

  if (/charged twice|billed .* twice|duplicate charge/.test(text)) {
    reply = 'Hi, thanks for flagging the possible duplicate charge. We will check the charge history and payment status before confirming whether a reversal is needed. We will follow up with what we find.\n\nBest regards,\nSupport Team';
  }

  return {
    urgency: mandatoryEscalation ? 'high' : triage.urgency,
    escalate: triage.escalate || mandatoryEscalation || flaggedRefund,
    reply,
  };
}
