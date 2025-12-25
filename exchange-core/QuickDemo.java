import exchange.core2.core.*;
import exchange.core2.core.common.*;
import exchange.core2.core.common.api.*;
import exchange.core2.core.common.api.binary.BatchAddSymbolsCommand;
import exchange.core2.core.common.config.*;

/**
 * 最简单的交易演示 - 确保成功!
 */
public class QuickDemo {
    public static void main(String[] args) throws Exception {
        System.out.println("\n🚀 启动交易所...\n");

        // 创建事件监听器
        SimpleEventsProcessor eventsProcessor = new SimpleEventsProcessor(new IEventsHandler() {
            public void tradeEvent(TradeEvent e) {
                System.out.println("💰 交易成功!");
                System.out.println("   买家: 用户" + (e.takerAction == OrderAction.BID ? e.takerUid : e.trades.get(0).makerUid));
                System.out.println("   卖家: 用户" + (e.takerAction == OrderAction.ASK ? e.takerUid : e.trades.get(0).makerUid));
                System.out.println("   成交量: " + e.totalVolume + " 手");
                System.out.println("   成交价: " + e.trades.get(0).price + "\n");
            }
            public void reduceEvent(ReduceEvent e) {}
            public void rejectEvent(RejectEvent e) {
                System.out.println("❌ 订单" + e.orderId + "被拒绝\n");
            }
            public void commandResult(IEventsHandler.ApiCommandResult r) {}
            public void orderBook(IEventsHandler.OrderBook o) {}
        });

        // 配置为现货模式（不需要保证金）
        ExchangeConfiguration conf = ExchangeConfiguration.defaultBuilder()
                .ordersProcessingCfg(OrdersProcessingConfiguration.builder()
                        .riskProcessingMode(OrdersProcessingConfiguration.RiskProcessingMode.NO_RISK_PROCESSING)
                        .marginTradingMode(OrdersProcessingConfiguration.MarginTradingMode.MARGIN_TRADING_DISABLED)
                        .build())
                .build();

        ExchangeCore exchangeCore = ExchangeCore.builder()
                .resultsConsumer(eventsProcessor)
                .exchangeConfiguration(conf)
                .build();

        exchangeCore.startup();
        ExchangeApi api = exchangeCore.getApi();
        Thread.sleep(200);

        // 创建交易对
        System.out.println("📝 创建交易对...");
        api.submitBinaryDataAsync(new BatchAddSymbolsCommand(
                CoreSymbolSpecification.builder()
                        .symbolId(1)
                        .type(SymbolType.CURRENCY_EXCHANGE_PAIR)
                        .baseCurrency(10)          // 基础币
                        .quoteCurrency(20)         // 计价币
                        .baseScaleK(1L)            // 1手 = 1个基础单位
                        .quoteScaleK(1L)           // 价格精度
                        .takerFee(0L)
                        .makerFee(0L)
                        .build()
        )).get();
        System.out.println("✓ 完成\n");

        // 创建用户
        System.out.println("👥 创建用户...");
        api.submitCommandAsync(ApiAddUser.builder().uid(1L).build()).get();
        api.submitCommandAsync(ApiAddUser.builder().uid(2L).build()).get();
        System.out.println("✓ 用户1 (买家)");
        System.out.println("✓ 用户2 (卖家)\n");

        // 充值
        System.out.println("💰 充值...");
        api.submitCommandAsync(ApiAdjustUserBalance.builder()
                .uid(1L).currency(20).amount(10000L).transactionId(1L).build()).get();
        System.out.println("✓ 用户1: 10000 计价币");

        api.submitCommandAsync(ApiAdjustUserBalance.builder()
                .uid(2L).currency(10).amount(100L).transactionId(2L).build()).get();
        System.out.println("✓ 用户2: 100 基础币\n");

        Thread.sleep(300);

        // 交易!
        System.out.println(repeat("=", 50));
        System.out.println("               开始交易!");
        System.out.println(repeat("=", 50) + "\n");

        // 卖家挂单
        System.out.println("🔵 用户2 挂单: 价格100, 卖出5手");
        api.submitCommandAsync(ApiPlaceOrder.builder()
                .uid(2L).orderId(1L).price(100L).size(5L)
                .action(OrderAction.ASK).orderType(OrderType.GTC).symbol(1)
                .build()).get();
        Thread.sleep(300);

        // 买家买入
        System.out.println("🟢 用户1 买入: 价格100, 买入3手\n");
        api.submitCommandAsync(ApiPlaceOrder.builder()
                .uid(1L).orderId(2L).price(100L).size(3L)
                .action(OrderAction.BID).orderType(OrderType.IOC).symbol(1)
                .build()).get();
        
        Thread.sleep(1000);

        // 查看余额
        System.out.println(repeat("=", 50));
        System.out.println("               交易完成!");
        System.out.println(repeat("=", 50) + "\n");

        System.out.println("💼 最终余额:");
        System.out.println("   用户1 (买家): 基础币=" + getBalance(api, 1L, 10) + ", 计价币=" + getBalance(api, 1L, 20));
        System.out.println("   用户2 (卖家): 基础币=" + getBalance(api, 2L, 10) + ", 计价币=" + getBalance(api, 2L, 20));
        
        System.out.println("\n✅ 演示完成!\n");
        Thread.sleep(500);
        exchangeCore.shutdown();
    }

    static long getBalance(ExchangeApi api, long uid, int currency) {
        try {
            return api.processReport(
                    new exchange.core2.core.common.api.reports.SingleUserReportQuery(uid), 0)
                    .get().getAccounts().get(currency);
        } catch (Exception e) {
            return 0;
        }
    }

    static String repeat(String s, int n) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < n; i++) sb.append(s);
        return sb.toString();
    }
}

