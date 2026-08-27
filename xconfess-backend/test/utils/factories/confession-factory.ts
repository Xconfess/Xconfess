import { faker } from '@faker-js/faker';
import { ConfessionData } from 'test/interface/confession-data';

export class ConfessionFactory {
  static build(overrides: Partial<ConfessionData> = {}): ConfessionData {
    return {
      id: faker.number.int({ min: 1, max: 10000 }),
      content: faker.lorem.paragraph(),
      isAnonymous: faker.datatype.boolean(),
      userId: faker.number.int({ min: 1, max: 1000 }),
      stellarTransactionHash: this.generateTransactionHash(),
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
      ...overrides,
    };
  }

  static buildMany(
    count: number,
    overrides: Partial<ConfessionData> = {},
  ): ConfessionData[] {
    return Array.from({ length: count }, () => this.build(overrides));
  }

  private static generateTransactionHash(): string {
    return faker.string.hexadecimal({ length: 64, prefix: '' });
  }
}
