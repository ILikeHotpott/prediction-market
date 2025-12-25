# 实际使用示例

## 📋 完整的交易流程示例

### 场景：两个用户进行 BTC/USDT 交易

---

## 🚀 第一步：初始化系统

### 1.1 创建资产（币种）

```bash
# 创建 BTC（资产ID: 1, 精度: 8位小数）
curl -X POST http://localhost:8080/syncAdminApi/v1/assets \
  -H "Content-Type: application/json" \
  -d '{
    "assetCode": "BTC",
    "assetId": 1,
    "scale": 8
  }'

# 返回:
{
  "code": 0,
  "message": "success",
  "data": {
    "assetCode": "BTC",
    "assetId": 1,
    "scale": 8,
    "active": true
  }
}
```

```bash
# 创建 USDT（资产ID: 2, 精度: 2位小数）
curl -X POST http://localhost:8080/syncAdminApi/v1/assets \
  -H "Content-Type: application/json" \
  -d '{
    "assetCode": "USDT",
    "assetId": 2,
    "scale": 2
  }'
```

### 1.2 创建交易对

```bash
curl -X POST http://localhost:8080/syncAdminApi/v1/symbols \
  -H "Content-Type: application/json" \
  -d '{
    "symbolId": 100,
    "symbolCode": "BTCUSDT",
    "symbolType": "CURRENCY_EXCHANGE_PAIR",
    "baseAsset": "BTC",
    "quoteCurrency": "USDT",
    "lotSize": 0.01,
    "stepSize": 1,
    "takerFee": 0.001,
    "makerFee": 0.0005,
    "marginBuy": 0,
    "marginSell": 0,
    "priceHighLimit": 1000000,
    "priceLowLimit": 0
  }'

# 返回:
{
  "code": 0,
  "message": "success",
  "data": {
    "symbolId": 100,
    "symbolCode": "BTCUSDT",
    "lotSize": 0.01,
    "stepSize": 1,
    "takerFee": 0.001,
    "makerFee": 0.0005,
    "status": "ACTIVE"
  }
}
```

**参数说明**:
- `lotSize: 0.01` - 每手 0.01 BTC
- `stepSize: 1` - 价格步长 1 USDT
- `takerFee: 0.001` - Taker 手续费 0.1% (每手 0.001 USDT)
- `makerFee: 0.0005` - Maker 手续费 0.05%

---

## 👥 第二步：创建用户并充值

### 2.1 创建用户 Alice (UID: 301)

```bash
curl -X POST http://localhost:8080/syncAdminApi/v1/users/301 \
  -H "Content-Type: application/json"

# 返回:
{
  "code": 0,
  "message": "success",
  "data": {
    "uid": 301
  }
}
```

### 2.2 给 Alice 充值 100,000 USDT

```bash
curl -X POST http://localhost:8080/syncAdminApi/v1/users/301/balance \
  -H "Content-Type: application/json" \
  -d '{
    "currency": 2,
    "amount": 10000000,
    "transactionId": 1001
  }'

# 返回:
{
  "code": 0,
  "message": "success",
  "data": {
    "uid": 301,
    "currency": 2,
    "balance": 10000000
  }
}
```

**注意**: `amount: 10000000` = 100,000 USDT (因为精度是 2 位，所以要乘以 100)

### 2.3 创建用户 Bob (UID: 302)

```bash
curl -X POST http://localhost:8080/syncAdminApi/v1/users/302 \
  -H "Content-Type: application/json"
```

### 2.4 给 Bob 充值 10 BTC

```bash
curl -X POST http://localhost:8080/syncAdminApi/v1/users/302/balance \
  -H "Content-Type: application/json" \
  -d '{
    "currency": 1,
    "amount": 1000000000,
    "transactionId": 1002
  }'
```

**注意**: `amount: 1000000000` = 10 BTC (因为精度是 8 位，所以要乘以 100000000)

---

## 📈 第三步：交易测试

### 3.1 Alice 下买单（BID）

