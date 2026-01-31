#!/usr/bin/env python3
"""Create test orders in Square Sandbox"""
import os
import sys
import httpx
import asyncio
from datetime import datetime, timedelta
import random
import uuid

sys.path.insert(0, '/app')
from app.utils.encryption import decrypt_token

async def create_test_orders(encrypted_token: str, location_id: str):
    """Create test orders in Square Sandbox"""
    try:
        access_token = decrypt_token(encrypted_token.strip())
        print(f"✓ Successfully decrypted token\n")
    except Exception as e:
        print(f"✗ Failed to decrypt token: {e}")
        return

    base_url = 'https://connect.squareupsandbox.com'

    # Test order data
    test_orders = [
        {"item": "Cappuccino", "amount": 450},
        {"item": "Latte", "amount": 525},
        {"item": "Espresso", "amount": 350},
        {"item": "Croissant", "amount": 425},
        {"item": "Sandwich", "amount": 895},
        {"item": "Salad", "amount": 1250},
        {"item": "Juice", "amount": 550},
        {"item": "Muffin", "amount": 375},
        {"item": "Cookie", "amount": 295},
        {"item": "Tea", "amount": 325},
    ]

    print(f"Creating {len(test_orders)} test orders in Square Sandbox...\n")

    async with httpx.AsyncClient(timeout=30.0) as client:
        success_count = 0

        for i, order_data in enumerate(test_orders, 1):
            try:
                # Create payment
                idempotency_key = str(uuid.uuid4())

                payment_payload = {
                    "idempotency_key": idempotency_key,
                    "source_id": "EXTERNAL",  # For sandbox testing
                    "amount_money": {
                        "amount": order_data["amount"],
                        "currency": "USD"
                    },
                    "location_id": location_id,
                    "note": f"Test order: {order_data['item']}"
                }

                resp = await client.post(
                    f'{base_url}/v2/payments',
                    json=payment_payload,
                    headers={
                        'Authorization': f'Bearer {access_token}',
                        'Square-Version': '2024-12-18',
                        'Content-Type': 'application/json'
                    }
                )

                if resp.status_code in [200, 201]:
                    payment = resp.json().get('payment', {})
                    amount_str = f"${order_data['amount'] / 100:.2f}"
                    print(f"  ✓ {i}. Created: {order_data['item']} - {amount_str}")
                    success_count += 1
                else:
                    print(f"  ✗ {i}. Failed: {resp.status_code} - {resp.text[:100]}")

                # Small delay to avoid rate limits
                await asyncio.sleep(0.3)

            except Exception as e:
                print(f"  ✗ {i}. Exception: {e}")

        print(f"\n✓ Successfully created {success_count}/{len(test_orders)} test orders")
        print(f"\n→ Now trigger a historical import to sync these orders!")

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python create_test_orders.py <encrypted_token> <location_id>")
        sys.exit(1)

    asyncio.run(create_test_orders(sys.argv[1], sys.argv[2]))
