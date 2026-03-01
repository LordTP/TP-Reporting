"""
Models package - Import all models to ensure SQLAlchemy relationships work
"""
# Import Base first
from app.database import Base

# Import models in dependency order to avoid relationship resolution issues
from app.models.organization import Organization
from app.models.user import User, user_locations
from app.models.square_account import SquareAccount
from app.models.location import Location
from app.models.sales_transaction import SalesTransaction
from app.models.data_import import DataImport
from app.models.dashboard import Dashboard
from app.models.client import Client, client_locations, user_clients
from app.models.budget import Budget, BudgetType
from app.models.catalog_category import CatalogItemCategory
from app.models.catalog_hierarchy import CatalogCategory, CatalogItemCategoryMembership, ClientCatalogMapping
from app.models.daily_sales_summary import DailySalesSummary
from app.models.exchange_rate import ExchangeRate
from app.models.location_group import LocationGroup, location_group_members
from app.models.client_group import ClientGroup, client_group_members
from app.models.role_permission import RolePermission
from app.models.footfall import FootfallEntry

__all__ = [
    "Base",
    "Organization",
    "User",
    "SquareAccount",
    "Location",
    "SalesTransaction",
    "DataImport",
    "Dashboard",
    "Client",
    "client_locations",
    "user_clients",
    "user_locations",
    "Budget",
    "BudgetType",
    "CatalogItemCategory",
    "CatalogCategory",
    "CatalogItemCategoryMembership",
    "ClientCatalogMapping",
    "DailySalesSummary",
    "ExchangeRate",
    "LocationGroup",
    "location_group_members",
    "ClientGroup",
    "client_group_members",
    "RolePermission",
    "FootfallEntry",
]
