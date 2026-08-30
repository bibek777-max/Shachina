"""
Automated Tests for SHACHINA Complete Authentication, Onboarding, and Data Isolation System.
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
async def test_bibek_default_login():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/api/v1/auth/login", json={
            "username_or_email": "bibek",
            "password": "Shachina2026!"
        })
        assert res.status_code == 200
        data = res.json()
        assert "access_token" in data
        assert data["user"]["username"] == "bibek"
        assert data["user"]["role"] == "OWNER"


@pytest.mark.asyncio
async def test_user_registration_and_onboarding():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Register new user
        reg_res = await client.post("/api/v1/auth/register", json={
            "full_name": "Trader Ram",
            "username": "trader_ram",
            "email": "ram@nepsetrading.com",
            "phone_number": "+977-9841234567",
            "password": "SecretPassword123!",
            "confirm_password": "SecretPassword123!"
        })
        assert reg_res.status_code == 200
        reg_data = reg_res.json()
        assert "access_token" in reg_data
        assert reg_data["user"]["username"] == "trader_ram"
        assert reg_data["user"]["onboarded"] is False

        token = reg_data["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Get profile
        me_res = await client.get("/api/v1/auth/me", headers=headers)
        assert me_res.status_code == 200
        me_data = me_res.json()
        assert me_data["full_name"] == "Trader Ram"
        assert me_data["preferences"]["onboarded"] is False

        # 3. Complete Onboarding
        pref_res = await client.put("/api/v1/auth/preferences", headers=headers, json={
            "primary_market": "NEPSE",
            "language": "ne",
            "onboarded": True
        })
        assert pref_res.status_code == 200

        # 4. Verify updated state
        me_res2 = await client.get("/api/v1/auth/me", headers=headers)
        assert me_res2.json()["preferences"]["onboarded"] is True


@pytest.mark.asyncio
async def test_forgot_and_reset_password_flow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Request forgot password for bibek
        forgot_res = await client.post("/api/v1/auth/forgot-password", json={
            "identifier": "bibek@shachina.ai"
        })
        assert forgot_res.status_code == 200
        token = forgot_res.json().get("reset_token")
        assert token is not None

        # Reset password
        reset_res = await client.post("/api/v1/auth/reset-password", json={
            "reset_token": token,
            "new_password": "NewBibekPassword2026!",
            "confirm_password": "NewBibekPassword2026!"
        })
        assert reset_res.status_code == 200

        # Login with new password
        login_res = await client.post("/api/v1/auth/login", json={
            "username_or_email": "bibek",
            "password": "NewBibekPassword2026!"
        })
        assert login_res.status_code == 200


@pytest.mark.asyncio
async def test_user_data_isolation():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Login Bibek
        res_b = await client.post("/api/v1/auth/login", json={
            "username_or_email": "bibek",
            "password": "Shachina2026!"
        })
        assert res_b.status_code == 200
        token_b = res_b.json()["access_token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # Add custom symbol to Bibek's watchlist
        await client.post("/api/v1/user/watchlist", headers=headers_b, json={
            "symbol": "CIT",
            "market": "NEPSE"
        })

        # Register another user Sita
        res_s = await client.post("/api/v1/auth/register", json={
            "full_name": "Sita Sharma",
            "username": "sita_sharma",
            "email": "sita@nepsetrading.com",
            "password": "Password987!",
            "confirm_password": "Password987!"
        })
        assert res_s.status_code == 200
        token_s = res_s.json()["access_token"]
        headers_s = {"Authorization": f"Bearer {token_s}"}

        # Check Sita's watchlist - must NOT contain CIT
        wl_s = await client.get("/api/v1/user/watchlist", headers=headers_s)
        assert wl_s.status_code == 200
        sita_symbols = [item["symbol"] for item in wl_s.json()]
        assert "CIT" not in sita_symbols

        # Check Bibek's watchlist - MUST contain CIT
        wl_b = await client.get("/api/v1/user/watchlist", headers=headers_b)
        assert wl_b.status_code == 200
        bibek_symbols = [item["symbol"] for item in wl_b.json()]
        assert "CIT" in bibek_symbols


@pytest.mark.asyncio
async def test_unauthorized_access_rejection():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Accessing /auth/me without token -> 401 Unauthorized
        res = await client.get("/api/v1/auth/me")
        assert res.status_code == 401

        # Accessing /user/watchlist without token -> 401 Unauthorized
        res2 = await client.get("/api/v1/user/watchlist")
        assert res2.status_code == 401
