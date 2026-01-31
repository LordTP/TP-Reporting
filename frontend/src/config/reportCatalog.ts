import {
  DollarSign, ShoppingBag, Tag, MapPin, CreditCard,
  Receipt, Percent, RotateCcw, Coins,
  Clock, Target, ShoppingCart,
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
  },
  {
    slug: 'sales-by-product',
    title: 'Sales by Product / SKU',
    description: 'Detailed product-level performance showing units sold, revenue, and average selling price.',
    category: 'sales',
    icon: ShoppingBag,
    status: 'available',
    accentColor: '#8b5cf6',
  },
  {
    slug: 'sales-by-category',
    title: 'Sales by Category',
    description: 'Category-level breakdown of sales volume and revenue contribution.',
    category: 'sales',
    icon: Tag,
    status: 'available',
    accentColor: '#8b5cf6',
  },
  {
    slug: 'sales-by-location',
    title: 'Sales by Location',
    description: 'Compare performance across all your store locations side by side.',
    category: 'sales',
    icon: MapPin,
    status: 'available',
    accentColor: '#8b5cf6',
  },
  {
    slug: 'sales-by-payment-method',
    title: 'Sales by Payment Method',
    description: 'CARD vs CASH split with breakdown by tender type and percentage share.',
    category: 'sales',
    icon: CreditCard,
    status: 'available',
    accentColor: '#8b5cf6',
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
  },
  {
    slug: 'discount-report',
    title: 'Discount Report',
    description: 'All discounts applied, broken down by day and location, with discount-to-sales ratio.',
    category: 'financial',
    icon: Percent,
    status: 'available',
    accentColor: '#10b981',
  },
  {
    slug: 'refund-report',
    title: 'Refund Report',
    description: 'Detailed refund analysis with refund rate trends and amounts by location.',
    category: 'financial',
    icon: RotateCcw,
    status: 'available',
    accentColor: '#10b981',
  },
  {
    slug: 'tips-report',
    title: 'Tips Report',
    description: 'Tips received broken down by day, location, and payment method.',
    category: 'financial',
    icon: Coins,
    status: 'available',
    accentColor: '#10b981',
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
  },
  {
    slug: 'budget-vs-actual',
    title: 'Budget vs Actual',
    description: 'Budget performance report comparing targets against actual sales by location.',
    category: 'operational',
    icon: Target,
    status: 'available',
    accentColor: '#f59e0b',
    adminOnly: true,
  },
  {
    slug: 'basket-analysis',
    title: 'Basket Analysis',
    description: 'Average order value, items per order, and basket size trends over time.',
    category: 'operational',
    icon: ShoppingCart,
    status: 'available',
    accentColor: '#f59e0b',
  },
]
