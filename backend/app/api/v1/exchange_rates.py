"""
Exchange Rates API Endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.user import User
from app.models.exchange_rate import ExchangeRate
from app.schemas.exchange_rate import (
    ExchangeRateCreate,
    ExchangeRateUpdate,
    ExchangeRateResponse,
    ExchangeRateList,
)

router = APIRouter(prefix="/exchange-rates", tags=["exchange-rates"])


@router.get("", response_model=ExchangeRateList)
async def list_exchange_rates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all exchange rates for the organization."""
    rates = db.query(ExchangeRate).filter(
        ExchangeRate.organization_id == current_user.organization_id
    ).order_by(ExchangeRate.from_currency).all()

    rates_data = []
    for r in rates:
        updater_name = r.updater.full_name if r.updater else None
        rates_data.append(ExchangeRateResponse(
            id=str(r.id),
            from_currency=r.from_currency,
            to_currency=r.to_currency,
            rate=r.rate,
            updated_at=r.updated_at,
            updated_by_name=updater_name,
        ))

    return ExchangeRateList(rates=rates_data)


@router.post("", response_model=ExchangeRateResponse, status_code=status.HTTP_201_CREATED)
async def create_exchange_rate(
    data: ExchangeRateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "superadmin"])),
):
    """Create a new exchange rate (Admin only)."""
    from_currency = data.from_currency.upper().strip()

    # Check for duplicate
    existing = db.query(ExchangeRate).filter(
        ExchangeRate.organization_id == current_user.organization_id,
        ExchangeRate.from_currency == from_currency,
        ExchangeRate.to_currency == "GBP",
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Exchange rate for {from_currency} -> GBP already exists. Use PUT to update.",
        )

    rate = ExchangeRate(
        organization_id=current_user.organization_id,
        from_currency=from_currency,
        to_currency="GBP",
        rate=data.rate,
        updated_by=current_user.id,
    )
    db.add(rate)
    db.commit()
    db.refresh(rate)

    return ExchangeRateResponse(
        id=str(rate.id),
        from_currency=rate.from_currency,
        to_currency=rate.to_currency,
        rate=rate.rate,
        updated_at=rate.updated_at,
        updated_by_name=current_user.full_name,
    )


@router.put("/{rate_id}", response_model=ExchangeRateResponse)
async def update_exchange_rate(
    rate_id: str,
    data: ExchangeRateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "superadmin"])),
):
    """Update an exchange rate (Admin only)."""
    rate = db.query(ExchangeRate).filter(
        ExchangeRate.id == rate_id,
        ExchangeRate.organization_id == current_user.organization_id,
    ).first()

    if not rate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exchange rate not found",
        )

    rate.rate = data.rate
    rate.updated_by = current_user.id
    db.commit()
    db.refresh(rate)

    return ExchangeRateResponse(
        id=str(rate.id),
        from_currency=rate.from_currency,
        to_currency=rate.to_currency,
        rate=rate.rate,
        updated_at=rate.updated_at,
        updated_by_name=current_user.full_name,
    )


@router.delete("/{rate_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_exchange_rate(
    rate_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "superadmin"])),
):
    """Delete an exchange rate (Admin only)."""
    rate = db.query(ExchangeRate).filter(
        ExchangeRate.id == rate_id,
        ExchangeRate.organization_id == current_user.organization_id,
    ).first()

    if not rate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exchange rate not found",
        )

    db.delete(rate)
    db.commit()
    return None
