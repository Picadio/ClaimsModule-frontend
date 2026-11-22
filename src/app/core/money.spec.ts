
import { decodeResponse, encodeRequest } from './claims-api';
import { MoneyPipe, moneyText, moneyUnits, reserveAuthority } from './money';

describe('Money contracts', () => {
  it('preserves the complete decimal value in both directions', () => {
    const value = '999999999999999.9999';
    expect(encodeRequest({ amount: value })).toBe('{"amount":999999999999999.9999}');
    expect(decodeResponse('{"currentAmount":999999999999999.9999,"changeSequence":3}'))
      .toEqual({ currentAmount: value, changeSequence: 3 });
    expect(moneyText(-moneyUnits(value)!)).toBe('-999999999999999.9999');
    expect(new MoneyPipe().transform(value)).toBe('$999,999,999,999,999.9999');
  });

  it('preserves audited decimal values with the backend audit serializer casing', () => {
    expect(decodeResponse('{"oldValues":{"Balance":999999999999999.9998},"newValues":{"Amount":0.0001,"NewBalance":999999999999999.9999,"ChangeSequence":7}}'))
      .toEqual({
        oldValues: { Balance: '999999999999999.9998' },
        newValues: { Amount: '0.0001', NewBalance: '999999999999999.9999', ChangeSequence: 7 },
      });
  });
  it('applies the thresholds to absolute change amounts without rounding', () => {
    expect(reserveAuthority(moneyUnits('-10000.0000')!)).toBe('Automatic');
    expect(reserveAuthority(moneyUnits('10000.0001')!)).toBe('Supervisor');
    expect(reserveAuthority(moneyUnits('100000')!)).toBe('Supervisor');
    expect(reserveAuthority(moneyUnits('-100000.0001')!)).toBe('Manager');
    expect(moneyUnits('0.00001')).toBeNull();
  });
});

