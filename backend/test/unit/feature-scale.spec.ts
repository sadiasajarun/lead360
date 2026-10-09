import { complexityForScale, scaleAdjustDays, scaleFromAnalysis, scaleFromSignals } from '../../src/modules/generation/engine/feature-scale.util';

describe('feature scale', () => {
  it('a products-only CMS is smaller than a multi-entity CMS with approval workflow', () => {
    const small = scaleFromSignals({ entities: ['products'], operations: 'crud', roles: 1 }, 2);
    const large = scaleFromSignals({ entities: ['products', 'pages', 'banners', 'blog posts'], operations: 'workflow', roles: 3, platforms: ['web', 'admin'] }, 6);
    expect(small).toBeLessThan(large);
    expect(small).toBeGreaterThanOrEqual(1);
    expect(large).toBeLessThanOrEqual(5);
  });

  it('integrations raise scale (checkout with a payment gateway vs a static cart)', () => {
    const cart = scaleFromSignals({ entities: ['cart'], operations: 'crud', roles: 1 });
    const checkout = scaleFromSignals({ entities: ['cart', 'orders'], operations: 'workflow', roles: 2, integrations: ['payment gateway', 'SMS'] });
    expect(checkout).toBeGreaterThan(cart);
  });

  it('is bounded and deterministic with empty evidence', () => {
    expect(scaleFromSignals(undefined)).toBe(1);
    expect(scaleFromSignals({}, 0)).toBe(scaleFromSignals({}, 0));
  });

  it('maps analyst complexity + key features to a scale', () => {
    expect(scaleFromAnalysis('simple', 1)).toBe(1);
    expect(scaleFromAnalysis('moderate', 3)).toBe(3);
    expect(scaleFromAnalysis('very-complex', 6)).toBe(5);
  });

  it('round-trips scale to complexity tiers', () => {
    expect(complexityForScale(1)).toBe('simple');
    expect(complexityForScale(3)).toBe('moderate');
    expect(complexityForScale(5)).toBe('very-complex');
  });

  it('transfers effort sub-linearly across scales', () => {
    expect(scaleAdjustDays(10, 2, 2)).toBeCloseTo(10);
    const doubled = scaleAdjustDays(10, 2, 4);
    expect(doubled).toBeGreaterThan(10);
    expect(doubled).toBeLessThan(20);
  });
});
