import MenuHub from "@components/admin/menus/MenuHub";
import type { MenuSection } from "@components/admin/menus/MenuHub";
import {
  Activity,
  BadgePercent,
  BarChart2,
  BookOpen,
  Boxes,
  Briefcase,
  Calendar,
  Car,
  ChartArea,
  ChartCandlestick,
  CircleDollarSign,
  ClipboardCheck,
  Cpu,
  CreditCard,
  FileCheck,
  FileText,
  FolderKanban,
  Globe,
  Home,
  Landmark,
  Layers,
  Link2,
  MessageCircle,
  Package,
  Percent,
  Receipt,
  Repeat,
  RotateCw,
  Settings,
  Settings2,
  ShoppingBag,
  Sparkles,
  KeyRound,
  Tags,
  Truck,
  Users,
  Wallet,
  Warehouse,
} from "lucide-react";

const a = {
  blue: "from-[#0066FF] to-[#00D2FF]",
  navy: "from-[#0B1533] to-[#0066FF]",
  cyan: "from-[#00D2FF] to-[#0891B2]",
  green: "from-[#34D399] to-[#059669]",
  amber: "from-[#F59E0B] to-[#D97706]",
  rose: "from-[#F43F5E] to-[#FB7185]",
  mix: "from-[#34D399] to-[#0066FF]",
  deep: "from-[#0066FF] to-[#0052CC]",
} as const;

export type HubKey =
  | "dashboards"
  | "inventory-sales"
  | "purchase"
  | "finance"
  | "accounting"
  | "ai"
  | "team"
  | "reports"
  | "settings";

export type HubDefinition = {
  key: HubKey;
  path: string;
  title: string;
  description: string;
  sections: MenuSection[];
};

