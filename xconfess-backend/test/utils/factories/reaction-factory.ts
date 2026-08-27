import { faker } from '@faker-js/faker';

export enum ReactionType {
  LIKE = 'like',
  LOVE = 'love',
  SUPPORT = 'support',
  LAUGH = 'laugh',
  SAD = 'sad',
}

export interface ReactionData {
  id?: number;
  type?: ReactionType;
  userId?: number;
  confessionId?: number;
  createdAt?: Date;
}

export class ReactionFactory {
  static build(overrides: Partial<ReactionData> = {}): ReactionData {
    return {
      id: faker.number.int({ min: 1, max: 10000 }),
      type: faker.helpers.enumValue(ReactionType),
      userId: faker.number.int({ min: 1, max: 1000 }),
      confessionId: faker.number.int({ min: 1, max: 10000 }),
      createdAt: faker.date.recent(),
      ...overrides,
    };
  }

  static buildMany(
    count: number,
    overrides: Partial<ReactionData> = {},
  ): ReactionData[] {
    return Array.from({ length: count }, () => this.build(overrides));
  }
}
