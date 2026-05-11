import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CURRENCY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const NUMBER = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Returns "$1,185.00" — full currency string including the $ prefix. */
export function formatCurrency(amount: number | null | undefined): string {
  return CURRENCY.format(Number(amount) || 0);
}

/** Returns "1,185.00" — comma-thousands, two decimals, no $ prefix.
 *  Useful when the dollar sign is already in the markup and you only need
 *  to swap a `.toFixed(2)` for thousands grouping. */
export function formatAmount(amount: number | null | undefined): string {
  return NUMBER.format(Number(amount) || 0);
}

export const CONTRACT_TERM_OPTIONS = [
  { months: 0, label: 'Month-to-month' },
  { months: 36, label: '3-year agreement' },
  { months: 60, label: '5-year agreement' },
] as const;

/** Human label for a package's contract term length in months. 0 = MTM,
 *  36 = 3-year, 60 = 5-year. Unknown values fall through to "N-month
 *  agreement" so admins who type a custom number don't see a broken label. */
export function formatContractTerm(months: number | null | undefined): string {
  const m = Number(months) || 0;
  if (m <= 0) return 'Month-to-month';
  if (m === 36) return '3-year agreement';
  if (m === 60) return '5-year agreement';
  return `${m}-month agreement`;
}
