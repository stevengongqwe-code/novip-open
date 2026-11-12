FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-writer libreoffice-impress fonts-noto-cjk && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && useradd -u 10001 -m converter
COPY service.py .
USER converter
ENV HOME=/tmp PYTHONDONTWRITEBYTECODE=1
EXPOSE 8000
CMD ["uvicorn","service:app","--host","0.0.0.0","--port","8000","--workers","1","--limit-concurrency","8"]
