require("dotenv").config();
const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const client = new Anthropic.Anthropic();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const ANALYTICS_TOOLS = [
  { name: "Google Analytics 4", patterns: [/gtag\.js/i, /G-[A-Z0-9]{6,}/i, /google-analytics\.com\/g\//i] },
  { name: "Google Tag Manager", patterns: [/googletagmanager\.com\/gtm\.js/i, /GTM-[A-Z0-9]+/i] },
  { name: "Microsoft Clarity",  patterns: [/clarity\.ms/i, /microsoft\.com\/clarity/i] },
  { name: "Mida.so",            patterns: [/mida\.so/i] },
];

function detectAnalytics(html) {
  // Only check <head> and the last 2000 chars before </body>
  const headMatch = html.match(/<head[\s\S]*?<\/head>/i);
  const bodyEnd   = html.slice(-2000);
  const scope     = (headMatch ? headMatch[0] : "") + bodyEnd;

  return ANALYTICS_TOOLS.map(tool => ({
    name: tool.name,
    detected: tool.patterns.some(p => p.test(scope)),
  }));
}

app.post("/audit", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL is required" });

  let normalizedUrl = url.trim();
  if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
    normalizedUrl = "https://" + normalizedUrl;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    send({ type: "status", message: "Fetching webpage..." });

    let html;
    try {
      const response = await fetch(normalizedUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SaasyCRO/1.0)" },
        timeout: 15000,
      });
      html = await response.text();
    } catch (fetchErr) {
      send({ type: "error", message: `Could not fetch the URL: ${fetchErr.message}` });
      return res.end();
    }

    // Detect analytics tools from raw HTML before stripping
    const analyticsTools = detectAnalytics(html);
    send({ type: "analytics_data", tools: analyticsTools });

    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 15000);

    send({ type: "status", message: "Analyzing with AI..." });

    const stream = client.messages.stream({
      model: "claude-opus-4-6",
      max_tokens: 6000,
      thinking: { type: "adaptive" },
      system: `You are a senior conversion rate optimization (CRO) expert auditing business websites. Your audits are direct, specific, and evidence-based. You respond ONLY in the exact format requested — no preamble, no text before [ACTIONS].`,
      messages: [{
        role: "user",
        content: `Audit this website using the Saasy CRO Framework: ${normalizedUrl}

Evaluate all 12 sections. Each is PASS (8.33 pts) or FAIL (0 pts). Base findings on the actual page content provided.

SECTION CRITERIA:
1. Above the Fold Clarity — clear value-prop headline, explains what + who, subheadline with outcome, product visual, CTA visible without scrolling, trust signal above fold
2. CTA Structure — one primary CTA, secondary CTAs support same goal, action-oriented copy, visually contrasting buttons, CTAs repeated down page, follows reading flow
3. Messaging & Copy — benefit-driven not feature-driven, communicates problem solved, clear outcome/transformation, simple/scannable, audience-specific, no vague language
4. Product Understanding — product value immediately clear, explains how it works, product visuals (screenshots/UI/demos), user journey explained, capabilities shown visually
5. Social Proof & Trust Signals — customer logos, testimonials with specific results/outcomes, case studies or success stories, quotes with measurable impact
6. Offer Clarity — offer clearly defined (demo/trial/signup), post-CTA steps clear, pricing accessible if relevant, trial/guarantee messaging, friction reduced, next step explained
7. Objection Handling — addresses common objections, FAQ section, pricing/onboarding/complexity concerns addressed, risk-reversal messaging, comparisons or differentiation
8. Visual Design & Layout — visual hierarchy guides reader down page, sections clearly separated, scannable text, readable typography, color supports CTAs, minimal clutter
9. Conversion Friction — short simple forms, minimal required fields, clear labels, minimal clicks before conversion, simple signup/booking process
10. Mobile Optimization — responsive layout, CTA visible on mobile, readable text size, easy-to-tap buttons, mobile-friendly forms
11. Analytics & Tracking — evidence of GA4, GTM, Microsoft Clarity, or A/B testing tool (Mida.so) in page source
12. A/B Test Recommendations — ALWAYS PASS — provide 2-3 specific, actionable A/B test ideas tailored to this site

GRADE DESCRIPTION GUIDANCE (write 2-3 sentences specific to this site):
- If few sections pass: highlight the most critical missing elements and what impact they have on conversions.
- If roughly half pass: acknowledge what works and name the specific gaps holding the page back.
- If most sections pass: confirm what the page does well and suggest one focused area for further improvement.

Respond in EXACTLY this format. NO text before [ACTIONS]:

[ACTIONS]
- [Specific actionable item for this site]
- [Specific actionable item for this site]
- [Specific actionable item for this site]
[/ACTIONS]

[GRADE]
DESCRIPTION: [Custom 2-3 sentence description following the guidance above, specific to this site]
[/GRADE]

[ANALYTICS]
[Specific findings on tracking tools detected or missing in page source]
VERDICT: PASS or FAIL
[/ANALYTICS]

[ABOVE_FOLD]
[Specific findings on above-the-fold elements for this site]
VERDICT: PASS or FAIL
[/ABOVE_FOLD]

[CTA_STRUCTURE]
[Specific findings on CTA structure for this site]
VERDICT: PASS or FAIL
[/CTA_STRUCTURE]

[MESSAGING_COPY]
[Specific findings on messaging and copy quality for this site]
VERDICT: PASS or FAIL
[/MESSAGING_COPY]

[PRODUCT_UNDERSTANDING]
[Specific findings on product explanation and visuals]
VERDICT: PASS or FAIL
[/PRODUCT_UNDERSTANDING]

[SOCIAL_PROOF]
[Specific findings on social proof and trust signals]
VERDICT: PASS or FAIL
[/SOCIAL_PROOF]

[OFFER_CLARITY]
[Specific findings on offer clarity and next steps]
VERDICT: PASS or FAIL
[/OFFER_CLARITY]

[OBJECTION_HANDLING]
[Specific findings on objection handling and FAQ]
VERDICT: PASS or FAIL
[/OBJECTION_HANDLING]

[VISUAL_DESIGN]
[Specific findings on visual design and layout]
VERDICT: PASS or FAIL
[/VISUAL_DESIGN]

[CONVERSION_FRICTION]
[Specific findings on conversion friction and form complexity]
VERDICT: PASS or FAIL
[/CONVERSION_FRICTION]

[MOBILE_OPTIMIZATION]
[Specific findings on mobile optimization]
VERDICT: PASS or FAIL
[/MOBILE_OPTIMIZATION]

[AB_TESTING]
[2-3 specific A/B test recommendations with brief rationale, tailored to this site]
VERDICT: PASS
[/AB_TESTING]

Website content:
${stripped}`,
      }],
    });

    send({ type: "status", message: "Generating audit..." });

    let fullText = "";
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        fullText += event.delta.text;
        send({ type: "chunk", text: event.delta.text });
      }
    }

    send({ type: "done" });
    res.end();
  } catch (err) {
    console.error(err);
    send({ type: "error", message: err.message || "An unexpected error occurred." });
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Website Auditor running at http://localhost:${PORT}`);
});
