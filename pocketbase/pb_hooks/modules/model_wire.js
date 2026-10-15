"use strict"

// Shared response normalization for model providers in the PocketBase Goja VM.
// Pure JavaScript: do not depend on Node Buffer, TextDecoder, fetch or a global process.
function utf8ToStr(bytes) {
  if (!bytes || bytes.length === undefined) return ""
  var out = ""
  var i = 0
  while (i < bytes.length) {
    var b = bytes[i] & 255
    if (b < 128) { out += String.fromCharCode(b); i++ }
    else if (b > 191 && b < 224 && i + 1 < bytes.length) {
      out += String.fromCharCode(((b & 31) << 6) | (bytes[i + 1] & 63))
      i += 2
    } else if (b > 223 && b < 240 && i + 2 < bytes.length) {
      out += String.fromCharCode(((b & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63))
      i += 3
    } else if (b > 239 && i + 3 < bytes.length) {
      var cp = ((b & 7) << 18) | ((bytes[i + 1] & 63) << 12) |
        ((bytes[i + 2] & 63) << 6) | (bytes[i + 3] & 63)
      cp -= 65536
      out += String.fromCharCode(55296 + (cp >> 10), 56320 + (cp & 1023))
      i += 4
    } else {
      out += String.fromCharCode(65533)
      i++
    }
  }
  return out
}

function bytesToStr(response) {
  if (!response) return ""
  var raw = response.body
  if (typeof raw === "string") return raw
  return utf8ToStr(raw)
}

// Normalize only provider *output*. Transport, model connection authorization,
// billing, timeouts and credential decryption remain under the existing engine.
function extractContent(provider, raw) {
  var payload = raw && typeof raw === "object" ? raw : {}
  var result = ""
  if (provider === "anthropic") {
    var blocks = payload.content || []
    for (var i = 0; i < blocks.length; i++) {
      var item = blocks[i] || {}
      if (String(item.type || "") === "text") result += String(item.text || "")
    }
  } else if (provider === "gemini") {
    var candidates = payload.candidates || []
    var parts = (((candidates[0] || {}).content) || {}).parts || []
    for (var j = 0; j < parts.length; j++) {
      var part = parts[j] || {}
      if (part.text !== undefined && part.text !== null) result += String(part.text)
    }
  } else {
    var choices = payload.choices || []
    var message = (choices[0] && choices[0].message) || {}
    result = String(message.content || "")
  }
  return result
}

module.exports = {
  utf8ToStr: utf8ToStr,
  bytesToStr: bytesToStr,
  extractContent: extractContent,
}
