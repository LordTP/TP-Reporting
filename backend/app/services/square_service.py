"""
Square API Service
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta, timezone
import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.models.square_account import SquareAccount
from app.models.location import Location
from app.utils.encryption import encrypt_token, decrypt_token


class SquareService:
    """Service for interacting with Square API"""

    def __init__(self):
        self.base_url = "https://connect.squareupsandbox.com" if settings.SQUARE_ENVIRONMENT == "sandbox" else "https://connect.squareup.com"
        self.api_version = "2024-01-18"

    def get_oauth_url(self, state: str) -> str:
        """
        Generate Square OAuth authorization URL

        Args:
            state: State parameter for CSRF protection

        Returns:
            OAuth authorization URL
        """
        scopes = [
            "PAYMENTS_READ",
            "ORDERS_READ",
            "MERCHANT_PROFILE_READ",
            "ITEMS_READ",
        ]

        params = {
            "client_id": settings.SQUARE_APPLICATION_ID,
            "scope": " ".join(scopes),
            "session": "false",
            "state": state,
        }

        query_string = "&".join([f"{k}={v}" for k, v in params.items()])
        return f"{self.base_url}/oauth2/authorize?{query_string}"

    async def exchange_code_for_token(self, code: str) -> Dict[str, Any]:
        """
        Exchange authorization code for access token

        Args:
            code: Authorization code from Square OAuth

        Returns:
            Token response with access_token, refresh_token, etc.
        """
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/oauth2/token",
                json={
                    "client_id": settings.SQUARE_APPLICATION_ID,
                    "client_secret": settings.SQUARE_APPLICATION_SECRET,
                    "code": code,
                    "grant_type": "authorization_code",
                },
            )
            response.raise_for_status()
            return response.json()

    async def refresh_access_token(self, refresh_token: str) -> Dict[str, Any]:
        """
        Refresh an expired access token

        Args:
            refresh_token: Refresh token

        Returns:
            New token response
        """
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/oauth2/token",
                json={
                    "client_id": settings.SQUARE_APPLICATION_ID,
                    "client_secret": settings.SQUARE_APPLICATION_SECRET,
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                },
            )
            response.raise_for_status()
            return response.json()

    async def get_merchant_info(self, access_token: str) -> Dict[str, Any]:
        """
        Get merchant information

        Args:
            access_token: Square access token

        Returns:
            Merchant information
        """
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/v2/merchants/me",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Square-Version": self.api_version,
                },
            )
            response.raise_for_status()
            data = response.json()
            return data.get("merchant", {})

    async def list_locations(self, access_token: str) -> List[Dict[str, Any]]:
        """
        List all locations for a merchant

        Args:
            access_token: Square access token

        Returns:
            List of locations
        """
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/v2/locations",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Square-Version": self.api_version,
                },
            )
            response.raise_for_status()
            data = response.json()
            return data.get("locations", [])

    async def list_payments(
        self,
        access_token: str,
        location_id: str,
        begin_time: datetime,
        end_time: datetime,
        cursor: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        List payments for a location within a time range

        Args:
            access_token: Square access token
            location_id: Location ID
            begin_time: Start of time range
            end_time: End of time range
            cursor: Pagination cursor

        Returns:
            Payments response with payments and cursor
        """
        params = {
            "location_id": location_id,
            "begin_time": begin_time.isoformat(),
            "end_time": end_time.isoformat(),
            "limit": 100,
        }

        if cursor:
            params["cursor"] = cursor

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{self.base_url}/v2/payments",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Square-Version": self.api_version,
                },
                params=params,
            )
            response.raise_for_status()
            return response.json()

    async def search_orders(
        self,
        access_token: str,
        location_ids: List[str],
        begin_time: datetime,
        end_time: datetime,
        cursor: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Search orders for locations within a time range

        This is the preferred method as it includes line items with product details

        Args:
            access_token: Square access token
            location_ids: List of location IDs
            begin_time: Start of time range
            end_time: End of time range
            cursor: Pagination cursor

        Returns:
            Orders response with orders and cursor
        """
        # Format datetime for Square API (RFC 3339 format)
        # If datetime is naive, treat as UTC
        if begin_time.tzinfo is None:
            start_at = begin_time.strftime("%Y-%m-%dT%H:%M:%SZ")
        else:
            start_at = begin_time.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        if end_time.tzinfo is None:
            end_at = end_time.strftime("%Y-%m-%dT%H:%M:%SZ")
        else:
            end_at = end_time.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        body = {
            "location_ids": location_ids,
            "query": {
                "filter": {
                    "date_time_filter": {
                        "closed_at": {
                            "start_at": start_at,
                            "end_at": end_at,
                        }
                    },
                    "state_filter": {
                        "states": ["COMPLETED"]
                    }
                },
                "sort": {
                    "sort_field": "CLOSED_AT",
                    "sort_order": "DESC"
                }
            },
            "limit": 100,
        }

        if cursor:
            body["cursor"] = cursor

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self.base_url}/v2/orders/search",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Square-Version": self.api_version,
                    "Content-Type": "application/json",
                },
                json=body,
            )
            response.raise_for_status()
            return response.json()

    async def search_orders_updated_since(
        self,
        access_token: str,
        location_ids: List[str],
        updated_since: datetime,
        cursor: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Search orders that were updated after a given timestamp.
        Catches refunds, status changes, and modifications on historical orders.

        Args:
            access_token: Square access token
            location_ids: List of location IDs
            updated_since: Only return orders updated after this time
            cursor: Pagination cursor

        Returns:
            Orders response with orders and cursor
        """
        if updated_since.tzinfo is None:
            start_at = updated_since.strftime("%Y-%m-%dT%H:%M:%SZ")
        else:
            start_at = updated_since.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        body = {
            "location_ids": location_ids,
            "query": {
                "filter": {
                    "date_time_filter": {
                        "updated_at": {
                            "start_at": start_at,
                        }
                    },
                    "state_filter": {
                        "states": ["COMPLETED"]
                    }
                },
                "sort": {
                    "sort_field": "UPDATED_AT",
                    "sort_order": "DESC"
                }
            },
            "limit": 100,
        }

        if cursor:
            body["cursor"] = cursor

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self.base_url}/v2/orders/search",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Square-Version": self.api_version,
                    "Content-Type": "application/json",
                },
                json=body,
            )
            response.raise_for_status()
            return response.json()

    async def list_refunds(
        self,
        access_token: str,
        begin_time: datetime,
        end_time: Optional[datetime] = None,
        location_id: Optional[str] = None,
        cursor: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        List payment refunds (including PENDING ones).
        Uses the Refunds API which surfaces refunds before they appear on orders.

        Args:
            access_token: Square access token
            begin_time: Only return refunds created after this time
            end_time: Only return refunds created before this time
            location_id: Optional location filter
            cursor: Pagination cursor

        Returns:
            Refunds response with refunds and cursor
        """
        params: Dict[str, Any] = {
            "begin_time": begin_time.isoformat() if begin_time.tzinfo else begin_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "sort_order": "DESC",
            "limit": 100,
        }

        if end_time:
            params["end_time"] = end_time.isoformat() if end_time.tzinfo else end_time.strftime("%Y-%m-%dT%H:%M:%SZ")
        if location_id:
            params["location_id"] = location_id
        if cursor:
            params["cursor"] = cursor

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{self.base_url}/v2/refunds",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Square-Version": self.api_version,
                },
                params=params,
            )
            response.raise_for_status()
            return response.json()

    async def get_order(
        self,
        access_token: str,
        order_id: str,
    ) -> Dict[str, Any]:
        """
        Get a single order by ID.

        Args:
            access_token: Square access token
            order_id: Square order ID

        Returns:
            Order object
        """
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{self.base_url}/v2/orders/{order_id}",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Square-Version": self.api_version,
                },
            )
            response.raise_for_status()
            data = response.json()
            return data.get("order", {})

    async def list_catalog(
        self,
        access_token: str,
        types: Optional[str] = None,
        cursor: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        List catalog objects from Square.

        Args:
            access_token: Square access token
            types: Comma-separated types e.g. "ITEM,CATEGORY"
            cursor: Pagination cursor

        Returns:
            Catalog response with objects and cursor
        """
        params: Dict[str, Any] = {}
        if types:
            params["types"] = types
        if cursor:
            params["cursor"] = cursor

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{self.base_url}/v2/catalog/list",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Square-Version": self.api_version,
                },
                params=params,
            )
            response.raise_for_status()
            return response.json()

    async def search_catalog_items(
        self,
        access_token: str,
        archived_state: str = "ARCHIVED_STATE_ALL",
        cursor: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Search catalog items including archived/deactivated ones.

        Uses SearchCatalogItems (POST) instead of ListCatalog (GET) because
        ListCatalog excludes archived items. archived_state=ARCHIVED_STATE_ALL
        returns both active and archived items.

        Args:
            access_token: Square access token
            archived_state: ARCHIVED_STATE_ALL, ARCHIVED_STATE_ARCHIVED, or ARCHIVED_STATE_NOT_ARCHIVED
            cursor: Pagination cursor

        Returns:
            Response with items array and cursor
        """
        body: Dict[str, Any] = {
            "archived_state": archived_state,
            "limit": 100,
        }
        if cursor:
            body["cursor"] = cursor

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self.base_url}/v2/catalog/search-catalog-items",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Square-Version": self.api_version,
                    "Content-Type": "application/json",
                },
                json=body,
            )
            response.raise_for_status()
            return response.json()

    def create_square_account(
        self,
        db: Session,
        organization_id: str,
        access_token: str,
        refresh_token: str,
        expires_at: datetime,
        merchant_id: str,
        merchant_name: str,
        currency: str,
    ) -> SquareAccount:
        """
        Create a Square account record

        Args:
            db: Database session
            organization_id: Organization ID
            access_token: Square access token
            refresh_token: Square refresh token
            expires_at: Token expiration datetime
            merchant_id: Square merchant ID
            merchant_name: Merchant name
            currency: Base currency

        Returns:
            Created SquareAccount
        """
        # Encrypt tokens before storing
        encrypted_access = encrypt_token(access_token)
        encrypted_refresh = encrypt_token(refresh_token)

        square_account = SquareAccount(
            organization_id=organization_id,
            square_merchant_id=merchant_id,
            access_token_encrypted=encrypted_access,
            refresh_token_encrypted=encrypted_refresh,
            token_expires_at=expires_at,
            account_name=merchant_name,
            base_currency=currency,
        )

        db.add(square_account)
        db.commit()
        db.refresh(square_account)

        return square_account

    def get_decrypted_token(self, square_account: SquareAccount) -> str:
        """
        Get decrypted access token for a Square account

        Args:
            square_account: SquareAccount instance

        Returns:
            Decrypted access token
        """
        return decrypt_token(square_account.access_token_encrypted)

    async def sync_locations(
        self, db: Session, square_account: SquareAccount
    ) -> List[Location]:
        """
        Sync locations from Square API to database

        Args:
            db: Database session
            square_account: SquareAccount instance

        Returns:
            List of synced locations
        """
        access_token = self.get_decrypted_token(square_account)
        square_locations = await self.list_locations(access_token)

        synced_locations = []

        for sq_loc in square_locations:
            # Check if location already exists
            location = (
                db.query(Location)
                .filter(Location.square_location_id == sq_loc["id"])
                .first()
            )

            if location:
                # Update existing location
                location.name = sq_loc.get("name", "Unknown")
                location.address = sq_loc.get("address")
                location.currency = sq_loc.get("currency", "USD")
                location.timezone = sq_loc.get("timezone")
                location.location_metadata = sq_loc
            else:
                # Create new location
                location = Location(
                    square_account_id=square_account.id,
                    square_location_id=sq_loc["id"],
                    name=sq_loc.get("name", "Unknown"),
                    address=sq_loc.get("address"),
                    currency=sq_loc.get("currency", "USD"),
                    timezone=sq_loc.get("timezone"),
                    location_metadata=sq_loc,
                )
                db.add(location)

            synced_locations.append(location)

        db.commit()
        return synced_locations


# Singleton instance
square_service = SquareService()
