/**
 * Unit tests for documentDefaultsController (D.1)
 *
 * All Prisma calls are mocked — no live DB needed.
 */
import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest';
import type { Request, Response } from 'express';

// ---------------------------------------------------------------------------
// Hoist mock factories (vi.mock is hoisted to top of file, so variables
// referenced inside factory must also be hoisted via vi.hoisted)
// ---------------------------------------------------------------------------

const {
  mockGeneralSettingFindFirst,
  mockCurrencyFindFirst,
  mockGeneralSettingCreate,
  mockGeneralSettingUpdate,
  mockRequireUserId,
  mockRequireTenantId,
} = vi.hoisted(() => ({
  mockGeneralSettingFindFirst: vi.fn(),
  mockCurrencyFindFirst: vi.fn(),
  mockGeneralSettingCreate: vi.fn(),
  mockGeneralSettingUpdate: vi.fn(),
  mockRequireUserId: vi.fn(),
  mockRequireTenantId: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  prisma: {
    generalSetting: {
      findFirst: mockGeneralSettingFindFirst,
      create: mockGeneralSettingCreate,
      update: mockGeneralSettingUpdate,
    },
    currency: {
      findFirst: mockCurrencyFindFirst,
    },
  },
}));

vi.mock('../lib/tenantScope', () => ({
  requireUserId: mockRequireUserId,
  requireTenantId: mockRequireTenantId,
  UnauthorizedError: class UnauthorizedError extends Error {
    status = 401;
    constructor(message = 'Not authorized') {
      super(message);
      this.name = 'UnauthorizedError';
    }
  },
}));

// ---------------------------------------------------------------------------
// Import AFTER mocks are set up
// ---------------------------------------------------------------------------

import {
  getDocumentDefaults,
  updateDocumentDefaults,
} from '../controllers/documentDefaultsController';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

function makeReq(body: Record<string, unknown> = {}): Request {
  return { body, user: 'user-123' } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUserId.mockReturnValue('user-123');
  mockRequireTenantId.mockReturnValue('tenant-123');
});

// ---------------------------------------------------------------------------
// GET /admin/document-defaults
// ---------------------------------------------------------------------------

