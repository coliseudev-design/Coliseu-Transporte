import requests

url = "http://localhost:3000/api/vendas/recentes?limit=8"
# Oh wait, we need the JWT token... I can just use python to query the local middleware...
# Actually the database output is fine. The API is fine.
