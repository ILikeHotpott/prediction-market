export const FINANCE_INTERVALS = [
  { value: "15m", label: "15Min" },
  { value: "1h", label: "Hourly" },
  { value: "1d", label: "Daily" },
  { value: "1w", label: "Weekly" },
]

export const FINANCE_ASSETS = [
  { value: "BTC", label: "Bitcoin", imageUrl: "/Finance_logo/Bitcoin.png" },
  { value: "ETH", label: "Ethereum", imageUrl: "/Finance_logo/eth.webp" },
  { value: "NVDA", label: "Nvidia", imageUrl: "/Finance_logo/Nvidia.png" },
  { value: "TSLA", label: "Tesla", imageUrl: "/Finance_logo/Tesla.png" },
  { value: "GOOGL", label: "Google", imageUrl: "/Finance_logo/Google.png" },
  { value: "AAPL", label: "Apple", imageUrl: "/Finance_logo/Apple-Logo.png" },
  { value: "MSFT", label: "Microsoft", imageUrl: "/Finance_logo/Microsoft_logo.png" },
  { value: "META", label: "Meta", imageUrl: "/Finance_logo/meta-logo.webp" },
  { value: "AMZN", label: "Amazon", imageUrl: "/Finance_logo/Amazon.png" },
]

export const FINANCE_ASSET_IMAGE_MAP = FINANCE_ASSETS.reduce((acc, item) => {
  acc[item.value] = item.imageUrl
  return acc
}, {})
