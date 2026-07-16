const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const UnitsController = require('../controllers/UnitsController');
const BrandsController = require('../controllers/BrandsController');
const CategoryController = require('../controllers/CategoryController');
const TaxRateController = require('../controllers/TaxRateController');
const TaxGroupController = require('../controllers/TaxGroupController');
const ProductController = require('../controllers/ProductController');
const SupplierController = require('@controllers/Admin/Purchases/SupplierController');
const purchaseOrderController = require('@controllers/Admin/Purchases/purchaseOrderController');
const debitNoteController = require('@controllers/Admin/Purchases/debitNoteController');
const purchaseController = require('@controllers/Admin/Purchases/purchaseController');
const supplierPaymentController = require('@controllers/Admin/Purchases/supplierPaymentController');
const SignatureController = require('../controllers/SignatureController');
const currencyController = require('../controllers/currencyController');
const BankDetailController = require('@controllers/bankDetailController');
const CompanySettings = require('@controllers/CompanySettingsController');
const appVersionController = require('@controllers/appVersionController');
const dashboardController = require('@controllers/Admin/dashboardController');
const { uploadCompanyFields, handleUploadError } = require('../middleware/uploadCompanyImages');
const protect = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');
const setup = require('../middleware/setup');
const { uploadSingle, uploadMultiple, uploadProductFields } = require('../middleware/uploadProductImages');
const { createUnitValidator, updateUnitValidator } = require('../validators/unitsValidator');
const { createBrandValidator, updateBrandValidator } = require('../validators/brandValidator');
const { createCategoryValidator, updateCategoryValidator } = require('../validators/categoryValidator');
const { createTaxRateValidator, updateTaxRateValidator } = require('../validators/taxRateValidator');
const { createTaxGroupValidator, updateTaxGroupValidator } = require('../validators/taxGroupValidator');
const { createProductValidator, updateProductValidator } = require('../validators/productValidator');
const { updateProfileValidator } = require('../validators/updateProfileValidator');
const { createSupplierValidator } = require('../validators/Admin/Purchases/SupplierVaidator');
const { purchaseOrderValidator, updatePurchaseOrderValidator } = require('../validators/Admin/Purchases/purchaseOrderValidator');
const { supplierPaymentValidator } = require('../validators/Admin/Purchases/supplierPaymentValidator');
const { purchaseValidator } = require('../validators/Admin/Purchases/purchaseValidator');
const { debitNoteValidator } = require('../validators/Admin/Purchases/debitNoteValidator');
const { createSignatureValidator, updateSignatureValidator } = require('../validators/signatureValidator');
const { createCurrencyValidator } = require('../validators/currencyValidator');
const { createBankDetailValidator, updateBankDetailValidator, updateBankDetailStatusValidator } = require('@validators/bankDetailValidator');
const { updateCompanySettingsValidator } = require('@validators/companySettingsValidator');
const { createCustomerValidator } = require('@validators/customerValidator');
const customerController = require('@controllers/customerController');
const vehicleController = require('../controllers/vehicleController');
const { createVehicleValidator, updateVehicleValidator } = require('../validators/vehicleValidator');
const localizationController = require('@controllers/localizationController');
const multer = require('multer');
const quotationController = require('@controllers/Admin/Invoice/quotationController');
const { quotationValidator, updateQuotationValidator } = require('../validators/Admin/Invoice/quotationValidator');
const invoiceTemplateController = require('@controllers/invoiceTemplateController');
const { createInvoiceValidator } = require('../validators/Admin/Invoice/invoiceValidator');
const { createCreditNoteValidator } = require('../validators/Admin/Invoice/creditNoteValidator');
const { createDeliveryChallanValidator } = require('../validators/Admin/Invoice/deliveryChallanValidator');
const invoiceController = require('@controllers/Admin/Invoice/invoiceController');
const creditNoteController = require('@controllers/Admin/Invoice/creditNoteController');
const inventoryController = require('@controllers/Admin/Invoice/inventoryController');
const deliveryChallanController = require('@controllers/Admin/Invoice/deliveryChallanController');
const emailSettingsController = require('@controllers/emailSettingsController');
const emailTeamplateController = require('@controllers/emailTeamplateController');
const roleController = require('@controllers/roleController');
const permissionController = require('@controllers/permissionController');
const userController = require('@controllers/userController');
const tenantController = require('@controllers/tenantController');
const planController = require('@controllers/planController');
const landingPageController = require('@controllers/landingPageController');
const platformTenantController = require('@controllers/platformTenantController');
const requirePlatformAdmin = require('../middleware/requirePlatformAdmin');
const reportController = require('@controllers/reportController');
const accountingReportController = require('@controllers/accountingReportController');
const transactionReportController = require('@controllers/transactionReportController');
const securityController = require('@controllers/securityController');
const activityLogController = require('@controllers/activityLogController');
const pettyCashController = require('@controllers/pettyCashController');
const { createStaffValidator } = require('../validators/staffValidator');
const { createRoleValidator } = require('../validators/roleValidator');
const expenseController = require('@controllers/expenseController');
const { createExpenseValidator } = require('../validators/expenseValidator');
const expenseCategoryController = require('../controllers/expenseCategoryController');
const { createCustomFieldValidator, updateCustomFieldValidator } = require('../validators/customFieldValidator');
const customFieldDataTypeController = require('../controllers/customFieldDataTypeController');
const { createCustomFieldDataTypeValidator, updateCustomFieldDataTypeValidator } = require('../validators/customFieldDataTypeValidator');

const fieldTypeController = require('@controllers/fieldTypeController');
const customFieldController = require('@controllers/customFieldController');
const aiController = require('@controllers/Admin/AI/aiController');
const { processPromptValidator, confirmDocumentValidator, updateConfigValidator } = require('../validators/Admin/AI/aiValidator');
const ledgerSetup = require('@controllers/Admin/ledgerSetupController');
const ledgerCutover = require('@controllers/Admin/ledgerCutoverController');

