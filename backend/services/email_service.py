"""
Email Service: Resend, AWS SES, SMTP (Mailtrap/MailHog/Gmail), atau mod dev.
Handles all email notifications for MRSM Portal including:
- Fee reminders, new fee assignments, payment confirmations
- Template-based email
"""
import os
import asyncio
import logging
import re
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Configuration
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
SCHOOL_NAME = "MRSM Kuala Berang"

# Check if Resend is available
RESEND_ENABLED = bool(RESEND_API_KEY and RESEND_API_KEY.startswith("re_"))

if RESEND_ENABLED:
    try:
        import resend
        resend.api_key = RESEND_API_KEY
        logger.info("Resend email service initialized")
    except ImportError:
        RESEND_ENABLED = False
        logger.warning("Resend library not installed. Email notifications disabled.")
else:
    logger.info("RESEND_API_KEY not set. Resend disabled (akan guna SES/SMTP atau mod dev jika tiada provider).")

# SMTP (Mailtrap, MailHog, Gmail, dll.) — sesuai untuk localhost
SMTP_HOST = os.environ.get("SMTP_HOST", "").strip()
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "").strip()
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
SMTP_USE_TLS = os.environ.get("SMTP_USE_TLS", "true").lower() in ("1", "true", "yes")
# Port 465 = SSL; else gunakan STARTTLS jika SMTP_USE_TLS true
SMTP_USE_SSL = SMTP_PORT == 465 or os.environ.get("SMTP_USE_SSL", "").lower() in ("1", "true", "yes")
SMTP_ENABLED = bool(SMTP_HOST and SMTP_USER and SMTP_PASSWORD)
if SMTP_ENABLED:
    logger.info("SMTP email enabled: %s:%s (TLS=%s)", SMTP_HOST, SMTP_PORT, SMTP_USE_TLS)


