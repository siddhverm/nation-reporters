export function riskPrompt(title: string, body: string) {
  return `
Perform an editorial risk assessment on this news article for a professional news publisher.

Title: ${title}
Body: ${body}

Assess for these risk categories:
- legal: defamation, sub judice, contempt
- political: inflammatory claims, unverified allegations
- health: medical misinformation
- finance: market-sensitive information
- election: electoral interference risk
- defamation: naming individuals with unverified allegations
- copyright: likely copied from another source
- conflict: incitement to violence or communal tension

Respond with JSON:
{
  "score": float 0.0-1.0 (0=low risk, 1=very high risk),
  "confidence": float 0.0-1.0 (how confident you are in this assessment),
  "flags": array of triggered risk categories (empty if none),
  "reasoning": "brief explanation of the main risks, or 'No significant risks detected'"
}
`.trim();
}
