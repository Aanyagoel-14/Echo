/*
 * POST /api/generate — Echo's synthesis endpoint (§7, CP7).
 *
 * Accepts { input, image, brandVoice } and returns the §6 content kit. Today it
 * returns hardcoded mock JSON so the whole app runs against a real endpoint
 * end-to-end. Any model call and any secret stays server-side — never in the
 * client (§2: "No API keys in client code, ever").
 *
 * TODO (event): replace mock with real LLM vision+text call + brand-voice prompt.
 *   Read `image` (vision), `input`, and `brandVoice`, call the model, and return
 *   the SAME { reel, carousel, thread } shape so the client never changes.
 */

// The §6 data contract. The server owns the mock now; the event swaps this
// constant for real model output.
const MOCK_KIT = {
  reel: {
    hook: "POV: you found the only water bottle you'll ever need.",
    script:
      "Open on the bottle in morning light. Quick cuts: fill, sip, toss in bag. Voiceover on the 3 reasons it's different. End on logo + CTA.",
    shotList: [
      '0:00 Close-up, bottle on windowsill, morning light',
      '0:03 Hand fills bottle at sink',
      '0:06 Sip, satisfied reaction',
      '0:09 Drop into gym bag',
      "0:12 Logo card + 'Link in bio'",
    ],
  },
  carousel: {
    slides: [
      { title: 'Meet your last water bottle.', body: "Seriously. Here's why." },
      { title: '1. Keeps cold 24h', body: 'Double-wall vacuum steel.' },
      { title: '2. Leak-proof, for real', body: 'Toss it in your bag. Trust.' },
      { title: '3. Looks good doing it', body: 'Six matte colorways.' },
      { title: 'Get yours', body: 'Link in bio →' },
    ],
  },
  thread: {
    tweets: [
      'I tested 7 water bottles for 30 days. Only one survived my chaos. A thread 🧵',
      "1/ Most bottles fail the bag test. This one didn't leak once.",
      "2/ Cold water at hour 24. Genuinely didn't expect that.",
      '3/ The little things: one-hand cap, fits the cupholder, no rattle.',
      '4/ Verdict: the boring stuff done right. Link below.',
    ],
  },
}

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  // The contract the event implementation will read from. Unused for now — the
  // mock is input-independent — but logged so the Vercel function logs confirm
  // the client is sending { input, image, brandVoice } during CP7 verification.
  const { input, image, brandVoice } = req.body ?? {}
  console.log('[generate] received', {
    hasInput: Boolean(input),
    hasImage: Boolean(image),
    tone: brandVoice?.tone ?? null,
  })

  // TODO (event): real vision+text synthesis goes here, returning this shape.
  res.status(200).json(MOCK_KIT)
}
