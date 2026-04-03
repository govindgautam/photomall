import os
print('SMTP_SERVER:', os.getenv('SMTP_SERVER', 'Not set'))
print('SENDER_EMAIL:', os.getenv('SENDER_EMAIL', 'Not set'))
print('SMTP_PASSWORD:', 'Set' if os.getenv('SMTP_PASSWORD') else 'Not set')