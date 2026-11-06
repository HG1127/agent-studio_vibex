import type {AgentSpec as Base} from '../pages/Home/presets'
import {parseOriginalRoleUiExtension} from '../../shared/original-role-execution-contract.mjs'
/** The original page and C's display helpers consume the same typed spec. */
export type OriginalRoleUiSpec=Base
export function originalRoleEditorView(value:Base):OriginalRoleUiSpec{
 return value
}
export function applyOriginalRoleEditorView(previous:Base,next:OriginalRoleUiSpec):Base{
 const extension=parseOriginalRoleUiExtension({roles:next.roles??[],capability_requirements:next.capability_requirements??[]},next.tools)
 return {...previous,...next,roles:extension.roles,capability_requirements:extension.capability_requirements}
}
