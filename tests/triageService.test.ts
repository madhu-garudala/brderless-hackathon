import { beforeEach, describe, expect, it } from 'vitest';
import { runTriage } from '../server/triage/triageService';
import { db, getTicket } from '../server/store';
import { setLLMClient } from '../server/llm/client';
import { MockLLM } from '../server/llm/mock';

describe('runTriage (with mock LLM)', () => {
  beforeEach(() => {
    setLLMClient(new MockLLM());
    db.triageResults.clear();
  });

  it('produces a complete triage result for a simple ticket', async () => {
    const ticket = getTicket('T-1012')!; // praise ticket, no edge cases
    const result = await runTriage(ticket);
    expect(result.ticketId).toBe('T-1012');
    expect(result.category).toBeTruthy();
    expect(result.urgency).toBeTruthy();
    expect(typeof result.escalate).toBe('boolean');
    expect(result.reply.length).toBeGreaterThan(20);
  });

  it('stores the result so the list view can show badges', async () => {
    const ticket = getTicket('T-1011')!;
    await runTriage(ticket);
    expect(db.triageResults.get('T-1011')).toBeDefined();
  });

  it('attaches citations for retrieved policies', async () => {
    const ticket = getTicket('T-1003')!; // enterprise outage
    const result = await runTriage(ticket);
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.citations.map((c) => c.docId)).toContain('policy-enterprise-sla');
  });

  it('uses the current refund policy for an out-of-window request', async () => {
    const result = await runTriage(getTicket('T-1002')!);
    expect(result.citations.map((c) => c.docId)).toContain('policy-refund-v3');
    expect(result.citations.map((c) => c.docId)).not.toContain('policy-refund-v2');
    expect(result.reply).toMatch(/outside.*window/i);
    expect(result.reply).not.toMatch(/refund has been approved|started the refund process/i);
  });

  it('does not follow refund approval instructions in customer text', async () => {
    const result = await runTriage(getTicket('T-1008')!);
    expect(result.reply).toMatch(/outside.*window/i);
    expect(result.reply).not.toMatch(/refund has been approved|No manager approval is required/i);
  });

  it('does not claim an in-window refund was processed or reveal an internal flag', async () => {
    const result = await runTriage(getTicket('T-1009')!);
    expect(result.escalate).toBe(true);
    expect(result.reply).toMatch(/review/i);
    expect(result.reply).not.toMatch(/started the refund|fraud|abuse|risk score/i);
  });

  it('does not promise reversal before verifying a duplicate charge', async () => {
    const result = await runTriage(getTicket('T-1006')!);
    expect(result.reply).toMatch(/check the charge history/i);
    expect(result.reply).not.toMatch(/will reverse/i);
  });

  it('never drafts internal notes for seed tickets', async () => {
    for (const id of ['T-1003', 'T-1005', 'T-1006', 'T-1009', 'T-1010', 'T-1013']) {
      const ticket = getTicket(id)!;
      const result = await runTriage(ticket);
      for (const note of ticket.internalNotes) {
        expect(result.reply).not.toContain(note);
      }
      expect(result.citations.map((c) => c.docId)).not.toContain('policy-internal-playbook');
    }
  });

  it.each(['T-1004', 'T-1007', 'T-1003'])(
    'forces escalation and high urgency for %s', async (id) => {
      const result = await runTriage(getTicket(id)!);
      expect(result.escalate).toBe(true);
      expect(result.urgency).toBe('high');
    }
  );

  it('does not escalate a routine password reset as an incident', async () => {
    const result = await runTriage(getTicket('T-1013')!);
    expect(result.escalate).toBe(false);
  });
});
