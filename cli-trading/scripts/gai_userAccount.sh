curl http://api.devnet.solana.com -X POST -H "Content-Type: application/json" -d '
  {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "getAccountInfo",
    "params": [
      "cAvRyncpo2FEyah5EGSPT8NNuf6TDyMJdssRPdPBnfk",
      {
        "encoding": "jsonParsed"
      }
    ]
  }'
