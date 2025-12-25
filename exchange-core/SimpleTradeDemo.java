import exchange.core2.core.ExchangeApi;
import exchange.core2.core.ExchangeCore;
import exchange.core2.core.IEventsHandler;
import exchange.core2.core.SimpleEventsProcessor;
import exchange.core2.core.common.*;
import exchange.core2.core.common.api.*;
import exchange.core2.core.common.api.binary.BatchAddSymbolsCommand;
import exchange.core2.core.common.cmd.CommandResultCode;
import exchange.core2.core.common.config.ExchangeConfiguration;

/**
 * 超级简单的交易演示
 * 只包含最核心的交易流程
 */
public class SimpleTradeDemo {

    public static void main(String[] args) throws Exception {
        System.out.println("\n" + repeat("=", 60));
        System.out.println("          🚀 Exchange-Core 交易演示");
        System.out.println(repeat("=", 60) + "\n");

        // 1. 创建并启动交易所
        System.out.println("➤ 启动交易所核心...");
        SimpleEventsProcessor eventsProcessor = new SimpleEventsProcessor(new IEventsHandler() {
            @Override
            public void tradeEvent(TradeEvent event) {
                System.out.println("\n💰 [交易成功!]");
                for (Trade trade : event.trades) {
                    System.out.printf("   买家(用户%d) 从 卖家(用户%d) 购买了 %d 手\n",
                            event.takerAction == OrderAction.BID ? event.takerUid : trade.makerUid,
                            event.takerAction == OrderAction.BID ? trade.makerUid : event.takerUid,
                            trade.volume);
                    System.out.printf("   成交价格: %.2f USDT, 成交金额: %.2f USDT\n",
                            trade.price / 100.0, (trade.price * trade.volume * 100_000L) / 100.0);
                }
            }

            @Override
            public void reduceEvent(ReduceEvent event) {
                System.out.printf("\n📉 [订单取消] 用户%d 取消了订单%d\n", event.uid, event.orderId);
            }

            @Override
            public void rejectEvent(RejectEvent event) {
                System.out.printf("\n❌ [订单拒绝] 用户%d的订单%d被拒绝\n", event.uid, event.orderId);
            }

            @Override
            public void commandResult(ApiCommandResult result) {
                // 可以在这里监控每个命令的执行结果
            }

            @Override
            public void orderBook(OrderBook orderBook) {
                // 订单簿更新
            }
        });

        ExchangeCore exchangeCore = ExchangeCore.builder()
                .resultsConsumer(eventsProcessor)
                .exchangeConfiguration(ExchangeConfiguration.defaultBuilder().build())
                .build();
        
        exchangeCore.startup();
        ExchangeApi api = exchangeCore.getApi();
        System.out.println("✓ 交易所已启动\n");
        Thread.sleep(300);

        // 2. 创建交易对
        System.out.println("➤ 创建 BTC/USDT 交易对...");
        CoreSymbolSpecification btcUsdt = CoreSymbolSpecification.builder()
                .symbolId(1)
                .type(SymbolType.CURRENCY_EXCHANGE_PAIR)
                .baseCurrency(1)           // BTC
                .quoteCurrency(2)          // USDT  
                .baseScaleK(100_000L)      // 1手 = 0.001 BTC
                .quoteScaleK(100L)         // 价格精度 0.01 USDT
                .takerFee(10L)
                .makerFee(5L)
                .build();
        
        api.submitBinaryDataAsync(new BatchAddSymbolsCommand(btcUsdt)).get();
        System.out.println("✓ 交易对已创建\n");
        Thread.sleep(200);

        // 3. 创建两个用户
        System.out.println("➤ 创建用户...");
        api.submitCommandAsync(ApiAddUser.builder().uid(101L).build()).get();
        api.submitCommandAsync(ApiAddUser.builder().uid(102L).build()).get();
        System.out.println("✓ 用户 101 (Alice - 买家) 已创建");
        System.out.println("✓ 用户 102 (Bob - 卖家) 已创建\n");
        Thread.sleep(200);

        // 4. 充值
        System.out.println("➤ 用户充值...");
        // Alice 充值 200,000 USDT（足够买5手，每手约 50,000×0.001=50 USDT，实际需要更多作为保证金）
        api.submitCommandAsync(ApiAdjustUserBalance.builder()
                .uid(101L)
                .currency(2)
                .amount(200_000_00L)        // 200,000 USDT
                .transactionId(1L)
                .build()).get();
        System.out.println("✓ Alice 充值: 200,000 USDT");

        // Bob 充值 0.01 BTC
        api.submitCommandAsync(ApiAdjustUserBalance.builder()
                .uid(102L)
                .currency(1)
                .amount(1_000_000L)        // 0.01 BTC (1,000,000 聪)
                .transactionId(2L)
                .build()).get();
        System.out.println("✓ Bob 充值: 0.01 BTC\n");
        Thread.sleep(300);

        // 5. 开始交易!
        System.out.println(repeat("=", 60));
        System.out.println("                    开始交易！");
        System.out.println(repeat("=", 60));

        // Bob 挂出卖单
        System.out.println("\n🔵 Bob 挂单: 以 50,000 USDT/BTC 的价格卖出 5 手 (0.005 BTC)");
        CommandResultCode result = api.submitCommandAsync(ApiPlaceOrder.builder()
                .uid(102L)
                .orderId(1L)
                .price(50_000_00L)         // 50,000 USDT
                .size(5L)                  // 5手
                .action(OrderAction.ASK)   // 卖出
                .orderType(OrderType.GTC)
                .symbol(1)
                .build()).get();
        System.out.println("   订单状态: " + result);
        Thread.sleep(500);

        // 查看订单簿
        System.out.println("\n📖 当前订单簿:");
        L2MarketData orderBook = api.requestOrderBookAsync(1, 10).get();
        printOrderBook(orderBook);
        Thread.sleep(500);

        // Alice 买入
        System.out.println("\n🟢 Alice 买单: 以 50,000 USDT/BTC 的价格买入 3 手 (0.003 BTC)");
        result = api.submitCommandAsync(ApiPlaceOrder.builder()
                .uid(101L)
                .orderId(2L)
                .price(50_000_00L)
                .size(3L)                  // 3手
                .action(OrderAction.BID)   // 买入
                .orderType(OrderType.IOC)  // 立即成交或取消
                .symbol(1)
                .build()).get();
        System.out.println("   订单状态: " + result);
        Thread.sleep(1000);  // 等待交易事件

        // 再次查看订单簿
        System.out.println("\n📖 交易后订单簿:");
        orderBook = api.requestOrderBookAsync(1, 10).get();
        printOrderBook(orderBook);
        Thread.sleep(500);

        // 6. 查看最终余额
        System.out.println("\n" + repeat("=", 60));
        System.out.println("                  交易完成！");
        System.out.println(repeat("=", 60) + "\n");

        System.out.println("💼 最终余额:");
        System.out.printf("   Alice (买家): %.2f USDT, %.8f BTC\n", 
                getBalance(api, 101L, 2) / 100.0,
                getBalance(api, 101L, 1) / 100_000_000.0);
        System.out.printf("   Bob (卖家):   %.2f USDT, %.8f BTC\n",
                getBalance(api, 102L, 2) / 100.0,
                getBalance(api, 102L, 1) / 100_000_000.0);

        System.out.println("\n✅ 演示完成！\n");
        
        Thread.sleep(1000);
        exchangeCore.shutdown();
    }

