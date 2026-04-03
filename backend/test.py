import os
import smtplib
from email.mime.text import MIMEText

sender = 'govindgautam9079077974@gmail.com'
password = 'tsra qmjn smtp vpnn'
to = 'govindgautam9079077974@gmail.com'

try:
    msg = MIMEText('Test email from PhotoMall - OTP will work now!')
    msg['Subject'] = 'PhotoMall Email Test'
    msg['From'] = sender
    msg['To'] = to
    
    server = smtplib.SMTP('smtp.gmail.com', 587)
    server.starttls()
    server.login(sender, password)
    server.send_message(msg)
    server.quit()
    print('✅ Email sent successfully! Check your inbox.')
except Exception as e:
    print(f'❌ Failed: {e}')