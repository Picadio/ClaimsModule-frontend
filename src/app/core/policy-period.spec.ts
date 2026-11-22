
import { Policy } from './contracts';
import { lossDayOutsidePeriod, policyPeriodBadge } from './policy-period';

const policy: Policy = {
  policyId: 'policy', policyNumber: 'POL-100', clientName: 'Meridian', effectiveDate: '2025-01-01',
  expirationDate: '2025-12-31', status: 'Active', coverageTypes: [],
};

describe('Policy period', () => {
  it('matches the API UTC date boundary including the endpoints', () => {
    expect(lossDayOutsidePeriod('2024-12-31T22:30:00-02:00', policy)).toBe(false);
    expect(lossDayOutsidePeriod('2025-12-31T23:30:00-02:00', policy)).toBe(true);
  });

  it('distinguishes an expired policy from a loss outside its period', () => {
    const expired = { ...policy, status: 'Expired' };
    expect(policyPeriodBadge('2025-06-01T12:00:00Z', expired))
      .toEqual({ label: 'Policy expired · loss within period', warning: true });
    expect(policyPeriodBadge('2025-06-01T12:00:00Z', policy))
      .toEqual({ label: 'In force on loss date', warning: false });
  });
});
