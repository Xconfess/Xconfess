import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { MigrationVerificationService } from './migration-verification.service';

const BACKEND_ROOT = path.resolve(__dirname, '..', '..');
const MIGRATION_DIRS = [
  path.join(BACKEND_ROOT, 'migrations'),
  path.join(BACKEND_ROOT, 'src', 'migrations'),
];

/**
 * Issues the repository already has. TypeORM orders migrations by the numeric
 * timestamp at the end of each class name, so a shared timestamp leaves the
 * order to the directory listing. These names may already be recorded in
 * deployed `migrations` tables, so they are left as they are. This list only
 * stops NEW collisions from landing. When one is fixed, remove it here.
 */
const KNOWN_MIGRATION_ISSUES = [
  'Duplicate migration timestamp: 0260927000001',
  'Duplicate migration timestamp: 0261016000001',
  'Duplicate migration name: create-confession-idempotency-records',
];

const createdDirs: string[] = [];

function migrationSource(className: string, withDown = true): string {
  return `import { MigrationInterface, QueryRunner } from 'typeorm';

export class ${className} implements MigrationInterface {
  name = '${className}';

  public async up(queryRunner: QueryRunner): Promise<void> {}
${withDown ? '\n  public async down(queryRunner: QueryRunner): Promise<void> {}\n' : ''}}
`;
}

function fixtureDir(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xconfess-migrations-'));
  createdDirs.push(dir);
  for (const [name, source] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), source);
  }
  return dir;
}

describe('migration ordering', () => {
  const service = new MigrationVerificationService({} as DataSource);

  afterAll(() => {
    for (const dir of createdDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  describe('repository migrations', () => {
    it('reports only the known legacy issues', async () => {
      const issues = await service.verifyMigrations(MIGRATION_DIRS);

      const unexpected = issues.filter(
        (issue) =>
          !KNOWN_MIGRATION_ISSUES.some((known) => issue.startsWith(known)),
      );
      expect(unexpected).toEqual([]);
    });

    it('still reports every known legacy issue, so the list stays current', async () => {
      const issues = await service.verifyMigrations(MIGRATION_DIRS);

      for (const known of KNOWN_MIGRATION_ISSUES) {
        expect(issues.some((issue) => issue.startsWith(known))).toBe(true);
      }
    });

    it('gives the same answer when run repeatedly', async () => {
      const first = await service.verifyMigrations(MIGRATION_DIRS);
      const second = await service.verifyMigrations(MIGRATION_DIRS);

      expect(second).toEqual(first);
    });
  });

  describe('checker behaviour on fixtures', () => {
    it('passes a directory with unique timestamps and rollbacks', async () => {
      const dir = fixtureDir({
        '20990101000000-add-first.ts': migrationSource(
          'AddFirst20990101000000',
        ),
        '20990102000000-add-second.ts': migrationSource(
          'AddSecond20990102000000',
        ),
      });

      await expect(service.verifyMigrations([dir])).resolves.toEqual([]);
    });

    it('flags a new timestamp collision', async () => {
      const dir = fixtureDir({
        '20990101000000-add-first.ts': migrationSource(
          'AddFirst20990101000000',
        ),
        '20990101000000-add-second.ts': migrationSource(
          'AddSecond20990101000000',
        ),
      });

      const issues = await service.verifyMigrations([dir]);
      expect(
        issues.some((issue) =>
          issue.startsWith('Duplicate migration timestamp:'),
        ),
      ).toBe(true);
    });

    it('flags a migration without a down method', async () => {
      const dir = fixtureDir({
        '20990103000000-add-third.ts': migrationSource(
          'AddThird20990103000000',
          false,
        ),
      });

      const issues = await service.verifyMigrations([dir]);
      expect(issues).toEqual([
        expect.stringContaining('Migration has no rollback method:'),
      ]);
    });
  });
});
