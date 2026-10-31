"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
// Write beside the target, sync then rename: a failed write cannot truncate
// the previous file. Errors propagate; callers must never report false success.
function atomicWrite(file, data) {
  fs.mkdirSync(path.dirname(file), {recursive:true});
  const temp = `${file}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  let fd;
  try {
    fd = fs.openSync(temp, "wx", 0o600);
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    fs.renameSync(temp, file);
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch {}
    try { fs.unlinkSync(temp); } catch (error) { if (error.code !== "ENOENT") console.warn("Temporary file cleanup:", error.code); }
  }
}
function atomicJson(file, data) { atomicWrite(file, JSON.stringify(data, null, 2)); }
module.exports = {atomicWrite, atomicJson};
