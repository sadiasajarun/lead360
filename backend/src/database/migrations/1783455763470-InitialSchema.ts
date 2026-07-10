import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1783455763470 implements MigrationInterface {
    name = 'InitialSchema1783455763470'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "requirements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "lead_id" uuid NOT NULL, "source_text" text, "files" jsonb NOT NULL DEFAULT '[]', "readiness_score" integer, "queries" jsonb NOT NULL DEFAULT '[]', CONSTRAINT "REL_dc2b473e59ebd10606fc634773" UNIQUE ("lead_id"), CONSTRAINT "PK_4e966e20a0ebaf89e4c1ed664a4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "proposal_versions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "proposal_id" uuid NOT NULL, "version_no" integer NOT NULL, "sections_json" jsonb NOT NULL DEFAULT '{}', "model" character varying, "tokens_used" integer NOT NULL DEFAULT '0', "pdf_key" character varying, CONSTRAINT "PK_64c09e1dd58aebaa26ab09bb528" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."proposals_template_enum" AS ENUM('global', 'local', 'agency', 'design_portfolio')`);
        await queryRunner.query(`CREATE TABLE "proposals" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "lead_id" uuid NOT NULL, "template" "public"."proposals_template_enum" NOT NULL, "sections" jsonb NOT NULL DEFAULT '{}', "theme" character varying NOT NULL DEFAULT 'light', "current_version_id" character varying, CONSTRAINT "PK_db524c8db8e126a38a2f16d8cac" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."budget_lines_seniority_enum" AS ENUM('senior', 'mid', 'junior')`);
        await queryRunner.query(`CREATE TABLE "budget_lines" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "budget_id" uuid NOT NULL, "milestone_id" uuid, "department" character varying NOT NULL, "role" character varying NOT NULL, "seniority" "public"."budget_lines_seniority_enum" NOT NULL DEFAULT 'mid', "units" integer NOT NULL DEFAULT '1', "days" integer NOT NULL DEFAULT '0', "day_rate_cents" bigint NOT NULL DEFAULT '0', "optional" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_4eabf9c9d7c8edc9ad302270c94" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "milestones" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "budget_id" uuid NOT NULL, "name" character varying NOT NULL, "order_no" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_0bdbfe399c777a6a8520ff902d9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "budgets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "lead_id" uuid NOT NULL, "currency" character varying NOT NULL DEFAULT 'USD', "fx_rate" numeric(12,4) NOT NULL DEFAULT '1', "contingency_pct" numeric(5,2) NOT NULL DEFAULT '0', "discount_pct" numeric(5,2) NOT NULL DEFAULT '0', "vat_pct" numeric(5,2) NOT NULL DEFAULT '0', "total_cents" bigint NOT NULL DEFAULT '0', "version" integer NOT NULL, CONSTRAINT "REL_0aa4b5902dd3f7e82623dfa4b2" UNIQUE ("lead_id"), CONSTRAINT "PK_9c8a51748f82387644b773da482" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."approvals_decision_enum" AS ENUM('approved', 'rejected')`);
        await queryRunner.query(`CREATE TABLE "approvals" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "lead_id" uuid NOT NULL, "submitted_at" TIMESTAMP WITH TIME ZONE NOT NULL, "submitted_by_id" character varying, "decided_at" TIMESTAMP WITH TIME ZONE, "decided_by_id" uuid, "decision" "public"."approvals_decision_enum", "note" text, CONSTRAINT "PK_690417aaefa84d18b1a59e2a499" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."leads_status_enum" AS ENUM('generated', 'pending_approval', 'approved', 'sent', 'locked', 'lost')`);
        await queryRunner.query(`CREATE TYPE "public"."leads_template_enum" AS ENUM('global', 'local', 'agency', 'design_portfolio')`);
        await queryRunner.query(`CREATE TYPE "public"."leads_loss_reason_enum" AS ENUM('budget', 'scope', 'timeline', 'competitor', 'no_response', 'other')`);
        await queryRunner.query(`CREATE TABLE "leads" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "title" character varying NOT NULL, "company" character varying NOT NULL, "contact_name" character varying, "contact_email" character varying, "website" character varying, "status" "public"."leads_status_enum" NOT NULL DEFAULT 'generated', "template" "public"."leads_template_enum" NOT NULL, "value_cents" bigint NOT NULL DEFAULT '0', "loss_reason" "public"."leads_loss_reason_enum", "loss_note" text, "submitted_by_id" uuid, CONSTRAINT "PK_cd102ed7a9a4ca7d4d8bfeba406" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('sales_pm', 'admin')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "email" character varying NOT NULL, "password_hash" character varying NOT NULL, "name" character varying NOT NULL, "role" "public"."users_role_enum" NOT NULL DEFAULT 'sales_pm', "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `);
        await queryRunner.query(`CREATE TYPE "public"."rate_cards_seniority_enum" AS ENUM('senior', 'mid', 'junior')`);
        await queryRunner.query(`CREATE TABLE "rate_cards" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "department" character varying NOT NULL, "role" character varying NOT NULL, "seniority" "public"."rate_cards_seniority_enum" NOT NULL, "day_rate_cents" bigint NOT NULL DEFAULT '0', "currency" character varying NOT NULL DEFAULT 'USD', CONSTRAINT "PK_54c4a5c4872b2339d848e5d9eb5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_fba85c8263bd41a5b1a1ee98f8" ON "rate_cards" ("role", "seniority") `);
        await queryRunner.query(`CREATE TABLE "role_day_samples" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "scope_signature" character varying NOT NULL, "role" character varying NOT NULL, "days" integer NOT NULL, "source" character varying, "rate_card_id" uuid, CONSTRAINT "PK_bfab93b9fca6d32fe12c17e2431" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_bbef676c4b9ce006dc2ab8b37d" ON "role_day_samples" ("scope_signature") `);
        await queryRunner.query(`CREATE TABLE "projects" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "slug" character varying NOT NULL, "name" character varying NOT NULL, "summary" text, "category" jsonb NOT NULL DEFAULT '[]', "tech_stack" jsonb NOT NULL DEFAULT '[]', "cover_key" character varying, "source_lead_id" uuid, CONSTRAINT "PK_6271df0a7aed1d6c0691ce6ac50" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_96e045ab8b0271e5f5a91eae1e" ON "projects" ("slug") `);
        await queryRunner.query(`CREATE TABLE "kb_chunks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "kb_document_id" uuid NOT NULL, "text" text NOT NULL, "content_hash" character varying NOT NULL, "meta" jsonb NOT NULL DEFAULT '{}', CONSTRAINT "PK_de84c3fce0c1a29928e98441cd3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_2b7318d294f5b537978be53c7c" ON "kb_chunks" ("content_hash") `);
        await queryRunner.query(`CREATE TABLE "kb_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "title" character varying NOT NULL, "source_path" character varying NOT NULL, "category" character varying, "template" character varying, "meta" jsonb NOT NULL DEFAULT '{}', CONSTRAINT "PK_14ad41415f09ecb8f042d78422a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "learning_snapshots" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "scaffold_version" character varying NOT NULL, "distilled_json" jsonb NOT NULL DEFAULT '{}', "metrics" jsonb NOT NULL DEFAULT '{}', CONSTRAINT "PK_b2101c43f14b720f6595fcde06c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."feedbacks_loss_reason_enum" AS ENUM('budget', 'scope', 'timeline', 'competitor', 'no_response', 'other')`);
        await queryRunner.query(`CREATE TABLE "feedbacks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "generation_id" uuid NOT NULL, "approval" boolean, "edit_diff" jsonb, "outcome" character varying, "loss_reason" "public"."feedbacks_loss_reason_enum", "prompt" text, CONSTRAINT "PK_79affc530fdd838a9f1e0cc30be" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "generations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "lead_id" uuid NOT NULL, "kind" character varying NOT NULL, "versions" jsonb NOT NULL DEFAULT '{}', "model" character varying, "tokens_in" integer NOT NULL DEFAULT '0', "tokens_out" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_9d2a52fbde1fba42c24ec42ddd2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "document_deliveries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "lead_id" uuid NOT NULL, "files" jsonb NOT NULL DEFAULT '[]', "method" character varying NOT NULL DEFAULT 'download', "status" character varying NOT NULL DEFAULT 'not_delivered', "delivered_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_4f5a76817035fee4066c6d001f6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "actor_id" uuid, "action" character varying NOT NULL, "entity" character varying NOT NULL, "entity_id" character varying, "before" jsonb, "after" jsonb, CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_445557993007fefee3aa9f1117" ON "audit_logs" ("entity") `);
        await queryRunner.query(`CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "user_id" character varying NOT NULL, "token_hash" character varying NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_a7838d2ba25be1342091b6695f" ON "refresh_tokens" ("token_hash") `);
        await queryRunner.query(`ALTER TABLE "requirements" ADD CONSTRAINT "FK_dc2b473e59ebd10606fc6347731" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "proposal_versions" ADD CONSTRAINT "FK_c6bcca84e48eebbe830bff776fa" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "proposals" ADD CONSTRAINT "FK_7bf5cb75376ab3bd5b164ce019f" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "budget_lines" ADD CONSTRAINT "FK_27df932d047b7ab0b9efd5f5632" FOREIGN KEY ("budget_id") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "budget_lines" ADD CONSTRAINT "FK_a9985c5ea067838bb378286a300" FOREIGN KEY ("milestone_id") REFERENCES "milestones"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "milestones" ADD CONSTRAINT "FK_f2fec31f730e6bfe738c2775339" FOREIGN KEY ("budget_id") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "budgets" ADD CONSTRAINT "FK_0aa4b5902dd3f7e82623dfa4b2d" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "approvals" ADD CONSTRAINT "FK_cd69026aa3ba7578c8c7b12ddbd" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "approvals" ADD CONSTRAINT "FK_bd8024eadb4e2ce3e706825aec8" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "leads" ADD CONSTRAINT "FK_b94002bd19b2681591b48685ff0" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "role_day_samples" ADD CONSTRAINT "FK_f06f575daa860c0de13038b8900" FOREIGN KEY ("rate_card_id") REFERENCES "rate_cards"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "projects" ADD CONSTRAINT "FK_f77350a819fb9299f9155bd0c2d" FOREIGN KEY ("source_lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "kb_chunks" ADD CONSTRAINT "FK_5ff5518b5a30425263683e3b352" FOREIGN KEY ("kb_document_id") REFERENCES "kb_documents"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "feedbacks" ADD CONSTRAINT "FK_c4e580fcd43e4ee2d644406f098" FOREIGN KEY ("generation_id") REFERENCES "generations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "generations" ADD CONSTRAINT "FK_ff50c070fdb25942b053e9e5e5b" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "document_deliveries" ADD CONSTRAINT "FK_6e12a6c1572665340a826c917c4" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_177183f29f438c488b5e8510cdb" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_177183f29f438c488b5e8510cdb"`);
        await queryRunner.query(`ALTER TABLE "document_deliveries" DROP CONSTRAINT "FK_6e12a6c1572665340a826c917c4"`);
        await queryRunner.query(`ALTER TABLE "generations" DROP CONSTRAINT "FK_ff50c070fdb25942b053e9e5e5b"`);
        await queryRunner.query(`ALTER TABLE "feedbacks" DROP CONSTRAINT "FK_c4e580fcd43e4ee2d644406f098"`);
        await queryRunner.query(`ALTER TABLE "kb_chunks" DROP CONSTRAINT "FK_5ff5518b5a30425263683e3b352"`);
        await queryRunner.query(`ALTER TABLE "projects" DROP CONSTRAINT "FK_f77350a819fb9299f9155bd0c2d"`);
        await queryRunner.query(`ALTER TABLE "role_day_samples" DROP CONSTRAINT "FK_f06f575daa860c0de13038b8900"`);
        await queryRunner.query(`ALTER TABLE "leads" DROP CONSTRAINT "FK_b94002bd19b2681591b48685ff0"`);
        await queryRunner.query(`ALTER TABLE "approvals" DROP CONSTRAINT "FK_bd8024eadb4e2ce3e706825aec8"`);
        await queryRunner.query(`ALTER TABLE "approvals" DROP CONSTRAINT "FK_cd69026aa3ba7578c8c7b12ddbd"`);
        await queryRunner.query(`ALTER TABLE "budgets" DROP CONSTRAINT "FK_0aa4b5902dd3f7e82623dfa4b2d"`);
        await queryRunner.query(`ALTER TABLE "milestones" DROP CONSTRAINT "FK_f2fec31f730e6bfe738c2775339"`);
        await queryRunner.query(`ALTER TABLE "budget_lines" DROP CONSTRAINT "FK_a9985c5ea067838bb378286a300"`);
        await queryRunner.query(`ALTER TABLE "budget_lines" DROP CONSTRAINT "FK_27df932d047b7ab0b9efd5f5632"`);
        await queryRunner.query(`ALTER TABLE "proposals" DROP CONSTRAINT "FK_7bf5cb75376ab3bd5b164ce019f"`);
        await queryRunner.query(`ALTER TABLE "proposal_versions" DROP CONSTRAINT "FK_c6bcca84e48eebbe830bff776fa"`);
        await queryRunner.query(`ALTER TABLE "requirements" DROP CONSTRAINT "FK_dc2b473e59ebd10606fc6347731"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a7838d2ba25be1342091b6695f"`);
        await queryRunner.query(`DROP TABLE "refresh_tokens"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_445557993007fefee3aa9f1117"`);
        await queryRunner.query(`DROP TABLE "audit_logs"`);
        await queryRunner.query(`DROP TABLE "document_deliveries"`);
        await queryRunner.query(`DROP TABLE "generations"`);
        await queryRunner.query(`DROP TABLE "feedbacks"`);
        await queryRunner.query(`DROP TYPE "public"."feedbacks_loss_reason_enum"`);
        await queryRunner.query(`DROP TABLE "learning_snapshots"`);
        await queryRunner.query(`DROP TABLE "kb_documents"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2b7318d294f5b537978be53c7c"`);
        await queryRunner.query(`DROP TABLE "kb_chunks"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_96e045ab8b0271e5f5a91eae1e"`);
        await queryRunner.query(`DROP TABLE "projects"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bbef676c4b9ce006dc2ab8b37d"`);
        await queryRunner.query(`DROP TABLE "role_day_samples"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fba85c8263bd41a5b1a1ee98f8"`);
        await queryRunner.query(`DROP TABLE "rate_cards"`);
        await queryRunner.query(`DROP TYPE "public"."rate_cards_seniority_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
        await queryRunner.query(`DROP TABLE "leads"`);
        await queryRunner.query(`DROP TYPE "public"."leads_loss_reason_enum"`);
        await queryRunner.query(`DROP TYPE "public"."leads_template_enum"`);
        await queryRunner.query(`DROP TYPE "public"."leads_status_enum"`);
        await queryRunner.query(`DROP TABLE "approvals"`);
        await queryRunner.query(`DROP TYPE "public"."approvals_decision_enum"`);
        await queryRunner.query(`DROP TABLE "budgets"`);
        await queryRunner.query(`DROP TABLE "milestones"`);
        await queryRunner.query(`DROP TABLE "budget_lines"`);
        await queryRunner.query(`DROP TYPE "public"."budget_lines_seniority_enum"`);
        await queryRunner.query(`DROP TABLE "proposals"`);
        await queryRunner.query(`DROP TYPE "public"."proposals_template_enum"`);
        await queryRunner.query(`DROP TABLE "proposal_versions"`);
        await queryRunner.query(`DROP TABLE "requirements"`);
    }

}
