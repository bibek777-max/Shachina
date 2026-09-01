"""
SHACHINA USER MEMORY API
Allows users to view, add, toggle, and delete AI memory items.
Memory is user-controlled (ON/OFF, View, Delete, Delete All).
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from backend.app.db.database import get_db
from backend.app.db.models import User, UserMemory
from backend.app.api.auth import get_current_user

router = APIRouter(prefix="/user/memory", tags=["User Memory"])


class MemoryCreateRequest(BaseModel):
    memory_key: str
    memory_value: str
    category: Optional[str] = "GENERAL"  # 'PREFERENCES', 'TRADING_STYLE', 'PERSONAL', 'GENERAL'
    is_enabled: Optional[bool] = True


class MemoryItem(BaseModel):
    id: int
    memory_key: str
    memory_value: str
    category: str
    is_enabled: bool
    created_at: Optional[str] = None


@router.get("", response_model=List[MemoryItem])
async def list_memories(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(UserMemory).where(UserMemory.user_id == current_user.id).order_by(UserMemory.created_at.desc())
    res = await db.execute(query)
    memories = res.scalars().all()
    return [
        MemoryItem(
            id=m.id,
            memory_key=m.memory_key,
            memory_value=m.memory_value,
            category=m.category or "GENERAL",
            is_enabled=m.is_enabled,
            created_at=m.created_at.isoformat() if m.created_at else None
        )
        for m in memories
    ]


@router.post("", response_model=MemoryItem)
async def create_memory(
    req: MemoryCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    mem = UserMemory(
        user_id=current_user.id,
        memory_key=req.memory_key.strip(),
        memory_value=req.memory_value.strip(),
        category=req.category or "GENERAL",
        is_enabled=req.is_enabled if req.is_enabled is not None else True,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(mem)
    await db.commit()
    await db.refresh(mem)
    return MemoryItem(
        id=mem.id,
        memory_key=mem.memory_key,
        memory_value=mem.memory_value,
        category=mem.category,
        is_enabled=mem.is_enabled,
        created_at=mem.created_at.isoformat()
    )


@router.patch("/{memory_id}/toggle")
async def toggle_memory(
    memory_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(UserMemory).where(
        (UserMemory.id == memory_id) & (UserMemory.user_id == current_user.id)
    )
    mem = (await db.execute(query)).scalars().first()
    if not mem:
        raise HTTPException(status_code=404, detail="Memory item not found.")
    mem.is_enabled = not mem.is_enabled
    await db.commit()
    return {"id": mem.id, "is_enabled": mem.is_enabled}


@router.delete("/{memory_id}")
async def delete_memory(
    memory_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(UserMemory).where(
        (UserMemory.id == memory_id) & (UserMemory.user_id == current_user.id)
    )
    mem = (await db.execute(query)).scalars().first()
    if not mem:
        raise HTTPException(status_code=404, detail="Memory item not found.")
    await db.delete(mem)
    await db.commit()
    return {"message": "Memory deleted successfully."}


@router.delete("")
async def delete_all_memories(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(UserMemory).where(UserMemory.user_id == current_user.id)
    memories = (await db.execute(query)).scalars().all()
    for m in memories:
        await db.delete(m)
    await db.commit()
    return {"message": f"Deleted {len(memories)} memory items."}
