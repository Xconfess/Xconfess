/**
 * Standardized report reason categories for moderation
 * These values are stored in the database and used for filtering/analytics
 */
export enum ReportReason {
  INAPPROPRIATE = 'inappropriate',
  HARASSMENT = 'harassment',
  SPAM = 'spam',
  HATE_SPEECH = 'hate_speech',
  FALSE_INFORMATION = 'false_information',
  VIOLENCE = 'violence',
  COPYRIGHT = 'copyright',
  PRIVACY_VIOLATION = 'privacy_violation',
  SELF_HARM = 'self_harm',
  OTHER = 'other',
}

/**
 * Human-readable descriptions for report reasons
 * Useful for UI display and admin interfaces
 */
export const REPORT_REASON_DESCRIPTIONS: Record<ReportReason, string> = {
  [ReportReason.INAPPROPRIATE]: 'Inappropriate content',
  [ReportReason.HARASSMENT]: 'Harassment or bullying',
  [ReportReason.SPAM]: 'Spam or misleading content',
  [ReportReason.HATE_SPEECH]: 'Hate speech or discrimination',
  [ReportReason.FALSE_INFORMATION]: 'False information or misinformation',
  [ReportReason.VIOLENCE]: 'Violent or graphic content',
  [ReportReason.COPYRIGHT]: 'Copyright infringement',
  [ReportReason.PRIVACY_VIOLATION]: 'Privacy violation',
  [ReportReason.SELF_HARM]: 'Self-harm or suicide content',
  [ReportReason.OTHER]: 'Other (please specify in details)',
};

/**
 * Helper function to get human-readable description
 */
export function getReportReasonDescription(reason: ReportReason): string {
  return REPORT_REASON_DESCRIPTIONS[reason] || reason;
}

/**
 * Helper function to validate if a string is a valid report reason
 */
export function isValidReportReason(reason: string): reason is ReportReason {
  return Object.values(ReportReason).includes(reason as ReportReason);
}
