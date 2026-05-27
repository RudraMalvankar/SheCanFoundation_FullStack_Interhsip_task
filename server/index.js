import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const app = express();
const port = Number(process.env.PORT || 5000);
const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
const mongoUri = process.env.MONGO_URI;
const adminUsername = process.env.ADMIN_USERNAME || "admin";
const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
const jwtSecret = process.env.JWT_SECRET || "she-can-foundation-dev-secret";

app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: clientUrl,
    credentials: true,
  }),
);
app.use(express.json({ limit: "20kb" }));

const submissionLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const contactSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(80, "Name is too long."),
  email: z.string().trim().email("Enter a valid email address.").max(120, "Email is too long."),
  message: z.string().trim().min(10, "Message must be at least 10 characters.").max(500, "Message is too long."),
});

const contactSubmissionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    source: { type: String, default: "she-can-foundation-form" },
  },
  { timestamps: true },
);

const ContactSubmission = mongoose.models.ContactSubmission || mongoose.model("ContactSubmission", contactSubmissionSchema);

const memorySubmissions = [];
let mongoReady = false;

function serializeSubmission(submission) {
  return {
    id: String(submission._id || submission.id || randomUUID()),
    name: submission.name,
    email: submission.email,
    message: submission.message,
    source: submission.source || "she-can-foundation-form",
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt,
  };
}

function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Admin authentication required." });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.adminUser = decoded;
    return next();
  } catch (_error) {
    return res.status(401).json({ message: "Invalid or expired admin session." });
  }
}

async function connectMongo() {
  if (!mongoUri) {
    console.warn("MONGO_URI is not set. Using in-memory storage for submissions.");
    return;
  }

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });
    mongoReady = true;
    console.log("Connected to MongoDB.");
  } catch (error) {
    mongoReady = false;
    console.warn("MongoDB connection failed. Falling back to in-memory storage.");
    console.warn(error.message);
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", database: mongoReady ? "mongo" : "memory" });
});

app.post("/api/admin/login", async (req, res) => {
  const loginSchema = z.object({
    username: z.string().trim().min(2, "Username is required."),
    password: z.string().min(4, "Password is required."),
  });

  const result = loginSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      message: "Please enter valid admin credentials.",
    });
  }

  const { username, password } = result.data;

  if (username !== adminUsername || password !== adminPassword) {
    return res.status(401).json({
      message: "Invalid admin credentials.",
    });
  }

  const token = jwt.sign(
    {
      username,
      role: "admin",
    },
    jwtSecret,
    { expiresIn: "8h" },
  );

  return res.json({
    message: "Admin login successful.",
    token,
    username,
  });
});

app.get("/api/admin/submissions", requireAdminAuth, async (_req, res) => {
  try {
    if (mongoReady) {
      const submissions = await ContactSubmission.find().sort({ createdAt: -1 }).lean();

      return res.json({
        database: "mongo",
        submissions: submissions.map(serializeSubmission),
      });
    }

    return res.json({
      database: "memory",
      submissions: [...memorySubmissions].reverse().map(serializeSubmission),
    });
  } catch (error) {
    console.error("Failed to load submissions:", error);
    return res.status(500).json({
      message: "Unable to load submissions right now.",
    });
  }
});

app.post("/api/contact", submissionLimiter, async (req, res) => {
  const result = contactSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      message: "Please fill out the form correctly.",
      errors: result.error.flatten().fieldErrors,
    });
  }

  const payload = {
    ...result.data,
    source: "she-can-foundation-form",
  };

  try {
    if (mongoReady) {
      await ContactSubmission.create(payload);
    } else {
      const now = new Date().toISOString();
      memorySubmissions.push({
        _id: randomUUID(),
        ...payload,
        createdAt: now,
        updatedAt: now,
      });
    }

    return res.status(201).json({
      message: "Form Submitted Successfully",
      storage: mongoReady ? "mongo" : "memory",
    });
  } catch (error) {
    console.error("Failed to save submission:", error);
    return res.status(500).json({
      message: "Unable to submit the form right now.",
    });
  }
});

const clientDistPath = path.resolve(__dirname, "..", "client", "dist");

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));

  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDistPath, "index.html"));
  });
}

await connectMongo();

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
