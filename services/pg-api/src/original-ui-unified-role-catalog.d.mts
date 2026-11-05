export const unifiedOriginalRoleCatalogSQL:string;
export type UnifiedRoleCatalogComponent=Readonly<{database_oid:string;source_sha256:string;original_14_LOGIN_metadata_verified:true;profile_component_only:true;whole_final_profile_verified:false;actual_LOGIN_connections_verified:false;authorizes_install:false;production_GO:false}>;
export function assertUnifiedOriginalRoleCatalog(raw:unknown,options?:Readonly<{purpose:'startup'|'transaction'}>):UnifiedRoleCatalogComponent;
export function verifyUnifiedOriginalRoleCatalog(db:{query(sql:string):Promise<{rows:unknown[]}>},options?:Readonly<{purpose:'startup'|'transaction'}>):Promise<UnifiedRoleCatalogComponent>;
