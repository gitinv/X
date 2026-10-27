export const demoAccounts = [
  { label: "Customer", email: "ava@redladyspa.com", password: "Demo-Customer-2026" },
  { label: "Technician", email: "chloe@redladyspa.com", password: "Demo-Tech-2026" },
  { label: "Front desk", email: "desk@redladyspa.com", password: "Demo-Desk-2026" },
  { label: "Oak manager", email: "manager@redladyspa.com", password: "Demo-Manager-2026" },
  { label: "Owner", email: "owner@redladyspa.com", password: "Demo-Owner-2026" },
  { label: "Platform admin", email: "platform@redladyspa.com", password: "Demo-Platform-2026" },
];

export function demoHints() {
  return process.env.DEMO_HINTS === "true" ? demoAccounts : [];
}
