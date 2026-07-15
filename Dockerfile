FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py database.py analytics.py ./
COPY static/ static/

RUN mkdir -p /data

EXPOSE 8000

ENV DB_DIR=/data

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