**场景**: Alice 想以 50,000 USDT/BTC 的价格买入 10 手 (0.1 BTC)

```bash
curl -X POST http://localhost:8080/syncTradeApi/v1/symbols/BTCUSDT/trade/301/orders \
  -H "Content-Type: application/json" \
  -d '{
    "price": 50000,
    "size": 10,
    "action": "BID",
    "orderType": "GTC",
    "userCookie": 1001
  }'

# 返回:
{
  "code": 0,
  "message": "success",
  "data": {
    "orderId": 5001,
    "symbol": "BTCUSDT",
    "price": 50000,
    "size": 10,
    "filled": 0,
    "state": "NEW",
    "action": "BID",
    "orderType": "GTC",
    "userCookie": 1001
  }
}
```

**订单簿状态**:
```
Asks: (无)
---------- 50000 (最高买价)
Bids:
  50000  |  10 手 (Alice)
```

### 3.2 查询订单簿

```bash
curl "http://localhost:8080/syncTradeApi/v1/symbols/BTCUSDT/orderbook?depth=10"

# 返回:
{
  "code": 0,
  "data": {
    "symbol": "BTCUSDT",
    "askPrices": [],
    "askVolumes": [],
    "bidPrices": [50000],
    "bidVolumes": [10]
  }
}
```

### 3.3 Bob 下卖单（ASK）- 立即成交

**场景**: Bob 想以 49,999 USDT/BTC 的价格卖出 5 手 (0.05 BTC)

```bash
curl -X POST http://localhost:8080/syncTradeApi/v1/symbols/BTCUSDT/trade/302/orders \
  -H "Content-Type: application/json" \
  -d '{
    "price": 49999,
    "size": 5,
    "action": "ASK",
    "orderType": "GTC",
    "userCookie": 2001
  }'

# 返回:
{
  "code": 0,
  "message": "success",
  "data": {
    "orderId": 5002,
    "symbol": "BTCUSDT",
    "price": 49999,
    "size": 5,
    "filled": 5,
    "state": "COMPLETED",
    "action": "ASK",
    "orderType": "GTC",
    "userCookie": 2001,
    "deals": [
      {
        "tradeId": 1,
        "price": 50000,
        "size": 5,
        "matchedOrderId": 5001,
        "timestamp": 1699430400000
      }
    ]
  }
}
```

**成交说明**:
- Bob 的卖单价格 49999 **低于** Alice 的买单价格 50000
- 按照价格优先原则，以 Alice 的价格 50000 成交
- Bob 作为 Taker（主动成交），Alice 作为 Maker（被动成交）
- 成交数量: 5 手 (0.05 BTC)
- 成交金额: 50000 × 5 × 0.01 = 2500 USDT

**手续费计算**:
- Alice (Maker): 2500 × 0.0005 = 1.25 USDT
- Bob (Taker): 2500 × 0.001 = 2.5 USDT

**余额变化**:
- Alice:
  - USDT: 100,000 - 2,500 - 1.25 = 97,498.75 USDT
  - BTC: 0 + 0.05 = 0.05 BTC
- Bob:
  - BTC: 10 - 0.05 = 9.95 BTC
  - USDT: 0 + 2,500 - 2.5 = 2,497.5 USDT

**订单簿状态**:
```
Asks: (无)
---------- 50000 (最高买价)
Bids:
  50000  |  5 手 (Alice 剩余)
```

### 3.4 查询用户账户

```bash
# 查询 Alice 的账户
curl "http://localhost:8080/syncTradeApi/v1/accounts/301"

# 返回:
{
  "code": 0,
  "data": {
    "uid": 301,
    "balances": {
      "USDT": 9749875,
      "BTC": 5000000
    },
    "openOrders": [
      {
        "orderId": 5001,
        "symbol": "BTCUSDT",
        "price": 50000,
        "size": 10,
        "filled": 5,
        "state": "ACTIVE"
      }
    ]
  }
}
```

