"""
Celery tasks for Square data synchronization
"""
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
import uuid
import asyncio

from app.celery_app import celery_app
from app.database import SessionLocal
from app.models.square_account import SquareAccount
from app.models.location import Location
from app.models.data_import import DataImport, ImportStatus
from app.models.sales_transaction import SalesTransaction
from app.services.square_service import square_service


def get_db():
    """Get database session for Celery tasks"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def parse_and_store_order(db: Session, order: Dict[str, Any], locations: List[Location]) -> tuple[bool, bool]:
    """
    Parse Square order data (with line items) and store in sales_transactions table

    Args:
        db: Database session
        order: Square order object
        locations: List of Location objects (to match location_id)

    Returns:
        Tuple of (stored: bool, was_duplicate: bool)
    """
    try:
        order_id = order.get("id")

        # Check if already exists (duplicate check)
        existing = db.query(SalesTransaction).filter(
            SalesTransaction.square_transaction_id == order_id
        ).first()

        if existing:
            return (False, True)  # Not stored, was duplicate

        # Find the matching location
        location_id = order.get("location_id")
        location = next((loc for loc in locations if loc.square_location_id == location_id), None)

        if not location:
            print(f"Location not found for order {order_id}, location_id: {location_id}")
            return (False, False)  # Not stored, not duplicate (error)

        # Parse datetime with timezone
        created_at_str = order.get("created_at", "")
        transaction_date = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))

        # Extract money amounts
        total_money = order.get("total_money", {})
        net_amounts = order.get("net_amounts", {})

        # Get tender information (first tender for payment type)
        tenders = order.get("tenders", [])
        tender_type = None
        card_brand = None
        last_4 = None

        if tenders:
            first_tender = tenders[0]
            tender_type = first_tender.get("type")

            card_details = first_tender.get("card_details", {})
            if card_details:
                card = card_details.get("card", {})
                card_brand = card.get("card_brand")
                last_4 = card.get("last_4")

        # Extract line items with product details
        line_items = order.get("line_items", [])
        line_items_data = []
        product_categories = set()

        for item in line_items:
            item_data = {
                "uid": item.get("uid"),
                "name": item.get("name"),
                "quantity": item.get("quantity"),
                "base_price_money": item.get("base_price_money"),
                "gross_sales_money": item.get("gross_sales_money"),
                "total_money": item.get("total_money"),
                "variation_name": item.get("variation_name"),
                "catalog_object_id": item.get("catalog_object_id"),
                "variation_total_price_money": item.get("variation_total_price_money"),
                "modifiers": item.get("modifiers", []),
            }
            line_items_data.append(item_data)

            # Extract category if available (would need catalog API for full category names)
            if item.get("catalog_object_id"):
                # For now, we'll store the catalog_object_id
                # In Phase 9, we can enhance this with full catalog data
                pass

        # Create transaction record
        transaction = SalesTransaction(
            location_id=location.id,
            square_transaction_id=order_id,
            transaction_date=transaction_date,

            # Money amounts
            amount_money_amount=net_amounts.get("total_money", {}).get("amount", 0),
            amount_money_currency=net_amounts.get("total_money", {}).get("currency", location.currency),
            total_money_amount=total_money.get("amount", 0),
            total_money_currency=total_money.get("currency", location.currency),

            # Additional amounts
            total_discount_amount=order.get("total_discount_money", {}).get("amount", 0),
            total_tax_amount=order.get("total_tax_money", {}).get("amount", 0),
            total_tip_amount=order.get("total_tip_money", {}).get("amount", 0),

            # Payment details
            tender_type=tender_type,
            payment_status=order.get("state", "UNKNOWN"),
            card_brand=card_brand,
            last_4=last_4,

            # Customer
            customer_id=order.get("customer_id"),

            # Product data (line items)
            line_items=line_items_data,
            product_categories=list(product_categories) if product_categories else None,

            # Raw data for future reference
            raw_data=order,
        )

        db.add(transaction)
        db.commit()

        return (True, False)  # Stored, not duplicate

    except IntegrityError:
        db.rollback()
        return (False, True)  # Duplicate transaction ID

    except Exception as e:
        db.rollback()
        print(f"Error storing order {order.get('id')}: {str(e)}")
        import traceback
        traceback.print_exc()
        return (False, False)  # Not stored, not duplicate (error)


def parse_and_store_payment(db: Session, payment: Dict[str, Any], location: Location) -> tuple[bool, bool]:
    """
    Parse Square payment data and store in sales_transactions table

    Args:
        db: Database session
        payment: Square payment object
        location: Location object

    Returns:
        Tuple of (stored: bool, was_duplicate: bool)
    """
    try:
        square_transaction_id = payment.get("id")

        # Check if already exists (duplicate check)
        existing = db.query(SalesTransaction).filter(
            SalesTransaction.square_transaction_id == square_transaction_id
        ).first()

        if existing:
            return (False, True)  # Not stored, was duplicate

        # Extract payment data
        amount_money = payment.get("amount_money", {})
        total_money = payment.get("total_money", {})

        # Parse datetime with timezone
        created_at_str = payment.get("created_at", "")
        transaction_date = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))

        # Get tender information (first tender for simplicity)
        tenders = payment.get("tender", [])
        tender_type = None
        card_brand = None
        last_4 = None

        if tenders:
            first_tender = tenders[0]
            tender_type = first_tender.get("type")

            card_details = first_tender.get("card_details", {})
            if card_details:
                card_brand = card_details.get("card", {}).get("card_brand")
                last_4 = card_details.get("card", {}).get("last_4")

        # Create transaction record
        transaction = SalesTransaction(
            location_id=location.id,
            square_transaction_id=square_transaction_id,
            transaction_date=transaction_date,

            # Money amounts
            amount_money_amount=amount_money.get("amount", 0),
            amount_money_currency=amount_money.get("currency", location.currency),
            total_money_amount=total_money.get("amount", 0),
            total_money_currency=total_money.get("currency", location.currency),

            # Additional amounts
            total_discount_amount=payment.get("total_discount_money", {}).get("amount", 0),
            total_tax_amount=payment.get("total_tax_money", {}).get("amount", 0),
            total_tip_amount=payment.get("total_tip_money", {}).get("amount", 0),

            # Payment details
            tender_type=tender_type,
            payment_status=payment.get("status", "UNKNOWN"),
            card_brand=card_brand,
            last_4=last_4,

            # Customer
            customer_id=payment.get("customer_id"),

            # Raw data for future reference
            raw_data=payment,
        )

        db.add(transaction)
        db.commit()

        return (True, False)  # Stored, not duplicate

    except IntegrityError:
        db.rollback()
        return (False, True)  # Duplicate transaction ID

    except Exception as e:
        db.rollback()
        print(f"Error storing payment {payment.get('id')}: {str(e)}")
        return (False, False)  # Not stored, not duplicate (error)


@celery_app.task(bind=True, max_retries=3)
def sync_square_payments(self, account_id: str, location_ids: Optional[List[str]] = None):
    """
    Sync Square payments for specified locations
    This task runs periodically or can be triggered manually

    Args:
        account_id: Square account UUID
        location_ids: Optional list of location UUIDs to sync. If None, syncs all active locations
    """
    db = next(get_db())

    try:
        # Get Square account
        account = db.query(SquareAccount).filter(
            SquareAccount.id == account_id,
            SquareAccount.is_active == True
        ).first()

        if not account:
            return {"status": "error", "message": "Square account not found or inactive"}

        # Get locations to sync
        query = db.query(Location).filter(
            Location.square_account_id == account_id,
            Location.is_active == True
        )

        if location_ids:
            query = query.filter(Location.id.in_(location_ids))

        locations = query.all()

        if not locations:
            return {"status": "error", "message": "No active locations found"}

        # Determine time range for sync
        # Sync last 7 days to catch any delayed transactions
        end_time = datetime.utcnow()
        start_time = account.last_sync_at if account.last_sync_at else (end_time - timedelta(days=7))

        total_synced = 0
        access_token = square_service.get_decrypted_token(account)

        for location in locations:
            try:
                # Fetch payments from Square API
                cursor = None
                location_synced = 0

                while True:
                    payments_response = asyncio.run(square_service.list_payments(
                        access_token=access_token,
                        location_id=location.square_location_id,
                        begin_time=start_time,
                        end_time=end_time,
                        cursor=cursor
                    ))

                    payments = payments_response.get("payments", [])

                    for payment in payments:
                        stored, _ = parse_and_store_payment(db, payment, location)
                        if stored:
                            location_synced += 1

                    cursor = payments_response.get("cursor")
                    if not cursor:
                        break

                total_synced += location_synced

            except Exception as e:
                # Log error but continue with other locations
                print(f"Error syncing location {location.id}: {str(e)}")
                continue

        # Update last sync time
        account.last_sync_at = end_time
        db.commit()

        # Rebuild daily sales summaries for synced locations
        if total_synced > 0:
            try:
                from app.services.summary_service import rebuild_daily_summaries_for_locations
                loc_ids = [str(loc.id) for loc in locations]
                summaries = rebuild_daily_summaries_for_locations(db, loc_ids)
                print(f"Rebuilt {summaries} daily summaries after sync")
            except Exception as e:
                print(f"Warning: Failed to rebuild daily summaries: {str(e)}")

        return {
            "status": "success",
            "account_id": account_id,
            "locations_synced": len(locations),
            "transactions_synced": total_synced,
            "sync_time": end_time.isoformat()
        }

    except Exception as e:
        db.rollback()
        # Retry on failure
        raise self.retry(exc=e, countdown=60 * (2 ** self.request.retries))

    finally:
        db.close()


@celery_app.task(bind=True, max_retries=3)
def import_historical_data(self, import_id: str, location_ids: Optional[List[str]] = None):
    """
    Import historical Square data for a given date range
    This is a long-running task that processes data in chunks

    Args:
        import_id: DataImport record UUID
        location_ids: Optional list of location UUIDs. If None, imports all locations
    """
    db = next(get_db())

    try:
        # Get import record
        data_import = db.query(DataImport).filter(DataImport.id == import_id).first()

        if not data_import:
            return {"status": "error", "message": "Import record not found"}

        # Update status to in_progress
        data_import.status = ImportStatus.IN_PROGRESS
        data_import.started_at = datetime.utcnow()
        db.commit()

        # Get Square account
        account = db.query(SquareAccount).filter(
            SquareAccount.id == data_import.square_account_id
        ).first()

        if not account:
            data_import.status = ImportStatus.FAILED
            data_import.error_message = "Square account not found"
            data_import.completed_at = datetime.utcnow()
            db.commit()
            return {"status": "error", "message": "Square account not found"}

        # Get locations
        query = db.query(Location).filter(
            Location.square_account_id == account.id,
            Location.is_active == True
        )

        if location_ids:
            query = query.filter(Location.id.in_(location_ids))

        locations = query.all()

        if not locations:
            data_import.status = ImportStatus.FAILED
            data_import.error_message = "No active locations found"
            data_import.completed_at = datetime.utcnow()
            db.commit()
            return {"status": "error", "message": "No active locations found"}

        # Get decrypted access token
        access_token = square_service.get_decrypted_token(account)

        # Split date range into monthly chunks to avoid timeout
        start_date = datetime.combine(data_import.start_date, datetime.min.time())
        end_date = datetime.combine(data_import.end_date, datetime.max.time())

        total_imported = 0
        total_duplicates = 0

        # Process each location
        for location in locations:
            try:
                current_start = start_date

                # Process in monthly chunks
                while current_start < end_date:
                    chunk_end = min(current_start + timedelta(days=30), end_date)

                    cursor = None
                    chunk_imported = 0

                    while True:
                        payments_response = asyncio.run(square_service.list_payments(
                            access_token=access_token,
                            location_id=location.square_location_id,
                            begin_time=current_start,
                            end_time=chunk_end,
                            cursor=cursor
                        ))

                        payments = payments_response.get("payments", [])

                        for payment in payments:
                            stored, is_duplicate = parse_and_store_payment(db, payment, location)
                            if stored:
                                chunk_imported += 1
                            if is_duplicate:
                                total_duplicates += 1

                        # Update progress
                        total_imported += chunk_imported
                        data_import.imported_transactions = total_imported
                        data_import.duplicate_transactions = total_duplicates
                        db.commit()

                        cursor = payments_response.get("cursor")
                        if not cursor:
                            break

                    current_start = chunk_end

            except Exception as e:
                # Log error but continue with other locations
                print(f"Error importing data for location {location.id}: {str(e)}")
                continue

        # Mark as completed
        data_import.status = ImportStatus.COMPLETED
        data_import.completed_at = datetime.utcnow()
        data_import.total_transactions = total_imported
        data_import.duplicate_transactions = total_duplicates
        db.commit()

        return {
            "status": "success",
            "import_id": import_id,
            "locations_processed": len(locations),
            "transactions_imported": total_imported,
            "duplicates": total_duplicates
        }

    except Exception as e:
        db.rollback()

        # Update import record with error
        if data_import:
            data_import.status = ImportStatus.FAILED
            data_import.error_message = str(e)
            data_import.completed_at = datetime.utcnow()
            db.commit()

        # Retry on failure
        raise self.retry(exc=e, countdown=60 * (2 ** self.request.retries))

    finally:
        db.close()


@celery_app.task
def sync_all_active_accounts():
    """
    Periodic task to sync all active Square accounts
    This should be scheduled to run every 15 minutes via Celery Beat
    """
    db = next(get_db())

    try:
        # Get all active Square accounts
        accounts = db.query(SquareAccount).filter(
            SquareAccount.is_active == True
        ).all()

        tasks_triggered = 0

        for account in accounts:
            # Trigger sync task for each account
            sync_square_payments.delay(str(account.id))
            tasks_triggered += 1

        return {
            "status": "success",
            "message": f"Triggered sync for {tasks_triggered} accounts",
            "timestamp": datetime.utcnow().isoformat()
        }

    finally:
        db.close()


@celery_app.task(bind=True, max_retries=3)
def import_square_orders_task(self, import_id: str):
    """
    Background task to import historical Square orders with line items

    Args:
        import_id: DataImport record UUID
    """
    db = next(get_db())

    try:
        from app.models.data_import import DataImport, ImportStatus as ImportStatusEnum

        # Get import record
        data_import = db.query(DataImport).filter(DataImport.id == import_id).first()

        if not data_import:
            return {"status": "error", "message": "Import record not found"}

        # Update status to in_progress
        data_import.status = ImportStatusEnum.IN_PROGRESS
        data_import.started_at = datetime.utcnow()
        db.commit()

        # Get account
        account = db.query(SquareAccount).filter(
            SquareAccount.id == data_import.square_account_id
        ).first()

        if not account:
            data_import.status = ImportStatusEnum.FAILED
            data_import.error_message = "Square account not found"
            data_import.completed_at = datetime.utcnow()
            db.commit()
            return {"status": "error", "message": "Square account not found"}

        # Get active locations
        locations = db.query(Location).filter(
            Location.square_account_id == account.id,
            Location.is_active == True
        ).all()

        if not locations:
            data_import.status = ImportStatusEnum.FAILED
            data_import.error_message = "No active locations found"
            data_import.completed_at = datetime.utcnow()
            db.commit()
            return {"status": "error", "message": "No active locations found"}

        # Decrypt access token
        access_token = square_service.get_decrypted_token(account)

        total_imported = 0
        total_duplicates = 0

        # Convert dates to datetime
        start_datetime = datetime.combine(data_import.start_date, datetime.min.time())
        end_datetime = datetime.combine(data_import.end_date, datetime.max.time())

        # Fetch orders for all locations
        location_ids = [loc.square_location_id for loc in locations]
        cursor = None

        while True:
            # Fetch orders from Square API
            orders_response = asyncio.run(square_service.search_orders(
                access_token=access_token,
                location_ids=location_ids,
                begin_time=start_datetime,
                end_time=end_datetime,
                cursor=cursor
            ))

            orders = orders_response.get("orders", [])

            # Store each order
            for order in orders:
                stored, duplicate = parse_and_store_order(db, order, locations)
                if stored:
                    total_imported += 1
                if duplicate:
                    total_duplicates += 1

            # Update progress
            data_import.imported_transactions = total_imported
            data_import.duplicate_transactions = total_duplicates
            db.commit()

            # Check for more pages
            cursor = orders_response.get("cursor")
            if not cursor:
                break

        # Mark as completed
        data_import.status = ImportStatusEnum.COMPLETED
        data_import.imported_transactions = total_imported
        data_import.duplicate_transactions = total_duplicates
        data_import.total_transactions = total_imported + total_duplicates
        data_import.completed_at = datetime.utcnow()
        db.commit()

        # Rebuild daily sales summaries for imported locations
        if total_imported > 0:
            try:
                from app.services.summary_service import rebuild_daily_summaries_for_locations
                loc_ids = [str(loc.id) for loc in locations]
                summaries = rebuild_daily_summaries_for_locations(db, loc_ids)
                print(f"Rebuilt {summaries} daily summaries after import")
            except Exception as e:
                print(f"Warning: Failed to rebuild daily summaries: {str(e)}")

        return {
            "status": "success",
            "imported": total_imported,
            "duplicates": total_duplicates
        }

    except Exception as e:
        db.rollback()

        # Safely update import status if data_import exists
        try:
            from app.models.data_import import DataImport, ImportStatus as ImportStatusEnum
            import_record = db.query(DataImport).filter(DataImport.id == import_id).first()
            if import_record:
                import_record.status = ImportStatusEnum.FAILED
                import_record.error_message = str(e)
                import_record.completed_at = datetime.utcnow()
                db.commit()
        except Exception as update_error:
            print(f"Failed to update import status: {str(update_error)}")

        print(f"Error importing orders: {str(e)}")
        import traceback
        traceback.print_exc()

        # Retry on failure
        raise self.retry(exc=e, countdown=60 * (2 ** self.request.retries))

    finally:
        db.close()
