// ============================================================
// 🔒 HARSH EDITS - GROQ API PROXY (Cloudflare Worker)
// ============================================================
// Deploy this on Cloudflare Workers (free plan).
// Your Groq API keys are stored HERE — never in the browser.
// ============================================================

const GROQ_API_KEYS = [
    "YOUR_GROQ_KEY_1",
    "YOUR_GROQ_KEY_2",
    "YOUR_GROQ_KEY_3",
    "YOUR_GROQ_KEY_4"
];

// ⚠️ IMPORTANT: Replace with YOUR actual domain after deploying!
// Example: "harshedits.com" or "softwherehub.com"
const ALLOWED_DOMAIN = "softwherehub.netlify.app";

let currentKeyIndex = 0;

function getNextKey() {
    const key = GROQ_API_KEYS[currentKeyIndex];
    currentKeyIndex = (currentKeyIndex + 1) % GROQ_API_KEYS.length;
    return key;
}

export default {
    async fetch(request) {

        // ── Handle CORS Preflight (OPTIONS) ──
        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: corsHeaders(request)
            });
        }

        // ── Only allow POST requests ──
        if (request.method !== "POST") {
            return new Response("Method Not Allowed", { status: 405 });
        }

        // ── Domain Restriction ──
        const origin = request.headers.get("Origin") || "";
        const referer = request.headers.get("Referer") || "";

        const isAllowed =
            origin.includes(ALLOWED_DOMAIN) ||
            referer.includes(ALLOWED_DOMAIN) ||
            origin.includes("localhost") || // Allow localhost for testing
            origin.includes("127.0.0.1");   // Allow localhost for testing

        if (!isAllowed) {
            console.log(`BLOCKED request from origin: ${origin}`);
            return new Response(JSON.stringify({ error: "Forbidden: Unauthorized domain." }), {
                status: 403,
                headers: { "Content-Type": "application/json" }
            });
        }

        // ── Parse Request Body ──
        let body;
        try {
            body = await request.json();
        } catch {
            return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        // ── Forward to Groq with auto key rotation on rate limit ──
        const maxRetries = GROQ_API_KEYS.length;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            const apiKey = getNextKey();

            try {
                const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${apiKey}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(body)
                });

                const data = await groqResponse.json();

                // If rate limited or bad key, try next key
                if (groqResponse.status === 429 || groqResponse.status === 401) {
                    console.warn(`Key attempt ${attempt + 1} failed with status ${groqResponse.status}. Rotating...`);
                    continue;
                }

                // Success — return response to browser
                return new Response(JSON.stringify(data), {
                    status: groqResponse.status,
                    headers: {
                        "Content-Type": "application/json",
                        ...corsHeaders(request)
                    }
                });

            } catch (err) {
                console.error(`Groq fetch error on attempt ${attempt + 1}:`, err.message);
                // Network error — try next key
                continue;
            }
        }

        // All keys exhausted
        return new Response(JSON.stringify({
            error: {
                message: "All API keys have hit their rate limit. Please try again later."
            }
        }), {
            status: 429,
            headers: {
                "Content-Type": "application/json",
                ...corsHeaders(request)
            }
        });
    }
};

// ── CORS Headers Helper ──
function corsHeaders(request) {
    const origin = request.headers.get("Origin") || "*";
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400"
    };
}
