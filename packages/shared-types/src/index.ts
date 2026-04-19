// Shared TypeScript types between API, web, and mobile

export type Role = 'REPORTER' | 'CHIEF_EDITOR' | 'SOCIAL_MANAGER' | 'ADMIN' | 'AI_BOT';

export type ArticleStatus =
  | 'DRAFT' | 'PENDING_REVIEW' | 'AI_PROCESSING' | 'NEEDS_EDIT'
  | 'APPROVED' | 'SCHEDULED' | 'PUBLISHING' | 'PUBLISHED'
  | 'PUBLISH_FAILED' | 'ARCHIVED';

export type Platform =
  | 'WEB' | 'MOBILE_PUSH' | 'EMAIL_HOOK'
  | 'TWITTER' | 'FACEBOOK' | 'INSTAGRAM'
  | 'YOUTUBE' | 'THREADS' | 'LINKEDIN'
  | 'WHATSAPP' | 'TELEGRAM';

export interface ArticleSummary {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  status: ArticleStatus;
  publishedAt: string | null;
  language: string;
  categoryId: string | null;
  riskScore: number | null;
  riskFlags: string[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface RiskAssessment {
  score: number;
  confidence: number;
  flags: string[];
  reasoning: string;
  autoApprove: boolean;
}
