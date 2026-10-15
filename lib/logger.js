/**
 * Log redaction.
 *
 * events/errorScanner.js used to post raw stack traces straight into a Discord
 * channel. Stack traces and error objects routinely carry environment values,
 * tokens in request URLs, file paths and user IDs. This module strips the
 * sensitive parts before anything leaves the process.
 *
 * Order matters: the most specific patterns run first, otherwise a generic rule
 * can match part of a token and leave the rest behind.
 */

/** Long opaque secrets (tokens, keys) — matched first so generic rules cannot split them. */
const LONG_SECRET = /\b[A-Za-z0-9_+/=-]{28,}\b/g;

/**
 * Three dotted base64url segments — Discord bot tokens and JWTs.
 * A Discord token is  <id.b64>.<timestamp.b64>.<hmac> ; the first segment can be
 * as short as ~11 characters, so the floor is deliberately low.
 */
const DOTTED_TOKEN = /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{10,}\b/g;

const PATTERNS = [
    // Discord webhooks (before the generic URL rules)
    /https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/gi,

    // key=value / key: value secrets — case-insensitive on the VALUE too
    /\b(?:client_secret|clientsecret|client_id|secret|token|password|passwd|pwd|api[_-]?key|apikey|access_token|refresh_token|accesstoken|refreshtoken|private_key|auth)\b\s*[:=]\s*['"]?[^\s'",;&}]+/gi,

    // Authorization / Bearer headers
    /\b(?:authorization|bearer)\b\s*[:=]?\s*[A-Za-z0-9._~+/-]{8,}=*/gi,

    // Connection strings
    /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|mariadb|redis|rediss|amqp|amqps):\/\/[^\s'"]+/gi,

    // Discord tokens and JWTs
    DOTTED_TOKEN,

    // Any remaining long opaque string
    LONG_SECRET,
];

const REDACTED = '[REDACTED]';

/** Remove secrets from an arbitrary string. */
function redact(text) {
    if (typeof text !== 'string' || !text) return text;

    let out = text;
    for (const pattern of PATTERNS) {
        // Reset lastIndex — these are /g/ regexes reused across calls.
        pattern.lastIndex = 0;
        out = out.replace(pattern, REDACTED);
    }

    // Absolute filesystem paths reveal the deployment layout.
    out = out.replace(/\/(?:home|root|var|srv|opt|Users)\/[^\s:()'"]+/g, (match) => {
        const parts = match.split('/').filter(Boolean);
        return `…/${parts.slice(-2).join('/')}`;
    });

    return out;
}

/** Truncate to Discord's 4096-char embed description limit with headroom. */
function truncate(text, max = 3500) {
    if (typeof text !== 'string') return String(text ?? '');
    return text.length > max ? `${text.slice(0, max)}\n… [truncated]` : text;
}

/** Build a safe, embed-ready error string. */
function formatError(error) {
    const raw = error && (error.stack || error.message)
        ? (error.stack || error.message)
        : String(error);
    return truncate(redact(raw));
}

module.exports = { redact, truncate, formatError, REDACTED };
