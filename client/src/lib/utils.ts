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
