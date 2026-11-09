import {runOriginalNoStoreBrowserCheck} from '../tests/helpers/original-no-store-browser-check.mjs'
try{console.log(JSON.stringify(await runOriginalNoStoreBrowserCheck()))}catch(error){console.error(error);process.exitCode=1}
