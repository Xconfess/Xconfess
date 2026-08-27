export const MODERATION_TEMPLATES = {
  report_resolved: [
    'Report resolved - Content reviewed and action taken',
    'Report resolved - Confession removed',
    'Report resolved - User warned',
  ],
  report_dismissed: [
    'Report dismissed - No violation found',
    'Report dismissed - Content is within guidelines',
    'Report dismissed - False report',
  ],
  confession_deleted: [
    'Confession deleted - Violates community guidelines',
    'Confession deleted - Spam content',
    'Confession deleted - Inappropriate content',
  ],
  user_banned: [
    'User banned - Repeated violations',
    'User banned - Severe content violation',
    'User banned - Harassment',
  ],
};

export function getTemplate(action: string, index = 0): string | null {
  const templates = MODERATION_TEMPLATES[action as keyof typeof MODERATION_TEMPLATES];
  if (!templates || templates.length === 0) {
    return null;
  }
  return templates[index % templates.length] || null;
}
