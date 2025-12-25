import exchange.core2.core.ExchangeApi;
import exchange.core2.core.ExchangeCore;
import exchange.core2.core.IEventsHandler;
import exchange.core2.core.SimpleEventsProcessor;
import exchange.core2.core.common.*;
import exchange.core2.core.common.api.*;
import exchange.core2.core.common.api.binary.BatchAddSymbolsCommand;
import exchange.core2.core.common.api.reports.SingleUserReportQuery;
import exchange.core2.core.common.api.reports.SingleUserReportResult;
import exchange.core2.core.common.api.reports.TotalCurrencyBalanceReportQuery;
import exchange.core2.core.common.api.reports.TotalCurrencyBalanceReportResult;
import exchange.core2.core.common.cmd.CommandResultCode;
import exchange.core2.core.common.config.ExchangeConfiguration;

import java.util.concurrent.Future;

/**
 * 简单的交易所测试程序
 * 演示如何创建交易对、用户、充值、下单、撮合交易
 */
public class MyExchangeTest {

    public static void main(String[] args) throws Exception {
        printLine();
        System.out.println("🚀 启动交易所核心系统...");
        printLine();

        // 1. 创建事件处理器 - 监听所有交易事件
        SimpleEventsProcessor eventsProcessor = new SimpleEventsProcessor(new IEventsHandler() {
            @Override
            public void tradeEvent(TradeEvent tradeEvent) {
                System.out.println("\n💰 [交易成功] " + formatTradeEvent(tradeEvent));
            }

            @Override
            public void reduceEvent(ReduceEvent reduceEvent) {
                System.out.println("\n📉 [订单减少] " + formatReduceEvent(reduceEvent));
            }

            @Override
            public void rejectEvent(RejectEvent rejectEvent) {
                System.out.println("\n❌ [订单拒绝] " + formatRejectEvent(rejectEvent));
            }

            @Override
            public void commandResult(ApiCommandResult commandResult) {
                // 命令执行结果（可以注释掉以减少输出）
                // System.out.println("✅ [命令结果] " + commandResult.resultCode());
            }

            @Override
            public void orderBook(OrderBook orderBook) {
                System.out.println("\n📊 [订单簿更新] " + formatOrderBook(orderBook));
            }
        });

        // 2. 创建并启动交易所
        ExchangeConfiguration conf = ExchangeConfiguration.defaultBuilder().build();
        ExchangeCore exchangeCore = ExchangeCore.builder()
                .resultsConsumer(eventsProcessor)
                .exchangeConfiguration(conf)
                .build();
        
        exchangeCore.startup();
        ExchangeApi api = exchangeCore.getApi();
        
        System.out.println("✅ 交易所核心系统已启动！\n");
        Thread.sleep(500); // 等待系统完全启动

        // 3. 定义货币和交易对
        final int CNY = 1;   // 人民币
        final int USDT = 2;  // USDT 稳定币
        final int BTC = 11;  // 比特币
        final int ETH = 60;  // 以太坊
        
        final int SYMBOL_BTC_USDT = 100; // BTC/USDT 交易对

        printLine();
        System.out.println("📝 第一步：创建 BTC/USDT 交易对");
        printLine();
        
        // 创建 BTC/USDT 交易对
        CoreSymbolSpecification btcUsdt = CoreSymbolSpecification.builder()
                .symbolId(SYMBOL_BTC_USDT)
                .type(SymbolType.CURRENCY_EXCHANGE_PAIR)
                .baseCurrency(BTC)        // 基础货币：BTC
                .quoteCurrency(USDT)      // 计价货币：USDT
                .baseScaleK(100_000L)     // 1手 = 0.001 BTC
                .quoteScaleK(100L)        // 价格精度 0.01 USDT
                .takerFee(50L)            // 吃单手续费
                .makerFee(20L)            // 挂单手续费
                .build();
        
        CommandResultCode result = api.submitBinaryDataAsync(new BatchAddSymbolsCommand(btcUsdt)).get();
        System.out.println("交易对创建结果: " + result);
        System.out.println("✅ BTC/USDT 交易对已创建\n");
        Thread.sleep(300);

        // 4. 创建三个用户
        printLine();
        System.out.println("👥 第二步：创建用户账户");
        printLine();
        
        long[] userIds = {1001L, 1002L, 1003L};
        String[] userNames = {"Alice（买家）", "Bob（卖家）", "Charlie（观察者）"};
        
        for (int i = 0; i < userIds.length; i++) {
            result = api.submitCommandAsync(ApiAddUser.builder()
                    .uid(userIds[i])
                    .build()).get();
            System.out.println("创建用户 " + userNames[i] + " (ID: " + userIds[i] + "): " + result);
        }
        System.out.println("✅ 所有用户创建完成\n");
        Thread.sleep(300);

        // 5. 用户充值
        printLine();
        System.out.println("💳 第三步：用户充值");
        printLine();
        
        // Alice 充值 100,000 USDT（准备买 BTC）
        api.submitCommandAsync(ApiAdjustUserBalance.builder()
                .uid(1001L)
                .currency(USDT)
                .amount(100_000_00L)  // 100,000 USDT (精度到分)
                .transactionId(1L)
                .build()).get();
        System.out.println("Alice 充值: 100,000 USDT ✅");

        // Bob 充值 5 BTC（准备卖 BTC）
        api.submitCommandAsync(ApiAdjustUserBalance.builder()
                .uid(1002L)
                .currency(BTC)
                .amount(5_000_000L)   // 5 BTC (精度到聪)
                .transactionId(2L)
                .build()).get();
        System.out.println("Bob 充值: 5 BTC ✅");

        // Charlie 充值 10,000 USDT
        api.submitCommandAsync(ApiAdjustUserBalance.builder()
                .uid(1003L)
                .currency(USDT)
                .amount(10_000_00L)
                .transactionId(3L)
                .build()).get();
        System.out.println("Charlie 充值: 10,000 USDT ✅\n");
        Thread.sleep(300);

        // 6. 查看初始余额
        printLine();
        System.out.println("📊 查看用户余额");
        printLine();
        printUserBalance(api, 1001L, "Alice");
        printUserBalance(api, 1002L, "Bob");
        printUserBalance(api, 1003L, "Charlie");
        System.out.println();
        Thread.sleep(500);

        // 7. 开始下单交易
        printLine();
        System.out.println("📈 第四步：开始交易！");
        printLine();

        // Bob 挂卖单：以 50,000 USDT 的价格卖出 2 BTC
        System.out.println("\n🔵 Bob 挂出卖单：");
        System.out.println("   - 价格: 50,000 USDT/BTC");
        System.out.println("   - 数量: 2 手 (0.002 BTC)");
        System.out.println("   - 类型: GTC (Good-Till-Cancel，一直有效直到成交或取消)");
        
        result = api.submitCommandAsync(ApiPlaceOrder.builder()
                .uid(1002L)
                .orderId(5001L)
                .price(50_000_00L)        // 50,000 USDT
                .size(2L)                 // 2手 = 0.002 BTC
                .action(OrderAction.ASK)  // 卖出
                .orderType(OrderType.GTC)
                .symbol(SYMBOL_BTC_USDT)
                .build()).get();
        System.out.println("   结果: " + result);
        Thread.sleep(500);

        // 查看订单簿
        System.out.println("\n📖 当前订单簿状态：");
        L2MarketData orderBook = api.requestOrderBookAsync(SYMBOL_BTC_USDT, 10).get();
        printOrderBook(orderBook);
        Thread.sleep(500);

        // Alice 部分成交：以市价买入 1 手
        System.out.println("\n🟢 Alice 发出买单：");
        System.out.println("   - 价格: 50,000 USDT/BTC (愿意接受的最高价)");
        System.out.println("   - 数量: 1 手 (0.001 BTC)");
        System.out.println("   - 类型: IOC (Immediate-or-Cancel，立即成交否则取消)");
        
        result = api.submitCommandAsync(ApiPlaceOrder.builder()
                .uid(1001L)
                .orderId(5002L)
                .price(50_000_00L)
                .size(1L)                 // 1手
                .action(OrderAction.BID)  // 买入
                .orderType(OrderType.IOC) // 立即成交或取消
                .symbol(SYMBOL_BTC_USDT)
                .build()).get();
        System.out.println("   结果: " + result);
        Thread.sleep(1000);  // 等待交易事件打印

        // 再次查看订单簿
        System.out.println("\n📖 交易后订单簿状态：");
        orderBook = api.requestOrderBookAsync(SYMBOL_BTC_USDT, 10).get();
        printOrderBook(orderBook);
        Thread.sleep(500);

        // Alice 再下一个买单（挂单）
        System.out.println("\n🟢 Alice 再挂一个买单：");
        System.out.println("   - 价格: 49,500 USDT/BTC");
        System.out.println("   - 数量: 3 手 (0.003 BTC)");
        System.out.println("   - 类型: GTC");
        
        result = api.submitCommandAsync(ApiPlaceOrder.builder()
                .uid(1001L)
                .orderId(5003L)
                .price(49_500_00L)
                .size(3L)
                .action(OrderAction.BID)
                .orderType(OrderType.GTC)
                .symbol(SYMBOL_BTC_USDT)
                .build()).get();
        System.out.println("   结果: " + result);
        Thread.sleep(500);

        // Charlie 也来凑热闹，挂个高价卖单
        System.out.println("\n🔴 Charlie 挂出高价卖单（给 Bob 充值 BTC）：");
        // 先给 Charlie 充值一些 BTC
        api.submitCommandAsync(ApiAdjustUserBalance.builder()
                .uid(1003L)
                .currency(BTC)
                .amount(1_000_000L)   // 1 BTC
                .transactionId(4L)
                .build()).get();
        
        System.out.println("   - 价格: 51,000 USDT/BTC");
        System.out.println("   - 数量: 1 手");
        
        result = api.submitCommandAsync(ApiPlaceOrder.builder()
                .uid(1003L)
                .orderId(5004L)
                .price(51_000_00L)
                .size(1L)
                .action(OrderAction.ASK)
                .orderType(OrderType.GTC)
                .symbol(SYMBOL_BTC_USDT)
                .build()).get();
        System.out.println("   结果: " + result);
        Thread.sleep(500);

        // 查看最终订单簿
        System.out.println("\n📖 当前完整订单簿：");
        orderBook = api.requestOrderBookAsync(SYMBOL_BTC_USDT, 10).get();
        printOrderBook(orderBook);
        Thread.sleep(500);

        // 8. 订单管理演示
        System.out.println();
        printLine();
        System.out.println("🔧 第五步：订单管理操作");
        printLine();

        // Alice 修改订单价格
        System.out.println("\n🔄 Alice 修改买单价格：49,500 -> 49,800 USDT");
        result = api.submitCommandAsync(ApiMoveOrder.builder()
                .uid(1001L)
                .orderId(5003L)
                .newPrice(49_800_00L)
                .symbol(SYMBOL_BTC_USDT)
                .build()).get();
        System.out.println("   结果: " + result);
        Thread.sleep(500);

        // Bob 取消部分卖单
        System.out.println("\n❌ Bob 取消剩余的卖单");
        result = api.submitCommandAsync(ApiCancelOrder.builder()
                .uid(1002L)
                .orderId(5001L)
                .symbol(SYMBOL_BTC_USDT)
                .build()).get();
        System.out.println("   结果: " + result);
        Thread.sleep(1000);

        // 9. 查看最终状态
        System.out.println();
        printLine();
        System.out.println("📊 第六步：查看最终余额和统计");
        printLine();
        
        printUserBalance(api, 1001L, "Alice");
        printUserBalance(api, 1002L, "Bob");
        printUserBalance(api, 1003L, "Charlie");

        // 查看系统统计
        Future<TotalCurrencyBalanceReportResult> totals = api.processReport(
                new TotalCurrencyBalanceReportQuery(), 0);
        System.out.println("\n💼 系统统计：");
        System.out.println("   USDT 手续费收入: " + totals.get().getFees().get(USDT) / 100.0 + " USDT");
        
        // 最终订单簿
        System.out.println("\n📖 最终订单簿状态：");
        orderBook = api.requestOrderBookAsync(SYMBOL_BTC_USDT, 10).get();
        printOrderBook(orderBook);

        System.out.println();
        printLine();
        System.out.println("✅ 测试完成！交易所运行正常");
        printLine();
        
        // 保持程序运行一会儿，确保所有事件都被处理
        Thread.sleep(2000);
        
        // 关闭交易所
        exchangeCore.shutdown();
        System.out.println("\n👋 交易所已关闭");
    }

