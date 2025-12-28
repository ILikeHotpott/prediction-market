import { create } from "zustand"

const normalizeId = (id) => (id != null ? String(id) : null)

export const useTradeStore = create((set) => ({
  selectedOptionId: null,
  action: "yes", // yes | no
  side: "buy",
  setOption: (id, action = "yes") =>
    set(() => ({
      selectedOptionId: normalizeId(id),
      action,
      side: "buy",
    })),
  setSide: (side) => set({ side }),
  resetForMarket: (options = []) => {
    const first = options[0]
    set({
      selectedOptionId: normalizeId(first?.id),
      action: "yes",
      side: "buy",
    })
  },
}))