const gatewayConfigController = require('../controllers/gatewayConfigController');
const paymentTransactionController = require('../controllers/paymentTransactionController');
const refundController = require('../controllers/refundController');
const razorpayController = require('../controllers/razorpayController');
const stripeController = require('../controllers/stripeController');

const accountController = require('../controllers/accountController');
const journalEntryController = require('../controllers/journalEntryController');
const financialStatementsController = require('../controllers/financialStatementsController');
const taxReportsController = require('../controllers/taxReportsController');
const accountingPeriodController = require('../controllers/accountingPeriodController');
const gstFilingController = require('../controllers/gstFilingController');
const eInvoiceController = require('../controllers/eInvoiceController');
const whatsappController = require('../controllers/whatsappController');
const accountingIntegrationController = require('../controllers/accountingIntegrationController');
const aiConfigController = require('@controllers/aiConfigController');
const aiExtractionController = require('@controllers/aiExtractionController');
const aiChatController = require('@controllers/aiChatController');
const aiUsageController = require('@controllers/aiUsageController');
const uploadAiJobs = require('@middleware/uploadAiJobs');
const requireAiEnabled = require('@middleware/requireAiEnabled');
const aiRateLimit = require('@middleware/aiRateLimit');
const agingController = require('../controllers/agingController');
const budgetController = require('../controllers/budgetController');
const fixedAssetController = require('../controllers/fixedAssetController');
const documentDefaultsController = require('../controllers/documentDefaultsController');
const apiKeyController = require('../controllers/apiKeyController');



router.get('/', protect, adminController.dashboard);

// Developer API keys (JWT session only for management)
router.get('/api-keys', protect, apiKeyController.listApiKeys);
router.post('/api-keys', protect, apiKeyController.createApiKey);
router.delete('/api-keys/:id', protect, apiKeyController.revokeApiKey);
router.get('/countries', protect, adminController.getCountries);
router.get('/states/:countryId', protect, adminController.getStates);
router.get('/cities/:stateId', protect, adminController.getCities);
router.get('/country/:id', protect, adminController.getCountryById);
router.get('/state/:id', protect, adminController.getStateById);
router.get('/city/:id', protect, adminController.getCityById);
router.get('/profile', protect, adminController.getProfile);
router.put('/profile', protect, upload.single('profileImage'), updateProfileValidator, adminController.updateProfile);

//Unit routes
router.get('/units', protect, UnitsController.getUnits);
router.post('/units', protect, createUnitValidator, UnitsController.createUnit);
router.get('/units/:id', protect, UnitsController.getUnitById);
router.put('/units/:id', protect, updateUnitValidator, UnitsController.updateUnit);
router.delete('/units/:id', protect, UnitsController.deleteUnit);

//Brand routes
router.get('/brands', protect, BrandsController.getAllBrands);
router.post('/brands', protect, upload.single('brand_image'), createBrandValidator, BrandsController.createBrand);
router.get('/brands/:id', protect, BrandsController.getBrandById);
router.put('/brands/:id', protect, upload.single('brand_image'), updateBrandValidator, BrandsController.updateBrand);
router.delete('/brands/:id', protect, BrandsController.deleteBrand);

//Category routes
router.get('/categories', protect, CategoryController.getAllCategories);
router.post('/categories', protect, upload.single('category_image'), createCategoryValidator, CategoryController.createCategory);
router.get('/categories/:id', protect, CategoryController.getCategoryById);
router.put('/categories/:id', protect, upload.single('category_image'), updateCategoryValidator, CategoryController.updateCategory);
router.delete('/categories/:id', protect, CategoryController.deleteCategory);

// Tax Rate routes
router.get('/tax-rates', protect, TaxRateController.getAllTaxRates);
router.post('/tax-rates', protect, createTaxRateValidator, TaxRateController.createTaxRate);
router.get('/tax-rates/:id', protect, TaxRateController.getTaxRateById);
router.put('/tax-rates/:id', protect, updateTaxRateValidator, TaxRateController.updateTaxRate);
router.delete('/tax-rates/:id', protect, TaxRateController.deleteTaxRate);
router.post('/tax-engine/suggest-for-line', protect, TaxRateController.suggestForLine);

//Tax Group routes
router.get('/tax-groups', protect, TaxGroupController.getAllTaxGroups);
router.post('/tax-groups', protect, createTaxGroupValidator, TaxGroupController.createTaxGroup);
router.get('/tax-groups/:id', protect, TaxGroupController.getTaxGroupById);
router.put('/tax-groups/:id', protect, updateTaxGroupValidator, TaxGroupController.updateTaxGroup);
router.delete('/tax-groups/:id', protect, TaxGroupController.deleteTaxGroup);

//Product Routes
router.post('/products', protect, uploadProductFields, handleUploadError, createProductValidator, ProductController.createProduct);
router.get('/products', protect, ProductController.getAllProducts);
router.get('/products/:id', protect, ProductController.getProductById);
router.put('/products/:id', protect, uploadProductFields, updateProductValidator, ProductController.updateProduct);
router.delete('/products/:id', protect, ProductController.deleteProduct);
router.get('/product-categories', protect, ProductController.getAllProductCategories);
router.get('/product-brands', protect, ProductController.getAllProductBrands);
router.get('/product-units', protect, ProductController.getAllUnits);
router.get('/product-taxes', protect, ProductController.getAllTaxGroups);

//suppliers routes
router.post('/suppliers', protect, upload.single('profileImage'), createSupplierValidator, SupplierController.createSupplier);
router.get('/suppliers', protect, SupplierController.listSuppliers);
router.get('/suppliers/:id', protect, SupplierController.getSupplierById);
router.put('/suppliers/:id', protect, upload.single('profileImage'), SupplierController.updateSupplier);
router.delete('/suppliers/:id', protect, SupplierController.deleteSupplier);
//debitnote
router.post('/debitnote', protect, upload.single('signatureImage'), debitNoteValidator, debitNoteController.createDebitNote);
router.get('/debitnote', protect, debitNoteController.getAllDebitNotes);
router.put('/debitnote', protect, upload.single('signatureImage'), debitNoteController.createDebitNote);
router.get('/debitnote/:id', protect, debitNoteController.getDebitNoteById);
router.delete('/debitnote/:id', protect, debitNoteController.deleteDebitNote);

