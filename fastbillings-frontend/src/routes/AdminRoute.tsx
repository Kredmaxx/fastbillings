import { Route, Routes, Navigate } from "react-router-dom";
import AdminLogin from "@pages/admin/auth/AdminLogin";
import AdminDashboard from "@pages/admin/AdminDashboard";
import SalesDashboard from "@pages/admin/dashboard/SalesDashboard";
import AccountsDashboard from "@pages/admin/dashboard/AccountsDashboard";
import ExpensesDashboard from "@pages/admin/dashboard/ExpensesDashboard";
import InventorySalesMenu from "@pages/admin/menus/InventorySalesMenu";
import {
    AccountingMenu,
    AiMenu,
    FinanceMenu,
    PurchaseMenu,
    ReportsMenu,
    SettingsMenu,
    TeamMenu,
} from "@pages/admin/menus/HubPages";
import ProtectedRoute from "./ProtectedRoute";
import AdminLayout from "@components/admin/layouts/AdminLayout";
import UnitList from "@pages/admin/productAndServices/UnitList";
import BrandList from "@pages/admin/productAndServices/BrandList";
import CategoryList from "@pages/admin/productAndServices/Categories";
import ProductList from "@pages/admin/productAndServices/ProductList";
import AddProduct from "@pages/admin/productAndServices/AddProduct";
import EditProduct from "@pages/admin/productAndServices/EditProduct";
import TaxRateList from "@pages/admin/settings/taxRates/TaxRateList";
import TcsRateList from "@pages/admin/settings/TcsRateList";
import TdsRateList from "@pages/admin/settings/TdsRateList";
import CreateTaxRate from "@pages/admin/settings/taxRates/CreateTaxRate";
import EditTaxRate from "@pages/admin/settings/taxRates/EditTaxRate";
import TaxGroups from "@pages/admin/settings/TaxGroups";
import AccountSettings from "@pages/admin/settings/AccountSettings";
import SupplierList from "@pages/admin/purchases/SupplierList";
import SignatureList from "@pages/admin/settings/systemSettings/SignatureList";
import PurchaseOrderList from "@pages/admin/purchases/PurchaseOrderList";
import CreatePurchaseOrder from "@pages/admin/purchases/CreatePurchaseOrder";
import BankAccountList from "@pages/admin/settings/financeSettings/BankAccountList";
import LedgerSetupWizard from "@pages/admin/settings/financeSettings/LedgerSetupWizard";
import DocumentDefaultsPage from "@pages/admin/settings/financeSettings/DocumentDefaults";
import CompanySettings from "@pages/admin/settings/websiteSettings/CompanySettings";
import EditPurchaseOrder from "@pages/admin/purchases/EditPurchaseOrder";
import PurchaseList from "@pages/admin/purchases/PurchaseList";
import CreatePurchase from "@pages/admin/purchases/CreatePurchase";
import SupplierPayments from "@pages/admin/purchases/SupplierPayments";
import DebitNoteList from "@pages/admin/purchases/DebitNoteList";
import CreateDebitNote from "@pages/admin/purchases/CreateDebitNote";
import OverviewDebitNote from "@pages/admin/purchases/OverviewDebitNote";
import CurrencyList from "@pages/admin/settings/financeSettings/currencies/CurrencyList";
import LocalizationSettings from "@pages/admin/settings/websiteSettings/LocalizationSettings";
import CustomerList from "@pages/admin/customers/CustomerList";
import CustomerForm from "@pages/admin/customers/CreateCustomer";
import EditCustomer from "@pages/admin/customers/EditCustomer";
import CustomerStatement from "@pages/admin/customers/CustomerStatement";
import VehicleList from "@pages/admin/vehicles/VehicleList";
import CreateVehicle from "@pages/admin/vehicles/CreateVehicle";
import EditVehicle from "@pages/admin/vehicles/EditVehicle";
import QuotationList from "@pages/admin/quotations/QuotationList";
import CreateNewQuotation from "@pages/admin/quotations/CreateNewQuotation";
import EditQuotation from "@pages/admin/quotations/EditQuotation";
import AdminLogout from "@pages/admin/auth/AdminLogout";
import InvoiceTemplateList from "@pages/admin/invoices/InvoiceTemplateList";
import CreateInvoice from "@pages/admin/invoices/CreateInvoice";
import InvoiceList from "@pages/admin/invoices/InvoiceList";
import EditInvoice from "@pages/admin/invoices/EditInvoice";
import RecurringInvoiceList from "@pages/admin/recurring-invoices/RecurringInvoiceList";
import RecurringExpenseList from "@pages/admin/recurring-expenses/RecurringExpenseList";
import ViewInvoice from "@pages/admin/invoices/ViewInvoice";
import CreditNoteList from "@pages/admin/credit-notes/CreditNoteList";
import AddCreditNote from "@pages/admin/credit-notes/AddCreditNote";
import EditCreditNote from "@pages/admin/credit-notes/EditCreditNote";
import SalesDebitNoteList from "@pages/admin/sales-debit-notes/SalesDebitNoteList";
import AddSalesDebitNote from "@pages/admin/sales-debit-notes/AddSalesDebitNote";
import ViewSalesDebitNote from "@pages/admin/sales-debit-notes/ViewSalesDebitNote";
import InventoryList from "@pages/admin/inventory/InventoryList";
import WarehouseList from "@pages/admin/inventory/WarehouseList";
import StockTransferList from "@pages/admin/inventory/StockTransferList";
import EmailSettings from "@pages/admin/settings/systemSettings/EmailSettings";
import DeliveryChallanList from "@pages/admin/delivery-challan/DeliveryChallanList";
import NewDeliveryChallan from "@pages/admin/delivery-challan/NewDeliveryChallan";
import RolesList from "@pages/admin/roles-permissions/RolesList";
import EditDeliveryChallan from "@pages/admin/delivery-challan/EditDeliveryChallan";
import ViewDeliveryChallan from "@pages/admin/delivery-challan/ViewDeliveryChallan";
import UserList from "@pages/admin/users/UserList";
import RolePermissions from "@pages/admin/roles-permissions/RolePermissions";
import Unauthorized from "@pages/admin/errors/Unauthorized";
import PurchaseReport from "@pages/admin/reports/transaction-reports/PurchaseReport";
import PurchaseOrderReport from "@pages/admin/reports/transaction-reports/PurchaseOrderReport";
import EmailTemplateList from "@pages/admin/settings/systemSettings/EmailTemplateList";
import PurchaseReturnReport from "@pages/admin/reports/transaction-reports/PurchaseReturnReport";
import QuotationReport from "@pages/admin/reports/transaction-reports/QuotationReport";
import SalesReport from "@pages/admin/reports/transaction-reports/SalesReport";
import SalesReturnReport from "@pages/admin/reports/transaction-reports/SalesReturnReport";
import IncomeReport from "@pages/admin/reports/accounting-reports/IncomeReport";
import ProfileSettings from "@pages/admin/settings/ProfileSettings";
import ExpenseReport from "@pages/admin/reports/accounting-reports/ExpenseReport";
import InventoryReport from "@pages/admin/reports/inventory-reports/InventoryReport";
import LowStockReport from "@pages/admin/reports/inventory-reports/LowStockReport";
import OutOfStockReport from "@pages/admin/reports/inventory-reports/OutOfStockReport";
import ExpenseList from "@pages/admin/finance-and-accounting/ExpenseList";
import Seo from "@components/admin/Seo";
import OverviewPurchase from "@pages/admin/purchases/OverviewPurchase";
import EmailInvoice from "@pages/admin/invoices/EmailInvoice";
import EditPurchase from "@pages/admin/purchases/EditPurchase";
import ExpenseCategoryList from "@pages/admin/finance-and-accounting/ExpenseCategoryList";
import PettyCashList from "@pages/admin/finance-and-accounting/PettyCashList";
import BankTransactionList from "@pages/admin/finance-and-accounting/BankTransactionList";
import BankTransactionsBanking from "@pages/admin/banking/BankTransactionList";
import Banking from "@pages/admin/finance-and-accounting/Banking";
import ReconcilationList from "@pages/admin/finance-and-accounting/ReconcilationList";
import Reminder from "@pages/admin/settings/systemSettings/Reminder";
import QuotationSettings from "@pages/admin/settings/moduleSettings/quotation/QuotationSettings";
import EmailQuotation from "@pages/admin/quotations/EmailQuotation";
import ViewQuotation from "@pages/admin/quotations/ViewQuotation";
import ExpenseSettings from "@pages/admin/settings/moduleSettings/expense/ExpenseSettings";
import InvoiceSettings from "@pages/admin/settings/moduleSettings/invoice/InvoiceSettings";
import NotFound from "@pages/errors/NotFound";
import PurchaseSettings from "@pages/admin/settings/moduleSettings/purchase/PurchaseSettings";
import PurchaseOrderSettings from "@pages/admin/settings/moduleSettings/purchaseOrder/PurchaseOrderSettings";
import PaymentTransactionList from "@pages/admin/payments/PaymentTransactionList";
import PaymentGateways from "@pages/admin/settings/PaymentGateways";
import RazorpayConfig from "@pages/admin/settings/RazorpayConfig";
import StripeConfig from "@pages/admin/settings/StripeConfig";
import AccountingIntegrations from "@pages/admin/settings/AccountingIntegrations";
import GstComplianceSettings from "@pages/admin/settings/GstComplianceSettings";
import MessagingSettings from "@pages/admin/settings/MessagingSettings";
import AiSettings from "@pages/admin/settings/AiSettings";
import ApiDocs from "@pages/admin/ApiDocs";
import ExtractionHistory from "@pages/admin/ai/ExtractionHistory";
import ChartOfAccountsList from "@pages/admin/accounting/ChartOfAccountsList";
import JournalEntryList from "@pages/admin/accounting/JournalEntryList";
import CreateJournalEntry from "@pages/admin/accounting/CreateJournalEntry";
import ProfitLossReport from "@pages/admin/accounting/reports/ProfitLossReport";
import BalanceSheetReport from "@pages/admin/accounting/reports/BalanceSheetReport";
import TrialBalanceReport from "@pages/admin/accounting/reports/TrialBalanceReport";
import CashFlowStatementReport from "@pages/admin/accounting/reports/CashFlowStatementReport";
import TaxSummaryReport from "@pages/admin/accounting/reports/TaxSummaryReport";
import GSTR1Report from "@pages/admin/accounting/reports/GSTR1Report";
import GSTR3BReport from "@pages/admin/accounting/reports/GSTR3BReport";
import GSTR9Report from "@pages/admin/accounting/reports/GSTR9Report";
import Cmp08Report from "@pages/admin/accounting/reports/Cmp08Report";
import TdsRegisterReport from "@pages/admin/accounting/reports/TdsRegisterReport";
import TcsRegisterReport from "@pages/admin/accounting/reports/TcsRegisterReport";
import Form24qReport from "@pages/admin/accounting/reports/Form24qReport";
import Form26qReport from "@pages/admin/accounting/reports/Form26qReport";
import Form27qReport from "@pages/admin/accounting/reports/Form27qReport";
import Form27eqReport from "@pages/admin/accounting/reports/Form27eqReport";
import ItcReversalList from "@pages/admin/accounting/reports/ItcReversalList";
import MsmePayablesReport from "@pages/admin/accounting/reports/MsmePayablesReport";
import Form26AsReconcile from "@pages/admin/accounting/reports/Form26AsReconcile";
import AdvanceTaxTracker from "@pages/admin/accounting/reports/AdvanceTaxTracker";
import SelfAssessmentTaxTracker from "@pages/admin/accounting/reports/SelfAssessmentTaxTracker";
import TaxDepositChallanTracker from "@pages/admin/accounting/reports/TaxDepositChallanTracker";
import ItWdvReport from "@pages/admin/accounting/reports/ItWdvReport";
import BooksVsItDepreciationReport from "@pages/admin/accounting/reports/BooksVsItDepreciationReport";
import Clause34TdsReport from "@pages/admin/accounting/reports/Clause34TdsReport";
import TaxAuditClassificationReport from "@pages/admin/accounting/reports/TaxAuditClassificationReport";
import TaxAuditPackReport from "@pages/admin/accounting/reports/TaxAuditPackReport";
import Clause21aInadmissibleReport from "@pages/admin/accounting/reports/Clause21aInadmissibleReport";
import CashExpenseDisallowanceReport from "@pages/admin/accounting/reports/CashExpenseDisallowanceReport";
import Section43BDisallowanceReport from "@pages/admin/accounting/reports/Section43BDisallowanceReport";
import Section40A2RelatedPartyReport from "@pages/admin/accounting/reports/Section40A2RelatedPartyReport";
import Section36VaDisallowanceReport from "@pages/admin/accounting/reports/Section36VaDisallowanceReport";
import Msme43BhDisallowanceReport from "@pages/admin/accounting/reports/Msme43BhDisallowanceReport";
import Section40AiaDisallowanceReport from "@pages/admin/accounting/reports/Section40AiaDisallowanceReport";
import Section40AiDisallowanceReport from "@pages/admin/accounting/reports/Section40AiDisallowanceReport";
import GSTR2BReconcile from "@pages/admin/accounting/reports/GSTR2BReconcile";
import ArAgingReport from "@pages/admin/accounting/reports/ArAgingReport";
import ApAgingReport from "@pages/admin/accounting/reports/ApAgingReport";
import CollectionsReport from "@pages/admin/accounting/reports/CollectionsReport";
import BudgetVarianceReport from "@pages/admin/accounting/reports/BudgetVarianceReport";
import CashFlowForecastReport from "@pages/admin/accounting/reports/CashFlowForecastReport";
import PnlByDimensionReport from "@pages/admin/accounting/reports/PnlByDimensionReport";
import AccountingPeriods from "@pages/admin/accounting/AccountingPeriods";
import EInvoiceList from "@pages/admin/accounting/EInvoiceList";
import ActivityLogList from "@pages/admin/activityLog/ActivityLogList";
import Budgets from "@pages/admin/accounting/Budgets";
import CostCenters from "@pages/admin/accounting/CostCenters";
import Projects from "@pages/admin/accounting/Projects";
import FixedAssets from "@pages/admin/accounting/FixedAssets";
import ApprovalsQueue from "@pages/admin/accounting/ApprovalsQueue";
import CostLayers from "@pages/admin/inventory/CostLayers";
import BatchSerialList from "@pages/admin/inventory/BatchSerialList";
import BomList from "@pages/admin/inventory/BomList";
import ManufactureOrderList from "@pages/admin/inventory/ManufactureOrderList";
const AdminRoute = () => {
    return (
        <Routes>
            <Route path="/login" element={<><Seo title="Login" /><AdminLogin /></>} />

            <Route element={<AdminLayout />}>
                {/* Dashboard */}
                <Route element={<ProtectedRoute moduleSlug="dashboard" action="view" />}>
                    <Route
                        index
                        element={<><Seo title="Dashboard" /><AdminDashboard /></>}
                    />
                </Route>

                <Route element={<ProtectedRoute moduleSlug="dashboard" action="view" />}>
                    <Route path="/dashboard" element={<><Seo title="Dashboard" /><AdminDashboard /></>} />
                    <Route path="/dashboard/sales" element={<><Seo title="Sales & Invoices" /><SalesDashboard /></>} />
                    <Route path="/dashboard/accounts" element={<><Seo title="Accounts & P&L" /><AccountsDashboard /></>} />
                    <Route path="/dashboard/expenses" element={<><Seo title="Expenses" /><ExpensesDashboard /></>} />
                </Route>

                <Route element={<ProtectedRoute />}>
                    <Route path="/menus/dashboards" element={<Navigate to="/admin" replace />} />
                    <Route path="/inventory-sales" element={<><Seo title="Inventory & Sales" /><InventorySalesMenu /></>} />
                    <Route path="/menus/purchase" element={<><Seo title="Purchase" /><PurchaseMenu /></>} />
                    <Route path="/menus/finance" element={<><Seo title="Finance & Accounts" /><FinanceMenu /></>} />
                    <Route path="/menus/accounting" element={<><Seo title="Accounting" /><AccountingMenu /></>} />
                    <Route path="/menus/ai" element={<><Seo title="AI" /><AiMenu /></>} />
                    <Route path="/menus/team" element={<><Seo title="Roles & Permissions" /><TeamMenu /></>} />
                    <Route path="/menus/reports" element={<><Seo title="Reports" /><ReportsMenu /></>} />
                    <Route path="/menus/settings" element={<><Seo title="Settings" /><SettingsMenu /></>} />
                </Route>

                {/* Product & Services */}
                <Route element={<ProtectedRoute moduleSlug="product-services" action="view" />}>
                    <Route path="/units" element={<><Seo title="Units" /><UnitList /></>} />
                    <Route path="/brands" element={<><Seo title="Brands" /><BrandList /></>} />
                    <Route path="/categories" element={<><Seo title="Categories" /><CategoryList /></>} />
                    <Route path="/products" element={<><Seo title="Products" /><ProductList /></>} />
                    <Route path="/products/new" element={<><Seo title="New Product" /><AddProduct /></>} />
                    <Route path="/products/edit/:id" element={<><Seo title="Edit Product" /><EditProduct /></>} />
                </Route>

                {/* Inventory */}
                <Route element={<ProtectedRoute moduleSlug="inventory" action="view" />}>
                    <Route path="/inventory" element={<><Seo title="Inventory" /><InventoryList /></>} />
                    <Route path="/inventory/cost-layers" element={<><Seo title="Cost Layers" /><CostLayers /></>} />
                    <Route path="/inventory/batch-serial" element={<><Seo title="Batch & Serial" /><BatchSerialList /></>} />
                    <Route path="/boms" element={<><Seo title="Bills of Materials" /><BomList /></>} />
                    <Route path="/manufacture-orders" element={<><Seo title="Manufacture Orders" /><ManufactureOrderList /></>} />
                    <Route path="/warehouses" element={<><Seo title="Warehouses" /><WarehouseList /></>} />
                    <Route path="/stock-transfers" element={<><Seo title="Stock Transfers" /><StockTransferList /></>} />
                </Route>

                {/* Invoices */}
                <Route element={<ProtectedRoute moduleSlug="invoices" action="view" />}>
                    <Route path="/invoices" element={<><Seo title="Invoices" /><InvoiceList /></>} />
                    <Route path="/invoices/create-invoice" element={<><Seo title="New Invoice" /><CreateInvoice /></>} />
                    <Route path="/invoices/edit-invoice/:invoiceId" element={<><Seo title="Edit Invoice" /><EditInvoice /></>} />
                    <Route path="/invoices/email/:invoiceId" element={<><Seo title="Email Invoice" /><EmailInvoice /></>} />
                    <Route path="/invoice-templates" element={<><Seo title="Invoice Templates" /><InvoiceTemplateList /></>} />
                    <Route path="/recurring-invoices" element={<><Seo title="Recurring Invoices" /><RecurringInvoiceList /></>} />
                </Route>

                {/* Credit Notes */}
                <Route element={<ProtectedRoute moduleSlug="credit-notes" action="view" />}>
                    <Route path="/credit-notes" element={<><Seo title="Credit Notes" /><CreditNoteList /></>} />
                    <Route path="/credit-notes/new" element={<><Seo title="New Credit Note" /><AddCreditNote /></>} />
                    <Route path="/credit-notes/edit/:id" element={<><Seo title="Edit Credit Note" /><EditCreditNote /></>} />
                </Route>

                {/* Sales Debit Notes (outward DN / GSTR-1 CDNR) — gated with credit-notes for now */}
                <Route element={<ProtectedRoute moduleSlug="credit-notes" action="view" />}>
                    <Route path="/sales-debit-notes" element={<><Seo title="Sales Debit Notes" /><SalesDebitNoteList /></>} />
                    <Route path="/sales-debit-notes/new" element={<><Seo title="New Sales Debit Note" /><AddSalesDebitNote /></>} />
                    <Route path="/sales-debit-notes/view/:id" element={<><Seo title="View Sales Debit Note" /><ViewSalesDebitNote /></>} />
                </Route>

                {/* Quotations */}
                <Route element={<ProtectedRoute moduleSlug="quotations" action="view" />}>
                    <Route path="/quotations" element={<><Seo title="Quotations" /><QuotationList /></>} />
                    <Route path="/quotations/new" element={<><Seo title="New Quotation" /><CreateNewQuotation /></>} />
                    <Route path="/quotations/edit/:id" element={<><Seo title="Edit Quotation" /><EditQuotation /></>} />
                    <Route path="/quotations/email/:id" element={<><Seo title="Email Quotation" /><EmailQuotation /></>} />
                </Route>

                {/* Delivery Challans */}
                <Route element={<ProtectedRoute moduleSlug="delivery-challans" action="view" />}>
                    <Route path="/delivery-challans" element={<><Seo title="Delivery Challans" /><DeliveryChallanList /></>} />
                    <Route path="/delivery-challans/new" element={<><Seo title="New Delivery Challan" /><NewDeliveryChallan /></>} />
                    <Route path="/delivery-challans/edit/:id" element={<><Seo title="Edit Delivery Challan" /><EditDeliveryChallan /></>} />
                    <Route path="/delivery-challans/view/:id" element={<><Seo title="View Delivery Challan" /><ViewDeliveryChallan /></>} />
                </Route>

                {/* Customers */}
                <Route element={<ProtectedRoute moduleSlug="customers" action="view" />}>
                    <Route path="/customers" element={<><Seo title="Customers" /><CustomerList /></>} />
                    <Route path="/customers/new" element={<><Seo title="New Customer" /><CustomerForm /></>} />
                    <Route path="/customers/edit/:id" element={<><Seo title="Edit Customer" /><EditCustomer /></>} />
                    <Route path="/customers/:id/statement" element={<><Seo title="Customer Statement" /><CustomerStatement /></>} />
                </Route>

                {/* Vehicles */}
                <Route path="/vehicles" element={<><Seo title="Vehicles" /><VehicleList /></>} />
                <Route path="/vehicles/new" element={<><Seo title="New Vehicle" /><CreateVehicle /></>} />
                <Route path="/vehicles/edit/:id" element={<><Seo title="Edit Vehicle" /><EditVehicle /></>} />

                {/* General Settings */}
                <Route element={<ProtectedRoute moduleSlug="general-settings" action="view" />}>
                    <Route path="/settings/account" element={<><Seo title="Account Settings" /><AccountSettings /></>} />
                    <Route path="/settings/profile" element={<><Seo title="Profile Settings" /><ProfileSettings /></>} />
                </Route>

                {/* Website Settings */}
                <Route element={<ProtectedRoute moduleSlug="website-settings" action="view" />}>
                    <Route path="/settings/company-settings" element={<><Seo title="Company Settings" /><CompanySettings /></>} />
                    <Route path="/settings/localization" element={<><Seo title="Localization Settings" /><LocalizationSettings /></>} />
                </Route>

                {/* System Settings */}
                <Route element={<ProtectedRoute moduleSlug="system-settings" action="view" />}>
                    <Route path="/settings/email-settings" element={<><Seo title="Email Settings" /><EmailSettings /></>} />
                    <Route path="/settings/email-templates" element={<><Seo title="Email Templates" /><EmailTemplateList /></>} />
                    <Route path="/settings/signatures" element={<><Seo title="Signatures" /><SignatureList /></>} />
                    <Route path="/settings/reminders" element={<><Seo title="Reminders" /><Reminder /></>} />
                </Route>

                {/* Module Settings */}
                <Route element={<ProtectedRoute moduleSlug="module-settings" action="view" />}>
                    <Route path="/settings/module-settings/invoice" element={<><Seo title="Module Settings - Invoice" /><InvoiceSettings /></>} />
                    <Route path="/settings/module-settings/purchase" element={<><Seo title="Module Settings - Purchase" /><PurchaseSettings /></>} />
                    <Route path="/settings/module-settings/purchase-order" element={<><Seo title="Module Settings - Purchase Order" /><PurchaseOrderSettings     /></>} />
                    <Route path="/settings/module-settings/expense" element={<><Seo title="Module Settings - Expense" /><ExpenseSettings /></>} />
                    <Route path="/settings/module-settings/quotations" element={<><Seo title="Module Settings - Quotations" /><QuotationSettings /></>} />
                </Route>

                {/* Finance Settings */}
                <Route element={<ProtectedRoute moduleSlug="finance-settings" action="view" />}>
                    <Route path="/settings/bank-accounts" element={<><Seo title="Bank Accounts" /><BankAccountList /></>} />
                    <Route path="/settings/tax-rates" element={<><Seo title="Tax Rates" /><TaxRateList /></>} />
                    <Route path="/settings/tax-rates/new" element={<><Seo title="New Tax Rate" /><CreateTaxRate /></>} />
                    <Route path="/settings/tax-rates/edit/:id" element={<><Seo title="Edit Tax Rate" /><EditTaxRate /></>} />
                    <Route path="/settings/tcs-rates" element={<><Seo title="TCS Rates" /><TcsRateList /></>} />
                    <Route path="/settings/tds-rates" element={<><Seo title="TDS Rates" /><TdsRateList /></>} />
                    <Route path="/settings/tax-groups" element={<><Seo title="Tax Groups" /><TaxGroups /></>} />
                    <Route path="/settings/currencies" element={<><Seo title="Currencies" /><CurrencyList /></>} />
                    <Route path="/settings/ledger-setup" element={<><Seo title="Ledger Setup" /><LedgerSetupWizard /></>} />
                    <Route path="/settings/document-defaults" element={<><Seo title="Document Defaults" /><DocumentDefaultsPage /></>} />
                </Route>

                {/* Purchase Module */}
                <Route element={<ProtectedRoute moduleSlug="purchase-orders" action="view" />}>
                    <Route path="/purchase-orders" element={<><Seo title="Purchase Orders" /><PurchaseOrderList /></>} />
                    <Route path="/purchase-orders/new" element={<><Seo title="New Purchase Order" /><CreatePurchaseOrder /></>} />
                    <Route path="/purchase-orders/edit/:id" element={<><Seo title="Edit Purchase Order" /><EditPurchaseOrder /></>} />
                </Route>

                <Route element={<ProtectedRoute moduleSlug="purchase-list" action="view" />}>
                    <Route path="/purchases" element={<><Seo title="Purchases" /><PurchaseList /></>} />
                    <Route path="/purchases/new" element={<><Seo title="New Purchase" /><CreatePurchase /></>} />
                    <Route path="/purchases/edit/:id" element={<><Seo title="Edit Purchase" /><EditPurchase /></>} />
                    <Route path="/purchases/view/:id" element={<><Seo title="Purchase Overview" /><OverviewPurchase /></>} />
                </Route>

                <Route element={<ProtectedRoute moduleSlug="debit-notes" action="view" />}>
                    <Route path="/debit-notes" element={<><Seo title="Debit Notes" /><DebitNoteList /></>} />
                    <Route path="/debit-notes/new" element={<><Seo title="New Debit Note" /><CreateDebitNote /></>} />
                    <Route path="/debit-notes/view/:id" element={<><Seo title="Debit Note Overview" /><OverviewDebitNote /></>} />
                </Route>

                <Route element={<ProtectedRoute moduleSlug="suppliers" action="view" />}>
                    <Route path="/suppliers" element={<><Seo title="Suppliers" /><SupplierList /></>} />
                </Route>

                <Route element={<ProtectedRoute moduleSlug="supplier-payments" action="view" />}>
                    <Route path="/supplier-payments" element={<><Seo title="Supplier Payments" /><SupplierPayments /></>} />
                </Route>

                {/* Finance & Accounting */}
                <Route element={<ProtectedRoute moduleSlug="expenses" action="view" />}>
                    <Route path="/banking" element={<><Seo title="Banking" /><Banking /></>} />
                    <Route path="/banking/transactions" element={<><Seo title="Bank Transactions" /><BankTransactionsBanking /></>} />
                    <Route path="/banking/:bankId" element={<><Seo title="Banking" /><ReconcilationList /></>} />
                    <Route path="/expenses" element={<><Seo title="Expenses" /><ExpenseList /></>} />
                    <Route path="/recurring-expenses" element={<><Seo title="Recurring Expenses" /><RecurringExpenseList /></>} />
                    <Route path="/expense-categories" element={<><Seo title="Expense Categories" /><ExpenseCategoryList /></>} />
                    <Route path="/transactions" element={<><Seo title="Transactions" /><BankTransactionList /></>} />
                    <Route path="/petty-cash" element={<><Seo title="Petty Cash" /><PettyCashList /></>} />
                </Route>

                {/* Accounting (slice F.1) */}
                <Route path="/accounting/chart-of-accounts" element={<><Seo title="Chart of Accounts" /><ChartOfAccountsList /></>} />
                <Route path="/accounting/journal-entries" element={<><Seo title="Journal Entries" /><JournalEntryList /></>} />
                <Route path="/accounting/journal-entries/new" element={<><Seo title="New Journal Entry" /><CreateJournalEntry /></>} />

                {/* Financial Statements (slice F.2) */}
                <Route path="/accounting/reports/profit-loss" element={<><Seo title="P&L" /><ProfitLossReport /></>} />
                <Route path="/accounting/reports/balance-sheet" element={<><Seo title="Balance Sheet" /><BalanceSheetReport /></>} />
                <Route path="/accounting/reports/trial-balance" element={<><Seo title="Trial Balance" /><TrialBalanceReport /></>} />
                <Route path="/accounting/reports/cash-flow" element={<><Seo title="Cash Flow Statement" /><CashFlowStatementReport /></>} />

                {/* Tax Reports (slice F.3) */}
                <Route path="/accounting/reports/tax-summary" element={<><Seo title="Tax Summary" /><TaxSummaryReport /></>} />
                <Route path="/accounting/reports/gstr-1" element={<><Seo title="GSTR-1" /><GSTR1Report /></>} />
                <Route path="/accounting/reports/gstr-3b" element={<><Seo title="GSTR-3B" /><GSTR3BReport /></>} />
                <Route path="/accounting/reports/gstr-9" element={<><Seo title="GSTR-9" /><GSTR9Report /></>} />
                <Route path="/accounting/reports/cmp-08" element={<><Seo title="CMP-08" /><Cmp08Report /></>} />
                <Route path="/accounting/reports/tds-register" element={<><Seo title="TDS Register" /><TdsRegisterReport /></>} />
                <Route path="/accounting/reports/tcs-register" element={<><Seo title="TCS Register" /><TcsRegisterReport /></>} />
                <Route path="/accounting/reports/form-24q" element={<><Seo title="Form 24Q" /><Form24qReport /></>} />
                <Route path="/accounting/reports/form-26q" element={<><Seo title="Form 26Q" /><Form26qReport /></>} />
                <Route path="/accounting/reports/form-27q" element={<><Seo title="Form 27Q" /><Form27qReport /></>} />
                <Route path="/accounting/reports/form-27eq" element={<><Seo title="Form 27EQ" /><Form27eqReport /></>} />
                <Route path="/accounting/reports/itc-reversal" element={<><Seo title="ITC Reversal" /><ItcReversalList /></>} />
                <Route path="/accounting/reports/msme-payables" element={<><Seo title="MSME Payables" /><MsmePayablesReport /></>} />
                <Route path="/accounting/reports/form-26as" element={<><Seo title="Form 26AS" /><Form26AsReconcile /></>} />
                <Route path="/accounting/reports/advance-tax" element={<><Seo title="Advance Tax" /><AdvanceTaxTracker /></>} />
                <Route path="/accounting/reports/self-assessment-tax" element={<><Seo title="Self-assessment Tax" /><SelfAssessmentTaxTracker /></>} />
                <Route path="/accounting/reports/tax-deposit-challans" element={<><Seo title="TDS/TCS Challans" /><TaxDepositChallanTracker /></>} />
                <Route path="/accounting/reports/it-wdv" element={<><Seo title="IT WDV" /><ItWdvReport /></>} />
                <Route path="/accounting/reports/books-vs-it-depreciation" element={<><Seo title="Books vs IT depreciation" /><BooksVsItDepreciationReport /></>} />
                <Route path="/accounting/reports/clause-34-tds" element={<><Seo title="Clause 34 TDS/TCS" /><Clause34TdsReport /></>} />
                <Route path="/accounting/reports/tax-audit-classification" element={<><Seo title="Tax-audit classification" /><TaxAuditClassificationReport /></>} />
                <Route path="/accounting/reports/tax-audit-pack" element={<><Seo title="Tax-audit pack" /><TaxAuditPackReport /></>} />
                <Route path="/accounting/reports/clause-21a-inadmissible" element={<><Seo title="Clause 21(a) inadmissible" /><Clause21aInadmissibleReport /></>} />
                <Route path="/accounting/reports/cash-expense-disallowance" element={<><Seo title="Cash expense disallowance" /><CashExpenseDisallowanceReport /></>} />
                <Route path="/accounting/reports/msme-43bh-disallowance" element={<><Seo title="MSME 43B(h) disallowance" /><Msme43BhDisallowanceReport /></>} />
                <Route path="/accounting/reports/section-43b-disallowance" element={<><Seo title="Section 43B disallowance" /><Section43BDisallowanceReport /></>} />
                <Route path="/accounting/reports/section-40a-2-related-party" element={<><Seo title="Section 40A(2) related party" /><Section40A2RelatedPartyReport /></>} />
                <Route path="/accounting/reports/section-36-1-va-disallowance" element={<><Seo title="Section 36(1)(va) employee PF/ESI" /><Section36VaDisallowanceReport /></>} />
                <Route path="/accounting/reports/section-40a-ia-disallowance" element={<><Seo title="Section 40(a)(ia) disallowance" /><Section40AiaDisallowanceReport /></>} />
                <Route path="/accounting/reports/section-40a-i-disallowance" element={<><Seo title="Section 40(a)(i) NR disallowance" /><Section40AiDisallowanceReport /></>} />
                <Route path="/accounting/reports/gstr-2b" element={<><Seo title="GSTR-2B Reconcile" /><GSTR2BReconcile /></>} />

                {/* Accounting Periods (slice F.4) */}
                <Route path="/accounting/periods" element={<><Seo title="Accounting Periods" /><AccountingPeriods /></>} />

                {/* Finance Reports (AR/AP Aging, Collections, Budget Variance, Cash Flow, P&L by Dimension) */}
                <Route path="/accounting/reports/ar-aging" element={<><Seo title="AR Aging" /><ArAgingReport /></>} />
                <Route path="/accounting/reports/ap-aging" element={<><Seo title="AP Aging" /><ApAgingReport /></>} />
                <Route path="/accounting/reports/collections" element={<><Seo title="Collections" /><CollectionsReport /></>} />
                <Route path="/accounting/reports/budget-variance" element={<><Seo title="Budget Variance" /><BudgetVarianceReport /></>} />
                <Route path="/accounting/reports/cash-flow-forecast" element={<><Seo title="Cash Flow Forecast" /><CashFlowForecastReport /></>} />
                <Route path="/accounting/reports/pnl-by-dimension" element={<><Seo title="P&L by Dimension" /><PnlByDimensionReport /></>} />

                {/* E-Invoices (slice G.1) */}
                <Route path="/accounting/e-invoices" element={<><Seo title="E-Invoices" /><EInvoiceList /></>} />

                {/* Budgets, Cost Centers, Projects, Fixed Assets */}
                <Route path="/accounting/budgets" element={<><Seo title="Budgets" /><Budgets /></>} />
                <Route path="/accounting/cost-centers" element={<><Seo title="Cost Centers" /><CostCenters /></>} />
                <Route path="/accounting/projects" element={<><Seo title="Projects" /><Projects /></>} />
                <Route path="/accounting/fixed-assets" element={<><Seo title="Fixed Assets" /><FixedAssets /></>} />
                <Route path="/accounting/approvals" element={<><Seo title="Approvals Queue" /><ApprovalsQueue /></>} />

                {/* Payments */}
                <Route path="/payments/transactions" element={<><Seo title="Transactions" /><PaymentTransactionList /></>} />
                <Route path="/settings/payment-gateways" element={<><Seo title="Payment Gateways" /><PaymentGateways /></>} />
                <Route path="/settings/payment-gateways/razorpay" element={<><Seo title="Razorpay Configuration" /><RazorpayConfig /></>} />
                <Route path="/settings/payment-gateways/stripe" element={<><Seo title="Stripe Configuration" /><StripeConfig /></>} />
                <Route path="/settings/accounting-integrations" element={<><Seo title="Accounting Integrations" /><AccountingIntegrations /></>} />
                <Route path="/settings/gst-compliance" element={<><Seo title="GST Compliance" /><GstComplianceSettings /></>} />
                <Route path="/settings/messaging" element={<><Seo title="Messaging" /><MessagingSettings /></>} />
                <Route path="/settings/ai" element={<><Seo title="AI Settings" /><AiSettings /></>} />
                <Route path="/api-docs" element={<><Seo title="API Documentation" /><ApiDocs /></>} />
                <Route path="/ai/extractions" element={<><Seo title="AI Extractions" /><ExtractionHistory /></>} />

                {/* Activity Log */}
                <Route element={<ProtectedRoute moduleSlug="activity-log" action="view" />}>
                  <Route path="/activity-log" element={<><Seo title="Activity Log" /><ActivityLogList /></>} />
                </Route>

                {/* Roles & Permissions */}
                <Route element={<ProtectedRoute moduleSlug="manage-users" action="view" />}>
                    <Route path="/users" element={<><Seo title="Users" /><UserList /></>} />
                    <Route path="/roles" element={<><Seo title="Roles" /><RolesList /></>} />
                    <Route path="/roles/permissions/:id" element={<><Seo title="Role Permissions" /><RolePermissions /></>} />
                </Route>

                {/* Reports - Transaction */}
                <Route element={<ProtectedRoute moduleSlug="transaction-reports" action="view" />}>
                    <Route path="/reports/sales" element={<><Seo title="Sales Report" /><SalesReport /></>} />
                    <Route path="/reports/sales-return" element={<><Seo title="Sales Return Report" /><SalesReturnReport /></>} />
                    <Route path="/reports/purchase" element={<><Seo title="Purchase Report" /><PurchaseReport /></>} />
                    <Route path="/reports/purchase-order" element={<><Seo title="Purchase Order Report" /><PurchaseOrderReport /></>} />
                    <Route path="/reports/purchase-return" element={<><Seo title="Purchase Return Report" /><PurchaseReturnReport /></>} />
                    <Route path="/reports/quotation" element={<><Seo title="Quotation Report" /><QuotationReport /></>} />
                </Route>

                {/* Reports - Accounting */}
                <Route element={<ProtectedRoute moduleSlug="accounting-reports" action="view" />}>
                    <Route path="/reports/income" element={<><Seo title="Income Report" /><IncomeReport /></>} />
                    <Route path="/reports/expense" element={<><Seo title="Expense Report" /><ExpenseReport /></>} />
                </Route>

                {/* Reports - Inventory */}
                <Route element={<ProtectedRoute moduleSlug="item-reports" action="view" />}>
                    <Route path="/reports/inventory" element={<><Seo title="Inventory Report" /><InventoryReport /></>} />
                    <Route path="/reports/low-stock" element={<><Seo title="Low Stock Report" /><LowStockReport /></>} />
                    <Route path="/reports/out-of-stock" element={<><Seo title="Out Of Stock Report" /><OutOfStockReport /></>} />
                </Route>

                {/* Logout */}
                <Route element={<ProtectedRoute />}>
                    <Route path="/logout" element={<AdminLogout />} />
                </Route>
            </Route>

            {/* No Layout Routes ex: print,pdf,view */}
            <Route path="/view-invoice/:id" element={<ViewInvoice />} />
            <Route path="/view-quotation/:id" element={<ViewQuotation />} />

            {/* Error Routes */}
            <Route path="/unauthorized" element={<><Seo title="Unauthorized" /><Unauthorized /></>} />
            <Route path="*" element={<><Seo title="Not Found" /><NotFound /></>} />
        </Routes>
    );
};

export default AdminRoute;