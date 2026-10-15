# Stage 1: Build and validate application assets
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files if present and install dependencies
COPY package*.json ./
RUN if [ -f package.json ]; then npm install; fi

# Copy project source files
COPY . .

# Run build script if defined in package.json
RUN if [ -f package.json ]; then npm run build --if-present; fi

# Stage 2: Package and serve with lightweight Nginx web server
FROM nginx:alpine
WORKDIR /usr/share/nginx/html

# Remove default Nginx placeholder page
RUN rm -rf ./*

# Copy built artifacts (or static repository files) from builder stage
COPY --from=builder /app /usr/share/nginx/html
RUN if [ -d /usr/share/nginx/html/dist ]; then cp -r /usr/share/nginx/html/dist/* /usr/share/nginx/html/; fi

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