//supplierpayment
router.post('/supplierpayments', protect, upload.single('attachment'), supplierPaymentValidator, supplierPaymentController.createSupplierPayment);
router.get('/supplierpayments', protect, supplierPaymentController.listSupplierPayments);
router.put('/supplierpayments/:id', protect, upload.single('attachment'), supplierPaymentController.updateSupplierPayment);
router.delete('/supplierpayments/:id', protect, supplierPaymentController.deleteSupplierPayment);

//purchase
router.post('/purchases', protect, upload.single('signatureImage'), purchaseValidator, purchaseController.createPurchase);
router.put('/purchases/:id', protect, upload.single('signatureImage'), purchaseController.updatePurchase);
router.get('/purchases', protect, purchaseController.getAllPurchases);
router.get('/purchases/:id', protect, purchaseController.getPurchaseById);
router.delete('/purchases/:id', protect, purchaseController.deletePurchase);
router.get('/purchases-minimal', protect, purchaseController.listPurchasesMinimal);
router.get('/purchases-pending', protect, purchaseController.listPurchasesPending);
router.post('/purchase-order-convert', protect, purchaseController.createPurchaseFromPO);

//purchaseOrder
router.post('/purchase-order', protect, upload.single('signatureImage'), purchaseOrderValidator, purchaseOrderController.createPurchaseOrder);
router.get('/purchase-orders', protect, purchaseOrderController.listPurchaseOrders);
router.get('/purchase-orders/:id', protect, purchaseOrderController.getPurchaseOrderById);
router.put('/purchase-orders/:id', protect, upload.single('signatureImage'), updatePurchaseOrderValidator, purchaseOrderController.updatePurchaseOrder);
router.delete('/purchase-orders/:id', protect, purchaseOrderController.deletePurchaseOrder);
router.get('/purchase-minimal', protect, purchaseOrderController.listPurchaseOrdersMinimal);

// Helper routes for purchase order creation
router.get('/user/type/:type', protect, purchaseOrderController.listUsersByType);
router.get('/user/:id', protect, purchaseOrderController.getUserById);
router.get('/productsrecent', protect, purchaseOrderController.getRecentProductsWithSearch);
router.get('/bankdetailsrecent', protect, purchaseOrderController.listBankDetails);
router.get('/signaturesrecent', protect, purchaseOrderController.getUserSignatures);
router.get('/tax-group-details', protect, purchaseOrderController.getAllTaxGroupsDetails);
//signature
router.post('/signatures', protect, upload.single('signatureImage'), createSignatureValidator, SignatureController.createSignature);
router.get('/signatures', protect, SignatureController.getUserSignatures);
router.put('/signatures/:signatureId', protect, upload.single('signatureImage'), updateSignatureValidator, SignatureController.updateSignature);
router.delete('/signatures/:signatureId', protect, SignatureController.deleteSignature);
router.patch('/signatures/set-default/:signatureId', protect, SignatureController.setAsDefaultSignature);
router.patch('/signatures/status/:signatureId', protect, SignatureController.updateSignatureStatus);
router.post('/paymentmode', protect, SignatureController.createPaymentMode);
router.get('/paymentmode', protect, SignatureController.listPaymentModes);

//currency
router.post('/currency', protect, createCurrencyValidator, currencyController.createCurrency);
router.get('/currency', protect, currencyController.getAllCurrencies);
router.put('/currency/:id', protect, currencyController.updateCurrency);
router.delete('/currency/:id', protect, currencyController.deleteCurrency);
router.patch('/currency/:id', protect, currencyController.updateCurrencyStatus);

//bankDetails
router.post('/bank-accounts', protect, createBankDetailValidator, BankDetailController.createBankDetail);
router.get('/bank-accounts', protect, BankDetailController.listBankDetails);
router.put('/bank-accounts/:id', protect, updateBankDetailValidator, BankDetailController.updateBankDetail);
router.delete('/bank-accounts/:id', protect, BankDetailController.deleteBankDetail);
router.patch('/bank-accounts/status/:id', protect, updateBankDetailStatusValidator, BankDetailController.updateBankDetailStatus);
router.post('/bank-reconcile/:id', protect, BankDetailController.reconcileTransaction);
router.get('/bank-petty', protect, BankDetailController.listFinancialDetails);
router.get('/bank-transactions-reconcile', protect, BankDetailController.listBankTransactionsReconciled);
router.get('/bank-transactions-details/:id', protect, BankDetailController.getBankTransactionDetails);

// Bank transactions (slice E.1) — list/get/create/delete + CSV import
const bankTransactionController = require('@controllers/bankTransactionController');
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
router.get('/bank-transactions', protect, bankTransactionController.list);
router.get('/bank-transactions/:id', protect, bankTransactionController.getById);
router.post('/bank-transactions', protect, bankTransactionController.create);
router.delete('/bank-transactions/:id', protect, bankTransactionController.remove);
router.post('/bank-transactions/import', protect, csvUpload.single('file'), bankTransactionController.importPreview);
router.post('/bank-transactions/import/confirm', protect, bankTransactionController.importConfirm);

// Bank transactions (slice E.2) — reconciliation matcher + link/unlink
router.get('/bank-transactions/:id/suggest-matches', protect, bankTransactionController.suggestMatches);
router.post('/bank-transactions/:id/link', protect, bankTransactionController.link);
router.post('/bank-transactions/:id/unlink', protect, bankTransactionController.unlink);


