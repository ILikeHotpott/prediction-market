import exchange.core2.core.*;
import exchange.core2.core.common.*;
import exchange.core2.core.common.api.*;
import exchange.core2.core.common.api.binary.BatchAddSymbolsCommand;
import exchange.core2.core.common.api.reports.*;
import exchange.core2.core.common.cmd.CommandResultCode;
import exchange.core2.core.common.config.*;
import org.eclipse.collections.impl.map.mutable.primitive.IntLongHashMap;

import java.util.*;
import java.util.concurrent.*;

/**
 * Exchange-Core REST API 包装器示例
 * 
 * 这是一个简化的示例，展示如何将 Exchange-Core 包装成 REST API
 * 实际项目中建议使用 Spring Boot / JAX-RS 等框架
 */
public class ExchangeRestApi {
    
    private final ExchangeCore exchangeCore;
    private final ExchangeApi api;
    private final Map<Long, List<IEventsHandler.TradeEvent>> userTrades = new ConcurrentHashMap<>();
    
    public ExchangeRestApi() {
        // 初始化交易所核心
        SimpleEventsProcessor eventsProcessor = new SimpleEventsProcessor(new IEventsHandler() {
            @Override
            public void tradeEvent(TradeEvent event) {
                // 记录交易事件，可以推送给前端
                recordTradeEvent(event);
                System.out.println("[交易事件] 交易对:" + event.symbol + ", 成交量:" + event.totalVolume);
            }

            @Override
            public void reduceEvent(ReduceEvent event) {
                System.out.println("[减少事件] 订单:" + event.orderId);
            }

            @Override
            public void rejectEvent(RejectEvent event) {
                System.out.println("[拒绝事件] 订单:" + event.orderId);
            }

            @Override
            public void commandResult(ApiCommandResult result) {
                // 可以在这里记录所有命令结果
            }

            @Override
            public void orderBook(OrderBook orderBook) {
                // 可以在这里推送订单簿更新到 WebSocket
            }
        });

        ExchangeConfiguration conf = ExchangeConfiguration.defaultBuilder()
                .ordersProcessingCfg(OrdersProcessingConfiguration.builder()
                        .riskProcessingMode(OrdersProcessingConfiguration.RiskProcessingMode.NO_RISK_PROCESSING)
                        .marginTradingMode(OrdersProcessingConfiguration.MarginTradingMode.MARGIN_TRADING_DISABLED)
                        .build())
                .build();

        this.exchangeCore = ExchangeCore.builder()
                .resultsConsumer(eventsProcessor)
                .exchangeConfiguration(conf)
                .build();

        this.exchangeCore.startup();
        this.api = exchangeCore.getApi();
        
        System.out.println("✓ Exchange API 已启动");
    }

    // ==================== REST API 端点 ====================

    /**
     * POST /api/users
     * 创建用户
     */
    public ApiResponse<String> createUser(long userId) {
        try {
            CommandResultCode result = api.submitCommandAsync(
                    ApiAddUser.builder().uid(userId).build()
            ).get();
            
            if (result == CommandResultCode.SUCCESS) {
                return ApiResponse.success("用户创建成功");
            } else {
                return ApiResponse.error("用户创建失败: " + result);
            }
        } catch (Exception e) {
            return ApiResponse.error("系统错误: " + e.getMessage());
        }
    }

    /**
     * POST /api/symbols
     * 创建交易对
     */
    public ApiResponse<String> createSymbol(CreateSymbolRequest request) {
        try {
            CoreSymbolSpecification spec = CoreSymbolSpecification.builder()
                    .symbolId(request.symbolId)
                    .type(SymbolType.CURRENCY_EXCHANGE_PAIR)
                    .baseCurrency(request.baseCurrency)
                    .quoteCurrency(request.quoteCurrency)
                    .baseScaleK(request.baseScaleK)
                    .quoteScaleK(request.quoteScaleK)
                    .takerFee(request.takerFee)
                    .makerFee(request.makerFee)
                    .build();

            CommandResultCode result = api.submitBinaryDataAsync(
                    new BatchAddSymbolsCommand(spec)
            ).get();

            if (result == CommandResultCode.SUCCESS) {
                return ApiResponse.success("交易对创建成功");
            } else {
                return ApiResponse.error("交易对创建失败: " + result);
            }
        } catch (Exception e) {
            return ApiResponse.error("系统错误: " + e.getMessage());
        }
    }

    /**
     * POST /api/balance/deposit
     * 充值
     */
    public ApiResponse<String> deposit(DepositRequest request) {
        try {
            CommandResultCode result = api.submitCommandAsync(
                    ApiAdjustUserBalance.builder()
                            .uid(request.userId)
                            .currency(request.currency)
                            .amount(request.amount)
                            .transactionId(request.transactionId)
                            .build()
            ).get();

            if (result == CommandResultCode.SUCCESS) {
                return ApiResponse.success("充值成功");
            } else {
                return ApiResponse.error("充值失败: " + result);
            }
        } catch (Exception e) {
            return ApiResponse.error("系统错误: " + e.getMessage());
        }
    }

