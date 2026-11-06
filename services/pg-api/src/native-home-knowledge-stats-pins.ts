// Fixed source/dependency bodies. No installed-schema attestation.
export const originalHomeStatisticsSqlSha="bba0d5264ea95bc783d6df35741a97a32a7deb8d51c613f70864ff7e88f23abd"
export const originalHomeStatisticsFunctionPins=Object.freeze([
  {
    "signature": "knowledge_employee_active(uuid)",
    "owner": "agentstudio_knowledge_acl",
    "language": "plpgsql",
    "strict": false,
    "set": false,
    "args": 1,
    "roles": [
      "agentstudio_knowledge_embedding",
      "agentstudio_knowledge_execution",
      "agentstudio_knowledge_index",
      "agentstudio_knowledge_query"
    ],
    "result": "boolean",
    "sha256": "82321600c04a16d96d62997203d5d863955c18743ff2578668766b5b2aad44df"
  },
  {
    "signature": "knowledge_access_mode(uuid)",
    "owner": "agentstudio_knowledge_acl",
    "language": "sql",
    "strict": false,
    "set": false,
    "args": 1,
    "roles": [
      "agentstudio_api",
      "agentstudio_knowledge_content",
      "agentstudio_knowledge_query"
    ],
    "result": "text",
    "sha256": "d403e834a01f796128a5ab6ce23ddbccf300ea5fa7b63ab0be58872ccead028d"
  },
  {
    "signature": "knowledge_shared_bases()",
    "owner": "agentstudio_knowledge_acl",
    "language": "sql",
    "strict": false,
    "set": true,
    "args": 0,
    "roles": [
      "agentstudio_api"
    ],
    "result": "TABLE(iduuid,owner_user_iduuid,owner_nametext,nametext,descriptiontext,access_roletext,semantic_allowedboolean,access_revisionbigint,base_revisionbigint)",
    "sha256": "f3ca826c7f9f882d252039f169fde682da77d1997496caaa95446dd8dbabb032"
  },
  {
    "signature": "original_home_knowledge_stats(uuid)",
    "owner": "agentstudio_knowledge_content",
    "language": "plpgsql",
    "strict": true,
    "set": true,
    "args": 1,
    "roles": [
      "agentstudio_api"
    ],
    "result": "TABLE(iduuid,owner_user_iduuid,revisionbigint,created_attimestampwithtimezone,updated_attimestampwithtimezone,document_countbigint,chunk_countbigint,access_roletext)",
    "sha256": "33ca4802a2d26e34c6939904ec6c4384d018c0de03a7acd7e8a928ed9bef3974"
  }
].map(pin=>Object.freeze({...pin,roles:Object.freeze(pin.roles)})))
