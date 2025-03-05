# URL Shortener - Local Development

## Prerequisites
- Node.js installed
- Serverless Framework installed (`npm install -g serverless`)

Define keys in file .env

```env
BUCKET_NAME=bucket_name
IS_OFFLINE=true
```
## Starting the Project Locally

To run the project locally using serverless-offline, use the following command:

```bash
serverless offline start --reloadHandler
```

This command:
- Starts a local API Gateway emulator
- Enables hot reloading for Lambda functions
- Watches for changes in your handler files
- Automatically restarts the service when changes are detected

The API will be available at `http://localhost:3000` by default.

## Informations

You can launch interface located in index.html to have à GUI to create meme instead using postman.