    /**
     * POST /api/orders
     * 下单
     */
    public ApiResponse<String> placeOrder(PlaceOrderRequest request) {
        try {
            CommandResultCode result = api.submitCommandAsync(
                    ApiPlaceOrder.builder()
                            .uid(request.userId)
                            .orderId(request.orderId)
                            .price(request.price)
                            .size(request.size)
                            .action(request.isBuy ? OrderAction.BID : OrderAction.ASK)
                            .orderType(request.orderType)
                            .symbol(request.symbolId)
                            .build()
            ).get();

            if (result == CommandResultCode.SUCCESS) {
                return ApiResponse.success("订单提交成功");
            } else {
                return ApiResponse.error("订单提交失败: " + result);
            }
        } catch (Exception e) {
            return ApiResponse.error("系统错误: " + e.getMessage());
        }
    }

    /**
     * DELETE /api/orders/{orderId}
     * 取消订单
     */
    public ApiResponse<String> cancelOrder(long userId, long orderId, int symbolId) {
        try {
            CommandResultCode result = api.submitCommandAsync(
                    ApiCancelOrder.builder()
                            .uid(userId)
                            .orderId(orderId)
                            .symbol(symbolId)
                            .build()
            ).get();

            if (result == CommandResultCode.SUCCESS) {
                return ApiResponse.success("订单取消成功");
            } else {
                return ApiResponse.error("订单取消失败: " + result);
            }
        } catch (Exception e) {
            return ApiResponse.error("系统错误: " + e.getMessage());
        }
    }

    /**
     * GET /api/orderbook/{symbolId}
     * 获取订单簿
     */
    public ApiResponse<OrderBookResponse> getOrderBook(int symbolId, int depth) {
        try {
            L2MarketData orderBook = api.requestOrderBookAsync(symbolId, depth).get();
            
            OrderBookResponse response = new OrderBookResponse();
            response.symbolId = symbolId;
            
            // 卖单
            response.asks = new ArrayList<>();
            for (int i = 0; i < orderBook.askSize; i++) {
                PriceLevel level = new PriceLevel();
                level.price = orderBook.askPrices[i];
                level.volume = orderBook.askVolumes[i];
                level.orders = orderBook.askOrders[i];
                response.asks.add(level);
            }
            
            // 买单
            response.bids = new ArrayList<>();
            for (int i = 0; i < orderBook.bidSize; i++) {
                PriceLevel level = new PriceLevel();
                level.price = orderBook.bidPrices[i];
                level.volume = orderBook.bidVolumes[i];
                level.orders = orderBook.bidOrders[i];
                response.bids.add(level);
            }
            
            return ApiResponse.success(response);
        } catch (Exception e) {
            return ApiResponse.error("系统错误: " + e.getMessage());
        }
    }

    /**
     * GET /api/users/{userId}/balance
     * 查询用户余额
     */
    public ApiResponse<Map<Integer, Long>> getUserBalance(long userId) {
        try {
            SingleUserReportResult report = api.processReport(
                    new SingleUserReportQuery(userId), 0
            ).get();

            IntLongHashMap accounts = report.getAccounts();
            Map<Integer, Long> balance = new HashMap<>();
            accounts.forEachKeyValue((currency, amount) -> {
                balance.put(currency, amount);
            });

            return ApiResponse.success(balance);
        } catch (Exception e) {
            return ApiResponse.error("系统错误: " + e.getMessage());
        }
    }

    /**
     * GET /api/users/{userId}/trades
     * 查询用户交易历史
     */
    public ApiResponse<List<IEventsHandler.TradeEvent>> getUserTrades(long userId) {
        List<IEventsHandler.TradeEvent> trades = userTrades.getOrDefault(userId, new ArrayList<>());
        return ApiResponse.success(trades);
    }

    // ==================== 辅助方法 ====================

    private void recordTradeEvent(IEventsHandler.TradeEvent event) {
        // 记录买方交易
        userTrades.computeIfAbsent(
                event.takerAction == OrderAction.BID ? event.takerUid : event.trades.get(0).makerUid,
                k -> new CopyOnWriteArrayList<>()
        ).add(event);

        // 记录卖方交易
        userTrades.computeIfAbsent(
                event.takerAction == OrderAction.ASK ? event.takerUid : event.trades.get(0).makerUid,
                k -> new CopyOnWriteArrayList<>()
        ).add(event);
    }

    public void shutdown() {
        exchangeCore.shutdown();
    }

    // ==================== 数据模型 ====================

    public static class ApiResponse<T> {
        public boolean success;
        public String message;
        public T data;

        public static <T> ApiResponse<T> success(T data) {
            ApiResponse<T> response = new ApiResponse<>();
            response.success = true;
            response.data = data;
            return response;
        }

