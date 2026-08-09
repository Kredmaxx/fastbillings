import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import {
  optionalTenantId,
  requireUserId,
  tenantOrUserScope,
  UnauthorizedError,
} from '../lib/tenantScope';

function money(n: Prisma.Decimal | number): number {
  return Math.round(Number(n) * 100) / 100;
}

function formatEmployee(e: {
  id: string;
  name: string;
  pan: string | null;
  employeeCode: string | null;
  createdAt: Date;
}) {
  return {
    id: e.id,
    name: e.name,
    pan: e.pan,
    employeeCode: e.employeeCode,
    createdAt: e.createdAt,
  };
}

function optionalDateIso(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

function optionalMoney(n: Prisma.Decimal | number | null | undefined): number | null {
  if (n == null) return null;
  return money(n);
}

function parseOptionalDate(raw: unknown): Date | null | undefined {
  if (raw === undefined) return undefined;
  if (raw == null || String(raw).trim() === '') return null;
  const s = String(raw).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  return new Date(`${s}T00:00:00.000Z`);
}

function parseOptionalMoney(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100) / 100;
}

function formatDeduction(d: {
  id: string;
  employeeId: string;
  payDate: Date;
  amountPaid: Prisma.Decimal | number;
  tdsAmount: Prisma.Decimal | number;
  section: string;
  notes: string | null;
  employeePfAmount?: Prisma.Decimal | number | null;
  employeeEsiAmount?: Prisma.Decimal | number | null;
  pfDueDate?: Date | null;
  pfDepositedDate?: Date | null;
  esiDueDate?: Date | null;
  esiDepositedDate?: Date | null;
  createdAt: Date;
  employee?: { name: string; pan: string | null; employeeCode: string | null };
}) {
  return {
    id: d.id,
    employeeId: d.employeeId,
    employeeName: d.employee?.name ?? null,
    employeePan: d.employee?.pan ?? null,
    employeeCode: d.employee?.employeeCode ?? null,
    payDate: d.payDate.toISOString().slice(0, 10),
    amountPaid: money(d.amountPaid),
    tdsAmount: money(d.tdsAmount),
    section: d.section,
    notes: d.notes,
    employeePfAmount: optionalMoney(d.employeePfAmount),
    employeeEsiAmount: optionalMoney(d.employeeEsiAmount),
    pfDueDate: optionalDateIso(d.pfDueDate),
    pfDepositedDate: optionalDateIso(d.pfDepositedDate),
    esiDueDate: optionalDateIso(d.esiDueDate),
    esiDepositedDate: optionalDateIso(d.esiDepositedDate),
    createdAt: d.createdAt,
  };
}

