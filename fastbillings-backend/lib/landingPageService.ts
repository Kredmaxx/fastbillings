import type { Prisma } from '@prisma/client';

import { prisma } from './prisma';
import { DEFAULT_LANDING_PAGE_CONTENT } from './landingPageDefaults';
import type { LandingPageContent } from './landingPageTypes';
import { listActivePlansForPublic } from './planService';

const SINGLETON_ID = 'default';

function mergeContent(partial: Partial<LandingPageContent>): LandingPageContent {
  return {
    ...DEFAULT_LANDING_PAGE_CONTENT,
    ...partial,
    meta: { ...DEFAULT_LANDING_PAGE_CONTENT.meta, ...partial.meta },
    header: { ...DEFAULT_LANDING_PAGE_CONTENT.header, ...partial.header },
    hero: { ...DEFAULT_LANDING_PAGE_CONTENT.hero, ...partial.hero },
    modules: { ...DEFAULT_LANDING_PAGE_CONTENT.modules, ...partial.modules },
    features: { ...DEFAULT_LANDING_PAGE_CONTENT.features, ...partial.features },
    howItWorks: { ...DEFAULT_LANDING_PAGE_CONTENT.howItWorks, ...partial.howItWorks },
    pricing: { ...DEFAULT_LANDING_PAGE_CONTENT.pricing, ...partial.pricing },
    testimonials: { ...DEFAULT_LANDING_PAGE_CONTENT.testimonials, ...partial.testimonials },
    faq: { ...DEFAULT_LANDING_PAGE_CONTENT.faq, ...partial.faq },
    cta: { ...DEFAULT_LANDING_PAGE_CONTENT.cta, ...partial.cta },
    footer: { ...DEFAULT_LANDING_PAGE_CONTENT.footer, ...partial.footer },
  };
}

export function parseLandingContent(raw: unknown): LandingPageContent {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_LANDING_PAGE_CONTENT;
  }
  return mergeContent(raw as Partial<LandingPageContent>);
}

export async function getOrCreateLandingPage() {
  const existing = await prisma.landingPage.findUnique({ where: { id: SINGLETON_ID } });
  if (existing) {
    return { ...existing, content: parseLandingContent(existing.content) };
  }

  const created = await prisma.landingPage.create({
    data: {
      id: SINGLETON_ID,
      content: DEFAULT_LANDING_PAGE_CONTENT as unknown as Prisma.InputJsonValue,
    },
  });
  return { ...created, content: parseLandingContent(created.content) };
}

export async function updateLandingPageContent(partial: Partial<LandingPageContent>) {
  const current = await getOrCreateLandingPage();
  const merged = mergeContent({ ...current.content, ...partial });
  const updated = await prisma.landingPage.update({
    where: { id: SINGLETON_ID },
    data: { content: merged as unknown as Prisma.InputJsonValue },
  });
  return { ...updated, content: parseLandingContent(updated.content) };
}

export async function getPublicLandingPayload() {
  const page = await getOrCreateLandingPage();
  const content = page.content;
  let plans: Awaited<ReturnType<typeof listActivePlansForPublic>> = [];

  if (content.pricing.enabled && content.pricing.useLivePlans) {
    plans = await listActivePlansForPublic();
  }

  return {
    id: page.id,
    content,
    plans,
    updatedAt: page.updatedAt,
  };
}
