"""
Automated Integration Tests for Shachina FastAPI Backend and Auth.
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from backend.app.main import app
from backend.app.db.database import engine, Base, AsyncSessionLocal
from backend.app.api.auth import seed_bibek_user
from shachina_quant.data.factory import MarketDataProviderRegistry


@pytest_asyncio.fixture(autouse=True)
async def clean_database():
    MarketDataProviderRegistry.initialize()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncSessionLocal() as session:
        await seed_bibek_user(session)
    yield


@pytest.mark.asyncio
async def test_health_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/health")
        assert res.status_code == 200
        data = res.json()
        assert data["platform"] == "SHACHINA"
        assert data["owner"] == "Bibek"
        assert data["primary_market"] == "NEPSE"
        assert data["zero_fabrication_policy"] == "ENFORCED"


@pytest.mark.asyncio
async def test_bibek_login_and_profile():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Login as Bibek
        login_res = await client.post("/api/v1/auth/login", json={
            "username_or_email": "bibek",
            "password": "Shachina2026!"
        })
        assert login_res.status_code == 200
        login_data = login_res.json()
        assert "access_token" in login_data
        assert login_data["user"]["username"] == "bibek"
        assert login_data["user"]["role"] == "OWNER"

        token = login_data["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Check /me
        me_res = await client.get("/api/v1/auth/me", headers=headers)
        assert me_res.status_code == 200
        assert me_res.json()["full_name"] == "Bibek"


@pytest.mark.asyncio
async def test_nepse_market_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Status
        status_res = await client.get("/api/v1/markets/nepse/status")
        assert status_res.status_code == 200
        assert status_res.json()["market"] == "NEPSE"

        # Symbols
        sym_res = await client.get("/api/v1/markets/NEPSE/symbols")
        assert sym_res.status_code == 200
        assert len(sym_res.json()) > 0

        # Validated OHLCV
        ohlcv_res = await client.get("/api/v1/markets/NEPSE/ohlcv/NABIL?limit=30")
        assert ohlcv_res.status_code == 200
        data = ohlcv_res.json()
        assert data["symbol"] == "NABIL"
        assert data["count"] == 30
        assert data["data_quality"]["is_valid"] is True
        assert data["data_quality"]["score"] >= 80.0
