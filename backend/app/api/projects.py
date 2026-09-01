"""
SHACHINA PROJECTS WORKSPACE API
Manages AI project workspaces with custom instructions, files, datasets, and context.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from backend.app.db.database import get_db
from backend.app.db.models import User, Project, ProjectItem
from backend.app.api.auth import get_current_user

router = APIRouter(prefix="/projects", tags=["AI Projects"])


class ProjectCreateRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    instructions: Optional[str] = ""
    context_data: Optional[Dict[str, Any]] = None


class ProjectItemCreateRequest(BaseModel):
    item_type: str  # 'FILE', 'NOTE', 'DATASET'
    title: str
    content: Optional[str] = ""
    file_metadata: Optional[Dict[str, Any]] = None


@router.get("")
async def list_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(Project)
        .where(Project.user_id == current_user.id)
        .options(selectinload(Project.items))
        .order_by(Project.updated_at.desc())
    )
    res = await db.execute(query)
    projects = res.scalars().all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "instructions": p.instructions,
            "item_count": len(p.items),
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        }
        for p in projects
    ]


@router.post("")
async def create_project(
    req: ProjectCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    proj_id = f"proj_{uuid.uuid4().hex[:12]}"
    proj = Project(
        id=proj_id,
        user_id=current_user.id,
        name=req.name.strip(),
        description=req.description.strip() if req.description else "",
        instructions=req.instructions.strip() if req.instructions else "",
        context_data=req.context_data or {},
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(proj)
    await db.commit()
    await db.refresh(proj)
    return {
        "id": proj.id,
        "name": proj.name,
        "description": proj.description,
        "instructions": proj.instructions,
        "items": [],
        "created_at": proj.created_at.isoformat()
    }


@router.get("/{project_id}")
async def get_project(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(Project)
        .where((Project.id == project_id) & (Project.user_id == current_user.id))
        .options(selectinload(Project.items))
    )
    proj = (await db.execute(query)).scalars().first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found.")
    return {
        "id": proj.id,
        "name": proj.name,
        "description": proj.description,
        "instructions": proj.instructions,
        "context_data": proj.context_data,
        "items": [
            {
                "id": it.id,
                "item_type": it.item_type,
                "title": it.title,
                "content": it.content,
                "file_metadata": it.file_metadata,
                "created_at": it.created_at.isoformat() if it.created_at else None
            }
            for it in proj.items
        ],
        "created_at": proj.created_at.isoformat() if proj.created_at else None,
        "updated_at": proj.updated_at.isoformat() if proj.updated_at else None,
    }


@router.post("/{project_id}/items")
async def add_project_item(
    project_id: str,
    req: ProjectItemCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Project).where((Project.id == project_id) & (Project.user_id == current_user.id))
    proj = (await db.execute(query)).scalars().first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found.")

    item_id = f"item_{uuid.uuid4().hex[:12]}"
    item = ProjectItem(
        id=item_id,
        project_id=proj.id,
        item_type=req.item_type,
        title=req.title.strip(),
        content=req.content or "",
        file_metadata=req.file_metadata or {},
        created_at=datetime.now(timezone.utc),
    )
    db.add(item)
    proj.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(item)
    return {
        "id": item.id,
        "project_id": item.project_id,
        "item_type": item.item_type,
        "title": item.title,
        "content": item.content,
        "file_metadata": item.file_metadata,
        "created_at": item.created_at.isoformat()
    }


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Project).where((Project.id == project_id) & (Project.user_id == current_user.id))
    proj = (await db.execute(query)).scalars().first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found.")
    await db.delete(proj)
    await db.commit()
    return {"message": "Project deleted successfully."}
