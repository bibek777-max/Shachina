"""
SHACHINA QUANT ENGINE: Provider Factory & Registry
Singleton dispatcher for all supported markets.
"""

from typing import Dict
from shachina_quant.core.models import MarketType
from shachina_quant.data.provider import MarketDataProvider
from shachina_quant.data.nepse_adapter import NEPSEDataProvider
from shachina_quant.data.global_adapter import CryptoDataProvider, USStocksDataProvider


class MarketDataProviderRegistry:
    """Central registry of market data providers."""

    _providers: Dict[MarketType, MarketDataProvider] = {}

    @classmethod
    def initialize(cls):
        cls._providers = {
            MarketType.NEPSE: NEPSEDataProvider(),
            MarketType.CRYPTO: CryptoDataProvider(),
            MarketType.US_STOCKS: USStocksDataProvider(),
        }

    @classmethod
    def get_provider(cls, market: MarketType) -> MarketDataProvider:
        if not cls._providers:
            cls.initialize()
        provider = cls._providers.get(market)
        if not provider:
            # Fallback to NEPSE as primary market default
            return cls._providers[MarketType.NEPSE]
        return provider
