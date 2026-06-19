import twilio from 'twilio'

export function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) throw new Error('Twilio env vars missing')
  return twilio(accountSid, authToken)
}

export async function sendSms(to: string, body: string): Promise<string> {
  const client = getTwilioClient()
  const message = await client.messages.create({
    from: process.env.TWILIO_PHONE_NUMBER!,
    to,
    body,
  })
  return message.sid
}
