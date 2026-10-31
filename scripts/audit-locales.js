#!/usr/bin/env node
"use strict";
const path=require("path");
const {localeCoverage}=require("../lib/diagnostics");
const result=localeCoverage(path.resolve(__dirname,".."));
if (process.argv.includes("--json")) console.log(JSON.stringify(result,null,2));
else for (const [code,item] of Object.entries(result)) console.log(`${code}: ${item.translated}/${item.total} keys (${item.percent}%) - ${item.missing.length} missing`);
if (process.argv.includes("--strict") && Object.values(result).some(x=>x.missing.length)) process.exitCode=1;