        public static <T> ApiResponse<T> error(String message) {
            ApiResponse<T> response = new ApiResponse<>();
            response.success = false;
            response.message = message;
            return response;
        }
    }

    public static class CreateSymbolRequest {
        public int symbolId;
        public int baseCurrency;
        public int quoteCurrency;
        public long baseScaleK;
        public long quoteScaleK;
        public long takerFee;
        public long makerFee;
    }

    public static class DepositRequest {
        public long userId;
        public int currency;
        public long amount;
        public long transactionId;
    }

    public static class PlaceOrderRequest {
        public long userId;
        public long orderId;
        public int symbolId;
        public long price;
        public long size;
        public boolean isBuy;
        public OrderType orderType;
    }

    public static class OrderBookResponse {
        public int symbolId;
        public List<PriceLevel> asks;
        public List<PriceLevel> bids;
    }

    public static class PriceLevel {
        public long price;
        public long volume;
        public long orders;
    }

    // ==================== 测试 ====================

    public static void main(String[] args) throws Exception {
        ExchangeRestApi exchangeApi = new ExchangeRestApi();
        
        System.out.println("\n" + repeat("=", 60));
        System.out.println("         REST API 风格的交易演示");
        System.out.println(repeat("=", 60) + "\n");

        // 1. 创建交易对
        System.out.println("➤ 创建交易对...");
        CreateSymbolRequest symbolReq = new CreateSymbolRequest();
        symbolReq.symbolId = 1;
        symbolReq.baseCurrency = 10;
        symbolReq.quoteCurrency = 20;
        symbolReq.baseScaleK = 1L;
        symbolReq.quoteScaleK = 1L;
        symbolReq.takerFee = 0L;
        symbolReq.makerFee = 0L;
        System.out.println("   " + exchangeApi.createSymbol(symbolReq).message);

        // 2. 创建用户
        System.out.println("\n➤ 创建用户...");
        System.out.println("   " + exchangeApi.createUser(101L).message);
        System.out.println("   " + exchangeApi.createUser(102L).message);

        // 3. 充值
        System.out.println("\n➤ 充值...");
        DepositRequest deposit1 = new DepositRequest();
        deposit1.userId = 101L;
        deposit1.currency = 20;
        deposit1.amount = 10000L;
        deposit1.transactionId = 1L;
        System.out.println("   用户101: " + exchangeApi.deposit(deposit1).message);

        DepositRequest deposit2 = new DepositRequest();
        deposit2.userId = 102L;
        deposit2.currency = 10;
        deposit2.amount = 100L;
        deposit2.transactionId = 2L;
        System.out.println("   用户102: " + exchangeApi.deposit(deposit2).message);

        Thread.sleep(300);

        // 4. 下单
        System.out.println("\n➤ 下单交易...");
        PlaceOrderRequest sellOrder = new PlaceOrderRequest();
        sellOrder.userId = 102L;
        sellOrder.orderId = 1L;
        sellOrder.symbolId = 1;
        sellOrder.price = 100L;
        sellOrder.size = 5L;
        sellOrder.isBuy = false;
        sellOrder.orderType = OrderType.GTC;
        System.out.println("   卖单: " + exchangeApi.placeOrder(sellOrder).message);

        Thread.sleep(200);

        PlaceOrderRequest buyOrder = new PlaceOrderRequest();
        buyOrder.userId = 101L;
        buyOrder.orderId = 2L;
        buyOrder.symbolId = 1;
        buyOrder.price = 100L;
        buyOrder.size = 3L;
        buyOrder.isBuy = true;
        buyOrder.orderType = OrderType.IOC;
        System.out.println("   买单: " + exchangeApi.placeOrder(buyOrder).message);

        Thread.sleep(1000);

        // 5. 查询订单簿
        System.out.println("\n➤ 查询订单簿...");
        ApiResponse<OrderBookResponse> orderBookResp = exchangeApi.getOrderBook(1, 10);
        if (orderBookResp.success) {
            OrderBookResponse ob = orderBookResp.data;
            System.out.println("   卖单数: " + ob.asks.size());
            System.out.println("   买单数: " + ob.bids.size());
            if (!ob.asks.isEmpty()) {
                System.out.println("   最低卖价: " + ob.asks.get(0).price + ", 数量: " + ob.asks.get(0).volume);
            }
        }

        // 6. 查询余额
        System.out.println("\n➤ 查询余额...");
        ApiResponse<Map<Integer, Long>> balance1 = exchangeApi.getUserBalance(101L);
        System.out.println("   用户101: " + balance1.data);

        ApiResponse<Map<Integer, Long>> balance2 = exchangeApi.getUserBalance(102L);
        System.out.println("   用户102: " + balance2.data);

        System.out.println("\n✅ API 测试完成!\n");

        Thread.sleep(1000);
        exchangeApi.shutdown();
    }

    private static String repeat(String s, int n) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < n; i++) sb.append(s);
        return sb.toString();
    }
}

