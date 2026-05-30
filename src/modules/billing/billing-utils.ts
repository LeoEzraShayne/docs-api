export type StripeAmountSession = {
  amount_total?: number | null;
  currency?: string | null;
};

export function checkoutFrontendUrl(rawUrl?: string | null) {
  return rawUrl?.split(',')[0]?.trim() || 'http://localhost:3000';
}

export function stripeAmountToJpy(session: StripeAmountSession) {
  const amount = session.amount_total ?? 0;
  return session.currency === 'jpy' ? amount : Math.round(amount / 100);
}