    // 辅助方法：打印分隔线
    private static void printLine() {
        for (int i = 0; i < 80; i++) System.out.print("=");
        System.out.println();
    }

    // 辅助方法：打印用户余额
    private static void printUserBalance(ExchangeApi api, long uid, String name) throws Exception {
        Future<SingleUserReportResult> report = api.processReport(new SingleUserReportQuery(uid), 0);
        org.eclipse.collections.impl.map.mutable.primitive.IntLongHashMap accounts = report.get().getAccounts();
        
        System.out.println("\n👤 " + name + " (ID: " + uid + "):");
        accounts.forEachKeyValue((currency, balance) -> {
            String currencyName = getCurrencyName(currency);
            String amount = formatAmount(currency, balance);
            System.out.println("   - " + currencyName + ": " + amount);
        });
    }

    // 辅助方法：获取货币名称
    private static String getCurrencyName(int currency) {
        switch (currency) {
            case 1: return "CNY";
            case 2: return "USDT";
            case 11: return "BTC";
            case 60: return "ETH";
            default: return "Currency-" + currency;
        }
    }

    // 辅助方法：格式化金额
    private static String formatAmount(int currency, long amount) {
        if (currency == 11) { // BTC
            return String.format("%.8f BTC", amount / 100_000_000.0);
        } else if (currency == 2) { // USDT
            return String.format("%.2f USDT", amount / 100.0);
        } else {
            return amount + " (原始值)";
        }
    }

