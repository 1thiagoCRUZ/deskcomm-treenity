export const NOTIFY_KINDS = {
  message_inbound: { sound: "message", tagPrefix: "msg" },
  alerts_toggle: { sound: "success", tagPrefix: "alerts" },
  lead_assigned: { sound: "attention", tagPrefix: "lead-assigned" },
  lead_won: { sound: "success", tagPrefix: "lead-won" },
  lead_lost: { sound: "failure", tagPrefix: "lead-lost" },
  mention: { sound: "attention", tagPrefix: "mention" },
  venda_bot: { sound: "success", tagPrefix: "venda-bot" },
  especialista: { sound: "attention", tagPrefix: "especialista" },
} as const;

export type NotifyKind = keyof typeof NOTIFY_KINDS;
