import {createThirdwebClient} from "@thirdweb-dev/react"

export const client = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID,
//   secretKey: process.env.THIRDWEB_SECRET_KEY,
})