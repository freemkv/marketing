// Private service binding only: no public route, workers.dev or preview URL.
// Pages owns CAPTCHA, rate limits and one-use challenges. This service can only
// send their fixed verification message from the restricted sender binding.
export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return new Response(null, {status: 405});
    try {
      const text = await request.text();
      if (text.length > 4096) return new Response(null, {status: 413});
      const {email, code, label} = JSON.parse(text);
      if (typeof email !== 'string' || email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ||
        typeof code !== 'string' || !/^\d{6}$/.test(code) || typeof label !== 'string' || label.length > 1000) {
        return new Response(null, {status: 400});
      }
      const result = await env.EMAIL.send({to: email, from: 'noreply@freemkv.org', subject: 'Your freemkv verification code',
        text: `${code}\n\n${label}\n\nThis code expires in 10 minutes. If you did not request it, ignore this email.`});
      if (!result?.messageId) return new Response(null, {status: 503});
      return Response.json({sent: true});
    } catch { return new Response(null, {status: 503}); }
  },
};