### 3.5 Bob 再下卖单 - 部分成交

```bash
curl -X POST http://localhost:8080/syncTradeApi/v1/symbols/BTCUSDT/trade/302/orders \
  -H "Content-Type: application/json" \
  -d '{
    "price": 50001,
    "size": 10,
    "action": "ASK",
    "orderType": "GTC",
    "userCookie": 2002
  }'

# 返回:
{
  "code": 0,
  "data": {
    "orderId": 5003,
    "symbol": "BTCUSDT",
    "price": 50001,
    "size": 10,
    "filled": 5,
    "state": "ACTIVE",
    "deals": [
      {
        "tradeId": 2,
        "price": 50000,
        "size": 5,
        "matchedOrderId": 5001,
        "timestamp": 1699430500000
      }
    ]
  }
}
```

**成交说明**:
- Bob 的卖单价格 50001 **高于** Alice 的买单价格 50000
- Alice 的剩余 5 手被全部成交
- Bob 的订单部分成交 5 手，剩余 5 手挂在订单簿

**订单簿状态**:
```
Asks:
  50001  |  5 手 (Bob 剩余)
---------- (无买单)
Bids: (无)
```

### 3.6 撤销订单

```bash
# Bob 撤销剩余的卖单
curl -X DELETE "http://localhost:8080/syncTradeApi/v1/symbols/BTCUSDT/trade/302/orders/5003"

# 返回:
{
  "code": 0,
  "data": {
    "orderId": 5003,
    "state": "CANCELLED"
  }
}
```

### 3.7 修改订单价格

```bash
# Alice 下新的买单
curl -X POST http://localhost:8080/syncTradeApi/v1/symbols/BTCUSDT/trade/301/orders \
  -H "Content-Type: application/json" \
  -d '{
    "price": 48000,
    "size": 10,
    "action": "BID",
    "orderType": "GTC",
    "userCookie": 1002
  }'

# 返回: orderId: 5004

# 修改价格到 48500
curl -X PUT http://localhost:8080/syncTradeApi/v1/symbols/BTCUSDT/trade/301/orders/5004 \
  -H "Content-Type: application/json" \
  -d '{
    "price": 48500
  }'

# 返回:
{
  "code": 0,
  "data": {
    "orderId": 5004,
    "price": 48500,
    "state": "ACTIVE"
  }
}
```

---

## 📡 WebSocket 实时推送

### 连接 WebSocket

```javascript
// 使用 STOMP over WebSocket
const socket = new SockJS('http://localhost:8080/ws');
const stompClient = Stomp.over(socket);

stompClient.connect({}, function(frame) {
    console.log('Connected: ' + frame);
    
    // 订阅 BTCUSDT 的行情推送
    stompClient.subscribe('/topic/ticks/BTCUSDT', function(message) {
        const tick = JSON.parse(message.body);
        console.log('New tick:', tick);
        // { price: 50000, size: 5, timestamp: 1699430400000 }
    });
    
    // 订阅用户 301 的订单更新
    stompClient.subscribe('/topic/orders/uid/301', function(message) {
        const orderUpdate = JSON.parse(message.body);
        console.log('Order update:', orderUpdate);
        // { orderId: 5001, state: "COMPLETED", filled: 10 }
    });
});
```

### 推送事件示例

当 Bob 的卖单成交时，所有订阅者会收到:

**行情推送** (`/topic/ticks/BTCUSDT`):
```json
{
  "price": 50000,
  "size": 5,
  "timestamp": 1699430400000
}
```

**Alice 的订单更新** (`/topic/orders/uid/301`):
```json
{
  "uid": 301,
  "orderId": 5001,
  "price": 50000,
  "size": 10,
  "filled": 5,
  "state": "ACTIVE",
  "action": "BID",
  "orderType": "GTC",
  "symbol": "BTCUSDT"
}
```

