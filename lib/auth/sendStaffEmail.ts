type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export async function sendStaffEmail(input: SendEmailInput): Promise<{ sent: boolean; devLogged?: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? 'FreshLoop AI <onboarding@resend.dev>';

  if (!apiKey) {
    if (process.env.NODE_ENV === 'development') {
      console.info('[FreshLoop email — dev only, no RESEND_API_KEY]', {
        to: input.to,
        subject: input.subject,
        text: input.text,
      });
      return { sent: true, devLogged: true };
    }
    throw new Error(
      'Email is not configured. Set RESEND_API_KEY and EMAIL_FROM in .env.'
    );
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html ?? `<pre style="font-family:sans-serif">${input.text}</pre>`,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Email provider error: ${detail.slice(0, 200)}`);
  }

  return { sent: true };
}
