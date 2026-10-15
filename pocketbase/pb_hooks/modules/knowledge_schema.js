"use strict"
var journal = require(__hooks + "/modules/schema_journal.js")

// VibeX-compatible version journal for the custom knowledge schema.
// A separate pb_migrations/ deployment is not universally available through
// VibeX Source editor, so this domain starts its staged migration path in pb_hooks.
// This is *not* PocketBase's built-in migration runner. Never alter applied steps.
function applyKnowledgeMigrations(app) {
  var steps = [
    {
      id: "knowledge_0001_existing_v6",
      description: "Register V6 knowledge tables and original indexes",
      apply: function (tx) {
        var statements = [
          "CREATE TABLE IF NOT EXISTS agent_studio_kb_bases (" +
            "id TEXT PRIMARY KEY, rh_user_id TEXT NOT NULL, name TEXT NOT NULL," +
            "description TEXT NOT NULL DEFAULT '', created_ms INTEGER NOT NULL, updated_ms INTEGER NOT NULL)",
          "CREATE INDEX IF NOT EXISTS idx_kb_bases_owner ON agent_studio_kb_bases(rh_user_id,updated_ms)",
          "CREATE TABLE IF NOT EXISTS agent_studio_kb_documents (" +
            "id TEXT PRIMARY KEY, base_id TEXT NOT NULL, rh_user_id TEXT NOT NULL," +
            "filename TEXT NOT NULL, size_chars INTEGER NOT NULL, chunk_count INTEGER NOT NULL," +
            "created_ms INTEGER NOT NULL)",
          "CREATE INDEX IF NOT EXISTS idx_kb_docs_base ON agent_studio_kb_documents(rh_user_id,base_id,created_ms)",
          "CREATE TABLE IF NOT EXISTS agent_studio_kb_chunks (" +
            "id TEXT PRIMARY KEY, base_id TEXT NOT NULL, document_id TEXT NOT NULL," +
            "rh_user_id TEXT NOT NULL, chunk_index INTEGER NOT NULL, text_content TEXT NOT NULL)",
          "CREATE INDEX IF NOT EXISTS idx_kb_chunks_lookup ON agent_studio_kb_chunks(rh_user_id,base_id,document_id)",
        ]
        for (var i = 0; i < statements.length; i++) tx.db().newQuery(statements[i]).execute()
      },
    },
    {
      id: "knowledge_0002_additive_indexes",
      description: "Add owner-scoped indexes for document and chunk lookups",
      apply: function (tx) {
        tx.db().newQuery(
          "CREATE INDEX IF NOT EXISTS idx_kb_docs_owner_id ON agent_studio_kb_documents(rh_user_id,id,base_id)"
        ).execute()
        tx.db().newQuery(
          "CREATE INDEX IF NOT EXISTS idx_kb_chunks_owner_seq ON agent_studio_kb_chunks(rh_user_id,base_id,document_id,chunk_index)"
        ).execute()
      },
    },
    {
      id: "knowledge_0003_cascade_triggers",
      description: "Prevent future orphaned knowledge documents and chunks after deletes",
      apply: function (tx) {
        tx.db().newQuery(
          "CREATE TRIGGER IF NOT EXISTS trg_as_kb_base_cleanup AFTER DELETE ON agent_studio_kb_bases BEGIN " +
          "DELETE FROM agent_studio_kb_chunks WHERE base_id=OLD.id AND rh_user_id=OLD.rh_user_id; " +
          "DELETE FROM agent_studio_kb_documents WHERE base_id=OLD.id AND rh_user_id=OLD.rh_user_id; END"
        ).execute()
        tx.db().newQuery(
          "CREATE TRIGGER IF NOT EXISTS trg_as_kb_doc_cleanup AFTER DELETE ON agent_studio_kb_documents BEGIN " +
          "DELETE FROM agent_studio_kb_chunks WHERE document_id=OLD.id AND rh_user_id=OLD.rh_user_id; END"
        ).execute()
      },
    },
    {
      id: "knowledge_0004_embedding_index",
      description: "Owner scoped embedding configuration, vector snapshots, retry queue and deletion cleanup",
      apply: function (tx) {
        var statements = [
          "CREATE TABLE IF NOT EXISTS agent_studio_kb_embedding_settings (" +
            "rh_user_id TEXT PRIMARY KEY, connection_id TEXT NOT NULL, model_name TEXT NOT NULL, updated_ms INTEGER NOT NULL)",
          "CREATE TABLE IF NOT EXISTS agent_studio_kb_vectors (" +
            "chunk_id TEXT PRIMARY KEY, rh_user_id TEXT NOT NULL, base_id TEXT NOT NULL, document_id TEXT NOT NULL," +
            "connection_id TEXT NOT NULL, model_name TEXT NOT NULL, dimensions INTEGER NOT NULL," +
            "vector_json TEXT NOT NULL, indexed_ms INTEGER NOT NULL)",
          "CREATE INDEX IF NOT EXISTS idx_kb_vectors_owner_base_model ON " +
            "agent_studio_kb_vectors(rh_user_id,base_id,connection_id,model_name)",
          "CREATE TABLE IF NOT EXISTS agent_studio_kb_embedding_queue (" +
            "rh_user_id TEXT NOT NULL, base_id TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0," +
            "next_attempt_ms INTEGER NOT NULL DEFAULT 0, lease_until_ms INTEGER NOT NULL DEFAULT 0," +
            "last_error TEXT NOT NULL DEFAULT '', updated_ms INTEGER NOT NULL," +
            "PRIMARY KEY (rh_user_id,base_id))",
          "CREATE INDEX IF NOT EXISTS idx_kb_embedding_queue_due ON " +
            "agent_studio_kb_embedding_queue(next_attempt_ms,lease_until_ms,updated_ms)",
          "CREATE TRIGGER IF NOT EXISTS trg_kb_vector_chunk_delete AFTER DELETE ON agent_studio_kb_chunks " +
            "BEGIN DELETE FROM agent_studio_kb_vectors WHERE chunk_id=OLD.id AND rh_user_id=OLD.rh_user_id; END",
          "CREATE TRIGGER IF NOT EXISTS trg_kb_embedding_base_delete AFTER DELETE ON agent_studio_kb_bases " +
            "BEGIN DELETE FROM agent_studio_kb_embedding_queue WHERE base_id=OLD.id AND rh_user_id=OLD.rh_user_id; " +
            "DELETE FROM agent_studio_kb_vectors WHERE base_id=OLD.id AND rh_user_id=OLD.rh_user_id; END",
          "CREATE TRIGGER IF NOT EXISTS trg_kb_vector_document_delete AFTER DELETE ON agent_studio_kb_documents " +
            "BEGIN DELETE FROM agent_studio_kb_vectors WHERE document_id=OLD.id AND rh_user_id=OLD.rh_user_id; END",
        ]
        for (var i = 0; i < statements.length; i++) tx.db().newQuery(statements[i]).execute()
      },
    },
    {
      id: "knowledge_0005_employee_sharing",
      description: "Explicit staff scoped knowledge viewer/editor ACL and removal cleanup",
      apply: function(tx) {
        var commands=[
          "CREATE TABLE IF NOT EXISTS agent_studio_kb_access ("+
          "base_id TEXT NOT NULL, owner_uid TEXT NOT NULL, recipient_uid TEXT NOT NULL,"+
          "role TEXT NOT NULL CHECK(role IN ('viewer','editor')),"+
          "created_ms INTEGER NOT NULL, updated_ms INTEGER NOT NULL,"+
          "PRIMARY KEY(base_id,recipient_uid))",
          "CREATE INDEX IF NOT EXISTS idx_kb_access_recipient ON "+
          "agent_studio_kb_access(recipient_uid,base_id)",
          "CREATE INDEX IF NOT EXISTS idx_kb_access_owner ON "+
          "agent_studio_kb_access(owner_uid,base_id)",
          "CREATE TABLE IF NOT EXISTS agent_studio_kb_access_events ("+
          "id TEXT PRIMARY KEY,base_id TEXT NOT NULL,owner_uid TEXT NOT NULL,"+
          "recipient_uid TEXT NOT NULL,action TEXT NOT NULL,role TEXT NOT NULL,"+
          "occurred_ms INTEGER NOT NULL)",
          "CREATE INDEX IF NOT EXISTS idx_kb_access_events_owner ON "+
          "agent_studio_kb_access_events(owner_uid,occurred_ms)",
          "CREATE TRIGGER IF NOT EXISTS trg_kb_access_base_delete AFTER DELETE "+
          "ON agent_studio_kb_bases BEGIN DELETE FROM agent_studio_kb_access "+
          "WHERE base_id=OLD.id AND owner_uid=OLD.rh_user_id; END",
        ]
        for(var i=0;i<commands.length;i++)tx.db().newQuery(commands[i]).execute()
      },
    },
    {
      id: "knowledge_0006_shared_semantic_consent",
      description: "Opt-in semantic reuse of owner vectors, charged exclusively to searching staff",
      apply: function(tx) {
        tx.db().newQuery(
          "ALTER TABLE agent_studio_kb_access ADD COLUMN semantic_allowed INTEGER NOT NULL DEFAULT 0"
        ).execute()
        tx.db().newQuery(
          "CREATE INDEX IF NOT EXISTS idx_kb_access_semantic ON agent_studio_kb_access(base_id,recipient_uid,semantic_allowed)"
        ).execute()
      },
    },
  ]
  journal.applySteps(app, steps)
}

module.exports = { applyKnowledgeMigrations: applyKnowledgeMigrations }