def get_base_email_template(title: str, content: str, footer_text: str = "") -> str:
    """Generate a beautiful HTML email template"""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
                <td align="center" style="padding: 40px 0;">
                    <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
                        <!-- Header -->
                        <tr>
                            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px 40px; border-radius: 16px 16px 0 0;">
                                <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                                    Portal MRSMKU
                                </h1>
                                <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">
                                    {SCHOOL_NAME}
                                </p>
                            </td>
                        </tr>
                        
                        <!-- Title -->
                        <tr>
                            <td style="padding: 30px 40px 20px 40px;">
                                <h2 style="margin: 0; color: #1a1a2e; font-size: 22px; font-weight: 600;">
                                    {title}
                                </h2>
                            </td>
                        </tr>
                        
                        <!-- Content -->
                        <tr>
                            <td style="padding: 0 40px 30px 40px;">
                                {content}
                            </td>
                        </tr>
                        
                        <!-- Footer -->
                        <tr>
                            <td style="padding: 20px 40px; background-color: #f8f9fa; border-radius: 0 0 16px 16px; border-top: 1px solid #e9ecef;">
                                <p style="margin: 0; color: #6c757d; font-size: 12px; text-align: center;">
                                    {footer_text or "Email ini dihantar secara automatik oleh Portal MRSMKU."}
                                </p>
                                <p style="margin: 8px 0 0 0; color: #6c757d; font-size: 12px; text-align: center;">
                                    &copy; {datetime.now().year} {SCHOOL_NAME}. Hak Cipta Terpelihara.
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """


def generate_fee_reminder_email(
    parent_name: str,
    children_outstanding: List[dict],
    total_outstanding: float
) -> str:
    """Generate fee reminder email content"""
    
    # Build children cards
    children_html = ""
    for child in children_outstanding:
        outstanding_items = ""
        for item in child.get("outstanding_items", [])[:3]:
            outstanding_items += f"""
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0; color: #495057; font-size: 14px;">
                    T{item['tingkatan']} ({item['tahun']})
                </td>
                <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0; text-align: right; color: #dc3545; font-weight: 600; font-size: 14px;">
                    RM {item['amount']:,.2f}
                </td>
            </tr>
            """
        
        children_html += f"""
        <div style="background-color: #f8f9fa; border-radius: 12px; padding: 20px; margin-bottom: 16px; border-left: 4px solid #667eea;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <div>
                    <h3 style="margin: 0; color: #1a1a2e; font-size: 16px; font-weight: 600;">{child['name']}</h3>
                    <p style="margin: 4px 0 0 0; color: #6c757d; font-size: 13px;">Tingkatan {child['form']} | {child['class_name']}</p>
                </div>
                <div style="text-align: right;">
                    <p style="margin: 0; color: #6c757d; font-size: 12px;">Tunggakan</p>
                    <p style="margin: 0; color: #dc3545; font-size: 18px; font-weight: 700;">RM {child['outstanding']:,.2f}</p>
                </div>
            </div>
            <table style="width: 100%; border-collapse: collapse;">
                {outstanding_items}
            </table>
        </div>
        """
    
    content = f"""
    <p style="color: #495057; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
        Assalamualaikum dan Salam Sejahtera <strong>{parent_name}</strong>,
    </p>
    
    <p style="color: #495057; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
        Ini adalah peringatan mengenai tunggakan yuran anak/anak-anak anda di {SCHOOL_NAME}. 
        Sila jelaskan bayaran secepat mungkin untuk mengelakkan sebarang kesulitan.
    </p>
    
    <div style="background: linear-gradient(135deg, #ff6b6b 0%, #ee5a5a 100%); border-radius: 12px; padding: 20px; margin-bottom: 24px; text-align: center;">
        <p style="margin: 0; color: rgba(255,255,255,0.9); font-size: 14px;">Jumlah Keseluruhan Tunggakan</p>
        <p style="margin: 8px 0 0 0; color: #ffffff; font-size: 32px; font-weight: 700;">RM {total_outstanding:,.2f}</p>
    </div>
    
    <h3 style="color: #1a1a2e; font-size: 16px; font-weight: 600; margin: 0 0 16px 0;">Butiran Tunggakan:</h3>
    
    {children_html}
    
    <div style="background-color: #e7f3ff; border-radius: 12px; padding: 16px; margin-top: 24px;">
        <p style="margin: 0; color: #0056b3; font-size: 14px;">
            <strong>Cara Pembayaran:</strong><br>
            Log masuk ke Portal MRSMKU dan klik pada menu "Yuran" untuk membuat pembayaran dalam talian, 
            atau hubungi pejabat maktab untuk maklumat lanjut.
        </p>
    </div>
    """
    
    return get_base_email_template(
        title="Peringatan Tunggakan Yuran",
        content=content,
        footer_text="Sila abaikan email ini jika anda telah menjelaskan bayaran."
    )


def generate_new_fee_email(
    parent_name: str,
    child_name: str,
    fee_set_name: str,
    total_amount: float,
    items: List[dict]
) -> str:
    """Generate new fee assignment notification email"""
    
    items_html = ""
    for item in items[:10]:
        items_html += f"""
        <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; color: #495057; font-size: 14px;">
                {item.get('name', 'Item')}
            </td>
            <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; text-align: right; color: #1a1a2e; font-weight: 500; font-size: 14px;">
                RM {item.get('amount', 0):,.2f}
            </td>
        </tr>
        """
    
    content = f"""
    <p style="color: #495057; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
        Assalamualaikum dan Salam Sejahtera <strong>{parent_name}</strong>,
    </p>
    
    <p style="color: #495057; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
        Kami ingin memaklumkan bahawa yuran baru telah dikenakan kepada anak anda:
    </p>
    
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 24px; margin-bottom: 24px;">
        <div style="display: flex; align-items: center; margin-bottom: 16px;">
            <div style="width: 48px; height: 48px; background-color: rgba(255,255,255,0.2); border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-right: 16px;">
                <span style="color: #ffffff; font-size: 24px;">🎓</span>
            </div>
            <div>
                <h3 style="margin: 0; color: #ffffff; font-size: 18px; font-weight: 600;">{child_name}</h3>
                <p style="margin: 4px 0 0 0; color: rgba(255,255,255,0.8); font-size: 14px;">{fee_set_name}</p>
            </div>
        </div>
        <div style="text-align: center; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.2);">
            <p style="margin: 0; color: rgba(255,255,255,0.8); font-size: 14px;">Jumlah Yuran</p>
            <p style="margin: 8px 0 0 0; color: #ffffff; font-size: 36px; font-weight: 700;">RM {total_amount:,.2f}</p>
        </div>
    </div>
    
    <h3 style="color: #1a1a2e; font-size: 16px; font-weight: 600; margin: 0 0 16px 0;">Pecahan Yuran:</h3>
    
    <table style="width: 100%; border-collapse: collapse; background-color: #f8f9fa; border-radius: 12px; overflow: hidden;">
        <thead>
            <tr style="background-color: #e9ecef;">
                <th style="padding: 12px 16px; text-align: left; color: #495057; font-size: 13px; font-weight: 600;">Item</th>
                <th style="padding: 12px 16px; text-align: right; color: #495057; font-size: 13px; font-weight: 600;">Jumlah</th>
            </tr>
        </thead>
        <tbody style="padding: 0 16px;">
            {items_html}
        </tbody>
    </table>
    
    <div style="background-color: #d4edda; border-radius: 12px; padding: 16px; margin-top: 24px;">
        <p style="margin: 0; color: #155724; font-size: 14px;">
            <strong>Log masuk ke Portal MRSMKU</strong> untuk membuat pembayaran dalam talian atau melihat butiran lanjut.
        </p>
    </div>
    """
    
    return get_base_email_template(
        title="Yuran Baru Dikenakan",
        content=content,
        footer_text="Sila hubungi pejabat maktab jika terdapat sebarang pertanyaan."
    )


def generate_payment_confirmation_email(
    parent_name: str,
    child_name: str,
    amount: float,
    receipt_number: str,
    remaining: float
) -> str:
    """Generate payment confirmation email"""
    
    status_html = ""
    if remaining <= 0:
        status_html = """
        <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); border-radius: 12px; padding: 20px; margin-top: 24px; text-align: center;">
            <span style="font-size: 48px;">🎉</span>
            <h3 style="margin: 16px 0 8px 0; color: #ffffff; font-size: 18px;">Tahniah!</h3>
            <p style="margin: 0; color: rgba(255,255,255,0.9); font-size: 14px;">Semua yuran telah dijelaskan sepenuhnya.</p>
        </div>
        """
    else:
        status_html = f"""
        <div style="background-color: #fff3cd; border-radius: 12px; padding: 16px; margin-top: 24px;">
            <p style="margin: 0; color: #856404; font-size: 14px;">
                <strong>Baki Tertunggak:</strong> RM {remaining:,.2f}<br>
                Sila jelaskan baki tertunggak secepat mungkin.
            </p>
        </div>
        """
    
    content = f"""
    <p style="color: #495057; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
        Assalamualaikum dan Salam Sejahtera <strong>{parent_name}</strong>,
    </p>
    
    <p style="color: #495057; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
        Terima kasih atas pembayaran yuran untuk <strong>{child_name}</strong>. 
        Berikut adalah butiran pembayaran anda:
    </p>
    
    <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); border-radius: 12px; padding: 24px; margin-bottom: 24px; text-align: center;">
        <p style="margin: 0; color: rgba(255,255,255,0.9); font-size: 14px;">Jumlah Dibayar</p>
        <p style="margin: 8px 0 0 0; color: #ffffff; font-size: 36px; font-weight: 700;">RM {amount:,.2f}</p>
    </div>
    
    <table style="width: 100%; border-collapse: collapse; background-color: #f8f9fa; border-radius: 12px; overflow: hidden;">
        <tr>
            <td style="padding: 16px; color: #6c757d; font-size: 14px;">No. Resit</td>
            <td style="padding: 16px; text-align: right; color: #1a1a2e; font-weight: 600; font-size: 14px;">{receipt_number}</td>
        </tr>
        <tr>
            <td style="padding: 16px; color: #6c757d; font-size: 14px; border-top: 1px solid #e9ecef;">Pelajar</td>
            <td style="padding: 16px; text-align: right; color: #1a1a2e; font-weight: 500; font-size: 14px; border-top: 1px solid #e9ecef;">{child_name}</td>
        </tr>
        <tr>
            <td style="padding: 16px; color: #6c757d; font-size: 14px; border-top: 1px solid #e9ecef;">Tarikh</td>
            <td style="padding: 16px; text-align: right; color: #1a1a2e; font-weight: 500; font-size: 14px; border-top: 1px solid #e9ecef;">{datetime.now().strftime('%d %b %Y, %H:%M')}</td>
        </tr>
    </table>
    
    {status_html}
    """
    
    return get_base_email_template(
        title="Pengesahan Pembayaran Yuran",
        content=content,
        footer_text="Simpan email ini sebagai rujukan."
    )


def _send_email_dev(to_email: str, subject: str, html_content: str, text_content: Optional[str] = None) -> dict:
    """Localhost/dev: log email ke konsol dan return success (tiada Resend/SES/SMTP)."""
    logger.info(
        "[EMAIL DEV] === E-mel (log sahaja) === To: %s | Subject: %s | HTML length: %s",
        to_email, subject, len(html_content or "")
    )
    if text_content:
        logger.debug("[EMAIL DEV] Body (text): %s", (text_content or "")[:500])
    return {"status": "success", "reason": "dev_log", "to": to_email, "subject": subject}


def _send_email_smtp_sync(
    to_email: str,
    subject: str,
    html_body: str,
    text_body: Optional[str] = None,
    from_email: Optional[str] = None,
    smtp_config: Optional[Dict[str, Any]] = None,
) -> dict:
    """Hantar e-mel melalui SMTP (sync). Gunakan smtp_config jika beri, else env."""
    cfg = smtp_config or {}
    host = cfg.get("host") or SMTP_HOST
    port = int(cfg.get("port") or SMTP_PORT)
    user = cfg.get("user") or SMTP_USER
    password = cfg.get("password") or SMTP_PASSWORD
    use_tls = cfg.get("use_tls", SMTP_USE_TLS) if smtp_config is not None else SMTP_USE_TLS
    use_ssl = (port == 465) or cfg.get("use_ssl", False) if smtp_config is not None else SMTP_USE_SSL
    from_addr = (cfg.get("sender_email") or from_email or SENDER_EMAIL).strip()
    if not host or not user or not password:
        return {"status": "error", "error": "SMTP host/user/password diperlukan", "to": to_email, "subject": subject}
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_email
    if text_body:
        msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))
    try:
        if use_ssl:
            with smtplib.SMTP_SSL(host, port) as server:
                server.login(user, password)
                server.sendmail(from_addr, [to_email], msg.as_string())
        elif use_tls:
            with smtplib.SMTP(host, port) as server:
                server.starttls()
                server.login(user, password)
                server.sendmail(from_addr, [to_email], msg.as_string())
        else:
            with smtplib.SMTP(host, port) as server:
                server.login(user, password)
                server.sendmail(from_addr, [to_email], msg.as_string())
        logger.info("SMTP email sent: %s to %s", subject, to_email)
        return {"status": "success", "to": to_email, "subject": subject}
    except Exception as e:
        logger.error("SMTP failed to %s: %s", to_email, e)
        return {"status": "error", "error": str(e), "to": to_email, "subject": subject}


async def get_smtp_config_from_db(db) -> Optional[Dict[str, Any]]:
    """Dapatkan tetapan SMTP dari DB (type smtp). Return dict untuk send atau None."""
    if db is None:
        return None
    try:
        doc = await db.settings.find_one({"type": "smtp"})
    except Exception:
        return None
    if not doc or not doc.get("host") or not doc.get("user") or not doc.get("password"):
        return None
    return {
        "host": doc.get("host", "").strip(),
        "port": int(doc.get("port") or 587),
        "user": doc.get("user", "").strip(),
        "password": doc.get("password", ""),
        "use_tls": doc.get("use_tls", True),
        "use_ssl": doc.get("port") == 465,
        "sender_email": (doc.get("sender_email") or SENDER_EMAIL).strip(),
    }


async def get_ses_config_from_db(db) -> Optional[Dict[str, Any]]:
    """Dapatkan tetapan AWS SES dari DB (type ses). Return dict untuk send atau None."""
    if db is None:
        return None
    try:
        doc = await db.settings.find_one({"type": "ses"})
    except Exception:
        return None
    if not doc or not doc.get("access_key_id") or not doc.get("secret_access_key"):
        return None
    return {
        "access_key_id": doc.get("access_key_id", "").strip(),
        "secret_access_key": doc.get("secret_access_key", ""),
        "region": (doc.get("region") or "ap-southeast-1").strip(),
        "sender_email": (doc.get("sender_email") or "").strip(),
    }


async def send_email_smtp(
    to_email: str,
    subject: str,
    html_body: str,
    text_body: Optional[str] = None,
    from_email: Optional[str] = None,
    smtp_config: Optional[Dict[str, Any]] = None,
) -> dict:
    """Hantar e-mel melalui SMTP (async). smtp_config dari DB atau env."""
    from_addr = (smtp_config.get("sender_email") if smtp_config else None) or from_email or SENDER_EMAIL
    return await asyncio.to_thread(
        _send_email_smtp_sync,
        to_email,
        subject,
        html_body,
        text_body,
        from_addr,
        smtp_config,
    )


async def send_email(
    to_email: str,
    subject: str,
    html_content: str
) -> dict:
    """Send email: Resend, or SMTP jika dikonfigurasi, atau dev log."""
    if not RESEND_ENABLED:
        if SMTP_ENABLED:
            return await send_email_smtp(to_email=to_email, subject=subject, html_body=html_content)
        return _send_email_dev(to_email, subject, html_content)
    try:
        params = {
            "from": SENDER_EMAIL,
            "to": [to_email],
            "subject": subject,
            "html": html_content
        }
        
        # Run sync SDK in thread to keep FastAPI non-blocking
        email = await asyncio.to_thread(resend.Emails.send, params)
        
        logger.info(f"Email sent successfully: {subject} to {to_email}")
        return {
            "status": "success",
            "email_id": email.get("id"),
            "to": to_email,
            "subject": subject
        }
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {str(e)}")
        return {
            "status": "error",
            "error": str(e),
            "to": to_email,
            "subject": subject
        }


async def send_fee_reminder(
    parent_email: str,
    parent_name: str,
    children_outstanding: List[dict],
    total_outstanding: float
) -> dict:
    """Send fee reminder email to parent"""
    html = generate_fee_reminder_email(parent_name, children_outstanding, total_outstanding)
    return await send_email(
        to_email=parent_email,
        subject=f"[MRSMKU] Peringatan Tunggakan Yuran - RM {total_outstanding:,.2f}",
        html_content=html
    )


async def send_new_fee_notification(
    parent_email: str,
    parent_name: str,
    child_name: str,
    fee_set_name: str,
    total_amount: float,
    items: List[dict]
) -> dict:
    """Send new fee assignment notification to parent"""
    html = generate_new_fee_email(parent_name, child_name, fee_set_name, total_amount, items)
    return await send_email(
        to_email=parent_email,
        subject=f"[MRSMKU] Yuran Baru Dikenakan - {child_name}",
        html_content=html
    )


async def send_payment_confirmation(
    parent_email: str,
    parent_name: str,
    child_name: str,
    amount: float,
    receipt_number: str,
    remaining: float
) -> dict:
    """Send payment confirmation email to parent"""
    html = generate_payment_confirmation_email(
        parent_name, child_name, amount, receipt_number, remaining
    )
    return await send_email(
        to_email=parent_email,
        subject=f"[MRSMKU] Pengesahan Pembayaran - {receipt_number}",
        html_content=html
    )


# ---------- Template-based email (DB template + SES or Resend) ----------

async def get_template_from_db(db, template_key: str, tingkatan: Optional[int] = None) -> Optional[Dict[str, Any]]:
    """Load email template from db by template_key. If tingkatan (1-5) given, prefer template for that form."""
    if tingkatan is not None:
        doc = await db.email_templates.find_one({
            "template_key": template_key,
            "tingkatan": tingkatan,
            "is_active": True,
        })
        if doc:
            return doc
    doc = await db.email_templates.find_one({
        "template_key": template_key,
        "tingkatan": None,
        "is_active": True,
    })
    if doc:
        return doc
    doc = await db.email_templates.find_one({
        "template_key": template_key,
        "is_active": True,
    })
    return doc


def render_template(
    subject: str,
    body_html: str,
    body_text: Optional[str],
    variables: Dict[str, Any],
) -> tuple:
    """Replace {{var_name}} in subject, body_html, body_text with values from variables. Returns (subject, html, text)."""
    def replacer(m):
        key = m.group(1).strip()
        return str(variables.get(key, ""))

    sub = re.sub(r"\{\{\s*(\w+)\s*\}\}", replacer, subject)
    html = re.sub(r"\{\{\s*(\w+)\s*\}\}", replacer, body_html)
    text = re.sub(r"\{\{\s*(\w+)\s*\}\}", replacer, body_text) if body_text else None
    return sub, html, text


async def send_email_provider(
    to_email: str,
    subject: str,
    html_body: str,
    text_body: Optional[str] = None,
    from_email: Optional[str] = None,
    db=None,
) -> dict:
    """Send email: SES (env atau DB) → Resend → SMTP (DB atau env) → dev log."""
    try:
        from services.ses_service import SES_ENABLED, send_email_ses
    except ImportError:
        SES_ENABLED = False
        send_email_ses = None
    ses_cfg = await get_ses_config_from_db(db) if db else None
    if SES_ENABLED and send_email_ses:
        return await send_email_ses(
            to_email=to_email,
            subject=subject,
            html_body=html_body,
            text_body=text_body,
            from_email=from_email or SENDER_EMAIL,
        )
    if ses_cfg and send_email_ses:
        return await send_email_ses(
            to_email=to_email,
            subject=subject,
            html_body=html_body,
            text_body=text_body,
            from_email=ses_cfg.get("sender_email") or from_email or SENDER_EMAIL,
            ses_config=ses_cfg,
        )
    if RESEND_ENABLED:
        return await send_email(to_email=to_email, subject=subject, html_content=html_body)
    smtp_cfg = await get_smtp_config_from_db(db) if db else None
    if SMTP_ENABLED:
        return await send_email_smtp(
            to_email=to_email,
            subject=subject,
            html_body=html_body,
            text_body=text_body,
            from_email=from_email,
        )
    if smtp_cfg:
        return await send_email_smtp(
            to_email=to_email,
            subject=subject,
            html_body=html_body,
            text_body=text_body,
            from_email=from_email,
            smtp_config=smtp_cfg,
        )
    return _send_email_dev(to_email, subject, html_body, text_body)


async def send_email_via_template(
    db,
    template_key: str,
    to_email: str,
    variables: Dict[str, Any],
    from_email: Optional[str] = None,
    tingkatan: Optional[int] = None,
) -> dict:
    """
    Load template by template_key (and optional tingkatan), render with variables, then send via SES or Resend.
    variables: dict e.g. {"parent_name": "Ali", "total_outstanding": "500.00"}.
    """
    template = await get_template_from_db(db, template_key, tingkatan=tingkatan)
    if not template:
        logger.warning(f"Template not found or inactive: {template_key}")
        return {
            "status": "error",
            "error": f"Template '{template_key}' tidak dijumpai atau tidak aktif",
            "to": to_email,
        }
    subject, html, text = render_template(
        template.get("subject", ""),
        template.get("body_html", ""),
        template.get("body_text"),
        variables or {},
    )
    return await send_email_provider(
        to_email=to_email,
        subject=subject,
        html_body=html,
        text_body=text,
        from_email=from_email,
        db=db,
    )
