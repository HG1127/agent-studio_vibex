// Repeatable upgrade rehearsal from an earlier empty V8 staging schema.
// PGlite is an isolated PostgreSQL engine; never touches any company DB.
// Do not treat this as an authorized production schema migration.
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const read=relative=>fs.readFileSync(path.join(root,relative),"utf8")
  .split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")

test("V8 staging upgrade adds knowledge revisions, deduplication, and journal exactly once",async()=>{
  const pg=await PGlite.create({extensions:{vector}})
  try {
    const current=read("db/postgres/001_stage_schema.sql")
    const revisionSegment="  UNIQUE(id,owner_user_id),\n"+
      "  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),\n"+
      "  CHECK(visibility <> 'team' OR team_id IS NOT NULL)"
    assert.ok(current.includes(revisionSegment),"Schema drift: KB revision field")
    const indexSegment="CREATE UNIQUE INDEX ux_knowledge_document_active_hash\n"+
      "  ON agentstudio.knowledge_documents(owner_user_id,base_id,sha256)\n"+
      "  WHERE status <> 'deleted';"
    assert.ok(current.includes(indexSegment),"Schema drift: unique active hash index")
    const earlier=current.replace(revisionSegment,
      "  UNIQUE(id,owner_user_id),\n"+
      "  CHECK(visibility <> 'team' OR team_id IS NOT NULL)")
      .replace(indexSegment,"")
    await pg.exec(earlier)
    const columns=await pg.query("SELECT column_name FROM information_schema.columns "+
      "WHERE table_schema='agentstudio' AND table_name='knowledge_bases'")
    assert.ok(!columns.rows.some(row=>row.column_name==="revision"))
    const dbName=String((await pg.query("SELECT current_database() AS name")).rows[0].name)
    assert.match(dbName,/^[a-z_][a-z0-9_]*$/)
    const originalUpgrade=read("db/postgres/migrations/pg_v8_002_knowledge.sql")
    assert.match(originalUpgrade,/current_database\(\) <> 'agentstudio_stage'/)
    const inMemoryUpgrade=originalUpgrade.replace(
      "current_database() <> 'agentstudio_stage'",
      "current_database() <> '"+dbName+"'")
    await pg.exec(inMemoryUpgrade)
    await pg.exec(inMemoryUpgrade)
    const revisions=await pg.query("SELECT count(*)::int AS n "+
      "FROM agentstudio.schema_migrations WHERE version='pg_v8_002'")
    assert.equal(revisions.rows[0].n,1)
    const newColumns=await pg.query("SELECT column_name FROM information_schema.columns "+
      "WHERE table_schema='agentstudio' AND table_name='knowledge_bases'")
    assert.ok(newColumns.rows.some(row=>row.column_name==="revision"))

    const user=await pg.query("INSERT INTO agentstudio.users"+
      "(external_issuer,external_subject) VALUES('stage-migration-test','A') RETURNING id")
    const uid=user.rows[0].id
    const base=await pg.query("INSERT INTO agentstudio.knowledge_bases"+
      "(owner_user_id,name) VALUES($1,'migration') RETURNING id,revision",[uid])
    const baseId=base.rows[0].id
    assert.equal(Number(base.rows[0].revision),1)
    const digest="f".repeat(64)
    const insert=async(filename)=>pg.query(
      "INSERT INTO agentstudio.knowledge_documents"+
      "(owner_user_id,base_id,filename,object_key,mime_type,sha256,status) "+
      "VALUES($1,$2,$3,'isolated-only','text/plain',$4,'indexed') RETURNING id",
      [uid,baseId,filename,digest])
    const first=await insert("first.txt")
    await assert.rejects(insert("duplicate.txt"),e=>e.code==="23505")
    await pg.query("UPDATE agentstudio.knowledge_documents SET status='deleted' WHERE id=$1",
      [first.rows[0].id])
    const second=await insert("replacement.txt")
    assert.ok(second.rows[0].id)
  } finally {
    await pg.close()
  }
})
