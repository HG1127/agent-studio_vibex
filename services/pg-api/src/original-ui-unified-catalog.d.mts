export const unifiedEmployeeCatalogSQL:string;
export function readUnifiedEmployeeCatalog(db:{query(sql:string):Promise<{rows:unknown[]}>}):Promise<Record<string,unknown>>;
export function assertUnifiedEmployeeCatalogStable(before:unknown,after:unknown):Readonly<{catalog_sha256:string;compared_whole_non_system_catalog:true;profile_component_only:true;whole_final_profile_verified:false;authorizes_install:false;production_GO:false}>;
