"""
Create a test admin user directly in the database
"""
import sys
import uuid
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.config import settings
from app.models.organization import Organization
from app.models.user import User
from app.utils.security import hash_password

# Database connection
engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def create_test_user():
    db = SessionLocal()

    try:
        # Check if organization exists
        org = db.query(Organization).filter(Organization.name == "Test Organization").first()

        if not org:
            # Create test organization
            org = Organization(
                id=uuid.uuid4(),
                name="Test Organization",
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            db.add(org)
            db.flush()
            print(f"✅ Created organization: {org.name} (ID: {org.id})")
        else:
            print(f"ℹ️  Organization already exists: {org.name} (ID: {org.id})")

        # Check if user exists
        existing_user = db.query(User).filter(User.email == "admin@test.com").first()

        if existing_user:
            print(f"ℹ️  User already exists: admin@test.com")
            print(f"   Email: admin@test.com")
            print(f"   Password: admin123")
            print(f"   Role: {existing_user.role}")
            return

        # Create test admin user
        hashed_password = hash_password("admin123")

        user = User(
            id=uuid.uuid4(),
            email="admin@test.com",
            password_hash=hashed_password,
            full_name="Test Admin",
            role="admin",
            organization_id=org.id,
            is_active=True,
            created_at=datetime.utcnow(),
            last_login=None
        )

        db.add(user)
        db.commit()

        print("✅ Test admin user created successfully!")
        print(f"   Email: admin@test.com")
        print(f"   Password: admin123")
        print(f"   Role: admin")
        print(f"   Organization: {org.name}")

    except Exception as e:
        db.rollback()
        print(f"❌ Error creating test user: {str(e)}")
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    create_test_user()
