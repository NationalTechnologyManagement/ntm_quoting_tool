// Lead-gen mode is decided at build time via VITE_LEAD_GEN_MODE. The Railway
// "lite" service ships a build with this flag set, so the bundle never even
// includes the payment/contract code paths the user could trigger.
export const IS_LEAD_GEN_MODE: boolean =
  String(import.meta.env.VITE_LEAD_GEN_MODE).toLowerCase() === 'true';