//company
router.get('/tenant', protect, tenantController.getCurrentTenant);
router.get('/tenants', protect, tenantController.listTenants);
router.patch('/tenant/status', protect, tenantController.updateCurrentTenantStatus);
router.put('/tenant/subscription', protect, tenantController.upsertCurrentTenantSubscription);
router.get('/subscription', protect, planController.getTenantSubscription);
router.get('/plans/active', protect, planController.listActivePlans);

// Platform super-admin — SaaS plan & subscription management
router.get('/platform/plans/meta', protect, requirePlatformAdmin, planController.getPlanMeta);
router.get('/platform/plans', protect, requirePlatformAdmin, planController.listPlans);
router.get('/platform/plans/:id', protect, requirePlatformAdmin, planController.getPlan);
router.post('/platform/plans', protect, requirePlatformAdmin, planController.createPlan);
router.put('/platform/plans/:id', protect, requirePlatformAdmin, planController.updatePlan);
router.patch('/platform/plans/:id/status', protect, requirePlatformAdmin, planController.togglePlanStatus);
router.delete('/platform/plans/:id', protect, requirePlatformAdmin, planController.deletePlan);
router.get('/platform/subscriptions', protect, requirePlatformAdmin, planController.listTenantSubscriptions);
router.get('/platform/subscriptions/stats', protect, requirePlatformAdmin, planController.getSubscriptionStats);
router.post('/platform/subscriptions/assign', protect, requirePlatformAdmin, planController.assignPlan);
router.post('/platform/subscriptions/:id/cancel', protect, requirePlatformAdmin, planController.cancelTenantSubscription);

// Platform super-admin — landing page CMS
router.get('/platform/landing-page', protect, requirePlatformAdmin, landingPageController.getAdminLandingPage);
router.put('/platform/landing-page', protect, requirePlatformAdmin, landingPageController.updateAdminLandingPage);

// Platform super-admin — tenant management
router.get('/platform/tenants', protect, requirePlatformAdmin, platformTenantController.listPlatformTenants);
router.get('/platform/tenants/:id', protect, requirePlatformAdmin, platformTenantController.getPlatformTenant);
router.post('/platform/tenants', protect, requirePlatformAdmin, platformTenantController.createPlatformTenant);
router.put('/platform/tenants/:id', protect, requirePlatformAdmin, platformTenantController.updatePlatformTenant);
router.patch('/platform/tenants/:id/status', protect, requirePlatformAdmin, platformTenantController.updatePlatformTenantStatus);
router.delete('/platform/tenants/:id', protect, requirePlatformAdmin, platformTenantController.deletePlatformTenant);

router.put('/company-details/:userId', protect, uploadCompanyFields, handleUploadError, updateCompanySettingsValidator, CompanySettings.updateCompanySettings);
router.get('/company-details/:userId', protect, CompanySettings.getCompanySettings);
router.get('/system-settings', protect, CompanySettings.getBasicDetails);
router.patch('/company/setup', protect, setup.single('siteLogo'), CompanySettings.updateCompanySetup);
router.post('/create-general-settings', protect, CompanySettings.createOrUpdateGeneralSetting);
router.get('/general-settings-list', protect, CompanySettings.listGeneralSettings);

// Document defaults (slice D.1)
router.get('/document-defaults', protect, documentDefaultsController.getDocumentDefaults);
router.put('/document-defaults', protect, documentDefaultsController.updateDocumentDefaults);

//customer
/**
 * @swagger
 * /admin/customers:
 *   post:
 *     tags: [Customers]
 *     summary: Create a new customer
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               email: { type: string, format: email }
 *               phone: { type: string }
 *               image: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: Customer created
 */
router.post('/customers', protect, upload.single('image'), createCustomerValidator, customerController.createCustomer);
router.put('/customers/:id', protect, upload.single('image'), customerController.updateCustomer);

/**
 * @swagger
 * /admin/customers:
 *   get:
 *     tags: [Customers]
 *     summary: List customers (paginated)
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of customers with pagination
 */
router.get('/customers', protect, customerController.getCustomers);
router.get('/customers/:id', protect, customerController.getCustomerById);
router.delete('/customers/:id', protect, customerController.deleteCustomer);
router.post('/customers/minimal', protect, customerController.createMinimalCustomer);
router.get('/customers/:id/statement', protect, customerController.getStatement);
// Customer CSV import (slice E.4)
router.post('/customers/import', protect, csvUpload.single('file'), customerController.customerImportPreview);
router.post('/customers/import/confirm', protect, customerController.customerImportConfirm);

// Vehicles
router.get('/vehicles', protect, vehicleController.getAllVehicles);
router.get('/customers/:customerId/vehicles', protect, vehicleController.getVehiclesForCustomer);
router.get('/vehicles/:id', protect, vehicleController.getVehicleById);
router.post('/vehicles', protect, createVehicleValidator, vehicleController.createVehicle);
router.put('/vehicles/:id', protect, updateVehicleValidator, vehicleController.updateVehicle);
router.delete('/vehicles/:id', protect, vehicleController.deleteVehicle);

// Payment infrastructure (slice D.1)
router.get('/gateway-configs', protect, gatewayConfigController.list);
router.get('/gateway-configs/:kind', protect, gatewayConfigController.get);
router.put('/gateway-configs/:kind', protect, gatewayConfigController.upsert);
router.delete('/gateway-configs/:kind', protect, gatewayConfigController.remove);

router.get('/payment-transactions', protect, paymentTransactionController.list);
router.get('/payment-transactions/:id', protect, paymentTransactionController.getById);

router.get('/refunds', protect, refundController.list);
router.get('/refunds/:id', protect, refundController.getById);

// Razorpay (slice D.2)
router.post('/razorpay/create-order/:invoiceId', protect, razorpayController.createOrder);
router.post('/razorpay/verify', protect, razorpayController.verifyPayment);
router.post('/razorpay/refund/:paymentTransactionId', protect, razorpayController.refund);

// Stripe (slice D.3)
router.post('/stripe/create-checkout-session/:invoiceId', protect, stripeController.createCheckoutSession);
router.post('/stripe/refund/:paymentTransactionId', protect, stripeController.refund);

