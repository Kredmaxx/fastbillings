import type { Request, Response, NextFunction } from 'express';

export function requirePlatformAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.auth?.isPlatformAdmin) {
    res.status(403).json({
      success: false,
      message: 'Platform super admin access required.',
    });
    return;
  }
  next();
}

module.exports = requirePlatformAdmin;
module.exports.requirePlatformAdmin = requirePlatformAdmin;
