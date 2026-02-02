"""
Permission registry — single source of truth for all permission keys, labels,
categories, and per-role defaults.
"""

ALL_PERMISSIONS = {
    # Pages
    "page:analytics":       {"label": "Analytics Page",       "category": "pages"},
    "page:sales":           {"label": "Sales Page",           "category": "pages"},
    "page:reports":         {"label": "Reports Page",         "category": "pages"},
    "page:budgets":         {"label": "Budgets Page",         "category": "pages"},
    "page:admin":           {"label": "Admin Page",           "category": "pages"},
    "page:square_accounts": {"label": "Square Accounts Page", "category": "pages"},
    "page:footfall":        {"label": "Footfall Page",        "category": "pages"},

    # Reports
    "report:daily_sales_summary":     {"label": "Daily Sales Summary",     "category": "reports"},
    "report:sales_by_product":        {"label": "Sales by Product / SKU",  "category": "reports"},
    "report:sales_by_category":       {"label": "Sales by Category",       "category": "reports"},
    "report:sales_by_location":       {"label": "Sales by Location",       "category": "reports"},
    "report:sales_by_payment_method": {"label": "Sales by Payment Method", "category": "reports"},
    "report:tax_report":              {"label": "Tax Report",              "category": "reports"},
    "report:discount_report":         {"label": "Discount Report",         "category": "reports"},
    "report:refund_report":           {"label": "Refund Report",           "category": "reports"},
    "report:tips_report":             {"label": "Tips Report",             "category": "reports"},
    "report:hourly_sales_pattern":    {"label": "Hourly Sales Pattern",    "category": "reports"},
    "report:budget_vs_actual":        {"label": "Budget vs Actual",        "category": "reports"},
    "report:basket_analysis":         {"label": "Basket Analysis",         "category": "reports"},
    "report:footfall_metrics":        {"label": "Footfall & Conversion",  "category": "reports"},

    # Features
    "feature:export_excel":        {"label": "Export to Excel",      "category": "features"},
    "feature:manage_budgets":      {"label": "Manage Budgets",       "category": "features"},
    "feature:manage_footfall":     {"label": "Manage Footfall",      "category": "features"},
    "feature:view_sales_by_client": {"label": "View Sales by Client", "category": "features"},
}

CONFIGURABLE_ROLES = ["manager", "store_manager", "reporting", "client"]
FULL_ACCESS_ROLES = ["admin", "superadmin"]

# Defaults: role -> set of granted permission keys
DEFAULT_PERMISSIONS = {
    "manager": {
        "page:analytics", "page:sales", "page:reports", "page:budgets",
        "report:daily_sales_summary", "report:sales_by_product", "report:sales_by_category",
        "report:sales_by_location", "report:sales_by_payment_method",
        "report:tax_report", "report:discount_report", "report:refund_report",
        "report:tips_report", "report:hourly_sales_pattern", "report:budget_vs_actual",
        "report:basket_analysis", "report:footfall_metrics",
        "feature:export_excel", "feature:manage_budgets", "feature:manage_footfall",
        "feature:view_sales_by_client", "page:footfall",
    },
    "store_manager": {
        "page:analytics", "page:sales", "page:reports",
        "report:daily_sales_summary", "report:sales_by_product", "report:sales_by_category",
        "report:sales_by_location", "report:sales_by_payment_method",
        "report:tax_report", "report:discount_report", "report:refund_report",
        "report:tips_report", "report:hourly_sales_pattern",
        "report:basket_analysis", "report:footfall_metrics",
        "feature:export_excel", "feature:manage_footfall",
        "page:footfall",
    },
    "reporting": {
        "page:analytics", "page:sales", "page:reports", "page:footfall",
        "report:daily_sales_summary", "report:sales_by_product", "report:sales_by_category",
        "report:sales_by_location", "report:sales_by_payment_method",
        "report:tax_report", "report:discount_report", "report:refund_report",
        "report:tips_report", "report:hourly_sales_pattern",
        "report:basket_analysis",
        "feature:export_excel",
    },
    "client": {
        "page:analytics", "page:sales", "page:reports",
        "report:daily_sales_summary", "report:sales_by_product", "report:sales_by_category",
        "report:sales_by_location",
        "report:basket_analysis",
    },
}
