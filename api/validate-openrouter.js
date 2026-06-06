/*
 * GET /api/validate-openrouter — CP9 part 3 GO/NO-GO gate.
 *
 * Fires ONE real vision+text call to OpenRouter, server-side, and reports back.
 * It is the cheapest possible proof that:
 *   - OPENROUTER_API_KEY is present in the server's secrets (never the client),
 *   - the account has credits, and
 *   - the chosen model accepts an image + text and returns content.
 *
 * The test image is a 32×32 solid red PNG inlined as a data URL, so the check
 * has no external dependency — we just ask the model what color it sees and
 * expect "red". This is validation only; CP13 wires the real synthesis into
 * /api/generate. Hit it from the iQOO browser: …/api/validate-openrouter
 */

// 32×32 solid red (#DC2626) PNG — the vision probe.
const RED_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAOklEQVR4nO3WSwkAMBAD0aoZ/4IipioKPTzYe2DJZ87q6R0CeVFcNEFLVUybZnBmMkMVAa+gY1/T9QWI8qA9JnV//AAAAABJRU5ErkJggg=='

export default async function handler(req, res) {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) {
    res.status(500).json({
      ok: false,
      error: 'OPENROUTER_API_KEY is not set',
      fix: 'Local: add it to .env then `vercel dev`. Prod: `vercel env add OPENROUTER_API_KEY` (Production), then redeploy.',
    })
    return
  }

  const model = process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001'
  const started = Date.now()

  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        // Optional OpenRouter attribution headers — safe to keep.
        'HTTP-Referer': 'https://echo-one-gamma.vercel.app',
        'X-Title': 'Echo CP9 validation',
      },
      body: JSON.stringify({
        model,
        max_tokens: 20,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What color is this image? Reply with one word.' },
              { type: 'image_url', image_url: { url: RED_PNG } },
            ],
          },
        ],
      }),
    })

    const elapsedMs = Date.now() - started
    const data = await r.json()

    if (!r.ok) {
      res.status(502).json({
        ok: false,
        model,
        status: r.status,
        error: data?.error?.message || data?.error || 'OpenRouter returned an error',
        elapsedMs,
      })
      return
    }

    const reply = data?.choices?.[0]?.message?.content ?? null
    res.status(200).json({
      ok: true,
      model,
      reply, // expect something containing "red"
      visionWorks: typeof reply === 'string' && /red/i.test(reply),
      usage: data?.usage ?? null,
      elapsedMs,
    })
  } catch (e) {
    res.status(500).json({ ok: false, model, error: String(e?.message || e) })
  }
}
