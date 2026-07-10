import { MigrationInterface, QueryRunner } from "typeorm";

export class SyncEntitiesToSchema1783639322207 implements MigrationInterface {
    name = 'SyncEntitiesToSchema1783639322207'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."invitations_role_enum" AS ENUM('sales_pm', 'admin')`);
        await queryRunner.query(`CREATE TABLE "invitations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "email" character varying NOT NULL, "token_hash" character varying NOT NULL, "role" "public"."invitations_role_enum" NOT NULL DEFAULT 'sales_pm', "invited_by_id" character varying, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "accepted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_5dec98cfdfd562e4ad3648bbb07" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_97ab59cb592c7cec109741b592" ON "invitations" ("email") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_872ac94a64b3d44fc4b554780c" ON "invitations" ("token_hash") `);
        await queryRunner.query(`CREATE TABLE "org_settings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "section" character varying NOT NULL, "value" jsonb NOT NULL DEFAULT '{}', "updated_by_id" character varying, CONSTRAINT "PK_3726dc3a3dfdcd4f0d95b330789" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_06b0101c4a6a01927ee2c51d39" ON "org_settings" ("section") `);
        await queryRunner.query(`CREATE TABLE "portfolio_projects" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "detail_url" character varying NOT NULL, "title" character varying NOT NULL, "summary" text NOT NULL DEFAULT '', "full_description" text NOT NULL DEFAULT '', "category_tags" jsonb NOT NULL DEFAULT '[]', "industry_tags" jsonb NOT NULL DEFAULT '[]', "tech_stack" jsonb NOT NULL DEFAULT '[]', "hero_image_url" character varying, "meta" jsonb NOT NULL DEFAULT '{}', CONSTRAINT "PK_aafa8e5cadcfcc5746510e8666d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_c2f9e4db3b1f8d59effb957b63" ON "portfolio_projects" ("detail_url") `);
        await queryRunner.query(`CREATE TYPE "public"."lead_comments_decision_enum" AS ENUM('approved', 'rejected')`);
        await queryRunner.query(`CREATE TABLE "lead_comments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "lead_id" uuid NOT NULL, "author_id" uuid, "body" text NOT NULL, "decision" "public"."lead_comments_decision_enum", CONSTRAINT "PK_0b6403ed412acdd7f84f74f992c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_3659ec3418128431c0f29c4c89" ON "lead_comments" ("lead_id") `);
        await queryRunner.query(`ALTER TABLE "proposals" ADD "sales_brief" jsonb`);
        await queryRunner.query(`ALTER TABLE "proposals" ADD "pitch_deck" jsonb`);
        await queryRunner.query(`CREATE TYPE "public"."leads_budget_currency_enum" AS ENUM('USD', 'BDT', 'GBP', 'EUR', 'CAD', 'AUD', 'CNY', 'JPY', 'INR')`);
        await queryRunner.query(`ALTER TABLE "leads" ADD "budget_currency" "public"."leads_budget_currency_enum" NOT NULL DEFAULT 'USD'`);
        await queryRunner.query(`ALTER TABLE "leads" ADD "submitted_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "users" ADD "avatar_key" character varying`);
        await queryRunner.query(`ALTER TABLE "users" ADD "preferences" jsonb NOT NULL DEFAULT '{}'`);
        await queryRunner.query(`ALTER TABLE "rate_cards" ADD "monthly_usd_cents" bigint NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "rate_cards" ADD "daily_usd_cents" bigint NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "rate_cards" ADD "hourly_usd_cents" bigint NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "rate_cards" ADD "monthly_bdt_cents" bigint NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "rate_cards" ADD "daily_bdt_cents" bigint NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "rate_cards" ADD "hourly_bdt_cents" bigint NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "projects" ADD "link" character varying`);
        await queryRunner.query(`ALTER TYPE "public"."leads_status_enum" RENAME TO "leads_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."leads_status_enum" AS ENUM('generated', 'pending_approval', 'approved', 'rejected', 'sent', 'locked', 'lost')`);
        await queryRunner.query(`ALTER TABLE "leads" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "leads" ALTER COLUMN "status" TYPE "public"."leads_status_enum" USING "status"::"text"::"public"."leads_status_enum"`);
        await queryRunner.query(`ALTER TABLE "leads" ALTER COLUMN "status" SET DEFAULT 'generated'`);
        await queryRunner.query(`DROP TYPE "public"."leads_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "lead_comments" ADD CONSTRAINT "FK_3659ec3418128431c0f29c4c89c" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "lead_comments" ADD CONSTRAINT "FK_1e6f37af4a460c0e3614f525ada" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "lead_comments" DROP CONSTRAINT "FK_1e6f37af4a460c0e3614f525ada"`);
        await queryRunner.query(`ALTER TABLE "lead_comments" DROP CONSTRAINT "FK_3659ec3418128431c0f29c4c89c"`);
        await queryRunner.query(`CREATE TYPE "public"."leads_status_enum_old" AS ENUM('generated', 'pending_approval', 'approved', 'sent', 'locked', 'lost')`);
        await queryRunner.query(`ALTER TABLE "leads" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "leads" ALTER COLUMN "status" TYPE "public"."leads_status_enum_old" USING "status"::"text"::"public"."leads_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "leads" ALTER COLUMN "status" SET DEFAULT 'generated'`);
        await queryRunner.query(`DROP TYPE "public"."leads_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."leads_status_enum_old" RENAME TO "leads_status_enum"`);
        await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "link"`);
        await queryRunner.query(`ALTER TABLE "rate_cards" DROP COLUMN "hourly_bdt_cents"`);
        await queryRunner.query(`ALTER TABLE "rate_cards" DROP COLUMN "daily_bdt_cents"`);
        await queryRunner.query(`ALTER TABLE "rate_cards" DROP COLUMN "monthly_bdt_cents"`);
        await queryRunner.query(`ALTER TABLE "rate_cards" DROP COLUMN "hourly_usd_cents"`);
        await queryRunner.query(`ALTER TABLE "rate_cards" DROP COLUMN "daily_usd_cents"`);
        await queryRunner.query(`ALTER TABLE "rate_cards" DROP COLUMN "monthly_usd_cents"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "preferences"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "avatar_key"`);
        await queryRunner.query(`ALTER TABLE "leads" DROP COLUMN "submitted_at"`);
        await queryRunner.query(`ALTER TABLE "leads" DROP COLUMN "budget_currency"`);
        await queryRunner.query(`DROP TYPE "public"."leads_budget_currency_enum"`);
        await queryRunner.query(`ALTER TABLE "proposals" DROP COLUMN "pitch_deck"`);
        await queryRunner.query(`ALTER TABLE "proposals" DROP COLUMN "sales_brief"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3659ec3418128431c0f29c4c89"`);
        await queryRunner.query(`DROP TABLE "lead_comments"`);
        await queryRunner.query(`DROP TYPE "public"."lead_comments_decision_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c2f9e4db3b1f8d59effb957b63"`);
        await queryRunner.query(`DROP TABLE "portfolio_projects"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_06b0101c4a6a01927ee2c51d39"`);
        await queryRunner.query(`DROP TABLE "org_settings"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_872ac94a64b3d44fc4b554780c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_97ab59cb592c7cec109741b592"`);
        await queryRunner.query(`DROP TABLE "invitations"`);
        await queryRunner.query(`DROP TYPE "public"."invitations_role_enum"`);
    }

}
