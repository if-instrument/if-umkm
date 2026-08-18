import uuid
import datetime
import logging
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

from app.models.platform import AIConversation, AIMessage
from app.providers.base_provider import LLMMessage

logger = logging.getLogger("chat_service")

class ChatHistoryService:
    """
    Service for managing AI Conversations and Messages history.
    Provides session creation, context loading, message persistence, and session deletion.
    """

    @classmethod
    def get_or_create_conversation(
        cls,
        db: Session,
        application_id: str,
        company_id: str,
        user_id: str,
        conversation_id: Optional[str] = None,
        first_prompt: Optional[str] = None
    ) -> AIConversation:
        """
        Retrieves an existing conversation or creates a new one.
        """
        if conversation_id:
            conv = db.query(AIConversation).filter(
                AIConversation.conversation_id == conversation_id,
                AIConversation.application_id == application_id,
                AIConversation.company_id == company_id
            ).first()
            if conv:
                return conv

        # Generate new conversation ID
        new_conv_id = conversation_id or f"conv_{uuid.uuid4().hex[:16]}"
        title = (first_prompt[:40] + "...") if first_prompt else "Obrolan Baru"

        conv = AIConversation(
            conversation_id=new_conv_id,
            application_id=application_id,
            company_id=company_id,
            user_id=user_id,
            title=title,
            created_at=datetime.datetime.utcnow(),
            updated_at=datetime.datetime.utcnow()
        )
        db.add(conv)
        db.commit()
        db.refresh(conv)
        return conv

    @classmethod
    def save_message(
        cls,
        db: Session,
        conversation_id: str,
        role: str,
        content: str,
        tokens_used: int = 0,
        tool_calls: Optional[List[Dict[str, Any]]] = None,
        tool_call_id: Optional[str] = None
    ) -> AIMessage:
        """
        Persists an individual message to the specified conversation.
        """
        import json
        tool_calls_str = json.dumps(tool_calls, ensure_ascii=False) if tool_calls else None

        msg = AIMessage(
            conversation_id=conversation_id,
            role=role,
            content=content,
            tool_calls=tool_calls_str,
            tool_call_id=tool_call_id,
            tokens_used=tokens_used,
            created_at=datetime.datetime.utcnow()
        )
        db.add(msg)

        # Update parent conversation updated_at
        conv = db.query(AIConversation).filter(AIConversation.conversation_id == conversation_id).first()
        if conv:
            conv.updated_at = datetime.datetime.utcnow()

        db.commit()
        db.refresh(msg)
        return msg

    @classmethod
    def get_conversation_context(
        cls,
        db: Session,
        conversation_id: str,
        limit: int = 10
    ) -> List[LLMMessage]:
        """
        Retrieves the past N messages formatted as LLMMessage objects for multi-turn context memory.
        """
        import json
        messages = db.query(AIMessage).filter(
            AIMessage.conversation_id == conversation_id
        ).order_by(AIMessage.id.desc()).limit(limit).all()

        messages = list(reversed(messages))
        llm_messages = []

        for m in messages:
            tool_calls_list = json.loads(m.tool_calls) if m.tool_calls else None
            llm_messages.append(LLMMessage(
                role=m.role,
                content=m.content or "",
                tool_call_id=m.tool_call_id,
                tool_calls=tool_calls_list
            ))

        return llm_messages

    @classmethod
    def list_conversations(
        cls,
        db: Session,
        application_id: str,
        company_id: str,
        user_id: Optional[str] = None,
        limit: int = 50
    ) -> List[AIConversation]:
        """
        Lists all conversations for a tenant / user ordered by most recently updated.
        """
        query = db.query(AIConversation).filter(
            AIConversation.application_id == application_id,
            AIConversation.company_id == company_id
        )
        if user_id:
            query = query.filter(AIConversation.user_id == user_id)
        return query.order_by(AIConversation.updated_at.desc()).limit(limit).all()

    @classmethod
    def get_messages(
        cls,
        db: Session,
        conversation_id: str,
        limit: int = 100
    ) -> List[AIMessage]:
        """
        Retrieves all raw messages in chronological order for a specific conversation session.
        """
        return db.query(AIMessage).filter(
            AIMessage.conversation_id == conversation_id
        ).order_by(AIMessage.id.asc()).limit(limit).all()

    @classmethod
    def delete_conversation(
        cls,
        db: Session,
        conversation_id: str
    ) -> bool:
        """
        Deletes a conversation session and all its associated messages.
        """
        db.query(AIMessage).filter(AIMessage.conversation_id == conversation_id).delete()
        deleted_count = db.query(AIConversation).filter(AIConversation.conversation_id == conversation_id).delete()
        db.commit()
        return deleted_count > 0
