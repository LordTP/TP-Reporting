"""
Sales Transaction Schemas
"""
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from pydantic import BaseModel, Field, field_serializer
from uuid import UUID


class SalesTransactionBase(BaseModel):
    """Base sales transaction schema"""
    square_transaction_id: str
    transaction_date: datetime
    amount_money_amount: int
    amount_money_currency: str
    total_money_amount: int
    payment_status: str


class SalesTransactionResponse(SalesTransactionBase):
    """Sales transaction response"""
    id: str
    location_id: str
    location_name: str
    amount_money_usd_equivalent: Optional[int] = None
    total_money_currency: str
    total_discount_amount: int
    total_tax_amount: int
    total_tip_amount: int
    tender_type: Optional[str] = None
    card_brand: Optional[str] = None
    last_4: Optional[str] = None
    customer_id: Optional[str] = None
    has_refund: bool
    refund_amount: int = 0
    created_at: datetime

    @field_serializer('id', 'location_id')
    def serialize_uuid(self, value):
        """Convert UUID to string"""
        if isinstance(value, UUID):
            return str(value)
        return value

    class Config:
        from_attributes = True


class SalesTransactionDetail(SalesTransactionResponse):
    """Detailed sales transaction with full data"""
    product_categories: Optional[List[str]] = None
    line_items: Optional[List[Dict[str, Any]]] = None
    raw_data: Dict[str, Any]

    class Config:
        from_attributes = True


class SalesTransactionList(BaseModel):
    """List of sales transactions with pagination"""
    transactions: List[SalesTransactionResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class SalesAggregation(BaseModel):
    """Aggregated sales data"""
    total_sales: int  # Gross sales in smallest currency unit
    total_refunds: int = 0  # Refund amount (positive number representing money returned)
    net_sales: int = 0  # total_sales - total_refunds
    total_transactions: int
    average_transaction: int
    currency: str
    start_date: date
    end_date: date
    by_currency: Optional[List[Dict[str, Any]]] = None
    refunds_by_currency: Optional[List[Dict[str, Any]]] = None
    net_by_currency: Optional[List[Dict[str, Any]]] = None


class SalesFilters(BaseModel):
    """Filters for sales query"""
    location_ids: Optional[List[str]] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    payment_status: Optional[str] = None
    tender_type: Optional[str] = None
    min_amount: Optional[int] = None  # In smallest currency unit
    max_amount: Optional[int] = None
    currency: Optional[str] = None
    page: int = Field(1, ge=1)
    page_size: int = Field(50, ge=1, le=100)
    sort_by: str = Field("transaction_date", pattern="^(transaction_date|amount_money_amount|total_money_amount)$")
    sort_order: str = Field("desc", pattern="^(asc|desc)$")


class SalesSummary(BaseModel):
    """Sales summary for dashboard"""
    total_sales: int
    transaction_count: int
    average_transaction: int
    currency: str
    period_start: date
    period_end: date
    by_tender_type: Dict[str, int]
    by_status: Dict[str, int]
    top_days: List[Dict[str, Any]]
    by_currency: Optional[List[Dict[str, Any]]] = None
