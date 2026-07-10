# Migrations

Entities are the source of truth (`src/modules/**/*.entity.ts`). Migrations create the tables from them.

## First-time setup (once the database is running — you'll be guided at that step)
```bash
# 0) infra up (from repo root) + deps installed
docker compose up -d
npm install

# 1) enable pgvector (already provided) — runs first
npm run migration:run          # applies 1720000000000-EnableVectorExtension

# 2) generate the schema migration from the entities, then apply it
npm run migration:generate -- src/database/migrations/InitSchema
npm run migration:run
```

## Pending for D5 (KB module)
The AI similarity column is added when the KB module is built:
```sql
ALTER TABLE kb_chunks ADD COLUMN embedding vector(1536);
CREATE INDEX kb_chunks_embedding_hnsw ON kb_chunks USING hnsw (embedding vector_cosine_ops);
```
(TypeORM doesn't manage the `vector` type, so this lives in a dedicated migration + raw pgvector queries — see `kb-chunk.entity.ts`.)

Rollback any migration with `npm run migration:revert`.