    // 辅助方法：格式化交易事件
    private static String formatTradeEvent(IEventsHandler.TradeEvent event) {
        StringBuilder sb = new StringBuilder();
        sb.append("交易对: ").append(event.symbol);
        sb.append(", 总成交量: ").append(event.totalVolume);
        sb.append(", Taker订单: ").append(event.takerOrderId);
        sb.append(", Taker用户: ").append(event.takerUid);
        sb.append(", 方向: ").append(event.takerAction == OrderAction.BID ? "买入" : "卖出");
        
        for (IEventsHandler.Trade trade : event.trades) {
            sb.append("\n   -> 成交价格: ").append(trade.price / 100.0);
            sb.append(", 成交量: ").append(trade.volume);
            sb.append(", Maker订单: ").append(trade.makerOrderId);
            sb.append(", Maker用户: ").append(trade.makerUid);
        }
        return sb.toString();
    }

    // 辅助方法：格式化减少事件
    private static String formatReduceEvent(IEventsHandler.ReduceEvent event) {
        return String.format("订单 %d (用户 %d) 减少 %d 手, 价格 %.2f",
                event.orderId, event.uid, event.reducedVolume, event.price / 100.0);
    }

    // 辅助方法：格式化拒绝事件
    private static String formatRejectEvent(IEventsHandler.RejectEvent event) {
        return String.format("订单 %d (用户 %d) 被拒绝, 价格: %.2f, 数量: %d",
                event.orderId, event.uid, event.price / 100.0, event.rejectedVolume);
    }

