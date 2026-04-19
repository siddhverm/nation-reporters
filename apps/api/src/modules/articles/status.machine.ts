import { ArticleStatus } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

// Valid transitions: from -> allowed next statuses
const TRANSITIONS: Record<ArticleStatus, ArticleStatus[]> = {
  DRAFT:          [ArticleStatus.PENDING_REVIEW],
  PENDING_REVIEW: [ArticleStatus.AI_PROCESSING, ArticleStatus.DRAFT],
  AI_PROCESSING:  [ArticleStatus.NEEDS_EDIT, ArticleStatus.APPROVED],
  NEEDS_EDIT:     [ArticleStatus.PENDING_REVIEW],
  APPROVED:       [ArticleStatus.SCHEDULED, ArticleStatus.PUBLISHING],
  SCHEDULED:      [ArticleStatus.PUBLISHING, ArticleStatus.APPROVED],
  PUBLISHING:     [ArticleStatus.PUBLISHED, ArticleStatus.PUBLISH_FAILED],
  PUBLISHED:      [ArticleStatus.ARCHIVED],
  PUBLISH_FAILED: [ArticleStatus.PUBLISHING],
  ARCHIVED:       [],
};

export function assertTransition(from: ArticleStatus, to: ArticleStatus) {
  if (!TRANSITIONS[from]?.includes(to)) {
    throw new BadRequestException(
      `Invalid status transition: ${from} → ${to}`,
    );
  }
}
