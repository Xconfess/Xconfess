// src/config/typeorm.config.ts
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

const TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);

export const getTypeOrmConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  const nodeEnv = (configService.get<string>('NODE_ENV') || '').toLowerCase();
  const appEnv = (configService.get<string>('APP_ENV') || '').toLowerCase();
  const syncOptIn = (
    configService.get<string>('TYPEORM_SYNCHRONIZE') || ''
  ).toLowerCase();

  const isLocalDevEnv =
    nodeEnv === 'development' ||
    nodeEnv === 'dev' ||
    nodeEnv === 'local' ||
    appEnv === 'development' ||
    appEnv === 'dev' ||
    appEnv === 'local';

  // Conservative default: never sync unless explicitly opted-in in local/dev only.
  const synchronize = isLocalDevEnv && TRUE_VALUES.has(syncOptIn);

  return {
    type: 'postgres',
    host: configService.get<string>('DB_HOST'),
    port: configService.get<number>('DB_PORT'),
    username: configService.get<string>('DB_USERNAME'),
    password: configService.get<string>('DB_PASSWORD'),
    database: configService.get<string>('DB_NAME'),
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],

    migrations: [process.cwd() + '/migrations/*.{ts,js}'],
    migrationsRun: !['test', 'ci'].includes(nodeEnv),

    synchronize,
    autoLoadEntities: true,
    extra: {
      max: 20,
      min: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    },
    logging: nodeEnv === 'development',
  };
};
