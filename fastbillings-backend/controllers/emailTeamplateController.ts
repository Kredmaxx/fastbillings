import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import type { EmailTemplateStatus, NotificationTypeStatus } from '@prisma/client';

import { prisma } from '../lib/prisma';
import {
  optionalTenantId,
  requireUserId,
  tenantOrUserFilter,
  tenantOrUserScope,
  UnauthorizedError,
} from '../lib/tenantScope';

interface CreateEmailTemplateBody {
  title?: string;
  // Note: the JS source uses `notification_type`; we accept that and the
  // Prisma-native `notificationTypeId` for forward-compat.
  notification_type?: string;
  notificationTypeId?: string;
  description?: string;
  subject?: string;
  sms_content?: string;
  notification_content?: string;
  status?: EmailTemplateStatus;
}

function handleUnauthorized(res: Response, err: unknown): boolean {
  if (err instanceof UnauthorizedError) {
    res.status(err.status).json({ success: false, message: err.message });
    return true;
  }
  return false;
}

/** System library + workspace-owned templates. */
function emailTemplateVisibility(req: Request): Prisma.EmailTemplateWhereInput {
  const userId = requireUserId(req);
  const tenantId = optionalTenantId(req);
  const ownership: Prisma.EmailTemplateWhereInput[] = [{ isSystem: true }, { userId }];
  if (tenantId) ownership.push({ tenantId });
  return { OR: ownership };
}

function workspaceSiblingFilter(
  tenantId: string | null,
  userId: string,
  notificationTypeId: string,
  excludeId: string,
): Prisma.EmailTemplateWhereInput {
  return {
    notificationTypeId,
    status: 'active',
    id: { not: excludeId },
    isSystem: false,
    ...(tenantId ? { OR: [{ tenantId }, { userId }] } : { userId }),
  };
}

// =============================================================================
// Email Templates
// =============================================================================

