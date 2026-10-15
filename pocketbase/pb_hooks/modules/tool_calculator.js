"use strict"

// Shared stateless builtin calculate tool; no eval(), Function(), network or host APIs.
function evaluate(src) {
  var text = String(src || "").replace(/\s+/g, "")
  if (!text) throw new Error("表达式为空")
  if (!/^[0-9+\-*/%().]+$/.test(text)) throw new Error("仅支持数字与 + - * / % 括号的算术表达式")
  var pos = 0
  function peek() { return text.charAt(pos) }
  function parseNumber() {
    var start = pos
    while (pos < text.length && "0123456789.".indexOf(text.charAt(pos)) >= 0) pos++
    if (start === pos) throw new Error("位置 " + (pos + 1) + " 处缺少数字")
    var n = parseFloat(text.substring(start, pos))
    if (isNaN(n)) throw new Error("非法数字")
    return n
  }
  function parseFactor() {
    var ch = peek()
    if (ch === "(") {
      pos++
      var value = parseExpression()
      if (peek() !== ")") throw new Error("缺少右括号")
      pos++
      return value
    }
    if (ch === "-") { pos++; return -parseFactor() }
    if (ch === "+") { pos++; return parseFactor() }
    return parseNumber()
  }
  function parseTerm() {
    var value = parseFactor()
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      var operator = peek()
      pos++
      var right = parseFactor()
      if ((operator === "/" || operator === "%") && right === 0) throw new Error("除数为零")
      if (operator === "*") value *= right
      else if (operator === "/") value /= right
      else value %= right
    }
    return value
  }
  function parseExpression() {
    var value = parseTerm()
    while (peek() === "+" || peek() === "-") {
      var operator = peek()
      pos++
      var right = parseTerm()
      value = operator === "+" ? value + right : value - right
    }
    return value
  }
  var result = parseExpression()
  if (pos < text.length) throw new Error("表达式存在多余内容")
  return result
}
module.exports = { evaluate:evaluate }
