"""
AWS SES Email Service
Menghantar e-mel melalui Amazon Simple Email Service (SES).
Konfigurasi: env (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION) atau tetapan DB (type ses).
"""
import os
import asyncio
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

SES_ENABLED = bool(
    os.environ.get("AWS_ACCESS_KEY_ID")
    and os.environ.get("AWS_SECRET_ACCESS_KEY")
)

try:
    import boto3
except ImportError:
    boto3 = None
    if SES_ENABLED:
        SES_ENABLED = False
        logger.warning("boto3 not installed. SES email disabled. pip install boto3")


def _get_ses_client(region: Optional[str] = None, ses_config: Optional[Dict[str, Any]] = None):
    """SES client: dari ses_config (DB) atau env."""
    if ses_config:
        ak = (ses_config.get("access_key_id") or "").strip()
        sk = ses_config.get("secret_access_key") or ""
        reg = (ses_config.get("region") or "ap-southeast-1").strip()
        if not ak or not sk:
            return None
        return boto3.client(
            "ses",
            region_name=reg,
            aws_access_key_id=ak,
            aws_secret_access_key=sk,
        )
    if not SES_ENABLED or not boto3:
        return None
    region = region or os.environ.get("AWS_REGION", "ap-southeast-1")
    return boto3.client("ses", region_name=region)


async def send_email_ses(
    to_email: str,
    subject: str,
    html_body: str,
    text_body: Optional[str] = None,
    from_email: Optional[str] = None,
    from_name: Optional[str] = None,
    region: Optional[str] = None,
    ses_config: Optional[Dict[str, Any]] = None,
) -> dict:
    """
    Hantar e-mel melalui AWS SES.
    Gunakan ses_config jika beri (dari DB), else env. from_email wajib (verified dalam SES).
    """
    if ses_config:
        client = _get_ses_client(region=ses_config.get("region"), ses_config=ses_config)
        source = (ses_config.get("sender_email") or from_email or "").strip()
    else:
        if not SES_ENABLED:
            return {"status": "skipped", "reason": "SES not configured"}
        client = _get_ses_client(region)
        source = from_email or os.environ.get("SENDER_EMAIL", "")
    if from_name and source:
        source = f"{from_name} <{source}>"
    if not source:
        logger.error("SES: from_email / SENDER_EMAIL required")
        return {"status": "error", "error": "From address not configured"}
    if not client:
        return {"status": "error", "error": "SES client not available"}

    params = {
        "Source": source,
        "Destination": {"ToAddresses": [to_email]},
        "Message": {
            "Subject": {"Data": subject, "Charset": "UTF-8"},
            "Body": {"Html": {"Data": html_body, "Charset": "UTF-8"}},
        },
    }
    if text_body:
        params["Message"]["Body"]["Text"] = {"Data": text_body, "Charset": "UTF-8"}
    try:
        def _send():
            return client.send_email(**params)
        result = await asyncio.to_thread(_send)
        message_id = result.get("MessageId", "")
        logger.info("SES email sent: %s to %s id=%s", subject, to_email, message_id)
        return {"status": "success", "message_id": message_id, "to": to_email, "subject": subject}
    except Exception as e:
        logger.error("SES failed to %s: %s", to_email, e)
        return {"status": "error", "error": str(e), "to": to_email, "subject": subject}