export const menuHubs: Record<HubKey, HubDefinition> = {
  dashboards: {
    key: "dashboards",
    path: "/admin",
    title: "Dashboards",
    description:
      "Overview KPIs plus sales, accounts, and expense dashboard views.",
    sections: [
      {
        title: "Business Views",
        eyebrow: "Live performance boards",
        items: [
          {
            title: "Overview",
            description: "Company-wide KPIs, aging, and recent activity.",
            to: "/admin",
            icon: <Home size={20} />,
            accent: a.blue,
          },
          {
            title: "Sales & Invoices",
            description: "Sales metrics, collections, and invoice trends.",
            to: "/admin/dashboard/sales",
            icon: <Receipt size={20} />,
            accent: a.deep,
          },
          {
            title: "Accounts & P&L",
            description: "Profit & loss, planning, and balance sheet summary.",
            to: "/admin/dashboard/accounts",
            icon: <ChartCandlestick size={20} />,
            accent: a.navy,
          },
          {
            title: "Expenses",
            description: "Operating spend, categories, and recent expenses.",
            to: "/admin/dashboard/expenses",
            icon: <CircleDollarSign size={20} />,
            accent: a.amber,
          },
        ],
      },
    ],
  },

  "inventory-sales": {
    key: "inventory-sales",
    path: "/admin/inventory-sales",
    title: "Inventory & Sales",
    description:
      "One place for catalog setup, stock control, billing documents, customers, and sales reports.",
    sections: [
      {
        title: "Catalog & Inventory",
        eyebrow: "Products, stock, and master data",
        items: [
          {
            title: "Products",
            description: "Manage items, prices, tax, and product details.",
            to: "/admin/products",
            icon: <Package size={20} />,
            accent: a.blue,
          },
          {
            title: "Categories",
            description: "Organize products into business categories.",
            to: "/admin/categories",
            icon: <Tags size={20} />,
            accent: a.cyan,
          },
          {
            title: "Brands",
            description: "Maintain product brands and brand mapping.",
            to: "/admin/brands",
            icon: <BadgePercent size={20} />,
            accent: a.green,
          },
          {
            title: "Units",
            description: "Set up unit measurements for sales and stock.",
            to: "/admin/units",
            icon: <Layers size={20} />,
            accent: a.amber,
          },
          {
            title: "Inventory",
            description: "Track quantity, valuation, movement, and availability.",
            to: "/admin/inventory",
            icon: <Warehouse size={20} />,
            accent: a.deep,
          },
          {
            title: "Warehouses",
            description: "Manage stock locations and default warehouse.",
            to: "/admin/warehouses",
            icon: <Warehouse size={20} />,
            accent: a.mix,
          },
          {
            title: "Stock transfers",
            description: "Move quantity between warehouses.",
            to: "/admin/stock-transfers",
            icon: <Boxes size={20} />,
            accent: a.cyan,
          },
          {
            title: "Cost Layers (FIFO)",
            description: "Review FIFO cost layers and inventory valuation.",
            to: "/admin/inventory/cost-layers",
            icon: <Boxes size={20} />,
            accent: a.navy,
          },
          {
            title: "Batch & serial",
            description: "Lot and serial stock by warehouse.",
            to: "/admin/inventory/batch-serial",
            icon: <Boxes size={20} />,
            accent: a.amber,
          },
          {
            title: "Bills of materials",
            description: "Define components for finished goods.",
            to: "/admin/boms",
            icon: <Boxes size={20} />,
            accent: a.deep,
          },
          {
            title: "Manufacture orders",
            description: "Build FG from BOM and update warehouse stock.",
            to: "/admin/manufacture-orders",
            icon: <Boxes size={20} />,
            accent: a.cyan,
          },
        ],
      },
      {
        title: "Sales Operations",
        eyebrow: "Customer-facing documents and workflows",
        items: [
          {
            title: "Invoices",
            description: "Create, send, collect, and track invoices.",
            to: "/admin/invoices",
            icon: <Receipt size={20} />,
            accent: a.blue,
          },
          {
            title: "Recurring Invoices",
            description: "Automate repeated billing for recurring customers.",
            to: "/admin/recurring-invoices",
            icon: <Repeat size={20} />,
            accent: a.mix,
          },
          {
            title: "Invoice Templates",
            description: "Choose and preview branded invoice layouts.",
            to: "/admin/invoice-templates",
            icon: <FileText size={20} />,
            accent: a.cyan,
          },
          {
            title: "Customers",
            description: "Manage customer profiles, contact details, and balances.",
            to: "/admin/customers",
            icon: <Users size={20} />,
            accent: a.deep,
          },
          {
            title: "Vehicles",
            description: "Maintain vehicle details for transport-based billing.",
            to: "/admin/vehicles",
            icon: <Car size={20} />,
            accent: a.amber,
          },
          {
            title: "Credit Notes",
            description: "Issue credit adjustments and sales returns.",
            to: "/admin/credit-notes",
            icon: <Receipt size={20} />,
            accent: a.rose,
          },
          {
            title: "Sales Debit Notes",
            description: "Issue outward debit notes for undercharges (GSTR-1 CDNR).",
            to: "/admin/sales-debit-notes",
            icon: <FileText size={20} />,
            accent: a.amber,
          },
          {
            title: "Quotations",
            description: "Prepare estimates and convert approved deals.",
            to: "/admin/quotations",
            icon: <FileText size={20} />,
            accent: a.navy,
          },
          {
            title: "Delivery Challans",
            description: "Manage dispatch records and delivery documents.",
            to: "/admin/delivery-challans",
            icon: <Truck size={20} />,
            accent: a.cyan,
          },
        ],
      },
    ],
  },

  purchase: {
    key: "purchase",
    path: "/admin/menus/purchase",
    title: "Purchase",
    description:
      "Manage suppliers, purchase orders, bills, debit notes, and supplier payments.",
    sections: [
      {
        title: "Purchasing",
        eyebrow: "Buy, receive, and settle",
        items: [
          {
            title: "Purchases",
            description: "Record and track purchase bills from suppliers.",
            to: "/admin/purchases",
            icon: <ShoppingBag size={20} />,
            accent: a.blue,
          },
          {
            title: "Purchase Orders",
            description: "Create and manage POs before goods arrive.",
            to: "/admin/purchase-orders",
            icon: <FileText size={20} />,
            accent: a.deep,
          },
          {
            title: "Debit Notes",
            description: "Issue purchase returns and debit adjustments.",
            to: "/admin/debit-notes",
            icon: <Receipt size={20} />,
            accent: a.rose,
          },
          {
            title: "Suppliers",
            description: "Maintain vendor profiles and contact details.",
            to: "/admin/suppliers",
            icon: <Truck size={20} />,
            accent: a.cyan,
          },
          {
            title: "Supplier Payments",
            description: "Record and track payments made to suppliers.",
            to: "/admin/supplier-payments",
            icon: <Wallet size={20} />,
            accent: a.green,
          },
        ],
      },
    ],
  },

  finance: {
    key: "finance",
    path: "/admin/menus/finance",
    title: "Finance & Accounts",
    description:
      "Banking, expenses, payments, and day-to-day money movement in one hub.",
    sections: [
      {
        title: "Cash & Banking",
        eyebrow: "Accounts and transactions",
        items: [
          {
            title: "Banking",
            description: "Overview of bank accounts and balances.",
            to: "/admin/banking",
            icon: <Landmark size={20} />,
            accent: a.blue,
          },
          {
            title: "Bank Transactions",
            description: "Review and reconcile bank movement.",
            to: "/admin/banking/transactions",
            icon: <Landmark size={20} />,
            accent: a.navy,
          },
          {
            title: "Payment Transactions",
            description: "Track gateway and payment activity.",
            to: "/admin/payments/transactions",
            icon: <CreditCard size={20} />,
            accent: a.deep,
          },
          {
            title: "Petty Cash",
            description: "Manage small day-to-day cash expenses.",
            to: "/admin/petty-cash",
            icon: <Wallet size={20} />,
            accent: a.amber,
          },
        ],
      },
      {
        title: "Expenses",
        eyebrow: "Operating spend",
        items: [
          {
            title: "Expenses",
            description: "Log and categorize business expenses.",
            to: "/admin/expenses",
            icon: <CircleDollarSign size={20} />,
            accent: a.rose,
          },
          {
            title: "Recurring Expenses",
            description: "Automate repeating expense entries.",
            to: "/admin/recurring-expenses",
            icon: <RotateCw size={20} />,
            accent: a.cyan,
          },
        ],
      },
    ],
  },

  accounting: {
    key: "accounting",
    path: "/admin/menus/accounting",
    title: "Accounting",
    description:
      "Ledgers, journals, statements, tax filings, budgets, and controls.",
    sections: [
      {
        title: "Core Ledger",
        eyebrow: "Books and entries",
        items: [
          {
            title: "Chart of Accounts",
            description: "Define and maintain your account structure.",
            to: "/admin/accounting/chart-of-accounts",
            icon: <BookOpen size={20} />,
            accent: a.blue,
          },
          {
            title: "Journal Entries",
            description: "Post manual journals and adjustments.",
            to: "/admin/accounting/journal-entries",
            icon: <FileText size={20} />,
            accent: a.deep,
          },
          {
            title: "Accounting Periods",
            description: "Open and close financial periods.",
            to: "/admin/accounting/periods",
            icon: <Calendar size={20} />,
            accent: a.cyan,
          },
          {
            title: "E-Invoices (IRN)",
            description: "Manage e-invoice IRN compliance records.",
            to: "/admin/accounting/e-invoices",
            icon: <FileCheck size={20} />,
            accent: a.green,
          },
        ],
      },
      {
        title: "Financial Statements",
        eyebrow: "Period results",
        items: [
          {
            title: "Profit & Loss",
            description: "Income statement for the selected period.",
            to: "/admin/accounting/reports/profit-loss",
            icon: <ChartCandlestick size={20} />,
            accent: a.mix,
          },
          {
            title: "Balance Sheet",
            description: "Assets, liabilities, and equity snapshot.",
            to: "/admin/accounting/reports/balance-sheet",
            icon: <BarChart2 size={20} />,
            accent: a.navy,
          },
          {
            title: "Trial Balance",
            description: "Verify debit and credit balances.",
            to: "/admin/accounting/reports/trial-balance",
            icon: <Layers size={20} />,
            accent: a.amber,
          },
          {
            title: "Cash Flow Statement",
            description: "Indirect cash flow (operating, investing, financing).",
            to: "/admin/accounting/reports/cash-flow",
            icon: <ChartArea size={20} />,
            accent: a.cyan,
          },
        ],
      },
      {
        title: "Finance Reports",
        eyebrow: "Receivables, payables, and forecasts",
        items: [
          {
            title: "AR Aging",
            description: "Outstanding customer receivables by age.",
            to: "/admin/accounting/reports/ar-aging",
            icon: <Users size={20} />,
            accent: a.blue,
          },
          {
            title: "AP Aging",
            description: "Outstanding supplier payables by age.",
            to: "/admin/accounting/reports/ap-aging",
            icon: <Truck size={20} />,
            accent: a.rose,
          },
          {
            title: "Collections",
            description: "Track collection performance.",
            to: "/admin/accounting/reports/collections",
            icon: <Wallet size={20} />,
            accent: a.green,
          },
          {
            title: "Budget Variance",
            description: "Compare actuals against budgets.",
            to: "/admin/accounting/reports/budget-variance",
            icon: <BarChart2 size={20} />,
            accent: a.amber,
          },
          {
            title: "Cash Flow Forecast",
            description: "Project upcoming cash inflows and outflows.",
            to: "/admin/accounting/reports/cash-flow-forecast",
            icon: <ChartArea size={20} />,
            accent: a.cyan,
          },
          {
            title: "P&L by Dimension",
            description: "Profitability by cost center or project.",
            to: "/admin/accounting/reports/pnl-by-dimension",
            icon: <FolderKanban size={20} />,
            accent: a.navy,
          },
        ],
      },
      {
        title: "Tax Reports",
        eyebrow: "GST and tax summaries",
        items: [
          {
            title: "Tax Summary",
            description: "Consolidated tax collected and paid.",
            to: "/admin/accounting/reports/tax-summary",
            icon: <Percent size={20} />,
            accent: a.deep,
          },
          {
            title: "GSTR-1 (Worksheet)",
            description: "Outward supplies books worksheet — not GSTN portal filing.",
            to: "/admin/accounting/reports/gstr-1",
            icon: <Receipt size={20} />,
            accent: a.blue,
          },
          {
            title: "GSTR-3B (Worksheet)",
            description: "Monthly GST summary books worksheet — not GSTN portal filing.",
            to: "/admin/accounting/reports/gstr-3b",
            icon: <Receipt size={20} />,
            accent: a.cyan,
          },
          {
            title: "GSTR-2B reconcile (Worksheet)",
            description: "Import portal 2B JSON and match ITC to purchases — books worksheet, not portal filing.",
            to: "/admin/accounting/reports/gstr-2b",
            icon: <Receipt size={20} />,
            accent: a.amber,
          },
          {
            title: "GSTR-9 annual (Worksheet)",
            description: "FY books worksheet (outward, ITC, HSN) — not GSTN portal filing.",
            to: "/admin/accounting/reports/gstr-9",
            icon: <Receipt size={20} />,
            accent: a.deep,
          },
          {
            title: "CMP-08 composition (Worksheet)",
            description: "Quarterly composition tax books worksheet — not GSTN portal filing.",
            to: "/admin/accounting/reports/cmp-08",
            icon: <Receipt size={20} />,
            accent: a.green,
          },
          {
            title: "TDS register",
            description: "Purchase + salary (u/s 192) TDS deductions by section (books).",
            to: "/admin/accounting/reports/tds-register",
            icon: <Receipt size={20} />,
            accent: a.amber,
          },
          {
            title: "Form 24Q (Worksheet)",
            description: "Quarterly salary TDS u/s 192 annexure — books only, not TRACES / full payroll.",
            to: "/admin/accounting/reports/form-24q",
            icon: <Receipt size={20} />,
            accent: a.amber,
          },
          {
            title: "Form 26Q (Worksheet)",
            description: "Quarterly TDS annexure for resident deductees — books only, not TRACES filing.",
            to: "/admin/accounting/reports/form-26q",
            icon: <Receipt size={20} />,
            accent: a.amber,
          },
          {
            title: "Form 27Q (Worksheet)",
            description: "Quarterly TDS annexure for non-resident deductees — books only, not TRACES (≠ 27EQ).",
            to: "/admin/accounting/reports/form-27q",
            icon: <Receipt size={20} />,
            accent: a.amber,
          },
          {
            title: "TCS register",
            description: "Invoice TCS collected by section (books).",
            to: "/admin/accounting/reports/tcs-register",
            icon: <Receipt size={20} />,
            accent: a.blue,
          },
          {
            title: "Form 27EQ (Worksheet)",
            description: "Quarterly TCS annexure from invoices — books only, not TRACES filing.",
            to: "/admin/accounting/reports/form-27eq",
            icon: <Receipt size={20} />,
            accent: a.blue,
          },
          {
            title: "ITC reversal",
            description: "GSTR-3B 4(B) Rule 42/43 / other manual reversals.",
            to: "/admin/accounting/reports/itc-reversal",
            icon: <Receipt size={20} />,
            accent: a.deep,
          },
          {
            title: "MSME payables",
            description: "45-day unpaid bills for MSME / Udyam suppliers.",
            to: "/admin/accounting/reports/msme-payables",
            icon: <Receipt size={20} />,
            accent: a.amber,
          },
          {
            title: "Form 26AS (Stub)",
            description:
              "Import TDS/TCS rows and match to purchase + salary TDS + invoice TCS — stub, not live AIS/Form 26AS.",
            to: "/admin/accounting/reports/form-26as",
            icon: <Receipt size={20} />,
            accent: a.cyan,
          },
          {
            title: "Advance tax",
            description:
              "FY instalments, year-end setoff, and 234B/C interest estimate/provision (books; not OLTAS/ITR).",
            to: "/admin/accounting/reports/advance-tax",
            icon: <Receipt size={20} />,
            accent: a.green,
          },
          {
            title: "Self-assessment tax",
            description:
              "Settle remaining tax + interest 234B/C payable after setoff/provision (Dr TAX_PAYABLE / Cr BANK) — books only.",
            to: "/admin/accounting/reports/self-assessment-tax",
            icon: <Receipt size={20} />,
            accent: a.green,
          },
          {
            title: "TDS/TCS deposit challans",
            description: "BSR + line map + GL settle (TDS/TCS payable → bank) — books only.",
            to: "/admin/accounting/reports/tax-deposit-challans",
            icon: <Receipt size={20} />,
            accent: a.amber,
          },
          {
            title: "IT WDV schedule",
            description: "Income-tax block WDV worksheet — books only, not ITR Schedule DPM.",
            to: "/admin/accounting/reports/it-wdv",
            icon: <Receipt size={20} />,
            accent: a.green,
          },
          {
            title: "Books vs IT depreciation",
            description:
              "Cl. 13/18 IT block dep vs books SLM difference — reconciliation only, not Schedule DPM / Form 3CD.",
            to: "/admin/accounting/reports/books-vs-it-depreciation",
            icon: <Receipt size={20} />,
            accent: a.green,
          },
          {
            title: "Clause 34 TDS/TCS",
            description:
              "Cl. 34(a) deducted vs challan deposit by 24Q/26Q/27Q/27EQ — books only, not TRACES / Form 3CD.",
            to: "/admin/accounting/reports/clause-34-tds",
            icon: <Receipt size={20} />,
            accent: a.amber,
          },
          {
            title: "Tax-audit classification",
            description:
              "Expense + income tax class + putative §40A(3)/§43B(h)/§40(a)(ia)/§40(a)(i) totals — books only, not Form 3CD.",
            to: "/admin/accounting/reports/tax-audit-classification",
            icon: <Receipt size={20} />,
            accent: a.cyan,
          },
          {
            title: "Tax-audit pack",
            description:
              "Form 3CD–style clause index into books worksheets — not e-filing / UDIN.",
            to: "/admin/accounting/reports/tax-audit-pack",
            icon: <Receipt size={20} />,
            accent: a.cyan,
          },
          {
            title: "Clause 21(a) inadmissible",
            description:
              "Tax-class DISALLOWABLE/PERSONAL/CAPITAL schedule + statutory worksheet links — not Form 3CD.",
            to: "/admin/accounting/reports/clause-21a-inadmissible",
            icon: <Receipt size={20} />,
            accent: a.amber,
          },
          {
            title: "Cash expense disallowance",
            description:
              "§40A(3) cash / petty-cash above ₹10,000 per day+payee (Rule 6DD tags exclude) — books worksheet, not Form 3CD.",
            to: "/admin/accounting/reports/cash-expense-disallowance",
            icon: <Receipt size={20} />,
            accent: a.amber,
          },
          {
            title: "MSME §43B(h) disallowance",
            description:
              "Unpaid MSME purchases past 45 days from purchase date — books worksheet, not Form 3CD.",
            to: "/admin/accounting/reports/msme-43bh-disallowance",
            icon: <Receipt size={20} />,
            accent: a.amber,
          },
          {
            title: "§43B statutory dues",
            description:
              "Unpaid bonus/PF/ESI etc. by category nature tag — books worksheet, not Form 3CD / payroll.",
            to: "/admin/accounting/reports/section-43b-disallowance",
            icon: <Receipt size={20} />,
            accent: a.amber,
          },
          {
            title: "§40A(2) related-party payments",
            description:
              "Related-party payments disclosure + optional FMV excess tags — books worksheet, not Form 3CD / AO opinion.",
            to: "/admin/accounting/reports/section-40a-2-related-party",
            icon: <Receipt size={20} />,
            accent: a.amber,
          },
          {
            title: "§36(1)(va) employee PF/ESI",
            description:
              "Employee PF/ESI on salary lines undeposited or late vs due-date proxy — not EPFO/ESIC / Form 3CD.",
            to: "/admin/accounting/reports/section-36-1-va-disallowance",
            icon: <Receipt size={20} />,
            accent: a.amber,
          },
          {
            title: "§40(a)(ia) TDS disallowance",
            description:
              "Resident TDS non-deduction / non-deposit (30% of taxable) — books worksheet, not Form 3CD.",
            to: "/admin/accounting/reports/section-40a-ia-disallowance",
            icon: <Receipt size={20} />,
            accent: a.amber,
          },
          {
            title: "§40(a)(i) NR TDS disallowance",
            description:
              "Non-resident TDS non-deduction / non-deposit (100% of taxable) — books worksheet, not Form 3CD.",
            to: "/admin/accounting/reports/section-40a-i-disallowance",
            icon: <Receipt size={20} />,
            accent: a.amber,
          },
        ],
      },
      {
        title: "Planning & Controls",
        eyebrow: "Budgets, dimensions, assets",
        items: [
          {
            title: "Budgets",
            description: "Plan and track departmental budgets.",
            to: "/admin/accounting/budgets",
            icon: <Wallet size={20} />,
            accent: a.green,
          },
          {
            title: "Cost Centers",
            description: "Allocate costs across business units.",
            to: "/admin/accounting/cost-centers",
            icon: <Briefcase size={20} />,
            accent: a.amber,
          },
          {
            title: "Projects",
            description: "Track project-level financials.",
            to: "/admin/accounting/projects",
            icon: <FolderKanban size={20} />,
            accent: a.blue,
          },
          {
            title: "Fixed Assets",
            description: "Register and depreciate fixed assets.",
            to: "/admin/accounting/fixed-assets",
            icon: <Layers size={20} />,
            accent: a.navy,
          },
          {
            title: "Approvals Queue",
            description: "Review and approve pending documents.",
            to: "/admin/accounting/approvals",
            icon: <ClipboardCheck size={20} />,
            accent: a.mix,
          },
        ],
      },
    ],
  },

  ai: {
    key: "ai",
    path: "/admin/menus/ai",
    title: "AI",
    description: "AI-assisted extractions, settings, and automation tools.",
    sections: [
      {
        title: "AI Tools",
        eyebrow: "Smart assistants",
        items: [
          {
            title: "Extractions",
            description: "Review AI-extracted bills and documents.",
            to: "/admin/ai/extractions",
            icon: <Sparkles size={20} />,
            accent: a.blue,
          },
          {
            title: "AI Settings",
            description: "Configure AI providers and usage options.",
            to: "/admin/settings/ai",
            icon: <Settings size={20} />,
            accent: a.navy,
          },
        ],
      },
    ],
  },

  team: {
    key: "team",
    path: "/admin/menus/team",
    title: "Roles & Permissions",
    description: "Manage users, roles, access control, and activity audit trails.",
    sections: [
      {
        title: "Access Control",
        eyebrow: "People and permissions",
        items: [
          {
            title: "Users",
            description: "Invite and manage team members.",
            to: "/admin/users",
            icon: <Users size={20} />,
            accent: a.blue,
          },
          {
            title: "Roles & Permissions",
            description: "Define roles and module-level access.",
            to: "/admin/roles",
            icon: <ClipboardCheck size={20} />,
            accent: a.deep,
          },
          {
            title: "Activity Log",
            description: "Audit who did what across the workspace.",
            to: "/admin/activity-log",
            icon: <Activity size={20} />,
            accent: a.navy,
          },
        ],
      },
    ],
  },

  reports: {
    key: "reports",
    path: "/admin/menus/reports",
    title: "Reports",
    description:
      "Transaction, accounting, and inventory reports for deeper analysis.",
    sections: [
      {
        title: "Transaction Reports",
        eyebrow: "Sales and purchase history",
        items: [
          {
            title: "Sales",
            description: "Invoice and sales performance report.",
            to: "/admin/reports/sales",
            icon: <Receipt size={20} />,
            accent: a.blue,
          },
          {
            title: "Sales Return",
            description: "Credit notes and sales return analysis.",
            to: "/admin/reports/sales-return",
            icon: <RotateCw size={20} />,
            accent: a.rose,
          },
          {
            title: "Purchase",
            description: "Purchase bills and spend analysis.",
            to: "/admin/reports/purchase",
            icon: <ShoppingBag size={20} />,
            accent: a.deep,
          },
          {
            title: "Purchase Order",
            description: "Open and closed purchase order report.",
            to: "/admin/reports/purchase-order",
            icon: <FileText size={20} />,
            accent: a.cyan,
          },
          {
            title: "Purchase Return",
            description: "Debit notes and purchase return report.",
            to: "/admin/reports/purchase-return",
            icon: <Truck size={20} />,
            accent: a.amber,
          },
          {
            title: "Quotation",
            description: "Quotation pipeline and conversion report.",
            to: "/admin/reports/quotation",
            icon: <FileText size={20} />,
            accent: a.navy,
          },
        ],
      },
      {
        title: "Accounting Reports",
        eyebrow: "Income and expense",
        items: [
          {
            title: "Income",
            description: "Income summary across documents.",
            to: "/admin/reports/income",
            icon: <BarChart2 size={20} />,
            accent: a.green,
          },
          {
            title: "Expense",
            description: "Expense summary by category and period.",
            to: "/admin/reports/expense",
            icon: <CircleDollarSign size={20} />,
            accent: a.rose,
          },
        ],
      },
      {
        title: "Inventory Reports",
        eyebrow: "Stock health",
        items: [
          {
            title: "Inventory",
            description: "Stock levels, valuation, and movement.",
            to: "/admin/reports/inventory",
            icon: <Warehouse size={20} />,
            accent: a.blue,
          },
          {
            title: "Low Stock",
            description: "Items approaching reorder thresholds.",
            to: "/admin/reports/low-stock",
            icon: <Boxes size={20} />,
            accent: a.amber,
          },
          {
            title: "Out of Stock",
            description: "Unavailable items that need restocking.",
            to: "/admin/reports/out-of-stock",
            icon: <Package size={20} />,
            accent: a.rose,
          },
        ],
      },
    ],
  },

  settings: {
    key: "settings",
    path: "/admin/menus/settings",
    title: "Settings & Configurations",
    description:
      "Company profile, localization, email, finance setup, gateways, and module defaults.",
    sections: [
      {
        title: "General & Website",
        eyebrow: "Profile and company",
        items: [
          {
            title: "Account / Profile",
            description: "Update your personal account details.",
            to: "/admin/settings/profile",
            icon: <Settings2 size={20} />,
            accent: a.blue,
          },
          {
            title: "Company Settings",
            description: "Logo, address, GSTIN, and company profile.",
            to: "/admin/settings/company-settings",
            icon: <Globe size={20} />,
            accent: a.deep,
          },
          {
            title: "Localization",
            description: "Date, currency, timezone, and language.",
            to: "/admin/settings/localization",
            icon: <Globe size={20} />,
            accent: a.cyan,
          },
        ],
      },
      {
        title: "System",
        eyebrow: "Email and communication",
        items: [
          {
            title: "Email Settings",
            description: "SMTP and outgoing email configuration.",
            to: "/admin/settings/email-settings",
            icon: <Cpu size={20} />,
            accent: a.navy,
          },
          {
            title: "Email Templates",
            description: "Customize transactional email templates.",
            to: "/admin/settings/email-templates",
            icon: <FileText size={20} />,
            accent: a.blue,
          },
          {
            title: "Signatures",
            description: "Manage document signature blocks.",
            to: "/admin/settings/signatures",
            icon: <FileCheck size={20} />,
            accent: a.green,
          },
          {
            title: "Messaging (WhatsApp)",
            description: "Configure WhatsApp delivery — provider send may be stub / wa.me fallback.",
            to: "/admin/settings/messaging",
            icon: <MessageCircle size={20} />,
            accent: a.mix,
          },
          {
            title: "AI Settings",
            description: "Enable and configure AI features.",
            to: "/admin/settings/ai",
            icon: <Sparkles size={20} />,
            accent: a.cyan,
          },
          {
            title: "API Documentation",
            description: "Generate API keys and open the developer reference.",
            to: "/admin/api-docs",
            icon: <KeyRound size={20} />,
            accent: a.blue,
          },
        ],
      },
      {
        title: "Finance Settings",
        eyebrow: "Tax, banks, and ledgers",
        items: [
          {
            title: "Bank Accounts",
            description: "Add and manage company bank accounts.",
            to: "/admin/settings/bank-accounts",
            icon: <Landmark size={20} />,
            accent: a.blue,
          },
          {
            title: "Tax Rates",
            description: "Configure GST and other tax rates.",
            to: "/admin/settings/tax-rates",
            icon: <Percent size={20} />,
            accent: a.amber,
          },
          {
            title: "TCS rates",
            description: "India TCS sections for sales invoices.",
            to: "/admin/settings/tcs-rates",
            icon: <Percent size={20} />,
            accent: a.cyan,
          },
          {
            title: "TDS rates",
            description: "India TDS sections for purchases.",
            to: "/admin/settings/tds-rates",
            icon: <Percent size={20} />,
            accent: a.amber,
          },
          {
            title: "GST compliance",
            description: "E-invoice and e-way providers (ClearTax, Masters India, mock).",
            to: "/admin/settings/gst-compliance",
            icon: <Percent size={20} />,
            accent: a.cyan,
          },
          {
            title: "Tax Groups",
            description: "Group tax rates for documents.",
            to: "/admin/settings/tax-groups",
            icon: <Layers size={20} />,
            accent: a.deep,
          },
          {
            title: "Currencies",
            description: "Multi-currency setup and exchange.",
            to: "/admin/settings/currencies",
            icon: <CircleDollarSign size={20} />,
            accent: a.green,
          },
          {
            title: "Ledger Setup",
            description: "Map default accounts for modules.",
            to: "/admin/settings/ledger-setup",
            icon: <BookOpen size={20} />,
            accent: a.navy,
          },
          {
            title: "Document Defaults",
            description: "Default terms, notes, and document options.",
            to: "/admin/settings/document-defaults",
            icon: <FileText size={20} />,
            accent: a.cyan,
          },
        ],
      },
      {
        title: "Integrations & Modules",
        eyebrow: "Gateways and module defaults",
        items: [
          {
            title: "Payment Gateways",
            description: "Razorpay, Stripe, and payment providers.",
            to: "/admin/settings/payment-gateways",
            icon: <CreditCard size={20} />,
            accent: a.blue,
          },
          {
            title: "Accounting Integrations (Stub)",
            description: "Xero / QuickBooks connect UI — stub, not live two-way sync.",
            to: "/admin/settings/accounting-integrations",
            icon: <Link2 size={20} />,
            accent: a.deep,
          },
          {
            title: "Invoice Module",
            description: "Invoice numbering and module preferences.",
            to: "/admin/settings/module-settings/invoice",
            icon: <Receipt size={20} />,
            accent: a.cyan,
          },
          {
            title: "Purchase Module",
            description: "Purchase document defaults and options.",
            to: "/admin/settings/module-settings/purchase",
            icon: <ShoppingBag size={20} />,
            accent: a.amber,
          },
          {
            title: "Purchase Order Module",
            description: "PO numbering and workflow settings.",
            to: "/admin/settings/module-settings/purchase-order",
            icon: <FileText size={20} />,
            accent: a.navy,
          },
          {
            title: "Expense Module",
            description: "Expense categories and module options.",
            to: "/admin/settings/module-settings/expense",
            icon: <CircleDollarSign size={20} />,
            accent: a.rose,
          },
        ],
      },
    ],
  },
};

export function MenuHubPage({ hubKey }: { hubKey: HubKey }) {
  const hub = menuHubs[hubKey];
  return (
    <MenuHub title={hub.title} description={hub.description} sections={hub.sections} />
  );
}

export type SearchablePage = {
  id: string;
  title: string;
  description: string;
  to: string;
  hub: string;
  section: string;
};

/** Flat index of hub pages + all nested menu shortcuts for header search. */
export function getSearchablePages(): SearchablePage[] {
  const pages: SearchablePage[] = [];
  const seen = new Set<string>();

  for (const hub of Object.values(menuHubs)) {
    const hubId = `hub:${hub.path}`;
    if (!seen.has(hub.path)) {
      seen.add(hub.path);
      pages.push({
        id: hubId,
        title: hub.title,
        description: hub.description,
        to: hub.path,
        hub: hub.title,
        section: "Menu Hub",
      });
    }

    for (const section of hub.sections) {
      for (const item of section.items) {
        const key = `${item.to}|${item.title}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pages.push({
          id: key,
          title: item.title,
          description: item.description,
          to: item.to,
          hub: hub.title,
          section: section.title,
        });
      }
    }
  }

  return pages;
}

