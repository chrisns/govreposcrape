import express, { Request, Response } from "express";
import cors from "cors";
import { search } from "./controllers/searchController";
import { handleMCP } from "./controllers/mcpController";
import { loggingMiddleware } from "./middleware/logging";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { timeoutMiddleware } from "./middleware/timeout";
import { validateResultMode } from "./middleware/validateRequest";
import { rateLimit } from "./middleware/rateLimit";

// Create Express app
const app = express();

// Parse environment variables
const PORT = process.env.PORT || 8080;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
	? process.env.ALLOWED_ORIGINS.split(",")
	: ["*"];

// Middleware
app.use(express.json({ limit: "64kb" })); // bound request body size
app.use(
	cors({
		origin: ALLOWED_ORIGINS,
		methods: ["GET", "POST", "OPTIONS"],
		// No credentials: this is a public, unauthenticated API, and `origin: *`
		// combined with `credentials: true` is rejected by browsers anyway.
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

// MCP Search endpoint (with rate limit + validation middleware)
app.post("/mcp/search", rateLimit, validateResultMode, search);

// MCP HTTP endpoint (Streamable HTTP transport)
app.post("/mcp", rateLimit, handleMCP);

// This server does not offer a server→client GET stream. Per the Streamable HTTP
// transport, advertise that explicitly with 405 (not the generic 404) so strict
// clients don't mistake it for a missing endpoint.
app.get("/mcp", (_req: Request, res: Response) => {
	res.setHeader("Allow", "POST");
	res.status(405).json({ error: { code: "METHOD_NOT_ALLOWED", message: "Use POST for /mcp" } });
});

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
