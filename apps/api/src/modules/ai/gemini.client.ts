import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

@Injectable()
export class GeminiClient {
  private readonly model: GenerativeModel;

  constructor(config: ConfigService) {
    const genAI = new GoogleGenerativeAI(config.get<string>('GEMINI_API_KEY')!);
    this.model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }

  async generate(prompt: string): Promise<{ text: string; tokensUsed: number }> {
    const result = await this.model.generateContent(prompt);
    const text = result.response.text();
    const tokensUsed = result.response.usageMetadata?.totalTokenCount ?? 0;
    return { text, tokensUsed };
  }

  async generateJson<T>(prompt: string): Promise<{ data: T; tokensUsed: number }> {
    const { text, tokensUsed } = await this.generate(
      `${prompt}\n\nRespond ONLY with valid JSON, no markdown, no explanation.`,
    );
    const data = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim()) as T;
    return { data, tokensUsed };
  }
}
