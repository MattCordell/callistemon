# AutoCoder API for Cloud Run (see autocoder/DEPLOY.md). Credentials are not baked in:
# Google auth comes from the service account, ICD-API keys from Secret Manager env vars.
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY medgemma_pipeline.py .
COPY autocoder/ autocoder/
CMD exec uvicorn autocoder.server:app --host 0.0.0.0 --port ${PORT:-8080}
