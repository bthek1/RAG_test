import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

User = get_user_model()


class Command(BaseCommand):
    help = "Recreate superuser from environment variables (DJANGO_SUPERUSER_EMAIL and DJANGO_SUPERUSER_PASSWORD)"

    def handle(self, *args, **options):
        email = os.getenv("DJANGO_SUPERUSER_EMAIL")
        password = os.getenv("DJANGO_SUPERUSER_PASSWORD")
        username = os.getenv("DJANGO_SUPERUSER_USERNAME", "admin")

        if not email or not password:
            self.stdout.write(
                self.style.ERROR(
                    "Error: DJANGO_SUPERUSER_EMAIL and DJANGO_SUPERUSER_PASSWORD environment variables must be set"
                )
            )
            return

        # Delete existing superuser with this email if it exists
        if User.objects.filter(email=email).exists():
            User.objects.filter(email=email).delete()
            self.stdout.write(
                self.style.WARNING(f"Deleted existing superuser with email: {email}")
            )

        # Create new superuser
        User.objects.create_superuser(
            email=email,
            password=password,
        )
        self.stdout.write(
            self.style.SUCCESS(f"Successfully created superuser with email: {email}")
        )
