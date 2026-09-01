"""
SHACHINA ASYNC API ENDPOINTS INTEGRATION TEST SUITE
"""

import pytest
import asyncio
from httpx import AsyncClient, ASGITransport

from backend.app.main import app
from backend.app.db.database import AsyncSessionLocal, engine, Base
from backend.app.api.auth import seed_bibek_user
from shachina_quant.data.factory import MarketDataProviderRegistry


@pytest.mark.asyncio
async def test_full_api_flow():
    # Initialize DB & Quant Engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for col_sql in [
            "ALTER TABLE user_preferences ADD COLUMN analysis_mode VARCHAR(16) DEFAULT 'pro'",
            "ALTER TABLE user_trading_settings ADD COLUMN emergency_stop_enabled BOOLEAN DEFAULT 0",
        ]:
            try:
                from sqlalchemy import text
                await conn.execute(text(col_sql))
            except Exception:
                pass
    async with AsyncSessionLocal() as session:
        await seed_bibek_user(session)
    MarketDataProviderRegistry.initialize()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Health check
        res = await client.get("/api/health")
        assert res.status_code == 200
        assert res.json()["owner"] == "Bibek"

        # 2. Public Registration Disabled (403 Forbidden)
        reg_res = await client.post("/api/v1/auth/register", json={})
        assert reg_res.status_code == 403

        # 3. Invalid credentials returns exact error message
        bad_login = await client.post("/api/v1/auth/login", json={
            "username_or_email": "bibek@shachina.ai",
            "password": "WrongPassword999!"
        })
        assert bad_login.status_code == 401
        assert bad_login.json()["detail"] == "Invalid username or password."

        # 4. Valid Login for authorized user
        login_res = await client.post("/api/v1/auth/login", json={
            "username_or_email": "bibek@shachina.ai",
            "password": "Bibek98@#$"
        })
        assert login_res.status_code == 200
        token_data = login_res.json()
        assert "access_token" in token_data
        token = token_data["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 5. Conversation Memory APIs
        conv_res = await client.post("/api/v1/conversations", json={"title": "Test Chat"}, headers=headers)
        assert conv_res.status_code == 200
        conv_id = conv_res.json()["id"]

        list_convs = await client.get("/api/v1/conversations", headers=headers)
        assert list_convs.status_code == 200
        assert len(list_convs.json()) >= 1

        # 6. Assistant General AI Query
        asst_gen = await client.post("/api/v1/assistant/chat", json={
            "message": "What is data analysis?",
            "conversation_id": conv_id,
            "language": "en"
        }, headers=headers)
        assert asst_gen.status_code == 200
        assert len(asst_gen.json()["response"]) > 20

        # 7. Assistant Trading Analysis Query
        asst_trade = await client.post("/api/v1/assistant/chat", json={
            "message": "Market herna NABIL chart setup.",
            "symbol": "NABIL",
            "market": "NEPSE",
            "conversation_id": conv_id,
            "analysis_mode": "pro"
        }, headers=headers)
        assert asst_trade.status_code == 200
        trade_json = asst_trade.json()
        assert trade_json["chart_annotations"] is not None

        # 8. Controlled Order Placement (Rejects unconfirmed)
        unconfirmed = await client.post("/api/v1/trading/order", json={
            "symbol": "NABIL",
            "quantity": 25,
            "price": 540.0,
            "confirmed": False
        }, headers=headers)
        assert unconfirmed.status_code == 400

        # 9. Controlled Order Placement (Executes confirmed)
        confirmed = await client.post("/api/v1/trading/order", json={
            "symbol": "NABIL",
            "quantity": 25,
            "price": 540.0,
            "stop_loss": 520.0,
            "target": 580.0,
            "confirmed": True
        }, headers=headers)
        if confirmed.status_code != 200:
            print("ORDER ERROR:", confirmed.status_code, confirmed.json())
        assert confirmed.status_code == 200
        order_data = confirmed.json()
        assert order_data["success"] is True

        # 10. Positions & Orders Retrieval
        pos_res = await client.get("/api/v1/trading/positions", headers=headers)
        assert pos_res.status_code == 200
        positions = pos_res.json()
        assert len(positions) >= 1
        assert positions[0]["symbol"] == "NABIL"

        ord_res = await client.get("/api/v1/trading/orders", headers=headers)
        assert ord_res.status_code == 200
        assert len(ord_res.json()) >= 1


if __name__ == "__main__":
    asyncio.run(test_full_api_flow())
    print("ALL API ENDPOINT INTEGRATION TESTS PASSED SUCCESSFULLY! ✓")
