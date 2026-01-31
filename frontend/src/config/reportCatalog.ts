import {
  DollarSign, ShoppingBag, Tag, MapPin, CreditCard,
  Receipt, Percent, RotateCcw, Coins,
  Clock, Target, ShoppingCart, Footprints,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type ReportCategory = 'sales' | 'financial' | 'operational'

export interface ReportDefinition {
  slug: string
  title: string
  description: string
  category: ReportCategory
  icon: LucideIcon
  status: 'available' | 'available'
  accentColor: string
  permissionKey: string
  adminOnly?: boolean
}

export const REPORT_CATEGORIES: Record<ReportCategory, { label: string; description: string; color: string }> = {
  sales: {
    label: 'Sales Reports',
    description: 'Revenue, products, and transaction analysis',
    color: '#8b5cf6',
  },
  financial: {
    label: 'Financial Reports',
    description: 'Tax, discounts, refunds, and tips',
    color: '#10b981',
  },
  operational: {
    label: 'Operational Reports',
    description: 'Patterns, budgets, and basket analysis',
    color: '#f59e0b',
  },
}

export const REPORTS: ReportDefinition[] = [
  // --- Sales Reports ---
  {
    slug: 'daily-sales-summary',
    title: 'Daily Sales Summary',
    description: 'Day-by-day breakdown with gross sales, transaction counts, and average order values.',
    category: 'sales',
    icon: DollarSign,
    status: 'available',
    accentColor: '#8b5cf6',
    permissionKey: 'report:daily_sales_summary',
  },
  {
    slug: 'sales-by-product',
    title: 'Sales by Product / SKU',
    description: 'Detailed product-level performance showing units sold, revenue, and average selling price.',
    category: 'sales',
    icon: ShoppingBag,
    status: 'available',
    accentColor: '#8b5cf6',
    permissionKey: 'report:sales_by_product',
  },
  {
    slug: 'sales-by-category',
    title: 'Sales by Category',
    description: 'Category-level breakdown of sales volume and revenue contribution.',
    category: 'sales',
    icon: Tag,
    status: 'available',
    accentColor: '#8b5cf6',
    permissionKey: 'report:sales_by_category',
  },
  {
    slug: 'sales-by-location',
    title: 'Sales by Location',
    description: 'Compare performance across all your store locations side by side.',
    category: 'sales',
    icon: MapPin,
    status: 'available',
    accentColor: '#8b5cf6',
    permissionKey: 'report:sales_by_location',
  },
  {
    slug: 'sales-by-payment-method',
    title: 'Sales by Payment Method',
    description: 'CARD vs CASH split with breakdown by tender type and percentage share.',
    category: 'sales',
    icon: CreditCard,
    status: 'available',
    accentColor: '#8b5cf6',
    permissionKey: 'report:sales_by_payment_method',
  },
  // --- Financial Reports ---
  {
    slug: 'tax-report',
    title: 'Tax Report',
    description: 'Tax collected summary broken down by day and location for filing purposes.',
    category: 'financial',
    icon: Receipt,
    status: 'available',
    accentColor: '#10b981',
    permissionKey: 'report:tax_report',
  },
  {
    slug: 'discount-report',
    title: 'Discount Report',
    description: 'All discounts applied, broken down by day and location, with discount-to-sales ratio.',
    category: 'financial',
    icon: Percent,
    status: 'available',
    accentColor: '#10b981',
    permissionKey: 'report:discount_report',
  },
  {
    slug: 'refund-report',
    title: 'Refund Report',
    description: 'Detailed refund analysis with refund rate trends and amounts by location.',
    category: 'financial',
    icon: RotateCcw,
    status: 'available',
    accentColor: '#10b981',
    permissionKey: 'report:refund_report',
  },
  {
    slug: 'tips-report',
    title: 'Tips Report',
    description: 'Tips received broken down by day, location, and payment method.',
    category: 'financial',
    icon: Coins,
    status: 'available',
    accentColor: '#10b981',
    permissionKey: 'report:tips_report',
  },
  // --- Operational Reports ---
  {
    slug: 'hourly-sales-pattern',
    title: 'Hourly Sales Pattern',
    description: 'Peak hour analysis showing sales volume, transaction count, and items sold by hour of day.',
    category: 'operational',
    icon: Clock,
    status: 'available',
    accentColor: '#f59e0b',
    permissionKey: 'report:hourly_sales_pattern',
  },
  {
    slug: 'budget-vs-actual',
    title: 'Budget vs Actual',
    description: 'Budget performance report comparing targets against actual sales by location.',
    category: 'operational',
    icon: Target,
    status: 'available',
    accentColor: '#f59e0b',
    permissionKey: 'report:budget_vs_actual',
  },
  {
    slug: 'basket-analysis',
    title: 'Basket Analysis',
    description: 'Average order value, items per order, and basket size trends over time.',
    category: 'operational',
    icon: ShoppingCart,
    status: 'available',
    accentColor: '#f59e0b',
    permissionKey: 'report:basket_analysis',
  },
  {
    slug: 'footfall-metrics',
    title: 'Footfall & Conversion',
    description: 'Footfall counts, conversion rates, and sales-per-visitor metrics by location.',
    category: 'operational',
    icon: Footprints,
    status: 'available',
    accentColor: '#f59e0b',
    permissionKey: 'report:footfall_metrics',
  },
]
