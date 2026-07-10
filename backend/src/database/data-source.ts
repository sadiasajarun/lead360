import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
config();

// TypeORM CLI data-source for migrations (npm run migration:*).
export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: +(process.env.DATABASE_PORT || 5432),
  username: process.env.DATABASE_USER || 'lead360',
  password: process.env.DATABASE_PASSWORD || 'lead360_dev_pw',
  database: process.env.DATABASE_NAME || 'lead360',
  // Cloud Postgres needs TLS; managed certs -> rejectUnauthorized:false.
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: ['src/modules/**/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
  // DEV ONLY (DATABASE_SYNCHRONIZE=true): lets `npm run seed` create tables from entities
  // in one shot, no authored migration needed. Prod leaves this unset -> migrations only.
  synchronize: process.env.DATABASE_SYNCHRONIZE === 'true',
});
