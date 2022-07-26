curl http://api.devnet.solana.com -X POST -H "Content-Type: application/json" -d '
  {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "getProgramAccounts",
    "params": [
      "9jwr5nC2f9yAraXrg4UzHXmCX3vi9FQkjD6p9e8bRqNa",
      {
        "encoding": "jsonParsed"
      }
    ]
  }'
