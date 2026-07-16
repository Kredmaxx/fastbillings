import express, { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';

import { prisma } from '../lib/prisma';
import { razorpayGateway } from '../lib/paymentGateways/razorpayGateway';
import { stripeGateway } from '../lib/paymentGateways/stripeGateway';

const router = Router();

// 60 requests per minute per IP — token enumeration defense
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests' },
});

/**
 * Public read-only invoice payload — token-gated, no auth header.
 * Returns 404 for any of: token not found, publicViewEnabled=false, isDeleted=true.
 */
router.get('/invoices/:token', limiter, async (req: Request, res: Response) => {
  try {
    const { token } = req.params as { token: string };
    if (!token || token.length < 32) {
      res.status(404).json({ success: false, message: 'Not found' });
      return;
    }

    const invoice = await prisma.invoice.findUnique({
      where: { publicViewToken: token },
      include: {
        billToCustomer: { select: { name: true, email: true, phone: true, billingAddress: true } },
        billFromUser: { select: { firstName: true, lastName: true } },
      },
    });

    if (!invoice || !invoice.publicViewEnabled || invoice.isDeleted) {
      res.status(404).json({ success: false, message: 'Not found' });
      return;
    }

    const company = await prisma.companySettings.findFirst({
      where: invoice.tenantId ? { tenantId: invoice.tenantId } : { userId: invoice.userId },
      select: { companyName: true, email: true, phone: true, address: true, publicBaseUrl: true, merchantUpiId: true, merchantName: true },
    });

    // SANITIZE — drop bank details, internal notes, audit timestamps, signature blobs, custom field IDs.
    // Invoice schema has no `currency` column — emit null.
    const sanitized = {
      invoiceNumber: invoice.invoiceNumber,
      invoiceType: invoice.invoiceType,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      status: invoice.status,
      currency: null as string | null,
      items: invoice.items,
      taxableAmount: invoice.taxableAmount,
      totalDiscount: invoice.totalDiscount,
      vat: invoice.vat,
      TotalAmount: invoice.TotalAmount,
      customer: invoice.billToCustomer
        ? {
            name: invoice.billToCustomer.name,
            email: invoice.billToCustomer.email,
            phone: invoice.billToCustomer.phone,
            billingAddress: invoice.billToCustomer.billingAddress,
          }
        : null,
      billFrom: invoice.billFromUser
        ? { firstName: invoice.billFromUser.firstName, lastName: invoice.billFromUser.lastName }
        : null,
      company,
    };

    res.json({ success: true, data: { invoice: sanitized } });
  } catch (err) {
    console.error('public invoice fetch error:', err);
    res.status(500).json({ success: false, message: 'Failed to load invoice' });
  }
});

/**
 * Razorpay webhook — public, signature-verified via per-user webhookSecret.
 * Uses express.raw() so we receive the exact bytes Razorpay signed.
 */
router.post('/razorpay/webhook', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  try {
    const rawBody = req.body instanceof Buffer ? req.body.toString('utf-8') : JSON.stringify(req.body);

    // Parse without verifying to extract the order_id so we can locate the tenant + config.
    let preview: { payload?: { payment?: { entity?: { order_id: string } } } } | null = null;
    try { preview = JSON.parse(rawBody); } catch { /* ignore */ }
    const orderId = preview?.payload?.payment?.entity?.order_id;
    if (!orderId) {
      res.status(400).json({ success: false, message: 'Missing order_id' });
      return;
    }

    const txn = await prisma.paymentTransaction.findFirst({
      where: { gatewayOrderId: orderId, kind: 'RAZORPAY' },
    });
    if (!txn) {
      // Unknown order: ack with 200 so Razorpay stops retrying.
      res.status(200).json({ success: true, message: 'Unknown order, ignoring' });
      return;
    }
    const cfg = await prisma.gatewayConfig.findUnique({
      where: { userId_kind: { userId: txn.userId, kind: 'RAZORPAY' } },
    });
    if (!cfg) {
      res.status(200).json({ success: true, message: 'No config, ignoring' });
      return;
    }

    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headers[k.toLowerCase()] = v;
    }
    const event = razorpayGateway.verifyWebhook(headers, rawBody, cfg.config);
    if (!event) {
      res.status(400).json({ success: false, message: 'Invalid webhook signature' });
      return;
    }

    // Idempotency: do not regress already-CAPTURED transactions.
    if (event.type === 'payment.captured' && event.paymentId) {
      if (txn.status !== 'CAPTURED') {
        await prisma.paymentTransaction.update({
          where: { id: txn.id },
          data: { status: 'CAPTURED', gatewayPaymentId: event.paymentId },
        });
      }
    } else if (event.type === 'payment.failed') {
      if (txn.status === 'CREATED' || txn.status === 'PENDING') {
        await prisma.paymentTransaction.update({ where: { id: txn.id }, data: { status: 'FAILED' } });
      }
    } else if (event.type === 'refund.processed' && event.refundId) {
      await prisma.refund.updateMany({
        where: { paymentTransactionId: txn.id, gatewayRefundId: event.refundId },
        data: { status: 'CAPTURED' },
      });
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('razorpay webhook error:', err);
    res.status(500).json({ success: false, message: 'Webhook processing error' });
  }
});

/**
 * Stripe webhook — public, signature-verified via per-user webhookSecret.
 * Uses express.raw() so we receive the exact bytes Stripe signed.
 */
router.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  try {
    const rawBody = req.body instanceof Buffer ? req.body.toString('utf-8') : JSON.stringify(req.body);

    // Parse without verifying to extract the session id so we can locate the tenant + config.
    let preview: { data?: { object?: { id?: string; payment_intent?: string } } } | null = null;
    try { preview = JSON.parse(rawBody); } catch { /* ignore */ }
    const sessionId = preview?.data?.object?.id;
    if (!sessionId) {
      res.status(400).json({ success: false, message: 'Missing session id' });
      return;
    }
    const txn = await prisma.paymentTransaction.findFirst({
      where: { gatewayOrderId: sessionId, kind: 'STRIPE' },
    });
    if (!txn) {
      // Unknown session: ack with 200 so Stripe stops retrying.
      res.status(200).json({ success: true, message: 'Unknown session, ignoring' });
      return;
    }
    const cfg = await prisma.gatewayConfig.findUnique({
      where: { userId_kind: { userId: txn.userId, kind: 'STRIPE' } },
    });
    if (!cfg) {
      res.status(200).json({ success: true, message: 'No config, ignoring' });
      return;
    }

    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headers[k.toLowerCase()] = v;
    }
    const event = stripeGateway.verifyWebhook(headers, rawBody, cfg.config);
    if (!event) {
      res.status(400).json({ success: false, message: 'Invalid webhook signature' });
      return;
    }

    // Idempotency: do not regress already-CAPTURED transactions.
    if (event.type === 'checkout.session.completed' && event.paymentId) {
      if (txn.status !== 'CAPTURED') {
        await prisma.paymentTransaction.update({
          where: { id: txn.id },
          data: { status: 'CAPTURED', gatewayPaymentId: event.paymentId },
        });
      }
    } else if (event.type === 'charge.refunded' && event.refundId) {
      await prisma.refund.updateMany({
        where: { paymentTransactionId: txn.id, gatewayRefundId: event.refundId },
        data: { status: 'CAPTURED' },
      });
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('stripe webhook error:', err);
    res.status(500).json({ success: false, message: 'Webhook processing error' });
  }
});

module.exports = router;
