export type SmsDriverName = "console" | "twilio" | "sns";

export interface SmsEnv {
  SMS_DRIVER?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM?: string;
  AWS_REGION?: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_PRICE_ID?: string;
  [key: string]: string | undefined;
}

export function resolveSmsDriverName(env: SmsEnv): SmsDriverName {
  if (env.SMS_DRIVER === "twilio" && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM) {
    return "twilio";
  }
  if (env.SMS_DRIVER === "sns" && env.AWS_REGION && env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
    return "sns";
  }
  return "console";
}

export function billingMode(env: SmsEnv): "stripe" | "stub" {
  return env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_ID ? "stripe" : "stub";
}
