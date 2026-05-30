import { checkoutFrontendUrl, stripeAmountToJpy } from './billing-utils';

describe('billing utils', () => {
  it('uses the primary frontend URL when multiple URLs are configured', () => {
    expect(
      checkoutFrontendUrl(
        'https://docs.meritledger.org,https://preview.example',
      ),
    ).toBe('https://docs.meritledger.org');
  });

  it('falls back to localhost when no frontend URL is configured', () => {
    expect(checkoutFrontendUrl(undefined)).toBe('http://localhost:3000');
  });

  it('keeps Stripe JPY amount totals as whole-yen values', () => {
    expect(stripeAmountToJpy({ amount_total: 980, currency: 'jpy' })).toBe(980);
    expect(stripeAmountToJpy({ amount_total: 66640, currency: 'jpy' })).toBe(
      66640,
    );
  });

  it('converts non-JPY minor units to whole JPY-equivalent units', () => {
    expect(stripeAmountToJpy({ amount_total: 98000, currency: 'usd' })).toBe(
      980,
    );
  });
});
