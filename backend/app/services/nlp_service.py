import asyncio
from typing import Any

try:
    from google.cloud import language_v1
except ImportError:
    language_v1 = None

from app.config import settings


class NLPService:
    def __init__(self) -> None:
        self.client = None

    def _get_client(self):
        if language_v1 is None:
            return None
        if self.client is None:
            try:
                self.client = language_v1.LanguageServiceClient()
            except Exception as e:
                print(f"Failed to create NLP client: {e}")
                return None
        return self.client

    async def analyze_content(self, text: str) -> dict[str, Any]:
        client = self._get_client()
        if client is None:
            return {
                "sentiment_score": 0,
                "sentiment_magnitude": 0,
                "entities": [],
                "categories": [],
            }

        document = language_v1.Document(
            content=text, type_=language_v1.Document.Type.PLAIN_TEXT
        )

        try:
            loop = asyncio.get_event_loop()

            sentiment = await loop.run_in_executor(
                None,
                lambda: client.analyze_sentiment(request={"document": document}).document_sentiment,
            )

            entities_resp = await loop.run_in_executor(
                None,
                lambda: client.analyze_entities(request={"document": document}),
            )
            entities = []
            for entity in entities_resp.entities:
                entities.append({
                    "name": entity.name,
                    "type": language_v1.Entity.Type(entity.type_).name,
                    "salience": entity.salience,
                })

            try:
                categories_resp = await loop.run_in_executor(
                    None,
                    lambda: client.classify_content(request={"document": document}),
                )
                categories = [
                    {"name": c.name, "confidence": c.confidence}
                    for c in categories_resp.categories
                ]
            except Exception:
                categories = []

            return {
                "sentiment_score": sentiment.score,
                "sentiment_magnitude": sentiment.magnitude,
                "entities": entities[:20],
                "categories": categories,
            }
        except Exception as e:
            print(f"NLP analysis error: {e}")
            return {
                "sentiment_score": 0,
                "sentiment_magnitude": 0,
                "entities": [],
                "categories": [],
            }


nlp_service = NLPService()
