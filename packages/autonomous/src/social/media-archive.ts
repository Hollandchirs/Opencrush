/**
 * Media Archive — saves AI-generated social media to disk.
 *
 * Folder: characters/{name}/social-media/
 * Naming: {contentType}_{YYYY-MM-DD}_{HH-mm-ss}_{rand}.{ext}
 */

import { join } from 'path'
import { mkdirSync, writeFileSync } from 'fs'

export interface ArchiveResult {
  filePath: string
  fileName: string
}

export interface ArchiveOptions {
  characterName: string
  charactersDir: string
  mediaBuffer: Buffer
  mediaType: 'image' | 'video'
  /** e.g. 'selfie_post', 'video_post', 'selfie', 'video' */
  contentType: string
}

/**
 * Save a media buffer to the character's social-media archive folder.
 * Creates the directory if it doesn't exist.
 */
export function saveMediaToArchive(opts: ArchiveOptions): ArchiveResult {
  const archiveDir = join(opts.charactersDir, opts.characterName, 'social-media')
  mkdirSync(archiveDir, { recursive: true })

  const now = new Date()
  const datePart = now.toISOString().slice(0, 10)
  const timePart = now.toTimeString().slice(0, 8).replace(/:/g, '-')
  const rand = Math.random().toString(36).slice(2, 6)
  const ext = opts.mediaType === 'video' ? 'mp4' : 'jpg'
  const fileName = `${opts.contentType}_${datePart}_${timePart}_${rand}.${ext}`
  const filePath = join(archiveDir, fileName)

  writeFileSync(filePath, opts.mediaBuffer)
  console.log(`[Social/Archive] Saved ${fileName} (${(opts.mediaBuffer.length / 1024).toFixed(0)} KB)`)

  return { filePath, fileName }
}
