"""
Exchange Rate Service
Reads manually-managed exchange rates from the database.
All conversions target GBP as the base currency.

Admin enters: rate = 0.85 means "1 EUR = 0.85 GBP".
This rate is stored directly and used as the multiplier to convert to GBP.
"""
import logging
from typing import Dict, Tuple
from uuid import UUID

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def _query_rates(db: Session, org_id: UUID):
    """Query exchange rates, returning empty list if table doesn't exist yet."""
    try:
        from app.models.exchange_rate import ExchangeRate
        return db.query(ExchangeRate).filter(
            ExchangeRate.organization_id == org_id,
            ExchangeRate.to_currency == "GBP",
        ).all()
    except Exception:
        logger.debug("exchange_rates table not available yet")
        db.rollback()
        return []


class ExchangeRateService:

    def get_gbp_based_rates(self, db: Session, org_id: UUID) -> Tuple[Dict[str, float], bool]:
        """Return GBP-based rates dict and whether rates are available.

        Returns dict where rates[X] = units of X per 1 GBP.
        Admin stores rate as "1 X = rate GBP", so gbp_to_X = 1 / rate.

        Returns (rates, has_rates).
        """
        rows = _query_rates(db, org_id)

        if not rows:
            return {}, False

        rates = {"GBP": 1.0}
        for row in rows:
            # row.rate = how many GBP you get for 1 unit of from_currency
            # gbp_based format: units of X per 1 GBP = 1 / row.rate
            if row.rate and row.rate != 0:
                rates[row.from_currency] = 1.0 / row.rate
            else:
                rates[row.from_currency] = 1.0

        return rates, True

    def get_rate(self, db: Session, org_id: UUID, from_currency: str, to_currency: str) -> float:
        """Get exchange rate from_currency -> to_currency."""
        if from_currency == to_currency:
            return 1.0

        rates, _ = self.get_gbp_based_rates(db, org_id)
        if not rates:
            return 1.0

        from_rate = rates.get(from_currency, 1.0)
        to_rate = rates.get(to_currency, 1.0)

        if from_rate == 0:
            return 1.0

        return to_rate / from_rate

    def convert(self, db: Session, org_id: UUID, amount_cents: int, from_currency: str, to_currency: str) -> int:
        """Convert amount in cents/minor units from one currency to another."""
        rate = self.get_rate(db, org_id, from_currency, to_currency)
        return round(amount_cents * rate)

    def get_rates_to_gbp(self, db: Session, org_id: UUID, currencies: set) -> Tuple[Dict[str, float], bool]:
        """Return {currency: rate_to_gbp} for all requested currencies.

        rate_to_gbp is the multiplier: gbp_amount = foreign_amount * rate_to_gbp.
        The admin enters this value directly (e.g. 0.85 for EUR).

        Returns (rate_dict, has_rates).
        """
        rows = _query_rates(db, org_id)

        rate_map = {row.from_currency: row.rate for row in rows}
        has_rates = len(rate_map) > 0

        result = {}
        for curr in currencies:
            if curr == "GBP":
                result[curr] = 1.0
            elif curr in rate_map:
                result[curr] = rate_map[curr]
            else:
                # No rate configured for this currency — use 1.0 as fallback
                result[curr] = 1.0

        return result, has_rates


# Singleton
exchange_rate_service = ExchangeRateService()
