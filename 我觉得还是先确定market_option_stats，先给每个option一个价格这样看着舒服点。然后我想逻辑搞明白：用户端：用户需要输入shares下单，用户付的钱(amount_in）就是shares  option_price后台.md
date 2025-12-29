- 我觉得还是先确定market_option_stats，先给每个option一个价格这样看着舒服点。然后我想逻辑搞明白：

  用户端：用户需要输入shares下单，用户付的钱(amount_in）就是shares * option_price

  后台处理流程：

  1. users: 

  确认是谁在下单（user_id）

  

  2. market:

  status = 'active'

  trading_deadline 还没过

  决定这个单是不是允许下

  

  3. market_options

  哪个选项：YES / NO / 其他离散选项

  用 id / option_index 找到具体 option

  

  4. balance_snapshot

  当作 Web2 钱包用：

  available_amount：还能下注多少钱

  locked_amount：MVP 可以先不管，或者一直为 0

  下单时：

  检查 available_amount >= 下单金额

  减少 available_amount

  

  5. positions

  记录用户在某个 market + option 上的持仓

  字段用法（MVP 版）：

  shares：买了多少份

  cost_basis：总共花了多少钱

  下单时：

  如果已经有这条 position：shares += amount, cost_basis += amount

  没有就插入一条新记录

  

  并且要确保未来我的这些逻辑上链、上web3之后不需要重新写

  

  上面这个逻辑怎么样