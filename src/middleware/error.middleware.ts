import { Request, Response, NextFunction } from 'express'
import { AppError } from '../utils/AppError'

export function errorMiddleware(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ message: err.message })
    return
  }

  if (process.env.NODE_ENV === 'development') {
    console.error(err)
  }

  res.status(500).json({ message: 'Internal server error' })
}
