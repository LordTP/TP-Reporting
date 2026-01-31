#!/usr/bin/env python3
import os
import sys
import httpx
import asyncio
from datetime import datetime, timedelta

# Add app to path
sys.path.insert(0, '/app')

from app.utils.encryption import decrypt_token

async def test_square_api(encrypted_token: str):
    """Test Square API with encrypted token"""
    try:
        access_token = decrypt_token(encrypted_token.strip())
        print(f"✓ Successfully decrypted token")
    except Exception as e:
        print(f"✗ Failed to decrypt token: {e}")
        return

    base_url = 'https://connect.squareupsandbox.com'

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Test 1: Get locations
        print(f"\n1. Testing Locations API...")
        try:
            resp = await client.get(
                f'{base_url}/v2/locations',
                headers={
                    'Authorization': f'Bearer {access_token}',
                    'Square-Version': '2024-12-18'
                }
            )
            print(f"   Status: {resp.status_code}")

            if resp.status_code == 200:
                data = resp.json()
                locations = data.get('locations', [])
                print(f"   Found {len(locations)} location(s)")

                if locations:
                    loc = locations[0]
                    print(f"   - {loc.get('name')} (ID: {loc.get('id')})")
                    location_id = loc.get('id')
                else:
                    print("   No locations found")
                    return
            else:
                print(f"   Error: {resp.text}")
                return
        except Exception as e:
            print(f"   Exception: {e}")
            return

        # Test 2: Get payments
        print(f"\n2. Testing Payments API...")
        try:
            end_time = datetime.utcnow().isoformat() + 'Z'
            start_time = (datetime.utcnow() - timedelta(days=365)).isoformat() + 'Z'

            resp = await client.get(
                f'{base_url}/v2/payments',
                params={
                    'location_id': location_id,
                    'begin_time': start_time,
                    'end_time': end_time,
                    'limit': 100
                },
                headers={
                    'Authorization': f'Bearer {access_token}',
                    'Square-Version': '2024-12-18'
                }
            )
            print(f"   Status: {resp.status_code}")

            if resp.status_code == 200:
                data = resp.json()
                payments = data.get('payments', [])
                print(f"   Found {len(payments)} payment(s)")

                if payments:
                    print(f"\n   First 3 payments:")
                    for i, p in enumerate(payments[:3], 1):
                        amt = p.get('amount_money', {})
                        print(f"   {i}. ${amt.get('amount', 0) / 100:.2f} {amt.get('currency')} - {p.get('status')} - {p.get('created_at')}")
                else:
                    print(f"\n   ✗ No payments found in Square Sandbox account.")
                    print(f"   → Your Square Sandbox is empty")
                    print(f"   → To test with real data, create test orders at:")
                    print(f"      https://developer.squareup.com/console/en/apps")
            else:
                print(f"   Error: {resp.text}")
        except Exception as e:
            print(f"   Exception: {e}")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python test_square.py <encrypted_token>")
        sys.exit(1)

    asyncio.run(test_square_api(sys.argv[1]))
