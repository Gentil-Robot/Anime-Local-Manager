"use strict";
// This is a single-user, loopback-only app. Browsers on other origins must
// not be able to import files, trigger jobs, or read the local library.
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);
function localAuthority(value, port) {
  if (typeof value !== "string" || !value || /[\s\\/@?#]/.test(value)) return null;
  try {
    const url = new URL(`http://${value}`);
    if (!LOOPBACK.has(url.hostname) || (port && Number(url.port || 80) !== Number(port))) return null;
    return url;
  } catch { return null; }
}
function localRequestGuard(req, res, next) {
  const host = localAuthority(req.headers?.host, req.socket?.localPort);
  const reject = () => res.status(403).json({error: "Local requests only", code: "ALM_ORIGIN_REJECTED"});
  if (!host) return reject();
  if (req.headers["sec-fetch-site"] === "cross-site") return reject();
  const origin = req.headers.origin;
  if (origin !== undefined) {
    try {
      const url = new URL(origin);
      if (url.protocol !== "http:" || url.username || url.password || !LOOPBACK.has(url.hostname)
        || Number(url.port || 80) !== Number(host.port || 80)) return reject();
    } catch { return reject(); }
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  return next();
}
function validIpcSender(event, mainWindow, origin) {
  try {
    return !!mainWindow && event.sender === mainWindow.webContents
      && event.senderFrame === mainWindow.webContents.mainFrame
      && new URL(event.senderFrame.url).origin === origin;
  } catch { return false; }
}
module.exports = {localAuthority, localRequestGuard, validIpcSender};
