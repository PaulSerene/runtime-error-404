# Execution Tools (Layer 3: Doing the work)

This directory contains deterministic Python scripts that perform the actual work.

## Operating Principles
- **Reliable & Fast**: Handle API requests, data transformations, cloud syncs, and database operations programmatically.
- **Environment Variables**: Load secrets and configurations from `.env` (never hardcode keys).
- **Intermediates**: Write temporary data to `.tmp/` (always cleanable/regenerable).
- **Self-Annealing**: When an execution script fails, inspect the error/traceback, fix the code, test it, and update the associated directive.

## Script Structure Pattern
```python
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load root .env
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

def main():
    # Deterministic logic here
    pass

if __name__ == "__main__":
    main()
```
