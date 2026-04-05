import multer, { StorageEngine } from 'multer'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { Request } from 'express'
import { AppError } from '../utils/AppError'

const UPLOAD_DIR = path.join(process.cwd(), 'uploads')
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const storage: StorageEngine = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, `${uuidv4()}${ext}`)
  },
})

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/quicktime', 'video/x-msvideo',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/mp4',
  'application/pdf',
])

const MAX_SIZE = 50 * 1024 * 1024 // 50MB

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: MAX_SIZE, files: 5 },
  fileFilter: (_req: Request, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new AppError(`Неподдерживаемый тип файла: ${file.mimetype}`, 400) as any, false)
      return
    }
    cb(null, true)
  },
}).array('files', 5)
