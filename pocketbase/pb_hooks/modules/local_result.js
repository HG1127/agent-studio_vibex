// Pure Goja-compatible result contract. Raster images only; no remote URLs or SVG.
var PREFIX = "\u001eSTUDIO_LOCAL_V1:"
function normalize(value) {
  if (typeof value === "string") return { text: value.slice(0, 12000), images: [] }
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.text !== "string" || !Array.isArray(value.images)) throw Error("invalid_local_result")
  if (value.images.length > 1) throw Error("too_many_images")
  var images = []
  for (var i = 0; i < value.images.length; i++) {
    var image = value.images[i] || {}, data = image.data
    if ((image.mimeType !== "image/png" && image.mimeType !== "image/jpeg") || typeof data !== "string" || data.length < 16 || data.length > 1398104 || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw Error("invalid_local_image")
    var padding = data.slice(-2) === "==" ? 2 : data.slice(-1) === "=" ? 1 : 0
    if (data.length / 4 * 3 - padding > 1048576) throw Error("image_too_large")
    if (image.mimeType === "image/png" ? data.indexOf("iVBORw0KGgo") !== 0 : data.indexOf("/9j/") !== 0) throw Error("invalid_image_signature")
    images.push({ mimeType: image.mimeType, data: data })
  }
  return { text: value.text.slice(0, 12000), images: images }
}
function encode(value) { return PREFIX + JSON.stringify(normalize(value)) }
function decode(value) {
  var raw = String(value || "")
  if (raw.indexOf(PREFIX) !== 0) return normalize(raw)
  return normalize(JSON.parse(raw.slice(PREFIX.length)))
}
module.exports = { normalize: normalize, encode: encode, decode: decode }
