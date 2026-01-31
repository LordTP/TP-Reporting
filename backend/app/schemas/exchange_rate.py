"""
Exchange Rate Schemas
"""
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


class ExchangeRateCreate(BaseModel):
    from_currency: str
    rate: float


class ExchangeRateUpdate(BaseModel):
    rate: float


class ExchangeRateResponse(BaseModel):
    id: str
    from_currency: str
    to_currency: str
    rate: float
    updated_at: datetime
    updated_by_name: Optional[str] = None

    class Config:
        from_attributes = True


class ExchangeRateList(BaseModel):
    rates: List[ExchangeRateResponse]
