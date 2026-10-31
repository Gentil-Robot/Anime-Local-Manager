'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const index=require('./catalogue-title-index').build(workerData.rows);
delete index.rows; // The main process already owns these rows.
parentPort.postMessage(index);
