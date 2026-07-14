FROM node:20-bookworm-slim

WORKDIR /app

# OCR runtime dependencies (Python + PDF conversion support)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    poppler-utils \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install Node dependencies first for better layer caching
COPY package*.json ./
RUN npm ci --omit=dev

# Create a virtual environment to satisfy PEP 668 (Debian Bookworm blocks
# system-wide pip installs outside a venv)
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python OCR dependencies used by ocr_service
COPY ocr_service/requirements.txt /tmp/ocr_service-requirements.txt
RUN pip install --no-cache-dir -r /tmp/ocr_service-requirements.txt

# Copy project files
COPY . .

ENV NODE_ENV=production
ENV OCR_PYTHON_PATH=/opt/venv/bin/python3

EXPOSE 4000

CMD ["npm", "start"]