//localization
router.get('/localization', protect, localizationController.getDropdownOptions);
router.post('/localizations', protect, localizationController.saveLocalization);
router.get('/localizations', protect, localizationController.getLocalization);
router.get('/settings-dropdown', localizationController.getSettingsDropdownList);

//Quotation
router.post('/quotations', protect, upload.single('signatureImage'), quotationValidator, quotationController.createQuotation);
router.get('/quotations', protect, quotationController.listQuotations);
router.get('/quotations/:id', quotationController.getQuotationById);
router.put('/quotations/:id', protect, upload.single('signatureImage'), updateQuotationValidator, quotationController.updateQuotation);
router.delete('/quotations/:id', protect, quotationController.deleteQuotation);
router.get('/quotations', protect, quotationController.listQuotations);
router.get('/customers-all', protect, quotationController.getAllCustomers);
router.get('/quotations-minimal', protect, quotationController.getAllCustomers);
router.patch('/quotations-status/:id', protect, quotationController.updateQuotationStatus);
router.post('/quotations/mail', protect, quotationController.sendQuotationEmailAndUpdateStatus);

//invoicetemplate
router.post('/invoice-template', protect, invoiceTemplateController.createOrUpdateTemplate);
router.get('/invoice-templates', protect, invoiceTemplateController.getAllTemplates);
//Invoice
/**
 * @swagger
 * /admin/invoices:
 *   post:
 *     tags: [Invoices]
 *     summary: Create a new invoice
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               customerId: { type: string }
 *               billTo: { type: string }
 *               items: { type: string, description: "JSON-encoded array of line items" }
 *               TotalAmount: { type: number }
 *     responses:
 *       201:
 *         description: Invoice created
 */
router.post('/invoices', protect, upload.single('signatureImage'), createInvoiceValidator, invoiceController.createInvoice);
router.post('/invoices/mail', protect, invoiceController.sendInvoiceEmail);
router.post('/invoices/update-status', protect, invoiceController.updateInvoiceStatus);
router.post('/invoices/:id/mark-sent', protect, invoiceController.markInvoiceSent);
router.get('/invoices/next-number', protect, invoiceController.getNextInvoiceNumber);

/**
 * @swagger
 * /admin/invoices:
 *   get:
 *     tags: [Invoices]
 *     summary: List invoices (paginated)
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of invoices with pagination
 */
router.get('/invoices', protect, invoiceController.getAllInvoices);
router.get('/invoices/:id', protect, invoiceController.getInvoice);
router.get('/invoices/details/:id', invoiceController.getInvoice);
router.put('/invoices/:id', protect, upload.single('signatureImage'), invoiceController.updateInvoice);
router.delete('/invoices/:id', protect, invoiceController.deleteInvoice);
router.post('/quotation-convert-to-invoice/:quotationId', protect, upload.single('signatureImage'), invoiceController.convertQuotationToInvoice);
router.post('/invoices/:id/convert-to-invoice', protect, invoiceController.convertProformaToInvoice);
router.post('/invoice/payment', protect, invoiceController.recordInvoicePayment);
router.post('/invoices-minimal', protect, invoiceController.listInvoicesMinimal);
router.get('/invoice-payment-details/:id', protect, invoiceController.getInvoicePaymentDetails);
router.get('/invoices-recurring', protect, invoiceController.getChildInvoices);
router.post('/invoices-minimal-delivery', protect, invoiceController.listInvoicesMinimalWithoutChallan);

// Recurring invoices (slice B.3)
router.get('/recurring-invoices', protect, invoiceController.getRecurringInvoices);
router.get('/invoices/:id/children', protect, invoiceController.getInvoiceChildren);
router.post('/invoices/:id/run-recurring-now', protect, invoiceController.runRecurringNow);
router.patch('/invoices/:id/recurring-status', protect, invoiceController.setRecurringStatus);

// Public link management (slice B.4)
router.post('/invoices/:id/enable-public-link', protect, invoiceController.enablePublicLink);
router.post('/invoices/:id/disable-public-link', protect, invoiceController.disablePublicLink);
router.post('/invoices/:id/rotate-public-link', protect, invoiceController.rotatePublicLink);


//Email Settings
router.post("/email-settings", protect, emailSettingsController.createOrUpdateEmailSettings);
router.get("/email-settings", protect, emailSettingsController.getEmailSettings);
router.post("/email-settings/test", protect, emailSettingsController.sendTestEmail);

//Email Template
router.post("/email-template", protect, emailTeamplateController.createEmailTemplate);
router.get("/email-template", protect, emailTeamplateController.listEmailTemplates);
router.get("/email-template/resolve/:docType/:id", protect, emailTeamplateController.resolveDocumentTemplate);
router.put("/email-template/:id", protect, emailTeamplateController.updateEmailTemplate);
router.delete("/email-template/:id", protect, emailTeamplateController.deleteEmailTemplate);
router.get("/notification-types", protect, emailTeamplateController.listNotificationTypes);


//credit notes
router.post('/credit-notes', protect, upload.single('signatureImage'), createCreditNoteValidator, creditNoteController.createCreditNote);
router.get('/credit-notes', protect, creditNoteController.getAllCreditNotes);
router.get('/credit-notes/:id', protect, creditNoteController.getCreditNoteById);
router.put('/credit-notes/:id', protect, upload.single('signatureImage'), creditNoteController.updateCreditNote);
router.delete('/credit-notes/:id', protect, creditNoteController.deleteCreditNote);

//delivery challan
router.post('/delivery-challan', protect, upload.single('signatureImage'), createDeliveryChallanValidator, deliveryChallanController.createDeliveryChallan);
router.get('/delivery-challan', protect, deliveryChallanController.getDeliveryChallans);
router.get('/delivery-challan/:id', protect, deliveryChallanController.getDeliveryChallanById);
router.put('/delivery-challan/:id', protect, upload.single('signatureImage'), deliveryChallanController.updateDeliveryChallan);
router.delete('/delivery-challan/:id', protect, deliveryChallanController.deleteDeliveryChallan);

