export const unifiedOriginalRoleInstallCatalogSQL:string;
export type UnifiedRoleInstallCatalogComponent=Readonly<{database_oid:string;source_sha256:string;original_14_LOGIN_metadata_verified:true;profile_component_only:true;installation_transaction_audited:true;whole_final_profile_verified:false;actual_LOGIN_connections_verified:false;authorizes_install:false;production_GO:false}>;
export function assertUnifiedOriginalRoleInstallCatalog(raw:unknown,options?:Readonly<{purpose:'install'}>):UnifiedRoleInstallCatalogComponent;
export function verifyUnifiedOriginalRoleInstallCatalog(db:{query(sql:string):Promise<{rows:unknown[]}>},options?:Readonly<{purpose:'install'}>):Promise<UnifiedRoleInstallCatalogComponent>;
