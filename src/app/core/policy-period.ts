
import { Policy } from './contracts';

export function lossDayOutsidePeriod(lossDate: string, policy: Policy): boolean {
  const date = new Date(lossDate);
  if (!Number.isFinite(date.getTime())) return false;
  const day = date.toISOString().slice(0, 10);
  return day < policy.effectiveDate || day > policy.expirationDate;
}

export function policyPeriodBadge(lossDate: string, policy: Policy): { label: string; warning: boolean } {
  if (lossDayOutsidePeriod(lossDate, policy)) return { label: 'Loss outside policy period', warning: true };
  if (policy.status === 'Expired') return { label: 'Policy expired · loss within period', warning: true };
  return { label: 'In force on loss date', warning: false };
}
