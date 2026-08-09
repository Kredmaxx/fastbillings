import type { Request, Response } from 'express';

import { prisma } from '../lib/prisma';
import {
  optionalTenantId,
  requireUserId,
  tenantOrUserFilter,
  UnauthorizedError,
} from '../lib/tenantScope';

function handleUnauthorized(res: Response, err: unknown): boolean {
  if (err instanceof UnauthorizedError) {
    res.status(err.status).json({ success: false, message: err.message });
    return true;
  }
  return false;
}

/** Prefer workspace (tenant) template, then legacy user-owned row. */
async function findWorkspaceTemplate(req: Request) {
  const userId = requireUserId(req);
  const tenantId = optionalTenantId(req);
  if (tenantId) {
    const byTenant = await prisma.invoiceTemplate.findFirst({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
    });
    if (byTenant) return byTenant;
  }
  return prisma.invoiceTemplate.findFirst({
    where: { ...tenantOrUserFilter(req) },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function createOrUpdateTemplate(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const { default_invoice_template } = req.body as { default_invoice_template?: string };

    // Prefer updating the workspace template when tenant is set
    let existing = tenantId
      ? await prisma.invoiceTemplate.findFirst({
          where: { tenantId },
          orderBy: { updatedAt: 'desc' },
        })
      : null;
    if (!existing) {
      existing = await prisma.invoiceTemplate.findFirst({
        where: tenantId ? { OR: [{ tenantId }, { userId }] } : { userId },
        orderBy: { updatedAt: 'desc' },
      });
    }

    if (existing) {
      const template = await prisma.invoiceTemplate.update({
        where: { id: existing.id },
        data: {
          default_invoice_template: default_invoice_template ?? existing.default_invoice_template,
          ...(tenantId && !existing.tenantId ? { tenantId } : {}),
        },
      });
      res.status(200).json({ success: true, message: 'Template updated successfully', data: template });
      return;
    }

    const template = await prisma.invoiceTemplate.create({
      data: {
        default_invoice_template: default_invoice_template ?? '',
        userId,
        tenantId,
      },
    });
    res.status(201).json({ success: true, message: 'Template created successfully', data: template });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Template upsert error:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err instanceof Error ? err.message : String(err) });
  }
}

export async function getMyTemplate(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const template = await findWorkspaceTemplate(req);
    if (!template) {
      res.status(404).json({ success: false, message: 'Template not found for this user' });
      return;
    }
    res.status(200).json({ success: true, data: template });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Get template error:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err instanceof Error ? err.message : String(err) });
  }
}

export async function getAllTemplates(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const templates = await prisma.invoiceTemplate.findMany({
      where: { ...tenantOrUserFilter(req) },
      include: {
        user: { select: { firstName: true, email: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    res.status(200).json({ success: true, count: templates.length, data: templates });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Get all templates error:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err instanceof Error ? err.message : String(err) });
  }
}

// CommonJS interop for legacy JS routes
module.exports = { createOrUpdateTemplate, getMyTemplate, getAllTemplates };
module.exports.createOrUpdateTemplate = createOrUpdateTemplate;
module.exports.getMyTemplate = getMyTemplate;
module.exports.getAllTemplates = getAllTemplates;
