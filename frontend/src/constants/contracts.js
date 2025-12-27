import {getContract} from "thirdweb"

export const predictionMarketContractAddress = "0xd8b934580fcE35a11B58C6D73aDeE468a2833fa8"
export const tokenContractAddress = "0xd9145CCE52D386f254917e481eB44e9943F39138"


export const predictionMarketContract = getContract({
    client: client,
    chain: baseSepolia,
    address: predictionMarketContractAddress,
})

export const tokenContract = getContract({
    client: client,
    chain: baseSepolia,
    address: tokenContractAddress,
})