//inventory
router.get('/inventory', protect, inventoryController.listInventory);
router.get('/inventory/history/:id', protect, inventoryController.getInventoryHistory);
router.post('/inventory', protect, inventoryController.updateStock);

//staff
router.post('/staff', protect, upload.single('profileImage'), createStaffValidator, userController.createStaffUser);
router.put('/staff/:id', protect, upload.single('profileImage'), userController.updateStaffUser);
router.get('/staff', protect, userController.listStaffUsers);
router.delete('/staff/:id', protect, userController.deleteStaffUser);

//roles
router.get('/roles', protect, roleController.getRoles);
router.get('/roles-minimal', protect, roleController.getAllRoles);
router.post('/roles', protect, createRoleValidator, roleController.createRole);
router.put('/roles/:id', protect, roleController.updateRole);
router.delete('/roles/:id', protect, roleController.deleteRole);
router.get('/user-by-role/:roleId', protect, roleController.listUsersByRole);


//permission
router.get('/permissions/:roleId', protect, permissionController.getPermissionsByRole);
router.get('/module-hierarchy', protect, permissionController.getModuleHierarchy);
router.post('/permissions', protect, permissionController.createOrUpdatePermissions);

//report
router.get('/inventory/stock-summary', protect, reportController.getInventoryStockSummary);
router.get('/report/inventory', protect, reportController.getInventoryReport);
router.get('/report/best-seller', protect, reportController.getBestSellerReport);
router.get('/report/low-stock', protect, reportController.getLowStockReport);
router.get('/report/stock-history', protect, reportController.getStockHistoryReport);
router.get('/report/out-of-stock', protect, reportController.getOutStockReport);

//accounting report
router.get('/report/income', protect, accountingReportController.getIncomeStats);
router.get('/report/expense', protect, accountingReportController.getPurchaseReport);
router.get('/report/payment-summary', protect, accountingReportController.getPaymentSummaryReport);

//transaction report 
router.get('/report/sales', protect, transactionReportController.getInvoiceSalesReport);
router.get('/report/sales-return', protect, transactionReportController.getCreditNoteSalesReport);
router.get('/report/purchase', protect, transactionReportController.getPurchaseReport);
router.get('/report/purchase-order', protect, transactionReportController.getPurchaseOrderReport);
router.get('/report/debit-note', protect, transactionReportController.getDebitNoteReport);
router.get('/report/quotation', protect, transactionReportController.getQuotationSalesReport);

//security Settings
router.put('/security/reset-password/:userId', protect, securityController.resetPassword);
router.delete('/security/delete-account/:userId', protect, securityController.deleteAccount);
router.get('/security/login-activities/:userId', protect, securityController.getLoginActivitiesByUser);

//activity log (audit trail)
router.get('/activity-logs', protect, activityLogController.listActivityLogs);

//dashboard
router.get('/dashboard', protect, dashboardController.getDashboard);
const dashboardPlanningController = require('@controllers/Admin/dashboardPlanningController');
router.get('/dashboard/accounts-planning', protect, dashboardPlanningController.accountsPlanning);

//expense
router.post("/expenses", protect, upload.single("attachment"), createExpenseValidator, expenseController.createExpense);
router.get("/expenses", protect, expenseController.getAllExpenses);
router.get("/expenses/:id", protect, expenseController.getExpenseById);
router.put("/expenses/:id", protect, upload.single("attachment"), expenseController.updateExpense);
router.delete("/expenses/:id", protect, expenseController.deleteExpense);

// Recurring expenses (slice C.2)
router.get('/recurring-expenses', protect, expenseController.getRecurringExpenses);
router.get('/expenses/:id/children', protect, expenseController.getExpenseChildren);
router.post('/expenses/:id/run-recurring-now', protect, expenseController.runRecurringExpenseNow);
router.patch('/expenses/:id/recurring-status', protect, expenseController.setExpenseRecurringStatus);

//expenseCategory
router.post("/expense-category", protect, expenseCategoryController.createExpenseCategory);
router.get("/expense-category", protect, expenseCategoryController.getAllExpenseCategories);
router.get("/expense-category/:id", protect, expenseCategoryController.getExpenseCategoryById);
router.put('/expense-category/:id', protect, expenseCategoryController.updateExpenseCategory);
router.delete('/expense-category/:id', protect, expenseCategoryController.deleteExpenseCategory);
router.get("/expense-category-minimal", protect, expenseCategoryController.listExpenseCategories);

//pettyCash
router.post("/petty-cash", protect, pettyCashController.createPettyCash);
router.get("/petty-cash", protect, pettyCashController.listPettyCash);
router.get("/bank-petty-chart", protect, pettyCashController.getFinancialSummary);
router.put("/petty-cash", protect, pettyCashController.returnPettyCash);
router.get("/petty-cash-transaction", protect, pettyCashController.listPettyCashTransactions);

//app-version
router.get("/app-version", appVersionController.getAppVersionStatus);


//custom-field-data-types
router.post('/custom-field-data-types', protect, createCustomFieldDataTypeValidator, customFieldDataTypeController.createCustomFieldDataType);
router.get('/custom-field-data-types', protect, customFieldDataTypeController.getAllCustomFieldDataTypes);


// Field Types
router.post('/field-types', protect, fieldTypeController.createFieldType);
router.get('/field-types', protect, fieldTypeController.getFieldTypes);


// Custom Fields
router.post('/custom-fields', protect, customFieldController.createCustomField);
router.put('/custom-fields/:id', protect, customFieldController.updateCustomField);
router.get('/custom-fields', protect, customFieldController.getCustomFields);
router.get('/custom-fields/module/:moduleId', protect, customFieldController.getModuleFields);
router.get('/customfields/module/:moduleId', protect, customFieldController.getModuleFieldsNew);
router.delete('/custom-fields/:id', protect, customFieldController.deleteCustomField);

