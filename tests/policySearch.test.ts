import { describe, expect, it } from 'vitest';
import { scoreDoc, searchPolicies, tokenize } from '../server/retrieval/policySearch';
import { policies } from '../server/data/policies';

describe('tokenize', () => {
  it('lowercases and strips stopwords', () => {
    expect(tokenize('I would like a REFUND for my purchase')).toEqual([
      'would',
      'like',
      'refund',
      'purchase',
    ]);
  });
});

describe('searchPolicies', () => {
  it('returns refund-related policies for a refund query', () => {
    const results = searchPolicies('I want a refund for my subscription', policies);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].doc.title.toLowerCase()).toContain('refund');
  });

  it('returns the SLA policy for an outage query', () => {
    const results = searchPolicies('outage uptime SLA breach service credits', policies);
    expect(results[0].doc.id).toBe('policy-enterprise-sla');
  });

  it('respects the result limit', () => {
    const results = searchPolicies('refund billing cancel data', policies, 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('returns nothing for an unrelated query', () => {
    const results = searchPolicies('zzz qqq xyzzy', policies);
    expect(results).toEqual([]);
  });

  it('excludes deprecated and internal documents before ranking', () => {
    const results = searchPolicies('refund refund risk score', policies);
    expect(results.map((r) => r.doc.id)).toContain('policy-refund-v3');
    expect(results.every((r) => r.doc.status === 'active' && r.doc.audience === 'public')).toBe(true);
  });

  it('does not match query fragments inside unrelated words', () => {
    expect(scoreDoc(['pro'], { ...policies[0], title: 'Example', body: 'provide process' })).toBe(0);
  });

  it('ranks security guidance first for a sign-in report', () => {
    const results = searchPolicies('Someone signed in from another country and it was not me', policies);
    expect(results[0].doc.id).toBe('policy-security-incident');
  });
});
