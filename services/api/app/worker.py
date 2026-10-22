import argparse
import time
from datetime import timedelta

from sqlalchemy import select

from .db import SessionLocal, now
from .drone import step
from .models import Job


def tick() -> bool:
    job_id = None
    try:
        with SessionLocal.begin() as db:
            job = db.scalar(
                select(Job)
                .where(Job.status == "PENDING", Job.next_attempt_at <= now())
                .order_by(Job.created_at)
                .with_for_update(skip_locked=True)
            )
            if not job:
                return False
            job_id = job.id
            step(db, job)
        return True
    except Exception as error:
        if job_id:
            with SessionLocal.begin() as db:
                job = db.get(Job, job_id)
                job.attempts += 1
                job.error = str(error)[:500]
                job.status = "DEAD_LETTER" if job.attempts >= 5 else "PENDING"
                job.next_attempt_at = now() + timedelta(seconds=2**job.attempts)
        return False


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    if args.once:
        tick()
    else:
        while True:
            tick()
            time.sleep(1)
