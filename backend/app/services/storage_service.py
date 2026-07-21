"""Object storage service utilizing Cloudflare R2 / S3 client."""
from __future__ import annotations

import boto3
from botocore.config import Config
from app.config import settings


def get_s3_client():
    """Build boto3 client configured for Cloudflare R2 API compatibility."""
    return boto3.client(
        "s3",
        endpoint_url=settings.R2_ENDPOINT_URL,
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def upload_bytes(key: str, body: bytes, content_type: str) -> str:
    """Upload raw bytes to R2 bucket. Returns the public/direct access URL."""
    s3 = get_s3_client()
    s3.put_object(
        Bucket=settings.R2_BUCKET_NAME,
        Key=key,
        Body=body,
        ContentType=content_type,
    )
    # Return formatted endpoint URL
    return f"{settings.R2_ENDPOINT_URL}/{settings.R2_BUCKET_NAME}/{key}"
