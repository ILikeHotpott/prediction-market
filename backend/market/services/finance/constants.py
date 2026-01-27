FINANCE_INTERVALS = {
    "15m": {
        "label": "15Min",
        "minutes": 15,
        "title_suffix": "in the next 15 minutes",
    },
    "1h": {
        "label": "Hourly",
        "minutes": 60,
        "title_suffix": "in the next hour",
    },
    "1d": {
        "label": "Daily",
        "minutes": 24 * 60,
        "title_suffix": "today",
    },
    "1w": {
        "label": "Weekly",
        "minutes": 7 * 24 * 60,
        "title_suffix": "this week",
    },
}


FINANCE_ASSETS = {
    "BTC": {
        "name": "Bitcoin",
        "type": "crypto",
        "source": "binance",
        "stream_symbol": "btcusdt",
        "image_url": "/Finance_logo/Bitcoin.png",
    },
    "ETH": {
        "name": "Ethereum",
        "type": "crypto",
        "source": "binance",
        "stream_symbol": "ethusdt",
        "image_url": "/Finance_logo/eth.webp",
    },
    "NVDA": {
        "name": "Nvidia",
        "type": "stock",
        "source": "finnhub",
        "stream_symbol": "NVDA",
        "image_url": "/Finance_logo/Nvidia.png",
    },
    "TSLA": {
        "name": "Tesla",
        "type": "stock",
        "source": "finnhub",
        "stream_symbol": "TSLA",
        "image_url": "/Finance_logo/Tesla.png",
    },
    "GOOGL": {
        "name": "Google",
        "type": "stock",
        "source": "finnhub",
        "stream_symbol": "GOOGL",
        "image_url": "/Finance_logo/Google.png",
    },
    "AAPL": {
        "name": "Apple",
        "type": "stock",
        "source": "finnhub",
        "stream_symbol": "AAPL",
        "image_url": "/Finance_logo/Apple-Logo.png",
    },
    "MSFT": {
        "name": "Microsoft",
        "type": "stock",
        "source": "finnhub",
        "stream_symbol": "MSFT",
        "image_url": "/Finance_logo/Microsoft_logo.png",
    },
    "META": {
        "name": "Meta",
        "type": "stock",
        "source": "finnhub",
        "stream_symbol": "META",
        "image_url": "/Finance_logo/meta-logo.webp",
    },
    "AMZN": {
        "name": "Amazon",
        "type": "stock",
        "source": "finnhub",
        "stream_symbol": "AMZN",
        "image_url": "/Finance_logo/Amazon.png",
    },
}


BINANCE_STREAM_SYMBOLS = [
    asset["stream_symbol"] for asset in FINANCE_ASSETS.values() if asset["source"] == "binance"
]

FINNHUB_SYMBOLS = [
    asset["stream_symbol"] for asset in FINANCE_ASSETS.values() if asset["source"] == "finnhub"
]

BINANCE_SYMBOL_MAP = {
    asset["stream_symbol"].upper(): symbol
    for symbol, asset in FINANCE_ASSETS.items()
    if asset["source"] == "binance"
}

FINNHUB_SYMBOL_MAP = {
    asset["stream_symbol"].upper(): symbol
    for symbol, asset in FINANCE_ASSETS.items()
    if asset["source"] == "finnhub"
}
