/**
 * Web only: Paystack's checkout as an overlay on top of the app (Paystack InlineJS v2), instead of
 * leaving app.deloo.space for checkout.paystack.com. Card details still go only to Paystack: the
 * overlay is their page in an iframe. Resolves when the renter pays or closes it; the server
 * (verify / webhook) still decides whether the booking is paid.
 */
type Callbacks = { onSuccess?: (tx: unknown) => void; onCancel?: () => void; onError?: (e: unknown) => void };
type PaystackPop = { resumeTransaction: (accessCode: string, callbacks?: Callbacks) => unknown };
declare global {
  interface Window { PaystackPop?: new () => PaystackPop }
}

const SCRIPT = 'https://js.paystack.co/v2/inline.js';
let loading: Promise<void> | null = null;

function load(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('web only'));
  if (window.PaystackPop) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => (window.PaystackPop ? resolve() : reject(new Error('Paystack didn’t load')));
    s.onerror = () => { loading = null; reject(new Error('Paystack didn’t load')); };
    document.head.appendChild(s);
  });
  return loading;
}

/** Load the script early (e.g. when the pay screen opens) so the overlay appears straight away. */
export function preloadPaystack() { load().catch(() => {}); }

/** The access code is the last part of the hosted checkout URL (https://checkout.paystack.com/<code>). */
export const accessCodeOf = (authorizationUrl: string) => authorizationUrl.split('?')[0].split('/').filter(Boolean).pop() ?? '';

export async function payInline(authorizationUrl: string): Promise<'paid' | 'closed'> {
  await load();
  const Pop = window.PaystackPop!;
  return new Promise((resolve, reject) => {
    new Pop().resumeTransaction(accessCodeOf(authorizationUrl), {
      onSuccess: () => resolve('paid'),
      onCancel: () => resolve('closed'),
      onError: (e) => reject(e instanceof Error ? e : new Error('Paystack couldn’t open')),
    });
  });
}
