"""Schemas for the role permission management API."""
from typing import Dict, List
from pydantic import BaseModel


class PermissionKeyInfo(BaseModel):
    key: str
    label: str
    category: str


class PermissionMatrixResponse(BaseModel):
    permissions: List[PermissionKeyInfo]
    matrix: Dict[str, Dict[str, bool]]


class PermissionMatrixUpdate(BaseModel):
    matrix: Dict[str, Dict[str, bool]]


class MyPermissionsResponse(BaseModel):
    permissions: List[str]
