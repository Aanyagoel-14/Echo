/*
 * Model provider seam for Echo's two model routes — api/audit.js (Suggestion
 * Model) and api/generate.js (Generation Model). Both speak OpenAI's
 * chat/completions dialect (system+user messages, response_format json_object,
 * image_url vision blocks), and BOTH Google model surfaces expose an
 * OpenAI-COMPATIBLE endpoint, so this module swaps only the transport and picks
 * one of two auth modes from env:
 *
 *   1. Gemini Developer API (static key) — set GEMINI_API_KEY. Simplest: hits
 *      generativelanguage.googleapis.com with `Authorization: Bearer <key>`.
 *      No service account, no token minting, no separate GCP API to enable.
 *   2. Vertex AI (service account) — set GOOGLE_VERTEX_PROJECT + GOOGLE_CLIENT_EMAIL
 *      + GOOGLE_PRIVATE_KEY. Mints a short-lived OAuth token (google-auth-library,
 *      cached per warm instance) and hits the Vertex openapi endpoint. Enterprise
 *      controls + zero data-retention.
 *
 * The Gemini API key wins when present (it needs no extra GCP setup), so you can
 * run on the key today and flip to full Vertex later by swapping env vars — no
 * code change. Returns { ok, status, data, error } with the OpenAI
 * { choices:[{ message:{ content } }] } shape both routes already parse.
 * Credentials never leave the server (§2) — imported ONLY by api/*.
 */

import { GoogleAuth } from 'google-auth-library'

const SCOPES = ['https://www.googleapis.com/auth/cloud-platform']
const DEFAULT_LOCATION = 'us-central1'
const GEMINI_OPENAI_URL =
  'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'

function geminiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''
}

function hasVertexSA() {
  return Boolean(
    process.env.GOOGLE_VERTEX_PROJECT &&
      process.env.GOOGLE_CLIENT_EMAIL &&
      process.env.GOOGLE_PRIVATE_KEY,
  )
}

// 'gemini-api' (static key) | 'vertex' (service account) | null (unconfigured).
export function modelProvider() {
  if (geminiKey()) return 'gemini-api'
  if (hasVertexSA()) return 'vertex'
  return null
}

// True when either provider is fully configured, so routes gate on one call —
// exactly where they used to check OPENROUTER_API_KEY.
export function isModelConfigured() {
  return modelProvider() !== null
}

function vertexLocation() {
  return process.env.GOOGLE_VERTEX_LOCATION || DEFAULT_LOCATION
}

// --- Vertex (service account) auth. Reused across warm invocations: GoogleAuth
// caches the access token and refreshes it before expiry. ---
let _auth = null
function getAuth() {
  if (_auth) return _auth
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL
  // Env stores keep the PEM on one line with literal "\n"; restore real
  // newlines. A no-op when it's already multiline.
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  if (!clientEmail || !privateKey) {
    throw new Error('Vertex not configured: GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY missing')
  }
  _auth = new GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: SCOPES,
  })
  return _auth
}

async function vertexAccessToken() {
  const client = await getAuth().getClient()
  const t = await client.getAccessToken()
  const token = typeof t === 'string' ? t : t?.token
  if (!token) throw new Error('Vertex: failed to mint access token')
  return token
}

// The Vertex OpenAI-compatible endpoint. "global" has no region host prefix.
function vertexEndpoint() {
  const project = process.env.GOOGLE_VERTEX_PROJECT
  const location = vertexLocation()
  const host =
    location === 'global'
      ? 'aiplatform.googleapis.com'
      : `${location}-aiplatform.googleapis.com`
  return `https://${host}/v1/projects/${project}/locations/${location}/endpoints/openapi/chat/completions`
}

// Resolve { url, headers, model } for the active provider. The two surfaces name
// models slightly differently — the Gemini API wants "gemini-2.5-flash", Vertex
// wants "google/gemini-2.5-flash" — so normalize the caller's id to each.
async function resolveTransport(model) {
  const provider = modelProvider()
  if (provider === 'gemini-api') {
    return {
      url: GEMINI_OPENAI_URL,
      headers: { Authorization: `Bearer ${geminiKey()}`, 'Content-Type': 'application/json' },
      model: model.replace(/^google\//, ''),
    }
  }
  if (provider === 'vertex') {
    const token = await vertexAccessToken()
    return {
      url: vertexEndpoint(),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      model: model.startsWith('google/') ? model : `google/${model}`,
    }
  }
  throw new Error(
    'No model provider configured (set GEMINI_API_KEY, or the Vertex service-account vars)',
  )
}

/*
 * POST an OpenAI-shaped chat body to the active provider and hand back the raw
 * result. `body` is the same object the routes built for OpenRouter — { model,
 * messages, max_tokens, temperature, response_format }; the model id is
 * normalized per provider here. Returns { ok, status, data, error } so callers
 * branch exactly as they did on the fetch Response before.
 */
export async function chatCompletions(body) {
  const { url, headers, model } = await resolveTransport(body.model)
  // Default Gemini 2.5's "thinking" OFF for Echo's structured-JSON tasks. Thinking
  // tokens are drawn from the same max_tokens budget AND billed, so leaving it on
  // silently eats the output allowance — a full kit/audit then truncates to invalid
  // JSON (a 502, or a fall back to the mock) while still costing you. Both Google
  // surfaces accept the OpenAI-compat `reasoning_effort`; an explicit caller value
  // (in `body`) still wins.
  const payload = { reasoning_effort: 'none', ...body, model }
  const r = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })
  const data = await r.json().catch(() => null)
  // Vertex wraps errors in an array ([{ error }]); the Gemini API and OpenRouter
  // use a bare { error }. Success is the normal OpenAI object. Normalize either.
  const errObj = Array.isArray(data) ? data[0]?.error : data?.error
  const error = errObj?.message || (typeof errObj === 'string' ? errObj : null)
  return { ok: r.ok, status: r.status, data, error }
}