export async function listSalaryTdsEmployees(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const rows = await prisma.salaryTdsEmployee.findMany({
      where: { isDeleted: false, ...tenantOrUserScope(req) },
      orderBy: { name: 'asc' },
    });
    res.json({
      success: true,
      data: {
        notes: 'Salary TDS deductees for Form 24Q books worksheet — not full payroll / TRACES.',
        employees: rows.map(formatEmployee),
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('listSalaryTdsEmployees error:', err);
    res.status(500).json({ success: false, message: 'Failed to list salary TDS employees' });
  }
}

export async function createSalaryTdsEmployee(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const body = req.body as Record<string, unknown>;
    const name = String(body.name ?? '').trim();
    if (!name) {
      res.status(400).json({ success: false, message: 'name is required' });
      return;
    }
    const pan =
      body.pan != null && String(body.pan).trim()
        ? String(body.pan).trim().toUpperCase()
        : null;
    const employeeCode =
      body.employeeCode != null && String(body.employeeCode).trim()
        ? String(body.employeeCode).trim()
        : null;

    const created = await prisma.salaryTdsEmployee.create({
      data: {
        userId,
        tenantId: optionalTenantId(req),
        name,
        pan,
        employeeCode,
      },
    });
    res.status(201).json({
      success: true,
      message: 'Employee recorded',
      data: { employee: formatEmployee(created) },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('createSalaryTdsEmployee error:', err);
    res.status(500).json({ success: false, message: 'Failed to create employee' });
  }
}

export async function deleteSalaryTdsEmployee(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.salaryTdsEmployee.findFirst({
      where: { id, isDeleted: false, ...tenantOrUserScope(req) },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Employee not found' });
      return;
    }
    await prisma.$transaction(async (tx) => {
      await tx.salaryTdsDeduction.updateMany({
        where: { employeeId: id, isDeleted: false },
        data: { isDeleted: true },
      });
      await tx.salaryTdsEmployee.update({
        where: { id },
        data: { isDeleted: true },
      });
    });
    res.json({ success: true, message: 'Employee deleted' });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('deleteSalaryTdsEmployee error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete employee' });
  }
}

export async function listSalaryTdsDeductions(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const from = req.query.from ? String(req.query.from).slice(0, 10) : null;
    const to = req.query.to ? String(req.query.to).slice(0, 10) : null;
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
      dateFilter.gte = new Date(`${from}T00:00:00.000Z`);
    }
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
      dateFilter.lte = new Date(`${to}T23:59:59.999Z`);
    }

    const rows = await prisma.salaryTdsDeduction.findMany({
      where: {
        isDeleted: false,
        ...tenantOrUserScope(req),
        ...(Object.keys(dateFilter).length ? { payDate: dateFilter } : {}),
      },
      include: {
        employee: { select: { name: true, pan: true, employeeCode: true } },
      },
      orderBy: [{ payDate: 'asc' }, { createdAt: 'asc' }],
    });

    const totalPaid = rows.reduce((s, r) => s + money(r.amountPaid), 0);
    const totalTds = rows.reduce((s, r) => s + money(r.tdsAmount), 0);
    res.json({
      success: true,
      data: {
        notes: 'Salary TDS u/s 192 lines for Form 24Q books worksheet — not TRACES filing.',
        summary: {
          count: rows.length,
          totalAmountPaid: Math.round(totalPaid * 100) / 100,
          totalTds: Math.round(totalTds * 100) / 100,
        },
        deductions: rows.map(formatDeduction),
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('listSalaryTdsDeductions error:', err);
    res.status(500).json({ success: false, message: 'Failed to list salary TDS deductions' });
  }
}

export async function createSalaryTdsDeduction(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const body = req.body as Record<string, unknown>;
    const employeeId = String(body.employeeId ?? '').trim();
    if (!employeeId) {
      res.status(400).json({ success: false, message: 'employeeId is required' });
      return;
    }
    const employee = await prisma.salaryTdsEmployee.findFirst({
      where: { id: employeeId, isDeleted: false, ...tenantOrUserScope(req) },
    });
    if (!employee) {
      res.status(404).json({ success: false, message: 'Employee not found' });
      return;
    }
    const payDateStr = String(body.payDate ?? '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payDateStr)) {
      res.status(400).json({ success: false, message: 'payDate must be YYYY-MM-DD' });
      return;
    }
    const amountPaid = Number(body.amountPaid);
    const tdsAmount = Number(body.tdsAmount);
    if (!Number.isFinite(amountPaid) || amountPaid <= 0) {
      res.status(400).json({ success: false, message: 'amountPaid must be greater than 0' });
      return;
    }
    if (!Number.isFinite(tdsAmount) || tdsAmount < 0) {
      res.status(400).json({ success: false, message: 'tdsAmount must be >= 0' });
      return;
    }
    const section =
      body.section != null && String(body.section).trim()
        ? String(body.section).trim()
        : '192';

    const employeePfAmount = parseOptionalMoney(body.employeePfAmount);
    const employeeEsiAmount = parseOptionalMoney(body.employeeEsiAmount);
    if (body.employeePfAmount !== undefined && employeePfAmount === undefined) {
      res.status(400).json({ success: false, message: 'employeePfAmount must be >= 0' });
      return;
    }
    if (body.employeeEsiAmount !== undefined && employeeEsiAmount === undefined) {
      res.status(400).json({ success: false, message: 'employeeEsiAmount must be >= 0' });
      return;
    }
    const pfDueDate = parseOptionalDate(body.pfDueDate);
    const pfDepositedDate = parseOptionalDate(body.pfDepositedDate);
    const esiDueDate = parseOptionalDate(body.esiDueDate);
    const esiDepositedDate = parseOptionalDate(body.esiDepositedDate);
    for (const [label, parsed] of [
      ['pfDueDate', pfDueDate],
      ['pfDepositedDate', pfDepositedDate],
      ['esiDueDate', esiDueDate],
      ['esiDepositedDate', esiDepositedDate],
    ] as const) {
      if (body[label] !== undefined && parsed === undefined) {
        res.status(400).json({ success: false, message: `${label} must be YYYY-MM-DD or empty` });
        return;
      }
    }

    const created = await prisma.salaryTdsDeduction.create({
      data: {
        userId,
        tenantId: optionalTenantId(req) ?? employee.tenantId,
        employeeId,
        payDate: new Date(`${payDateStr}T00:00:00.000Z`),
        amountPaid: new Prisma.Decimal(Math.round(amountPaid * 100) / 100),
        tdsAmount: new Prisma.Decimal(Math.round(tdsAmount * 100) / 100),
        section,
        notes: body.notes != null ? String(body.notes).trim() || null : null,
        ...(employeePfAmount !== undefined
          ? {
              employeePfAmount:
                employeePfAmount == null ? null : new Prisma.Decimal(employeePfAmount),
            }
          : {}),
        ...(employeeEsiAmount !== undefined
          ? {
              employeeEsiAmount:
                employeeEsiAmount == null ? null : new Prisma.Decimal(employeeEsiAmount),
            }
          : {}),
        ...(pfDueDate !== undefined ? { pfDueDate } : {}),
        ...(pfDepositedDate !== undefined ? { pfDepositedDate } : {}),
        ...(esiDueDate !== undefined ? { esiDueDate } : {}),
        ...(esiDepositedDate !== undefined ? { esiDepositedDate } : {}),
      },
      include: {
        employee: { select: { name: true, pan: true, employeeCode: true } },
      },
    });

    res.status(201).json({
      success: true,
      message: 'Salary TDS deduction recorded',
      data: { deduction: formatDeduction(created) },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('createSalaryTdsDeduction error:', err);
    res.status(500).json({ success: false, message: 'Failed to create salary TDS deduction' });
  }
}

export async function deleteSalaryTdsDeduction(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.salaryTdsDeduction.findFirst({
      where: { id, isDeleted: false, ...tenantOrUserScope(req) },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Deduction not found' });
      return;
    }
    await prisma.salaryTdsDeduction.update({
      where: { id },
      data: { isDeleted: true },
    });
    res.json({ success: true, message: 'Deduction deleted' });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('deleteSalaryTdsDeduction error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete deduction' });
  }
}

const handlers = {
  listSalaryTdsEmployees,
  createSalaryTdsEmployee,
  deleteSalaryTdsEmployee,
  listSalaryTdsDeductions,
  createSalaryTdsDeduction,
  deleteSalaryTdsDeduction,
};
module.exports = handlers;
module.exports.default = handlers;
