import httpx
from app.config import settings

class AlertManager:
    async def send_dingtalk_alert(self, message: str):
        if not settings.DINGTALK_WEBHOOK_URL:
            return
        
        payload = {
            "msgtype": "text",
            "text": {
                "content": f"【SiteOptimizer Pro 告警】\n{message}"
            }
        }
        async with httpx.AsyncClient() as client:
            try:
                await client.post(settings.DINGTALK_WEBHOOK_URL, json=payload)
            except Exception as e:
                print(f"DingTalk Alert Error: {e}")

    async def send_wecom_alert(self, message: str):
        if not settings.WECOM_WEBHOOK_URL:
            return
            
        payload = {
            "msgtype": "text",
            "text": {
                "content": f"SiteOptimizer Pro 告警：\n{message}"
            }
        }
        async with httpx.AsyncClient() as client:
            try:
                await client.post(settings.WECOM_WEBHOOK_URL, json=payload)
            except Exception as e:
                print(f"WeCom Alert Error: {e}")

    async def broadcast_alert(self, message: str):
        await self.send_dingtalk_alert(message)
        await self.send_wecom_alert(message)

alert_manager = AlertManager()
