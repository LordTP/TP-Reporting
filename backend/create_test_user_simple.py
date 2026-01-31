"""
Create a test admin user using direct SQL
"""
import sys
import uuid
from datetime import datetime
from sqlalchemy import create_engine, text
from passlib.context import CryptContext

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Database URL
DATABASE_URL = "postgresql://teliporter:teliporter@postgres:5432/teliporter"

def create_test_user():
    engine = create_engine(DATABASE_URL)

    with engine.connect() as conn:
        # Check if organization exists
        result = conn.execute(
            text("SELECT id, name FROM organizations WHERE name = 'Test Organization' LIMIT 1")
        )
        org = result.fetchone()

        if org:
            org_id = org[0]
            org_name = org[1]
            print(f"ℹ️  Organization already exists: {org_name}")
        else:
            # Create organization
            org_id = uuid.uuid4()
            conn.execute(
                text("""
                    INSERT INTO organizations (id, name, created_at, updated_at)
                    VALUES (:id, :name, :created_at, :updated_at)
                """),
                {
                    "id": org_id,
                    "name": "Test Organization",
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                }
            )
            conn.commit()
            print(f"✅ Created organization: Test Organization (ID: {org_id})")

        # Check if user exists
        result = conn.execute(
            text("SELECT email, role FROM users WHERE email = 'admin@test.com' LIMIT 1")
        )
        user = result.fetchone()

        if user:
            print(f"ℹ️  User already exists: {user[0]}")
            print(f"   Email: admin@test.com")
            print(f"   Password: admin123")
            print(f"   Role: {user[1]}")
            return

        # Create user
        user_id = uuid.uuid4()
        hashed_password = pwd_context.hash("admin123")

        conn.execute(
            text("""
                INSERT INTO users (id, email, password_hash, full_name, role, organization_id, is_active, created_at)
                VALUES (:id, :email, :password_hash, :full_name, :role, :organization_id, :is_active, :created_at)
            """),
            {
                "id": user_id,
                "email": "admin@test.com",
                "password_hash": hashed_password,
                "full_name": "Test Admin",
                "role": "admin",
                "organization_id": org_id,
                "is_active": True,
                "created_at": datetime.utcnow()
            }
        )
        conn.commit()

        print("✅ Test admin user created successfully!")
        print(f"   Email: admin@test.com")
        print(f"   Password: admin123")
        print(f"   Role: admin")
        print(f"   Organization: Test Organization")

if __name__ == "__main__":
    try:
        create_test_user()
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        sys.exit(1)
