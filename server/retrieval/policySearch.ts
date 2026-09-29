import type { PolicyDoc } from '../../shared/types';

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'i', 'my', 'me', 'we', 'our',
  'you', 'your', 'it', 'its', 'to', 'of', 'for', 'and', 'or', 'in', 'on', 'at',
  'this', 'that', 'be', 'been', 'do', 'does', 'did', 'have', 'has', 'had',
  'with', 'from', 'by', 'as', 'not', 'no', 'so', 'if', 'but', 'about', 'please',
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/**
 * Score a document against query terms using simple term-frequency matching.
 * Good enough for a corpus of this size; swap for embeddings if the doc set grows.
 */
export function scoreDoc(queryTerms: string[], doc: PolicyDoc): number {
  const titleTerms = new Set(tokenize(doc.title));
  const bodyTerms = tokenize(doc.body);
  let score = 0;
  for (const term of new Set(queryTerms)) {
    if (titleTerms.has(term)) score += 3;
    score += bodyTerms.filter((word) => word === term).length;
  }
  return score;
}

export interface ScoredDoc {
  doc: PolicyDoc;
  score: number;
}

export function searchPolicies(
  query: string,
  docs: PolicyDoc[],
  limit = 3
): ScoredDoc[] {
  const terms = tokenize(query);
  const intentBoosts: Record<string, RegExp> = {
    'policy-security-incident': /signed in|sign.in|unauthorized|suspicious login|wasn.t me|credential compromise/i,
    'policy-data-privacy': /gdpr|ccpa|personal data|data export|data deletion/i,
    'policy-enterprise-sla': /outage|sla breach|uptime/i,
    'policy-refund-v3': /refund|money back/i,
  };
  return docs
    .filter((doc) => doc.status === 'active' && doc.audience === 'public')
    .map((doc) => ({ doc, score: scoreDoc(terms, doc) +
      (intentBoosts[doc.id]?.test(query) ? 20 : 0) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