**Bob 的订单更新** (`/topic/orders/uid/302`):
```json
{
  "uid": 302,
  "orderId": 5002,
  "price": 49999,
  "size": 5,
  "filled": 5,
  "state": "COMPLETED",
  "action": "ASK",
  "orderType": "GTC",
  "symbol": "BTCUSDT"
}
```

---

## 🔍 查询 API

### 查询用户交易历史

```bash
curl "http://localhost:8080/syncTradeApi/v1/accounts/301/trades?symbol=BTCUSDT&limit=10"

# 返回:
{
  "code": 0,
  "data": {
    "trades": [
      {
        "tradeId": 2,
        "orderId": 5001,
        "symbol": "BTCUSDT",
        "price": 50000,
        "size": 5,
        "role": "MAKER",
        "fee": 1.25,
        "timestamp": 1699430500000
      },
      {
        "tradeId": 1,
        "orderId": 5001,
        "symbol": "BTCUSDT",
        "price": 50000,
        "size": 5,
        "role": "MAKER",
        "fee": 1.25,
        "timestamp": 1699430400000
      }
    ]
  }
}
```

### 查询活跃订单

```bash
curl "http://localhost:8080/syncTradeApi/v1/accounts/301/orders?status=ACTIVE"

# 返回:
{
  "code": 0,
  "data": {
    "orders": [
      {
        "orderId": 5004,
        "symbol": "BTCUSDT",
        "price": 48500,
        "size": 10,
        "filled": 0,
        "state": "ACTIVE",
        "action": "BID",
        "timestamp": 1699430600000
      }
    ]
  }
}
```

### 查询交易对信息

```bash
curl "http://localhost:8080/syncTradeApi/v1/symbols/BTCUSDT"

# 返回:
{
  "code": 0,
  "data": {
    "symbol": "BTCUSDT",
    "baseAsset": "BTC",
    "quoteAsset": "USDT",
    "lotSize": 0.01,
    "stepSize": 1,
    "takerFee": 0.001,
    "makerFee": 0.0005,
    "status": "ACTIVE",
    "stats24h": {
      "high": 50000,
      "low": 50000,
      "volume": 10,
      "quoteVolume": 500000,
      "trades": 2
    }
  }
}
```

### 查询 K 线数据

```bash
curl "http://localhost:8080/syncTradeApi/v1/symbols/BTCUSDT/klines?interval=1m&limit=100"

# 返回:
{
  "code": 0,
  "data": {
    "symbol": "BTCUSDT",
    "interval": "1m",
    "bars": [
      {
        "timestamp": 1699430400000,
        "open": 50000,
        "high": 50000,
        "low": 50000,
        "close": 50000,
        "volume": 5
      },
      {
        "timestamp": 1699430460000,
        "open": 50000,
        "high": 50000,
        "low": 50000,
        "close": 50000,
        "volume": 5
      }
    ]
  }
}
```

---

## 💡 高级用例

### IOC 订单（立即成交或取消）

```bash
curl -X POST http://localhost:8080/syncTradeApi/v1/symbols/BTCUSDT/trade/301/orders \
  -H "Content-Type: application/json" \
  -d '{
    "price": 50000,
    "size": 10,
    "action": "BID",
    "orderType": "IOC",
    "userCookie": 1003
  }'

# IOC 订单特点:
# - 如果有对手盘，立即成交
# - 如果没有对手盘或部分成交，剩余部分自动取消
# - 不会挂在订单簿上
```

### FOK 订单（全部成交或取消）

```bash
curl -X POST http://localhost:8080/syncTradeApi/v1/symbols/BTCUSDT/trade/301/orders \
  -H "Content-Type: application/json" \
  -d '{
    "price": 50000,
    "size": 10,
    "action": "BID",
    "orderType": "FOK_BUDGET",
    "userCookie": 1004
  }'

# FOK 订单特点:
# - 必须全部成交，否则整个订单取消
# - 不会部分成交
# - 适合大额交易
```

---

## 🎯 完整的 Python 客户端示例

