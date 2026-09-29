import type { Ticket, TriageResult } from '../../shared/types';
import { db } from '../store';
import { searchPolicies } from '../retrieval/policySearch';
import { buildTriagePrompt, SYSTEM_PROMPT } from './promptBuilder';
import { parseTriageResponse } from './parser';
import { getLLMClient } from '../llm/client';
import { applyBusinessRules } from './businessRules';

export async function runTriage(ticket: Ticket): Promise<TriageResult> {
  const query = `${ticket.subject} ${ticket.message}`;
  const retrieved = searchPolicies(query, db.policies, 3);

  const prompt = buildTriagePrompt(
    ticket,
    retrieved.map((r) => r.doc)
  );

  const llm = getLLMClient();
  const raw = await llm.complete({ system: SYSTEM_PROMPT, user: prompt });
  const parsed = parseTriageResponse(raw);
  const enforced = applyBusinessRules(ticket, parsed);

  const result: TriageResult = {
    ticketId: ticket.id,
    category: parsed.category,
    urgency: enforced.urgency,
    escalate: enforced.escalate,
    reply: enforced.reply,
    reasoning: parsed.reasoning,
    citations: retrieved.map((r) => ({
      docId: r.doc.id,
      title: r.doc.title,
      snippet: r.doc.body.slice(0, 140) + '…',
    })),
    generatedAt: new Date().toISOString(),
  };

  db.triageResults.set(ticket.id, result);
  console.info(JSON.stringify({ event: 'triage_complete', ticketId: ticket.id,
    queryTerms: query.toLowerCase().match(/[a-z]{3,}/g)?.length ?? 0,
    retrieved: retrieved.map(({ doc, score }) => ({ id: doc.id, score })),
    parsed: { category: parsed.category, urgency: parsed.urgency, escalate: parsed.escalate },
    result: { category: result.category, urgency: result.urgency, escalate: result.escalate },
    replyOverridden: result.reply !== parsed.reply,
  }));
  if (process.env.TRIAGE_DEBUG === '1') {
    console.debug(JSON.stringify({ event: 'triage_debug', ticketId: ticket.id,
      query, prompt, raw }));
  }
  return result;
}
