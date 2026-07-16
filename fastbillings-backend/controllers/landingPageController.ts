import type { Request, Response } from 'express';

import {
  getOrCreateLandingPage,
  getPublicLandingPayload,
  updateLandingPageContent,
} from '../lib/landingPageService';
import type { LandingPageContent } from '../lib/landingPageTypes';

export async function getPublicLandingPage(_req: Request, res: Response): Promise<void> {
  try {
    const data = await getPublicLandingPayload();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to load landing page',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function getAdminLandingPage(_req: Request, res: Response): Promise<void> {
  try {
    const page = await getOrCreateLandingPage();
    res.json({ success: true, data: page });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to load landing page',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function updateAdminLandingPage(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { content?: Partial<LandingPageContent> };
    if (!body.content || typeof body.content !== 'object') {
      res.status(400).json({ success: false, message: 'content object is required' });
      return;
    }
    const page = await updateLandingPageContent(body.content);
    res.json({ success: true, data: page, message: 'Landing page updated' });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to update landing page',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

module.exports = {
  getPublicLandingPage,
  getAdminLandingPage,
  updateAdminLandingPage,
};
