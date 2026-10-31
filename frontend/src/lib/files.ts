/** File types the backend can read (see backend/app/ingest/documents.py). */
export const UPLOAD_ACCEPT = [
  'image/*',
  '.heic',
  '.heif',
  '.pdf',
  '.docx',
  '.pptx',
  '.xlsx',
  '.csv',
  '.tsv',
  '.txt',
  '.md',
  '.json',
  '.html',
].join(',')

export const UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024
const MAX_EDGE = 1800
const SHRINK_OVER_BYTES = 900 * 1024

/**
 * Phone photos and screenshots are often several MB. Re-encode large images
 * as JPEG in the browser so uploads stay well under the 4 MB API limit.
 * Formats the browser can't decode (HEIC on most browsers) are sent as-is.
 */
export async function prepareUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && file.size <= SHRINK_OVER_BYTES) {
    bitmap.close()
    return file
  }
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.fillStyle = '#ffffff' // flatten PNG transparency
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
  if (!blob || blob.size >= file.size) return file
  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
  return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified })
}

export const formatBytes = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
