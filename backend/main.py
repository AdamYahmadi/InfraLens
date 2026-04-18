from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import json
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_PATH = "../data/mock_infrastructure.json"

@app.get("/api/v1/infrastructure")
def get_infrastructure():
    with open(DATA_PATH, "r") as f:
        data = json.load(f)
    return data

@app.get("/api/v1/status")
def get_status():
    return {"status": "online", "host": "M720q", "message": "Backend is connected"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)