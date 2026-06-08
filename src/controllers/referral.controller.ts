import { Request, Response } from 'express'
import { referralService } from '../services/referral.service'

interface AuthRequest extends Request { user: { userId: string } }

class ReferralController {
  getStats = async (req: Request, res: Response): Promise<void> => {
    const userId = (req as AuthRequest).user.userId
    const stats = await referralService.getStats(userId)
    res.json({ data: stats })
  }
}

export const referralController = new ReferralController()