export async function createEmailTemplate(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const body = req.body as CreateEmailTemplateBody;
    const {
      title,
      description,
      subject,
      sms_content,
      notification_content,
      status = 'active',
    } = body;
    const notificationTypeId = body.notification_type ?? body.notificationTypeId;

    if (!title || !notificationTypeId || !subject) {
      res.status(400).json({
        success: false,
        message: 'Title, notification_type, and subject are required',
      });
      return;
    }

    const notificationTypeExists = await prisma.notificationType.findUnique({
      where: { id: notificationTypeId },
    });
    if (!notificationTypeExists) {
      res.status(404).json({
        success: false,
        message: 'Notification type not found',
      });
      return;
    }

    const emailTemplate = await prisma.emailTemplate.create({
      data: {
        title,
        notificationTypeId,
        description,
        subject,
        sms_content,
        notification_content,
        status: status as EmailTemplateStatus,
        isSystem: false,
        userId,
        tenantId,
      },
    });

    // Only one active workspace template per notification type.
    if (emailTemplate.status === 'active') {
      await prisma.emailTemplate.updateMany({
        where: workspaceSiblingFilter(tenantId, userId, notificationTypeId, emailTemplate.id),
        data: { status: 'inactive' },
      });
    }

    res.status(201).json({
      success: true,
      message: 'Email template created successfully',
      data: emailTemplate,
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Email template creation error:', err);
    res.status(500).json({
      success: false,
      message: 'Error creating email template',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function listEmailTemplates(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { page = '1', limit = '10', search = '', status } = req.query as {
      page?: string;
      limit?: string;
      status?: EmailTemplateStatus;
      search?: string;
    };

    const pageNum = Number(page);
    const limitNum = Number(limit);

    const andFilters: Prisma.EmailTemplateWhereInput[] = [emailTemplateVisibility(req)];
    if (search) {
      andFilters.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { subject: { contains: search, mode: 'insensitive' } },
        ],
      });
    }
    if (status) andFilters.push({ status });
    const where: Prisma.EmailTemplateWhereInput = { AND: andFilters };

    const [total, templates] = await Promise.all([
      prisma.emailTemplate.count({ where }),
      prisma.emailTemplate.findMany({
        where,
        include: {
          notificationType: { select: { id: true, title: true, slug: true } },
        },
        orderBy: [{ isSystem: 'desc' }, { createdAt: 'desc' }],
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
    ]);

    // Expose the relation as `notification_type` too — the frontend (and its
    // EmailTemplate type) reads `notification_type`, while Prisma names it
    // `notificationType`. Keeping both avoids an edit-modal crash.
    const mapped = templates.map((t) => ({
      ...t,
      notification_type: (t as { notificationType?: unknown }).notificationType,
    }));

    res.status(200).json({
      success: true,
      message: 'Email templates fetched successfully',
      data: {
        templates: mapped,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Error fetching email templates:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching email templates',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function updateEmailTemplate(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const { id } = req.params as { id: string };
    const body = req.body as CreateEmailTemplateBody;
    const updates: Prisma.EmailTemplateUncheckedUpdateInput = { ...body };

    // Translate notification_type (legacy) → notificationTypeId for Prisma.
    const incomingNotificationTypeId =
      body.notification_type ?? body.notificationTypeId ?? undefined;
    delete (updates as Record<string, unknown>).notification_type;
    delete (updates as Record<string, unknown>).notificationTypeId;
    delete (updates as Record<string, unknown>).isSystem;
    delete (updates as Record<string, unknown>).tenantId;
    delete (updates as Record<string, unknown>).userId;

    if (incomingNotificationTypeId) {
      const notificationTypeExists = await prisma.notificationType.findUnique({
        where: { id: incomingNotificationTypeId },
      });
      if (!notificationTypeExists) {
        res.status(404).json({
          success: false,
          message: 'Notification type not found',
        });
        return;
      }
      updates.notificationTypeId = incomingNotificationTypeId;
    }

    const existing = await prisma.emailTemplate.findFirst({
      where: {
        id,
        isSystem: false,
        ...tenantOrUserFilter(req),
      },
    });
    if (!existing) {
      res.status(404).json({
        success: false,
        message: 'Email template not found or not editable',
      });
      return;
    }

    const updatedTemplate = await prisma.emailTemplate.update({
      where: { id },
      data: updates,
    });

    if (updatedTemplate.status === 'active') {
      await prisma.emailTemplate.updateMany({
        where: workspaceSiblingFilter(
          tenantId,
          userId,
          updatedTemplate.notificationTypeId,
          updatedTemplate.id,
        ),
        data: { status: 'inactive' },
      });
    }

    res.status(200).json({
      success: true,
      message: 'Email template updated successfully',
      data: updatedTemplate,
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Error updating email template:', err);
    res.status(500).json({
      success: false,
      message: 'Error updating email template',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function deleteEmailTemplate(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };

    const existing = await prisma.emailTemplate.findFirst({
      where: {
        id,
        isSystem: false,
        ...tenantOrUserFilter(req),
      },
    });
    if (!existing) {
      res.status(404).json({
        success: false,
        message: 'Email template not found or not deletable',
      });
      return;
    }

    await prisma.emailTemplate.delete({ where: { id } });

    res.status(200).json({
      success: true,
      message: 'Email template deleted successfully',
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Error deleting email template:', err);
    res.status(500).json({
      success: false,
      message: 'Error deleting email template',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// Notification Types (helper endpoint that lives in this controller file)
// =============================================================================

export async function listNotificationTypes(req: Request, res: Response): Promise<void> {
  try {
    const { search = '', status, tagId } = req.query as {
      search?: string;
      status?: NotificationTypeStatus;
      tagId?: string;
    };

    const where: Prisma.NotificationTypeWhereInput = {};

    if (status) {
      where.status = status;
    }

    if (search) {
      where.title = { contains: search, mode: 'insensitive' };
    }

    if (tagId) {
      where.tags = { some: { notificationTagId: tagId } };
    }

    const data = await prisma.notificationType.findMany({
      where,
      include: {
        tags: {
          include: {
            notificationTag: { select: { id: true, title: true, status: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Flatten the join to mirror Mongoose `.populate('tags', 'title status')`.
    const flattened = data.map((nt) => ({
      ...nt,
      tags: nt.tags.map((joinRow) => joinRow.notificationTag),
    }));

    res.status(200).json({
      success: true,
      message: 'Notification types fetched successfully',
      data: flattened,
      count: flattened.length,
    });
  } catch (err) {
    console.error('Error fetching notification types:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching notification types',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// Template rendering — resolve the active template for a document type and
// substitute {Tag} merge fields with the document's real values. Used by the
// invoice/quotation email screens to prefill subject + body.
// =============================================================================

function fmtMoney(amount: unknown, code?: string | null): string {
  const c = (code || 'USD').toString().toUpperCase();
  const n = Number(amount ?? 0);
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(n);
  } catch {
    return `${c} ${n.toFixed(2)}`;
  }
}
function fmtDate(d: unknown): string {
  if (!d) return '';
  const date = new Date(d as string);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
function humanizeStatus(s: unknown): string {
  return String(s ?? '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
function applyPlaceholders(text: string | null | undefined, map: Record<string, string>): string {
  let out = text ?? '';
  for (const [key, value] of Object.entries(map)) {
    // Tags are plain words/spaces — escape just in case, then replace {Tag} globally.
    const safe = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\{\\s*${safe}\\s*\\}`, 'g'), value);
  }
  return out;
}

function appBaseUrl(): string {
  return (process.env.FRONTEND_URL || 'http://localhost:8080').replace(/\/+$/, '');
}

async function activeTemplateForSlug(req: Request, slug: string) {
  return prisma.emailTemplate.findFirst({
    where: {
      status: 'active',
      notificationType: { slug },
      AND: [emailTemplateVisibility(req)],
    },
    // Prefer workspace overrides over system library templates.
    orderBy: [{ isSystem: 'asc' }, { updatedAt: 'desc' }],
  });
}

async function buildInvoiceMap(req: Request, invoiceId: string): Promise<Record<string, string> | null> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, ...tenantOrUserScope(req) },
    include: { billToCustomer: true, customer: true, payments: true },
  });
  if (!invoice) return null;
  const company = await prisma.companySettings.findFirst({
    where: tenantOrUserFilter(req),
    orderBy: { createdAt: 'desc' },
  });
  const customer = invoice.billToCustomer ?? invoice.customer;
  const total = Number(invoice.TotalAmount ?? 0);
  const paid = (invoice.payments ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0);
  return {
    'Customer Name': customer?.name ?? '',
    'Company Name': company?.companyName ?? '',
    'Invoice Number': invoice.invoiceNumber ?? '',
    'Invoice Date': fmtDate(invoice.invoiceDate),
    'Due Date': fmtDate(invoice.dueDate),
    'Invoice Amount': fmtMoney(total, invoice.currencyCode),
    'Invoice Status': humanizeStatus(invoice.status),
    'Amount Paid': fmtMoney(paid, invoice.currencyCode),
    'Balance Due': fmtMoney(total - paid, invoice.currencyCode),
    'View Invoice Link': `${appBaseUrl()}/admin/view-invoice/${invoice.id}`,
  };
}

async function buildQuotationMap(req: Request, quotationId: string): Promise<Record<string, string> | null> {
  const q = await prisma.quotation.findFirst({
    where: { id: quotationId, ...tenantOrUserScope(req) },
    include: { billToCustomer: true, customer: true },
  });
  if (!q) return null;
  const company = await prisma.companySettings.findFirst({
    where: tenantOrUserFilter(req),
    orderBy: { createdAt: 'desc' },
  });
  const customer = q.billToCustomer ?? q.customer;
  return {
    'Customer Name': customer?.name ?? '',
    'Company Name': company?.companyName ?? '',
    'Quotation Number': q.quotationId ?? '',
    'Quotation Date': fmtDate(q.quotationDate),
    'Expiry Date': fmtDate(q.expiryDate),
    'Quotation Amount': fmtMoney(q.TotalAmount, q.currencyCode),
    'View Quotation Link': `${appBaseUrl()}/admin/view-quotation/${q.id}`,
  };
}

/**
 * GET /admin/email-template/resolve/:docType/:id
 * docType: 'invoice' | 'quotation'
 * Returns { hasTemplate, subject, html } — the active template for that
 * document type with merge fields filled. hasTemplate=false → caller uses its
 * own built-in default body.
 */
export async function resolveDocumentTemplate(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { docType, id } = req.params as { docType: string; id: string };
    const slugByType: Record<string, string> = {
      invoice: 'invoice-generated',
      quotation: 'new-quotation-created',
    };
    const slug = slugByType[docType];
    if (!slug) {
      res.status(400).json({ success: false, message: `Unsupported document type: ${docType}` });
      return;
    }

    const template = await activeTemplateForSlug(req, slug);
    if (!template) {
      res.status(200).json({ success: true, data: { hasTemplate: false, subject: '', html: '' } });
      return;
    }

    const map = docType === 'invoice' ? await buildInvoiceMap(req, id) : await buildQuotationMap(req, id);
    if (!map) {
      res.status(404).json({ success: false, message: `${docType} not found` });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        hasTemplate: true,
        subject: applyPlaceholders(template.subject, map),
        html: applyPlaceholders(template.description, map),
      },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('resolveDocumentTemplate error:', err);
    res.status(500).json({
      success: false,
      message: 'Error resolving email template',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// CommonJS interop for legacy JS routes that still use module-alias requires.
module.exports = {
  createEmailTemplate,
  listEmailTemplates,
  updateEmailTemplate,
  listNotificationTypes,
  deleteEmailTemplate,
  resolveDocumentTemplate,
};
module.exports.createEmailTemplate = createEmailTemplate;
module.exports.listEmailTemplates = listEmailTemplates;
module.exports.updateEmailTemplate = updateEmailTemplate;
module.exports.listNotificationTypes = listNotificationTypes;
module.exports.deleteEmailTemplate = deleteEmailTemplate;
module.exports.resolveDocumentTemplate = resolveDocumentTemplate;
