
import { Pipe, PipeTransform } from '@angular/core';
import { Authority, Money } from './contracts';

const scale = 10_000n;
const decimalPattern = /^(-?)(\d{1,15})(?:\.(\d{1,4}))?$/;

export function moneyUnits(raw: string): bigint | null {
  const match = decimalPattern.exec(raw.trim());
  if (!match) return null;
  const units = BigInt(match[2]) * scale + BigInt((match[3] ?? '').padEnd(4, '0'));
  return match[1] ? -units : units;
}

export function moneyText(units: bigint): Money {
  const magnitude = units < 0n ? -units : units;
  const fraction = (magnitude % scale).toString().padStart(4, '0').replace(/0+$/, '');
  return (units < 0n ? '-' : '') + (magnitude / scale) + (fraction ? '.' + fraction : '');
}

export function reserveAuthority(units: bigint): Authority {
  const magnitude = units < 0n ? -units : units;
  if (magnitude > 100_000n * scale) return 'Manager';
  if (magnitude > 10_000n * scale) return 'Supervisor';
  return 'Automatic';
}

export const claimLimit = 10_000_000n * scale;

@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(value: Money | null | undefined): string {
    if (value == null) return '—';
    const sign = value.startsWith('-') ? '-' : '';
    const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
    return sign + '$' + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' +
      fraction.replace(/0+$/, '').padEnd(2, '0');
  }
}
