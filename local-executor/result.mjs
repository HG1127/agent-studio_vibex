export function desktopResult(result) {
  // Windows-MCP reports ownership refusals as MCP tool errors, including
  // during the post-action screenshot. Never expose its raw desktop detail.
  if (result.isError && (result.content || []).some(c => c.type === 'text' &&
      /\b(?:USER_CONTROL|TAKEOVER_PENDING|CONTROL_UNAVAILABLE|PHYSICAL_INPUT_HELD)\b/.test(c.text))) {
    throw Error('desktop_user_control')
  }
  return mcpResult(result, true)
}

export function mcpResult(result, imagesEnabled = false) {
  const content = result.content || []
  const text = content.filter(c => c.type === 'text').map(c => c.text).join('\n').slice(0, 12000)
    || (result.structuredContent ? JSON.stringify(result.structuredContent).slice(0, 12000) : '')
  if (result.isError) throw Error('mcp_tool_failed', { cause: text })
  const images = content.filter(c => c.type === 'image')
  if (!images.length) return text || '工具返回空文本'
  if (!imagesEnabled) throw Error('image_output_not_enabled')
  if (images.length > 1) throw Error('too_many_images')
  const image = images[0]
  if (!['image/png', 'image/jpeg'].includes(image.mimeType) || typeof image.data !== 'string' ||
      image.data.length > 1398104 || image.data.length < 16 || image.data.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)) throw Error('invalid_image')
  const bytes = Buffer.from(image.data, 'base64')
  if (bytes.length > 1048576 || bytes.toString('base64') !== image.data ||
      (image.mimeType === 'image/png' ? bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' : bytes.subarray(0, 3).toString('hex') !== 'ffd8ff')) throw Error('invalid_image')
  return { text: text || '截图已返回', images: [{ mimeType: image.mimeType, data: image.data }] }
}
