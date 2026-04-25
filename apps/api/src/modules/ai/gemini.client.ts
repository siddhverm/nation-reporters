import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

@Injectable()
export class GeminiClient {
  private readonly model: GenerativeModel;
  private readonly logger = new Logger(GeminiClient.name);
  private lastCallAt = 0;
  private readonly minIntervalMs = 4500; // 15 RPM free tier → 1 req per 4s

  constructor(config: ConfigService) {
    const genAI = new GoogleGenerativeAI(config.get<string>('GEMINI_API_KEY')!);
    this.model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  }

  private async throttle() {
    const now = Date.now();
    const wait = this.minIntervalMs - (now - this.lastCallAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastCallAt = Date.now();
  }

  async generate(prompt: string, retries = 3): Promise<{ text: string; tokensUsed: number }> {
    await this.throttle();
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await this.model.generateContent(prompt);
        const text = result.response.text();
        const tokensUsed = result.response.usageMetadata?.totalTokenCount ?? 0;
        return { text, tokensUsed };
      } catch (err) {
        const msg = (err as Error).message ?? '';
        const is429 = msg.includes('429') || msg.includes('quota') || msg.includes('Too Many');
        const quotaHardBlocked =
          msg.includes('limit: 0')
          || msg.includes('Quota exceeded for metric')
          || msg.includes('free_tier');
        if (is429 && quotaHardBlocked) {
          // Fail fast so ingestion can immediately switch to raw publishing path.
          throw err;
        }
        if (is429 && attempt < retries) {
          const backoff = Math.pow(2, attempt + 1) * 5000; // 10s, 20s, 40s
          this.logger.warn(`Rate limited — retrying in ${backoff / 1000}s (attempt ${attempt + 1}/${retries})`);
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
        throw err;
      }
    }
    throw new Error('Gemini: exceeded retry attempts');
  }

  async generateJson<T>(prompt: string): Promise<{ data: T; tokensUsed: number }> {
    const { text, tokensUsed } = await this.generate(
      `${prompt}\n\nRespond ONLY with valid JSON, no markdown, no explanation.`,
    );
    const data = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim()) as T;
    return { data, tokensUsed };
  }
}
