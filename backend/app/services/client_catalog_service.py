"""
Client Catalog Mapping Service
Recomputes the pre-computed client → catalog_object_id mappings
based on client category_keywords matched against catalog categories.
"""
import logging
from typing import Optional, Set
from sqlalchemy.orm import Session

from app.models.client import Client
from app.models.catalog_hierarchy import (
    CatalogCategory,
    CatalogItemCategoryMembership,
    ClientCatalogMapping,
)
from app.models.square_account import SquareAccount

logger = logging.getLogger(__name__)


def recompute_client_mappings(
    db: Session,
    client_id: Optional[str] = None,
    organization_id: Optional[str] = None,
) -> int:
    """Recompute client_catalog_mappings for one client or all clients in an org.

    Call this when:
    - Client keywords are updated (pass client_id)
    - Catalog is synced (pass organization_id to recompute all clients in org)

    Returns number of mappings created.
    """
    # Get clients to recompute
    query = db.query(Client).filter(Client.category_keywords.isnot(None))
    if client_id:
        query = query.filter(Client.id == client_id)
    elif organization_id:
        query = query.filter(Client.organization_id == organization_id)

    clients = query.all()
    if not clients:
        return 0

    # Get all square account IDs for the org(s)
    org_ids = set(str(c.organization_id) for c in clients)
    account_ids = [
        str(r[0]) for r in db.query(SquareAccount.id).filter(
            SquareAccount.organization_id.in_(org_ids)
        ).all()
    ]

    if not account_ids:
        return 0

    # Load all categories into memory for keyword matching
    all_categories = db.query(
        CatalogCategory.square_category_id,
        CatalogCategory.name,
        CatalogCategory.parent_category_id,
        CatalogCategory.path_to_root,
    ).filter(
        CatalogCategory.square_account_id.in_(account_ids)
    ).all()

    # Build parent→children map for descendant traversal
    children_map: dict[str, list[str]] = {}
    for cat in all_categories:
        if cat.parent_category_id:
            children_map.setdefault(cat.parent_category_id, []).append(cat.square_category_id)

    total_mappings = 0

    for client in clients:
        keywords = client.category_keywords or []
        if not keywords:
            # Clear any existing mappings
            db.query(ClientCatalogMapping).filter(
                ClientCatalogMapping.client_id == client.id
            ).delete()
            continue

        # Find all category IDs where the category name or any ancestor name matches a keyword
        matching_cat_ids: Set[str] = set()
        keyword_by_cat: dict[str, str] = {}  # cat_id → matched keyword

        for cat in all_categories:
            cat_id = cat.square_category_id
            cat_name = cat.name or ""
            path = cat.path_to_root or []

            # Check category name itself + all ancestors in path_to_root
            all_names = [cat_name] + [p.get("name", "") for p in path if isinstance(p, dict)]

            for keyword in keywords:
                kw_lower = keyword.lower()
                for name in all_names:
                    if kw_lower in name.lower():
                        matching_cat_ids.add(cat_id)
                        keyword_by_cat[cat_id] = keyword
                        break

        # Expand to include ALL descendants of matching categories
        def _add_descendants(cat_id: str, keyword: str):
            for child_id in children_map.get(cat_id, []):
                if child_id not in matching_cat_ids:
                    matching_cat_ids.add(child_id)
                    keyword_by_cat[child_id] = keyword
                    _add_descendants(child_id, keyword)

        for cat_id in list(matching_cat_ids):
            _add_descendants(cat_id, keyword_by_cat[cat_id])

        # Get all catalog_object_ids in those categories
        matched_objects: dict[str, str] = {}  # catalog_object_id → matched_keyword
        if matching_cat_ids:
            rows = db.query(
                CatalogItemCategoryMembership.catalog_object_id,
                CatalogItemCategoryMembership.category_id,
            ).filter(
                CatalogItemCategoryMembership.category_id.in_(matching_cat_ids),
                CatalogItemCategoryMembership.square_account_id.in_(account_ids),
            ).all()
            for obj_id, cat_id in rows:
                if obj_id not in matched_objects:
                    matched_objects[obj_id] = keyword_by_cat.get(cat_id, keywords[0])

        # Clear old mappings for this client
        db.query(ClientCatalogMapping).filter(
            ClientCatalogMapping.client_id == client.id
        ).delete()

        # Insert new mappings
        for obj_id, keyword in matched_objects.items():
            db.add(ClientCatalogMapping(
                client_id=client.id,
                catalog_object_id=obj_id,
                matched_keyword=keyword,
            ))
            total_mappings += 1

        logger.info(
            f"Client '{client.name}' ({client.id}): {len(matched_objects)} products "
            f"matched from {len(matching_cat_ids)} categories using keywords {keywords}"
        )

    db.commit()
    return total_mappings