    private static void printOrderBook(L2MarketData orderBook) {
        System.out.println("   卖单 (ASK):");
        if (orderBook.askSize == 0) {
            System.out.println("     (空)");
        } else {
            for (int i = orderBook.askSize - 1; i >= 0; i--) {
                System.out.printf("     %.2f USDT × %d 手\n",
                        orderBook.askPrices[i] / 100.0,
                        orderBook.askVolumes[i]);
            }
        }
        
        System.out.println("   " + repeat("-", 30));
        
        System.out.println("   买单 (BID):");
        if (orderBook.bidSize == 0) {
            System.out.println("     (空)");
        } else {
            for (int i = 0; i < orderBook.bidSize; i++) {
                System.out.printf("     %.2f USDT × %d 手\n",
                        orderBook.bidPrices[i] / 100.0,
                        orderBook.bidVolumes[i]);
            }
        }
    }

    private static long getBalance(ExchangeApi api, long uid, int currency) {
        try {
            org.eclipse.collections.impl.map.mutable.primitive.IntLongHashMap accounts = 
                api.processReport(new exchange.core2.core.common.api.reports.SingleUserReportQuery(uid), 0)
                .get().getAccounts();
            return accounts.get(currency);
        } catch (Exception e) {
            return 0;
        }
    }

    private static String repeat(String str, int count) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < count; i++) sb.append(str);
        return sb.toString();
    }
}

