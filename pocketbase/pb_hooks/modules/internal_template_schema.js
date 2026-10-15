"use strict"

// Versioned, immutable internal-template invitation table.
// Deliberately no global template catalog, organization-wide browse, or
// persisted plain invitation token; these are one-use invitations.
var journal = require(__hooks + "/modules/schema_journal.js")

function applyInternalTemplateMigrations(app) {
  journal.applySteps(app, [{
    id: "internal_0001_template_invites",
    description: "Add single-use internal agent-template invitations with ownership and expiry",
    apply: function (tx) {
      tx.db().newQuery(
        "CREATE TABLE IF NOT EXISTS agent_studio_template_invites (" +
        "id TEXT PRIMARY KEY,owner_uid TEXT NOT NULL,spec_id TEXT NOT NULL," +
        "name TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE," +
        "created_ms INTEGER NOT NULL,expires_ms INTEGER NOT NULL," +
        "used_ms INTEGER NOT NULL DEFAULT 0,used_by TEXT NOT NULL DEFAULT ''," +
        "revoked INTEGER NOT NULL DEFAULT 0)"
      ).execute()
      tx.db().newQuery(
        "CREATE INDEX IF NOT EXISTS idx_internal_invites_owner " +
        "ON agent_studio_template_invites(owner_uid,created_ms DESC)"
      ).execute()
      tx.db().newQuery(
        "CREATE INDEX IF NOT EXISTS idx_internal_invites_expiry " +
        "ON agent_studio_template_invites(expires_ms,revoked,used_ms)"
      ).execute()
    }
  },{
    id:"internal_0002_template_snapshot",
    description:"Freeze recipient-safe Agent template text in each invitation",
    apply:function(tx){
      tx.db().newQuery(
        "ALTER TABLE agent_studio_template_invites ADD COLUMN " +
        "snapshot_json TEXT NOT NULL DEFAULT ''"
      ).execute()
    }
  }])
}
module.exports = {applyInternalTemplateMigrations:applyInternalTemplateMigrations}
