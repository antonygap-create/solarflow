"""
Proposal CRUD Service (services/proposal.py)
---------------------------------------------
Handles creation and database queries for commercial solar proposal records in PostgreSQL.
"""

import uuid
from typing import Optional
from sqlalchemy.orm import Session

from app.models import Proposal
from app.schemas.proposal import ProposalCreate


def create_proposal(db: Session, proposal_in: ProposalCreate) -> Proposal:
    """
    Creates and commits a new Proposal record in PostgreSQL.
    
    :param db: SQLAlchemy database session
    :param proposal_in: ProposalCreate schema instance
    :return: Created Proposal ORM model instance
    """
    db_proposal = Proposal(
        customer_email=proposal_in.customer_email,
        latitude=proposal_in.latitude,
        longitude=proposal_in.longitude,
        system_capacity_kw=proposal_in.system_capacity_kw,
        annual_generation_kwh=proposal_in.annual_generation_kwh,
        total_system_cost=proposal_in.total_system_cost,
        estimated_annual_savings=proposal_in.estimated_annual_savings,
        roi_25_years_percent=proposal_in.roi_25_years_percent
    )
    db.add(db_proposal)
    db.commit()
    db.refresh(db_proposal)
    return db_proposal


def get_proposal_by_id(db: Session, proposal_id: uuid.UUID) -> Optional[Proposal]:
    """
    Retrieves a Proposal record by UUID from PostgreSQL.
    
    :param db: SQLAlchemy database session
    :param proposal_id: UUID of proposal
    :return: Proposal ORM instance if found, else None
    """
    return db.query(Proposal).filter(Proposal.id == proposal_id).first()
