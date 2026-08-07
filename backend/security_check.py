import os
import sys

from dotenv import load_dotenv


def verify_security_env():
    load_dotenv()

    if not os.path.exists(".env"):
        print("CRITICAL: .env file missing. Security credentials not found.")
        sys.exit(1)

    token_value = os.getenv("PVE_TOKEN_VALUE")
    if token_value and len(token_value) < 20:
        print(
            "WARNING: PVE_TOKEN_VALUE seems too short. Use a long UUID token for security."
        )

    verify_ssl = os.getenv("PVE_VERIFY_SSL", "False").lower() == "true"
    if not verify_ssl:
        print(
            "SECURITY NOTE: SSL verification is disabled. Ensure you are on a trusted local network."
        )

    return True
