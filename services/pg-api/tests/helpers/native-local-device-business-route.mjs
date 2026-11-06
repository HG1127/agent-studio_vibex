// Pure fixture composition using the same strict Boolean router as the actual
// Native entry. An owned local response ends dispatch; false awaits generic.
import {createNativeEntryHttpHandler} from '../../src/native-entry-http.ts'
export function composeNativeLocalDeviceBusiness(local,generic){return createNativeEntryHttpHandler(generic,local)}
