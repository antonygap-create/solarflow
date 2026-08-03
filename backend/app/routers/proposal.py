"""
FastAPI Router for Proposals Persistence (/api/v1/proposals).
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.proposal import ProposalCreate, ProposalRead
from app.services.proposal import create_proposal, get_proposal_by_id

router = APIRouter(
    prefix="/api/v1/proposals",
    tags=["Proposals"]
)


@router.post(
    "/",
    response_model=ProposalRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create & Save Commercial Solar Proposal",
    description="Saves solar estimation and economics metrics into PostgreSQL database as a proposal record."
)
async def create_new_proposal(
    payload: ProposalCreate,
    db: Session = Depends(get_db)
) -> ProposalRead:
    """
    HTTP POST endpoint to persist a new solar proposal in PostgreSQL.
    """
    try:
        return create_proposal(db=db, proposal_in=payload)
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to save proposal record: {str(err)}"
        )


@router.get(
    "/{proposal_id}",
    response_model=ProposalRead,
    status_code=status.HTTP_200_OK,
    summary="Get Proposal by UUID",
    description="Fetches a saved solar proposal record from PostgreSQL by its unique UUID ID."
)
async def get_proposal(
    proposal_id: uuid.UUID,
    db: Session = Depends(get_db)
) -> ProposalRead:
    """
    HTTP GET endpoint to retrieve a proposal record by UUID.
    """
    proposal = get_proposal_by_id(db=db, proposal_id=proposal_id)
    if not proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Proposal with ID '{proposal_id}' was not found."
        )
    return proposal
