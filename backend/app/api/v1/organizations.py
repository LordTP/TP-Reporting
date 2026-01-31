"""
${file^} API Routes
"""
from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def list_items():
    """List endpoint - to be implemented"""
    return {"message": "Coming soon"}
