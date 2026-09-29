import type { TriageCategory, TriageUrgency } from '../../shared/types';

export interface ParsedTriage {
  category: TriageCategory;
  urgency: TriageUrgency;
  escalate: boolean;
  reply: string;
  reasoning: string;
}

const categories: Record<string, TriageCategory> = {
  refund: 'refund', refund_request: 'refund',
  billing: 'billing', billing_issue: 'billing',
  outage: 'outage', incident: 'outage',
  security: 'security', cancellation: 'cancellation', churn: 'cancellation',
  privacy: 'privacy', data_request: 'privacy',
  account: 'account', general: 'general', other: 'general',
};
const urgencies: Record<string, TriageUrgency> = {
  low: 'low', medium: 'medium', normal: 'medium',
  high: 'high', urgent: 'high',
};

function normalize<T>(field: string, value: unknown, labels: Record<string, T>): T {
  if (typeof value !== 'string') throw new Error(`Invalid ${field} from model`);
  const normalized = labels[value.trim().toLowerCase().replace(/[\s-]+/g, '_')];
  if (!normalized) throw new Error(`Invalid ${field} from model: ${value}`);
  return normalized;
}

/**
 * Extract the triage JSON from a model response. Models sometimes wrap JSON
 * in code fences or prose, so we locate the outermost object first.
 */
export function parseTriageResponse(raw: string): ParsedTriage {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in model response');
  }
  const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Model response must be an object');
  }
  const fields = parsed as Record<string, unknown>;

  for (const field of ['category', 'urgency', 'escalate', 'reply']) {
    if (!(field in fields)) {
      throw new Error(`Model response missing field: ${field}`);
    }
  }

  return {
    category: normalize('category', fields.category, categories),
    urgency: normalize('urgency', fields.urgency, urgencies),
    escalate: parseEscalate(fields.escalate),
    reply: requireText('reply', fields.reply),
    reasoning: fields.reasoning === undefined ? '' : requireText('reasoning', fields.reasoning),
  };
}

function parseEscalate(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  throw new Error('Invalid escalate from model');
}

function requireText(field: string, value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid ${field} from model`);
  return value;
}
