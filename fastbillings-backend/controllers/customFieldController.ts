import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';

// CustomField is a global lookup table tied to Module + FieldType — it has no
// userId column, so tenantScope() does not apply here. Soft-deletion via
// `deletedAt` is still respected.

// Create custom field
export async function createCustomField(req: Request, res: Response): Promise<void> {
  try {
    const {
      moduleId,
      labelName,
      fieldSlug,
      dataType,
      helpText,
      isMandatory,
      showInTable,
      options,
    } = req.body as {
      moduleId?: string;
      labelName?: string;
      fieldSlug?: string;
      dataType?: string;
      helpText?: string;
      isMandatory?: boolean;
      showInTable?: boolean;
      options?: unknown;
    };

    const existing = await prisma.customField.findFirst({
      where: {
        moduleId: moduleId as string,
        fieldSlug: fieldSlug as string,
        deletedAt: null,
      },
    });

    if (existing) {
      res.status(409).json({
        success: false,
        message: 'Field slug already exists in this module',
      });
      return;
    }

    const field = await prisma.customField.create({
      data: {
        moduleId: moduleId as string,
        labelName: labelName as string,
        fieldSlug: fieldSlug as string,
        fieldTypeId: dataType as string,
        helpText: helpText ?? '',
        isMandatory: isMandatory ?? false,
        showInTable: showInTable ?? false,
        options: (options ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Custom field created successfully',
      data: field,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Error creating custom field',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Update custom field
export async function updateCustomField(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params as { id: string };

    const {
      moduleId,
      labelName,
      fieldSlug,
      dataType,
      helpText,
      isMandatory,
      showInTable,
      options,
      status,
    } = req.body as {
      moduleId?: string;
      labelName?: string;
      fieldSlug?: string;
      dataType?: string;
      helpText?: string;
      isMandatory?: boolean;
      showInTable?: boolean;
      options?: unknown;
      status?: 'Active' | 'Inactive';
    };

    const field = await prisma.customField.findUnique({ where: { id } });

    if (!field) {
      res.status(404).json({
        success: false,
        message: 'Custom field not found',
      });
      return;
    }

    const checkModuleId = moduleId || field.moduleId;
    const checkSlug = fieldSlug || field.fieldSlug;

    // check duplicate inside same module
    const existing = await prisma.customField.findFirst({
      where: {
        id: { not: id },
        moduleId: checkModuleId,
        fieldSlug: checkSlug,
        deletedAt: null,
      },
    });

    if (existing) {
      res.status(409).json({
        success: false,
        message: 'Field slug already exists in this module',
      });
      return;
    }

    const data: Prisma.CustomFieldUpdateInput = {
      module: { connect: { id: checkModuleId } },
      labelName: labelName || field.labelName,
      fieldSlug: checkSlug,
      fieldType: { connect: { id: dataType || field.fieldTypeId } },
      helpText: helpText ?? field.helpText,
      isMandatory: isMandatory ?? field.isMandatory,
      showInTable: showInTable ?? field.showInTable,
      status: status || field.status,
    };

    if (options !== undefined) {
      data.options = (options ?? Prisma.JsonNull) as
        | Prisma.InputJsonValue
        | typeof Prisma.JsonNull;
    }

    const updated = await prisma.customField.update({
      where: { id: field.id },
      data,
    });

    res.json({
      success: true,
      message: 'Custom field updated successfully',
      data: updated,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Error updating custom field',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Get all fields
export async function getCustomFields(req: Request, res: Response): Promise<void> {
  try {
    const fields = await prisma.customField.findMany({
      where: { deletedAt: null },
      include: {
        fieldType: true,
        module: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: fields,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Error fetching fields',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Get fields by module (paginated, searchable)
export async function getModuleFields(req: Request, res: Response): Promise<void> {
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);
    const search = ((req.query.search as string) ?? '').trim();
    const { moduleId } = req.params as { moduleId: string };

    const where: Prisma.CustomFieldWhereInput = {
      moduleId,
      deletedAt: null,
    };

    // Search filter
    if (search) {
      where.OR = [
        { labelName: { contains: search, mode: 'insensitive' } },
        { fieldSlug: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, fields] = await Promise.all([
      prisma.customField.count({ where }),
      prisma.customField.findMany({
        where,
        include: { fieldType: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    res.status(200).json({
      success: true,
      message: 'Module fields fetched successfully',
      data: {
        fields,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Error fetching module fields',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function getModuleFieldsNew(req: Request, res: Response): Promise<void> {
  try {
    const { moduleId } = req.params as { moduleId: string };

    const fields = await prisma.customField.findMany({
      where: {
        moduleId,
        deletedAt: null,
      },
      include: { fieldType: true },
    });

    res.json({
      success: true,
      data: fields,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Error fetching module fields',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Soft-delete field
export async function deleteCustomField(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params as { id: string };

    const field = await prisma.customField.findUnique({ where: { id } });

    if (!field) {
      res.status(404).json({
        success: false,
        message: 'Field not found',
      });
      return;
    }

    await prisma.customField.update({
      where: { id: field.id },
      data: { deletedAt: new Date() },
    });

    res.json({
      success: true,
      message: 'Custom field deleted successfully',
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Error deleting field',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// CommonJS interop for legacy JS routes that still use module-alias requires.
module.exports = {
  createCustomField,
  updateCustomField,
  getCustomFields,
  getModuleFields,
  getModuleFieldsNew,
  deleteCustomField,
};
module.exports.createCustomField = createCustomField;
module.exports.updateCustomField = updateCustomField;
module.exports.getCustomFields = getCustomFields;
module.exports.getModuleFields = getModuleFields;
module.exports.getModuleFieldsNew = getModuleFieldsNew;
module.exports.deleteCustomField = deleteCustomField;
