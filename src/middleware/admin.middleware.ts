import { Request, Response, NextFunction } from 'express'

export function adminMiddleware(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-admin-key']
  if (!key || key !== process.env.ADMIN_SECRET) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}