// AI Routes - Core
router.post('/ai/process', protect, processPromptValidator, aiController.processAIPrompt);
router.post('/ai/confirm', protect, confirmDocumentValidator, aiController.confirmAIDocument);
router.get('/ai/history', protect, aiController.getAIHistory);
router.get('/ai/history/:id', protect, aiController.getAIPromptDetail);
router.delete('/ai/history/:id', protect, aiController.deleteAIPromptLog);
// NOTE (cluster H, slice H.1): the legacy AIConfiguration endpoints below
// were a stub for a different (module-toggles) feature and collide with
// the new BYOK AiConfig endpoints registered further down. Commented out
// here; the new owner is `aiConfigController` at the bottom of this file.
// router.get('/ai/config', protect, aiController.getAIConfig);
// router.put('/ai/config', protect, updateConfigValidator, aiController.updateAIConfig);
router.get('/ai/stats', protect, aiController.getAIStats);

// AI Routes - Suggestions
router.get('/ai/suggestions', protect, aiController.getSuggestions);

// AI Routes - Batch Processing
router.post('/ai/batch', protect, aiController.processBatch);

// AI Routes - Insights
router.get('/ai/insights', protect, aiController.getInsights);

// AI Routes - Chat Conversational Mode
// NOTE (cluster H, slice H.3): the legacy conversational-mode chat endpoints
// below belong to an abandoned AI feature and collide path-for-path with the
// new BYOK streaming co-pilot (`aiChatController`) mounted near the bottom of
// this file (`/ai/chat`, `/ai/chat/sessions/*`). Critically, the legacy
// `GET /ai/chat/:sessionId` would shadow the new `GET /ai/chat/sessions/:id`
// since Express matches in order. Commented out here; the new owner is
// `aiChatController`. The legacy controller file is left in place but unmounted.
// router.post('/ai/chat/start', protect, aiController.startChatSession);
// router.post('/ai/chat/:sessionId/message', protect, aiController.sendChatMessage);
// router.get('/ai/chat/:sessionId', protect, aiController.getChatSession);
// router.get('/ai/chat', protect, aiController.listChatSessions);

// AI Routes - Duplicate Detection
router.post('/ai/check-duplicates', protect, aiController.checkDuplicates);

// AI Routes - Payment Follow-up
router.get('/ai/overdue-invoices', protect, aiController.getOverdueInvoices);
router.post('/ai/generate-followup', protect, aiController.generateFollowup);
router.post('/ai/send-followup', protect, aiController.sendFollowup);

// AI Routes - Prompt Templates
router.post('/ai/templates', protect, aiController.createTemplate);
router.get('/ai/templates', protect, aiController.getTemplates);
router.put('/ai/templates/:id', protect, aiController.updateTemplate);
router.delete('/ai/templates/:id', protect, aiController.deleteTemplate);
router.post('/ai/templates/:id/use', protect, aiController.useTemplate);

// Chart of Accounts (slice F.1)
router.get('/accounts', protect, accountController.list);
router.post('/accounts/seed-defaults', protect, accountController.seedDefaults);
router.get('/accounts/:id', protect, accountController.getById);
router.post('/accounts', protect, accountController.create);
router.put('/accounts/:id', protect, accountController.update);
router.delete('/accounts/:id', protect, accountController.remove);

router.get('/journal-entries', protect, journalEntryController.list);
router.get('/journal-entries/:id', protect, journalEntryController.getById);
router.post('/journal-entries', protect, journalEntryController.create);
router.delete('/journal-entries/:id', protect, journalEntryController.remove);

// Financial statements (slice F.2)
/**
 * @swagger
 * /admin/reports/profit-loss:
 *   get:
 *     tags: [Accounting]
 *     summary: Profit & Loss statement
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: P&L with revenue, expense, net income
 */
router.get('/reports/profit-loss', protect, financialStatementsController.profitLoss);
router.get('/reports/balance-sheet', protect, financialStatementsController.balanceSheet);
router.get('/reports/trial-balance', protect, financialStatementsController.trialBalance);

// Tax reports (slice F.3)
router.get('/reports/tax-summary', protect, taxReportsController.taxSummary);
/**
 * @swagger
 * /admin/reports/gstr-1:
 *   get:
 *     tags: [Tax & GST]
 *     summary: GSTR-1 summary for a tax period
 *     parameters:
 *       - in: query
 *         name: month
 *         schema: { type: integer, minimum: 1, maximum: 12 }
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: GSTR-1 summary
 */
router.get('/reports/gstr-1', protect, taxReportsController.gstr1);
router.get('/reports/gstr-3b', protect, taxReportsController.gstr3b);

// Accounting periods (slice F.4)
router.get('/accounting-periods', protect, accountingPeriodController.list);
router.post('/accounting-periods', protect, accountingPeriodController.create);
router.put('/accounting-periods/:id', protect, accountingPeriodController.update);
router.post('/accounting-periods/:id/lock', protect, accountingPeriodController.lock);
router.post('/accounting-periods/:id/unlock', protect, accountingPeriodController.unlock);
router.delete('/accounting-periods/:id', protect, accountingPeriodController.remove);

// GST filing export (slice F.4)
router.get('/gst-filing/gstr-1/export', protect, gstFilingController.exportGstr1);
router.get('/gst-filing/gstr-3b/export', protect, gstFilingController.exportGstr3b);

// E-invoice (slice G.1)
router.get('/e-invoices', protect, eInvoiceController.list);
router.get('/e-invoices/by-invoice/:invoiceId', protect, eInvoiceController.getByInvoice);
/**
 * @swagger
 * /admin/e-invoices/generate/{invoiceId}:
 *   post:
 *     tags: [E-Invoice]
 *     summary: Generate IRN for an invoice
 *     parameters:
 *       - in: path
 *         name: invoiceId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: IRN generated
 *       404:
 *         description: Invoice not found
 */
router.post('/e-invoices/generate/:invoiceId', protect, eInvoiceController.generate);
router.post('/e-invoices/:id/cancel', protect, eInvoiceController.cancel);