    // 辅助方法：格式化订单簿事件
    private static String formatOrderBook(IEventsHandler.OrderBook orderBook) {
        StringBuilder sb = new StringBuilder();
        sb.append("交易对: ").append(orderBook.symbol);
        sb.append(", 买单数: ").append(orderBook.bids.size());
        sb.append(", 卖单数: ").append(orderBook.asks.size());
        return sb.toString();
    }

    // 辅助方法：打印订单簿
    private static void printOrderBook(L2MarketData orderBook) {
        System.out.println("\n   卖单 (ASK):");
        if (orderBook.askSize == 0) {
            System.out.println("   (空)");
        } else {
            for (int i = orderBook.askSize - 1; i >= 0; i--) {
                System.out.printf("   %.2f USDT  |  %d 手  |  %d 档\n",
                        orderBook.askPrices[i] / 100.0,
                        orderBook.askVolumes[i],
                        orderBook.askOrders[i]);
            }
        }
        
        System.out.print("   ");
        for (int i = 0; i < 50; i++) System.out.print("-");
        System.out.println();
        
        System.out.println("   买单 (BID):");
        if (orderBook.bidSize == 0) {
            System.out.println("   (空)");
        } else {
            for (int i = 0; i < orderBook.bidSize; i++) {
                System.out.printf("   %.2f USDT  |  %d 手  |  %d 档\n",
                        orderBook.bidPrices[i] / 100.0,
                        orderBook.bidVolumes[i],
                        orderBook.bidOrders[i]);
            }
        }
    }
}

