FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy source code
COPY . .

# Create logs and exports directories
RUN mkdir -p logs exports

# Run the scheduler
CMD ["node", "src/scheduler.js", "start"]
