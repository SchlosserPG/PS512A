// ============================================================
// Probability and Statistics Course Assistant
// Cloudflare Worker — Cloudflare AI (gpt-oss-120b)
//
// No external API key needed. Runs inside Cloudflare.
// No Gemini rate limits. No daily quota.
//
// SETUP:
// 1. Go to your Worker > Settings > Bindings > Add binding
//    Type:          Workers AI
//    Variable name: AI
//    Click Save and Deploy
//
// 2. No other variables needed — delete GEMINI_API_KEY
//    if you still have it set.
// ============================================================

export default {
  async fetch(request, env) {

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    // Only allow POST
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Parse body
    var body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(
        JSON.stringify({ error: { message: 'Invalid JSON' } }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    if (!body.messages || !Array.isArray(body.messages)) {
      return new Response(
        JSON.stringify({ error: { message: 'messages array required' } }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Limit to last 6 messages to save tokens
    var recentMessages = body.messages.slice(-6);

    // Build messages array with system prompt first
    var messages = [{ role: 'system', content: SYSTEM_PROMPT }];
    for (var i = 0; i < recentMessages.length; i++) {
      messages.push({
        role: recentMessages[i].role === 'assistant' ? 'assistant' : 'user',
        content: recentMessages[i].content
      });
    }

    // Call Cloudflare AI
    var aiResponse;
    try {
      aiResponse = await env.AI.run(
        '@cf/meta/llama-3.1-8b-instruct',
        {
          messages: messages,
          max_tokens: 600
        }
      );
    } catch (e) {
      // fallback to mistral if llama fails
      try {
        aiResponse = await env.AI.run(
          '@cf/mistral/mistral-7b-instruct-v0.1',
          {
            messages: messages,
            max_tokens: 600
          }
        );
      } catch (e2) {
        return new Response(
          JSON.stringify({ error: { message: 'AI model error: ' + e2.message } }),
          { status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
        );
      }
    }

    // Extract reply
    var reply = '(no response)';
    if (aiResponse && aiResponse.choices && aiResponse.choices[0] && aiResponse.choices[0].message && aiResponse.choices[0].message.content) {
      reply = aiResponse.choices[0].message.content;
    } else if (aiResponse && aiResponse.response) {
      reply = aiResponse.response;
    } else if (typeof aiResponse === 'string') {
      reply = aiResponse;
    }

    // Return in format chat.html expects
    return new Response(
      JSON.stringify({ content: [{ type: 'text', text: reply }] }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }
};

var SYSTEM_PROMPT = 'You are a friendly, precise assistant for Probability and Business Statistics with R (RStudio, R 4.5+). Explain the WHY behind concepts, use code blocks for all R code, and connect results to business interpretation. SKEWNESS & KURTOSIS: Use ONLY semTools skew() and kurtosis() (z-scores). Thresholds: n < 50 → ±2; 50–300 → ±3.29; >300 → ±7 + histogram. Never use rules of thumb (e.g., ±1) or e1071 skewness() alone. Always confirm sample size before interpreting. STAY IN SCOPE: Use only course methods, functions, and approaches. Do not introduce outside techniques—redirect if needed.';