// Accounting integrations (slice G.2)
router.get('/accounting-integrations', protect, accountingIntegrationController.list);
router.post('/accounting-integrations/:kind/connect', protect, accountingIntegrationController.connect);
router.get('/accounting-integrations/:kind/callback', protect, accountingIntegrationController.callback);
router.post('/accounting-integrations/:kind/sync', protect, accountingIntegrationController.syncNow);
router.delete('/accounting-integrations/:kind', protect, accountingIntegrationController.disconnect);

// Messaging / WhatsApp (slice G.3)
router.get('/messaging/config', protect, whatsappController.getConfig);
router.put('/messaging/config', protect, whatsappController.upsertConfig);
router.post('/messaging/whatsapp/send', protect, whatsappController.sendMessage);
router.post('/invoices/:invoiceId/send-whatsapp', protect, whatsappController.sendInvoiceWhatsapp);

// AI configuration (cluster H, slice H.1)
router.get('/ai/config', protect, aiConfigController.getAiConfig);
router.put('/ai/config', protect, aiConfigController.updateAiConfig);
router.post('/ai/config/test', protect, aiConfigController.testAiConfig);
router.delete('/ai/config', protect, aiConfigController.deleteAiConfig);

// AI bill extraction (cluster H, slice H.2)
router.post(
  '/ai/extract-bill',
  protect,
  requireAiEnabled,
  aiRateLimit,
  uploadAiJobs.single('bill'),
  aiExtractionController.extractBill,
);
router.get('/ai/extract-bill', protect, aiExtractionController.listJobs);
router.get('/ai/extract-bill/:id', protect, aiExtractionController.getJob);
router.post('/ai/extract-bill/:id/confirm', protect, aiExtractionController.confirmJob);
router.post('/ai/extract-bill/:id/discard', protect, aiExtractionController.discardJob);

// AI co-pilot chat (cluster H, slice H.3)
// Order matters: the static `/ai/chat/sessions` paths are declared and matched
// distinctly from the streaming `POST /ai/chat`. (Legacy `/ai/chat/:sessionId`
// routes that would have shadowed `/ai/chat/sessions/:id` are unmounted above.)
router.post('/ai/chat', protect, requireAiEnabled, aiRateLimit, aiChatController.streamChat);
router.get('/ai/chat/sessions', protect, aiChatController.listSessions);
router.get('/ai/chat/sessions/:id', protect, aiChatController.getSession);
router.patch('/ai/chat/sessions/:id', protect, aiChatController.renameSession);
router.delete('/ai/chat/sessions/:id', protect, aiChatController.deleteSession);

// AI usage logs / cost reporting (cluster H, slice H.4)
router.get('/ai/usage', protect, aiUsageController.getUsage);
router.get('/ai/usage/summary', protect, aiUsageController.getUsageSummary);

// Spec D — Approval workflows (maker-checker)
const approvalsController = require('@controllers/approvalsController');
router.get('/approvals/pending', protect, approvalsController.listPending);
router.post('/invoices/:id/approve', protect, invoiceController.approveInvoice);
router.post('/invoices/:id/reject', protect, invoiceController.rejectInvoice);
router.post('/expenses/:id/approve', protect, expenseController.approveExpense);
router.post('/expenses/:id/reject', protect, expenseController.rejectExpense);
router.post('/purchases/:id/approve', protect, purchaseController.approvePurchase);
router.post('/purchases/:id/reject', protect, purchaseController.rejectPurchase);

// Spec G — Exchange-rate CRUD (manual rate table; BYOK rate-API is a future provider)
const exchangeRateController = require('@controllers/Admin/exchangeRateController');
router.get('/exchange-rates', protect, exchangeRateController.listExchangeRates);
router.post('/exchange-rates', protect, exchangeRateController.createExchangeRate);
router.delete('/exchange-rates/:id', protect, exchangeRateController.deleteExchangeRate);

// Country accounting packs + ledger setup (slice B.5)
router.get('/ledger/status', protect, ledgerSetup.ledgerStatus);
router.get('/ledger/country-packs', protect, ledgerSetup.listCountryPacks);
router.post('/ledger/setup', protect, ledgerSetup.applyCountryPack);

// Opening-balance cutover (slice B.6)
router.get('/ledger/cutover/preview', protect, ledgerCutover.previewCutoverHandler);
router.post('/ledger/cutover/commit', protect, ledgerCutover.commitCutoverHandler);

// P3.1 — AR/AP Aging + Dunning
router.get('/reports/ar-aging', protect, agingController.arAging);
router.get('/reports/ap-aging', protect, agingController.apAging);
router.get('/reports/collections', protect, agingController.collections);

// P3.2 — Budget CRUD
router.get('/budgets', protect, budgetController.listBudgets);
router.post('/budgets', protect, budgetController.createBudget);
router.put('/budgets/:id', protect, budgetController.updateBudget);
router.delete('/budgets/:id', protect, budgetController.deleteBudget);

// P3.2 — Budget Variance + Cash-Flow Forecast reports
router.get('/reports/budget-variance', protect, budgetController.budgetVarianceReport);
router.get('/reports/cash-flow-forecast', protect, budgetController.cashFlowForecastReport);

// P3.4 — Fixed Assets + Depreciation
// NOTE: run-depreciation must be declared BEFORE /:id to avoid route shadowing.
router.post('/fixed-assets/run-depreciation', protect, fixedAssetController.runDepreciation);
router.get('/fixed-assets', protect, fixedAssetController.listFixedAssets);
router.post('/fixed-assets', protect, fixedAssetController.createFixedAsset);
router.put('/fixed-assets/:id', protect, fixedAssetController.updateFixedAsset);
router.delete('/fixed-assets/:id', protect, fixedAssetController.deleteFixedAsset);

// P3.5 — FIFO cost layers read endpoint
router.get('/inventory/cost-layers', protect, ProductController.listCostLayers);

module.exports = router;