describe('getDocumentDefaults', () => {
  it('returns all-fallback defaults when no row exists', async () => {
    mockGeneralSettingFindFirst.mockResolvedValue(null);
    mockCurrencyFindFirst.mockResolvedValue({ code: 'USD' });

    const req = makeReq();
    const res = makeRes();
    await getDocumentDefaults(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as MockedFunction<typeof res.json>).mock.calls[0][0] as {
      success: boolean;
      data: Record<string, unknown>;
    };
    expect(body.success).toBe(true);
    expect(body.data.defaultCurrencyCode).toBe('USD');
    expect(body.data.defaultSignType).toBe('none');
    expect(body.data.defaultSignatureId).toBeNull();
    expect(body.data.paymentTermsDays).toBeNull();
    expect(body.data.defaultNotes).toBe('');
    expect(body.data.defaultTerms).toBe('');
  });

  it('returns stored values merged with fallbacks', async () => {
    mockGeneralSettingFindFirst.mockResolvedValue({
      value: {
        defaultCurrencyCode: 'INR',
        defaultSignType: 'digitalSignature',
        defaultSignatureId: 'sig-1',
        paymentTermsDays: 30,
        defaultNotes: 'Thanks',
        defaultTerms: 'Net 30',
      },
    });
    mockCurrencyFindFirst.mockResolvedValue({ code: 'USD' }); // fallback not used

    const req = makeReq();
    const res = makeRes();
    await getDocumentDefaults(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as MockedFunction<typeof res.json>).mock.calls[0][0] as {
      success: boolean;
      data: Record<string, unknown>;
    };
    expect(body.data.defaultCurrencyCode).toBe('INR');
    expect(body.data.defaultSignType).toBe('digitalSignature');
    expect(body.data.defaultSignatureId).toBe('sig-1');
    expect(body.data.paymentTermsDays).toBe(30);
    expect(body.data.defaultNotes).toBe('Thanks');
    expect(body.data.defaultTerms).toBe('Net 30');
  });

  it('falls back to null for defaultCurrencyCode when no default currency exists', async () => {
    mockGeneralSettingFindFirst.mockResolvedValue(null);
    mockCurrencyFindFirst.mockResolvedValue(null); // no default currency

    const req = makeReq();
    const res = makeRes();
    await getDocumentDefaults(req, res);

    const body = (res.json as MockedFunction<typeof res.json>).mock.calls[0][0] as {
      success: boolean;
      data: Record<string, unknown>;
    };
    expect(body.data.defaultCurrencyCode).toBeNull();
  });

  it('returns 401 when user is not authenticated', async () => {
    // Throw an error that looks exactly like the mocked UnauthorizedError so
    // `handleUnauthorized` recognises it (instanceof check on the same class).
    const { UnauthorizedError } = await import('../lib/tenantScope');
    mockRequireUserId.mockImplementation(() => { throw new UnauthorizedError(); });

    const req = makeReq();
    const res = makeRes();
    await getDocumentDefaults(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 500 on prisma error', async () => {
    mockGeneralSettingFindFirst.mockRejectedValue(new Error('DB connection failed'));

    const req = makeReq();
    const res = makeRes();
    await getDocumentDefaults(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ---------------------------------------------------------------------------
// PUT /admin/document-defaults
// ---------------------------------------------------------------------------

describe('updateDocumentDefaults', () => {
  it('upserts a full set of defaults and returns them', async () => {
    mockGeneralSettingFindFirst.mockResolvedValue(null); // no existing row
    mockCurrencyFindFirst.mockResolvedValue({ code: 'USD' });
    mockGeneralSettingCreate.mockResolvedValue({});

    const req = makeReq({
      defaultCurrencyCode: 'EUR',
      defaultSignType: 'eSignature',
      defaultSignatureId: 'sig-abc',
      paymentTermsDays: 14,
      defaultNotes: 'note text',
      defaultTerms: 'term text',
    });
    const res = makeRes();
    await updateDocumentDefaults(req, res);

    expect(mockGeneralSettingCreate).toHaveBeenCalledOnce();
    const createArgs = mockGeneralSettingCreate.mock.calls[0][0] as {
      data: { tenantId: string; key: string; groupSlug: string; value: Record<string, unknown> };
    };
    expect(createArgs.data.tenantId).toBe('tenant-123');
    expect(createArgs.data.key).toBe('document_defaults');
    expect(createArgs.data.groupSlug).toBe('documents');
    expect(createArgs.data.value).toMatchObject({
      defaultCurrencyCode: 'EUR',
      defaultSignType: 'eSignature',
      paymentTermsDays: 14,
    });

    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as MockedFunction<typeof res.json>).mock.calls[0][0] as {
      success: boolean;
      data: Record<string, unknown>;
    };
    expect(body.success).toBe(true);
    expect(body.data.defaultCurrencyCode).toBe('EUR');
    expect(body.data.defaultSignType).toBe('eSignature');
    expect(body.data.paymentTermsDays).toBe(14);
  });

  it('partial PUT merges with existing stored value without wiping other fields', async () => {
    // Existing row has all fields set
    mockGeneralSettingFindFirst.mockResolvedValue({
      id: 'gs-1',
      value: {
        defaultCurrencyCode: 'INR',
        defaultSignType: 'none',
        defaultSignatureId: null,
        paymentTermsDays: 30,
        defaultNotes: 'original note',
        defaultTerms: 'original terms',
      },
    });
    mockCurrencyFindFirst.mockResolvedValue({ code: 'USD' });
    mockGeneralSettingUpdate.mockResolvedValue({});

    // Caller only sends defaultNotes — other fields must be preserved
    const req = makeReq({ defaultNotes: 'updated note' });
    const res = makeRes();
    await updateDocumentDefaults(req, res);

    const updateArgs = mockGeneralSettingUpdate.mock.calls[0][0] as {
      data: { value: Record<string, unknown> };
    };
    const merged = updateArgs.data.value;
    expect(merged.defaultNotes).toBe('updated note');
    expect(merged.defaultCurrencyCode).toBe('INR'); // preserved
    expect(merged.paymentTermsDays).toBe(30); // preserved
    expect(merged.defaultTerms).toBe('original terms'); // preserved
  });

  it('rejects an invalid defaultSignType', async () => {
    const req = makeReq({ defaultSignType: 'badValue' });
    const res = makeRes();
    await updateDocumentDefaults(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockGeneralSettingCreate).not.toHaveBeenCalled();
    expect(mockGeneralSettingUpdate).not.toHaveBeenCalled();
  });

  it('rejects a negative paymentTermsDays', async () => {
    const req = makeReq({ paymentTermsDays: -5 });
    const res = makeRes();
    await updateDocumentDefaults(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockGeneralSettingCreate).not.toHaveBeenCalled();
    expect(mockGeneralSettingUpdate).not.toHaveBeenCalled();
  });

  it('accepts null paymentTermsDays (clears the field)', async () => {
    mockGeneralSettingFindFirst.mockResolvedValue({
      id: 'gs-1',
      value: { paymentTermsDays: 30, defaultNotes: 'x', defaultTerms: 'y' },
    });
    mockCurrencyFindFirst.mockResolvedValue({ code: 'USD' });
    mockGeneralSettingUpdate.mockResolvedValue({});

    const req = makeReq({ paymentTermsDays: null });
    const res = makeRes();
    await updateDocumentDefaults(req, res);

    const updateArgs = mockGeneralSettingUpdate.mock.calls[0][0] as {
      data: { value: Record<string, unknown> };
    };
    expect(updateArgs.data.value.paymentTermsDays).toBeNull();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('coerces string paymentTermsDays to a number', async () => {
    mockGeneralSettingFindFirst.mockResolvedValue(null);
    mockCurrencyFindFirst.mockResolvedValue({ code: 'USD' });
    mockGeneralSettingCreate.mockResolvedValue({});

    const req = makeReq({ paymentTermsDays: '7' });
    const res = makeRes();
    await updateDocumentDefaults(req, res);

    const createArgs = mockGeneralSettingCreate.mock.calls[0][0] as {
      data: { value: Record<string, unknown> };
    };
    expect(createArgs.data.value.paymentTermsDays).toBe(7);
  });

  it('returns 401 when user is not authenticated', async () => {
    const { UnauthorizedError } = await import('../lib/tenantScope');
    mockRequireUserId.mockImplementation(() => { throw new UnauthorizedError(); });

    const req = makeReq({ defaultNotes: 'x' });
    const res = makeRes();
    await updateDocumentDefaults(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockGeneralSettingCreate).not.toHaveBeenCalled();
    expect(mockGeneralSettingUpdate).not.toHaveBeenCalled();
  });

  it('returns 500 on prisma error', async () => {
    mockGeneralSettingFindFirst.mockRejectedValue(new Error('DB down'));

    const req = makeReq({ defaultNotes: 'x' });
    const res = makeRes();
    await updateDocumentDefaults(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
