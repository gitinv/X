import { resolveSmsDriverName, type SmsDriverName } from "@redlady/core";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

async function sendTwilio(to: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const token = process.env.TWILIO_AUTH_TOKEN ?? "";
  const from = process.env.TWILIO_FROM ?? "";
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  const json = (await response.json()) as { sid?: string; message?: string };
  if (!response.ok) throw new Error(json.message || "Twilio refused the message.");
  return json.sid || "twilio";
}

async function sendSns(to: string, body: string) {
  const client = new SNSClient({ region: process.env.AWS_REGION });
  const result = await client.send(new PublishCommand({ PhoneNumber: to, Message: body }));
  return result.MessageId || "sns";
}

export async function dispatchSms(to: string, body: string): Promise<{ name: SmsDriverName; providerId: string }> {
  const name = resolveSmsDriverName(process.env);
  if (name === "twilio") return { name, providerId: await sendTwilio(to, body) };
  if (name === "sns") return { name, providerId: await sendSns(to, body) };
  const providerId = `console-${Date.now()}`;
  console.log(`[sms:console] to=${to} ${body}`);
  return { name, providerId };
}
