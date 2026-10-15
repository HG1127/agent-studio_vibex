#!/usr/bin/env node
// Operator wrapper. The actual isolated code is owned by the PG service image.
import {main} from "../services/pg-api/src/stage-migration-operator.mjs"
void main(process.argv.slice(2))
