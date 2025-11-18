import express, { Request, Response } from "express";
import cors from "cors";
import { search } from "./controllers/searchController";
import { handleMCP } from "./controllers/mcpController";
import { loggingMiddleware } from "./middleware/logging";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { timeoutMiddleware } from "./middleware/timeout";

// Create Express app
const app = express();

// Parse environment variables
const PORT = process.env.PORT || 8080;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
	? process.env.ALLOWED_ORIGINS.split(",")
	: ["*"];

// Middleware
app.use(express.json());
app.use(
	cors({
		origin: ALLOWED_ORIGINS,
		methods: ["GET", "POST", "OPTIONS"],
		credentials: true,
	}),
);
app.use(loggingMiddleware);
app.use(timeoutMiddleware(10000)); // 10 second timeout

// Serve static files from public directory
app.use(express.static("public"));

// Health endpoint
app.get("/health", (_req: Request, res: Response) => {
	res.status(200).json({
		status: "ok",
		timestamp: new Date().toISOString(),
		service: "govreposcrape-api",
		version: "1.0.0",
	});
});

// MCP Search endpoint (legacy)
app.post("/mcp/search", search);

// MCP HTTP endpoint (SSE-based for remote MCP)
app.post("/mcp", handleMCP);

// 404 handler (must be after all routes)
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
	console.log(
		JSON.stringify({
			level: "info",
			message: "Server started",
			port: PORT,
			environment: process.env.NODE_ENV || "development",
			timestamp: new Date().toISOString(),
		}),
	);
});

// Graceful shutdown
process.on("SIGTERM", () => {
	console.log(
		JSON.stringify({
			level: "info",
			message: "SIGTERM received, shutting down gracefully",
			timestamp: new Date().toISOString(),
		}),
	);
	process.exit(0);
});

process.on("SIGINT", () => {
	console.log(
		JSON.stringify({
			level: "info",
			message: "SIGINT received, shutting down gracefully",
			timestamp: new Date().toISOString(),
		}),
	);
	process.exit(0);
});
