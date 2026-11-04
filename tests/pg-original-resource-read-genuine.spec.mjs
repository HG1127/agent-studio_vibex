// Exactly one environment-selected case, one fresh PG service, one initializer.
import {test,expect,chromium} from '@playwright/test'
import {registerOriginalResourceReadTest} from './helpers/pg-original-resource-read-stories.mjs'
import {startOriginalResourceReadFixture} from './helpers/pg-original-resource-read-fixture.mjs'
registerOriginalResourceReadTest({test,expect,chromium,startGenuineFixture:startOriginalResourceReadFixture})
