"""
SHACHINA CONVERSATION MEMORY API
Multi-conversation management, message history, renaming, searching,
and context isolation for Bibek's AI personal assistant.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from backend.app.db.database import get_db
from backend.app.db.models import User, Conversation, ConversationMessage
from backend.app.api.auth import get_current_user

router = APIRouter(prefix="/conversations", tags=["Conversation Memory"])


class CreateConversationRequest(BaseModel):
    title: Optional[str] = "New Conversation"


class RenameConversationRequest(BaseModel):
    title: str


@router.get("")
async def list_conversations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(Conversation)
        .where(Conversation.user_id == current_user.id)
        .options(selectinload(Conversation.messages))
        .order_by(Conversation.updated_at.desc())
    )
    res = await db.execute(query)
    convs = res.scalars().all()

    results = []
    for c in convs:
        last_msg = c.messages[-1].content[:80] if c.messages else "No messages yet"
        results.append({
            "id": c.id,
            "title": c.title,
            "message_count": len(c.messages),
            "last_preview": last_msg,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        })
    return results


@router.post("")
async def create_conversation(
    req: CreateConversationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    conv_id = f"conv_{uuid.uuid4().hex[:12]}"
    conv = Conversation(
        id=conv_id,
        user_id=current_user.id,
        title=req.title.strip() or "New Conversation",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(conv)
    await db.commit()
    await db.refresh(conv)

    return {
        "id": conv.id,
        "title": conv.title,
        "created_at": conv.created_at.isoformat(),
        "messages": [],
    }


@router.get("/search")
async def search_conversations(
    q: str = Query(..., min_length=1),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    search_term = f"%{q.strip().lower()}%"
    msg_query = (
        select(ConversationMessage)
        .join(Conversation)
        .where(
            (Conversation.user_id == current_user.id) &
            (ConversationMessage.content.ilike(search_term))
        )
        .order_by(ConversationMessage.created_at.desc())
        .limit(20)
    )
    res = await db.execute(msg_query)
    messages = res.scalars().all()

    return [
        {
            "id": m.id,
            "conversation_id": m.conversation_id,
            "role": m.role,
            "content": m.content,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in messages
    ]


@router.get("/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(Conversation)
        .where(
            (Conversation.id == conversation_id) &
            (Conversation.user_id == current_user.id)
        )
        .options(selectinload(Conversation.messages))
    )
    res = await db.execute(query)
    conv = res.scalars().first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    return {
        "id": conv.id,
        "title": conv.title,
        "created_at": conv.created_at.isoformat() if conv.created_at else None,
        "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "speech_text": m.speech_text,
                "annotations": m.annotations,
                "trade_proposal": m.trade_proposal,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in conv.messages
        ]
    }


@router.patch("/{conversation_id}")
async def rename_conversation(
    conversation_id: str,
    req: RenameConversationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Conversation).where(
        (Conversation.id == conversation_id) &
        (Conversation.user_id == current_user.id)
    )
    res = await db.execute(query)
    conv = res.scalars().first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    conv.title = req.title.strip() or conv.title
    conv.updated_at = datetime.now(timezone.utc)
    await db.commit()

    return {"message": "Conversation renamed successfully.", "title": conv.title}


@router.delete("/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Conversation).where(
        (Conversation.id == conversation_id) &
        (Conversation.user_id == current_user.id)
    )
    res = await db.execute(query)
    conv = res.scalars().first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    await db.delete(conv)
    await db.commit()

    return {"message": "Conversation deleted successfully."}