```python
import requests
import json

class ExchangeClient:
    def __init__(self, base_url="http://localhost:8080"):
        self.base_url = base_url
        self.session = requests.Session()
    
    def create_asset(self, asset_code, asset_id, scale):
        """创建资产"""
        url = f"{self.base_url}/syncAdminApi/v1/assets"
        data = {
            "assetCode": asset_code,
            "assetId": asset_id,
            "scale": scale
        }
        return self.session.post(url, json=data).json()
    
    def create_symbol(self, symbol_id, symbol_code, base_asset, quote_currency):
        """创建交易对"""
        url = f"{self.base_url}/syncAdminApi/v1/symbols"
        data = {
            "symbolId": symbol_id,
            "symbolCode": symbol_code,
            "symbolType": "CURRENCY_EXCHANGE_PAIR",
            "baseAsset": base_asset,
            "quoteCurrency": quote_currency,
            "lotSize": 0.01,
            "stepSize": 1,
            "takerFee": 0.001,
            "makerFee": 0.0005,
            "marginBuy": 0,
            "marginSell": 0,
            "priceHighLimit": 1000000,
            "priceLowLimit": 0
        }
        return self.session.post(url, json=data).json()
    
    def create_user(self, uid):
        """创建用户"""
        url = f"{self.base_url}/syncAdminApi/v1/users/{uid}"
        return self.session.post(url).json()
    
    def deposit(self, uid, currency, amount, tx_id):
        """充值"""
        url = f"{self.base_url}/syncAdminApi/v1/users/{uid}/balance"
        data = {
            "currency": currency,
            "amount": amount,
            "transactionId": tx_id
        }
        return self.session.post(url, json=data).json()
    
    def place_order(self, uid, symbol, price, size, action, order_type="GTC"):
        """下单"""
        url = f"{self.base_url}/syncTradeApi/v1/symbols/{symbol}/trade/{uid}/orders"
        data = {
            "price": price,
            "size": size,
            "action": action,
            "orderType": order_type,
            "userCookie": 1
        }
        return self.session.post(url, json=data).json()
    
    def cancel_order(self, uid, symbol, order_id):
        """撤单"""
        url = f"{self.base_url}/syncTradeApi/v1/symbols/{symbol}/trade/{uid}/orders/{order_id}"
        return self.session.delete(url).json()
    
    def get_orderbook(self, symbol, depth=10):
        """获取订单簿"""
        url = f"{self.base_url}/syncTradeApi/v1/symbols/{symbol}/orderbook"
        return self.session.get(url, params={"depth": depth}).json()

# 使用示例
client = ExchangeClient()

# 1. 创建资产
client.create_asset("BTC", 1, 8)
client.create_asset("USDT", 2, 2)

# 2. 创建交易对
client.create_symbol(100, "BTCUSDT", "BTC", "USDT")

# 3. 创建用户
client.create_user(301)
client.create_user(302)

# 4. 充值
client.deposit(301, 2, 10000000, 1001)  # Alice 充 100,000 USDT
client.deposit(302, 1, 1000000000, 1002)  # Bob 充 10 BTC

# 5. 下单
alice_order = client.place_order(301, "BTCUSDT", 50000, 10, "BID")
print(f"Alice 订单: {alice_order}")

bob_order = client.place_order(302, "BTCUSDT", 49999, 5, "ASK")
print(f"Bob 订单: {bob_order}")

# 6. 查询订单簿
orderbook = client.get_orderbook("BTCUSDT")
print(f"订单簿: {orderbook}")
```

---

## 🎉 总结

这个完整的示例展示了:

1. ✅ 如何初始化交易所（创建资产、交易对）
2. ✅ 如何管理用户（创建、充值）
3. ✅ 如何进行交易（下单、撤单、修改）
4. ✅ 如何查询数据（订单簿、账户、历史）
5. ✅ 如何使用 WebSocket 接收实时推送
6. ✅ 如何编写客户端代码

现在你可以基于这个示例开发自己的交易应用了！🚀

