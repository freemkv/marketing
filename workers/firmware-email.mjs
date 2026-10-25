import {firmwareInputText} from '../src/lib/firmware-report-inputs.mjs';
// Private service binding only: no public route, workers.dev or preview URL.
// Pages owns CAPTCHA, rate limits and one-use challenges. This service can only
// send their fixed verification message from the restricted sender binding.
export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return new Response(null, {status: 405});
    try {
      const text = await request.text();
      if (text.length > 100 * 1024) return new Response(null, {status: 413});
      const report = JSON.parse(text);
      const {email, code, label} = report;
      if (report.type === 'flash-report') {
        const description = report.description ?? '';
        const descriptionBytes = typeof description === 'string' ? new TextEncoder().encode(description).byteLength : Infinity;
        if (!env.REPORT_TO || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(env.REPORT_TO) ||
            typeof report.report_id !== 'string' || !/^[0-9a-f-]{36}$/.test(report.report_id) ||
            !['session', 'all'].includes(report.scope) || typeof report.url !== 'string' ||
            descriptionBytes > 16 * 1024 || (description !== '' && !description.trim()) ||
            !/^https:\/\/freemkv\.org\/api\/flash-reports\/download\/[0-9a-f-]{36}\?token=[0-9a-f]{64}$/.test(report.url)) {
          return new Response(null, {status: 400});
        }
        // Email is plain text. Normalize platform newlines and strip control
        // characters that can make the supplied paragraph misleading.
        const safeDescription = description
          .replace(/\r\n?/g, '\n')
          .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
        const inputs = firmwareInputText(report.firmware_inputs);
        const result = await env.EMAIL.send({to: env.REPORT_TO, from: 'noreply@freemkv.org',
          subject: `freemkv flash report ${report.report_id}`,
          text: `A ${report.scope === 'all' ? 'full history' : 'session'} flash report was submitted.\n\nDescription:\n${safeDescription}\n\n${inputs}\n\nDownload: ${report.url}\n\nThe upload expires after 90 days.`});
        if (!result?.messageId) return new Response(null, {status: 503});
        return Response.json({sent: true});
      }
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
