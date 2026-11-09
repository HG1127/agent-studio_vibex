// Types for the existing original read-only service preflight functions reused
// by the optional075 installer. The original implementation is unchanged.
import type {SqlClient} from './contracts.ts'
import type {CompleteProfileTarget} from './pg18-complete-profile.ts'
import type {CompleteProfileSnapshot} from './pg18-complete-profile-source.mjs'
export function completeServiceTarget(db:SqlClient,expected:CompleteProfileTarget):Promise<true>
export function completeServiceInitialAdmin(db:SqlClient,required:boolean):Promise<boolean>
export function completeServiceCatalog(db:SqlClient,snapshot:Pick<CompleteProfileSnapshot,'roles'>):Promise<Map<string,Readonly<{name:string;login:boolean;safe:boolean;verifier:string|null}>>>
