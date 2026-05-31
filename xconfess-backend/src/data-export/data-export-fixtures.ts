/**
 * Fixtures for data export redaction testing
 */

export const mockUserActive = {
  id: 'user-1',
  username: 'active_user',
  is_active: true,
};

export const mockUserDeactivated = {
  id: 'user-2',
  username: 'deactivated_user',
  is_active: false,
};

export const mockConfessionNormal = {
  id: 'conf-1',
  message: 'This is a normal confession',
  gender: 'other',
  created_at: new Date('2026-01-01T10:00:00Z'),
  view_count: 100,
  isAnchored: true,
  stellarTxHash: '0x123',
  isDeleted: false,
  moderationStatus: 'approved',
};

export const mockConfessionDeleted = {
  id: 'conf-2',
  message: 'This confession was deleted',
  gender: 'male',
  created_at: new Date('2026-01-02T10:00:00Z'),
  view_count: 50,
  isAnchored: false,
  isDeleted: true,
  deletedAt: new Date('2026-01-03T10:00:00Z'),
};

export const mockConfessionModerated = {
  id: 'conf-3',
  message: 'This confession was rejected',
  gender: 'female',
  created_at: new Date('2026-01-04T10:00:00Z'),
  view_count: 10,
  isAnchored: false,
  moderationStatus: 'rejected',
  moderationScore: 0.99,
  moderationFlags: ['hate_speech'],
};

export const mockConfessionHidden = {
  id: 'conf-4',
  message: 'This confession is hidden',
  gender: 'other',
  created_at: new Date('2026-01-05T10:00:00Z'),
  view_count: 5,
  isAnchored: false,
  isHidden: true,
  moderationStatus: 'approved',
};

export const mockCommentNormal = {
  id: 'comm-1',
  content: 'This is a normal comment',
  createdAt: new Date('2026-01-06T10:00:00Z'),
  confession: { id: 'conf-1' },
  isDeleted: false,
};

export const mockCommentDeleted = {
  id: 'comm-2',
  content: 'This comment was deleted',
  createdAt: new Date('2026-01-07T10:00:00Z'),
  confession: { id: 'conf-1' },
  isDeleted: true,
};

export const mockCommentModerated = {
  id: 'comm-3',
  content: 'This comment was rejected',
  createdAt: new Date('2026-01-07T11:00:00Z'),
  confession: { id: 'conf-1' },
  moderationStatus: 'rejected',
};

export const mockMessageNormal = {
  id: 'msg-1',
  content: 'Hello world',
  replyContent: 'Hi there',
  createdAt: new Date('2026-01-08T10:00:00Z'),
  repliedAt: new Date('2026-01-08T11:00:00Z'),
  confession: { id: 'conf-1' },
};

export const mockMessageDeleted = {
  id: 'msg-2',
  content: 'Deleted message',
  createdAt: new Date('2026-01-09T10:00:00Z'),
  isDeleted: true,
};
