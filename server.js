require("dotenv").config();
const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const client = new Anthropic.Anthropic();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/audit", async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

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
        headers: { "User-Agent": "Mozilla/5.0 (compatible; WebsiteAuditor/1.0)" },
        timeout: 15000,
      });
      html = await response.text();
    } catch (fetchErr) {
      send({ type: "error", message: `Could not fetch the URL: ${fetchErr.message}` });
      return res.end();
    }

    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 12000);

    send({ type: "status", message: "Analyzing with AI..." });

    const stream = client.messages.stream({
      model: "claude-opus-4-6",
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      system: `You are a conversion rate optimization (CRO) expert auditing business websites.
Your audits are direct, specific, and actionable. You respond ONLY using the exact section format given — no text before [ACTIONS].`,
      messages: [
        {
          role: "user",
          content: `Audit this website: ${normalizedUrl}

Return your response in EXACTLY this format, using these markers precisely:

[ACTIONS]
- Action item (short, specific, immediately actionable — tied to a real finding on this site)
- Action item
- Action item
(3–5 items max)
[/ACTIONS]

[CTA_AUDIT]
List every unique CTA found (buttons, action links like "Sign Up", "Get Started", "Buy Now", "Contact Us", etc.).

Assess whether there are more than 2 distinct CTAs. More CTAs dilute conversion focus.

Verdict: PASS or FAIL — one sentence explanation.
[/CTA_AUDIT]

[COPY_EFFECTIVENESS]
Analyze whether the copy is value-driven.
- Value-driven copy = outcomes and benefits for the customer ("Save 10 hours a week", "Double your revenue")
- Weak copy = features or company-centric ("Founded in 2010", "50+ features")

Quote 2–3 specific lines from the actual page copy to support your verdict.

If weak: explain exactly why, then give 1–2 concrete rewrite examples.

Verdict: VALUE-DRIVEN or NOT VALUE-DRIVEN — one sentence explanation.
[/COPY_EFFECTIVENESS]

Website content:
${stripped}`,
        },
      ],
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
